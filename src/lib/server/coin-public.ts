/**
 * The public read layer behind `/api/coin/*` — what the IDEA Coin Ledger
 * (`src/lib/legacy/coins/index.html`) reads instead of the frozen Google Sheets
 * export.
 *
 * TWO RULES GOVERN THIS MODULE.
 *
 * 1. NO EMAIL LEAVES IT, EVER. Every read below is an `anon`-granted
 *    SECURITY DEFINER RPC (0089, rewritten by 0239) that projects the email
 *    column away inside the database (see that file's header for why the boundary
 *    lives there rather than here). Nothing in this module reads a
 *    `student_email`, and a per-student request is addressed by the opaque
 *    `student_id` those RPCs mint. Adding a field here that carries an
 *    address would defeat the whole design — don't.
 *
 * 2. THE OUTPUT SHAPE IS CSV BECAUSE THE PAGE PARSES CSV. The Ledger's own
 *    `parseCSV` reads by HEADER NAME, so the two feeds below are emitted as
 *    CSV under names that page looks for, and the JSON feeds keep the field
 *    names it already reads.
 *
 * SINCE COIN V2 (0239) THERE IS ONE BALANCE AND ONLY ONE. `Coin Balance` is
 * the sum of a student's digital rows; physical rows are history and no
 * longer count, so the old component figures (`Physical Balance`,
 * `Digital Balance`) and the lifetime buckets (`Awarded`, `Fines`, `Spent`,
 * `Adjustments`, `Paid Out`, `Debt`) are gone from the feed entirely rather
 * than sent as zeros a reader could mistake for a fact. A negative balance IS
 * the debt, and the page shows it as the balance.
 *
 * Amounts are numeric(12,2) now. They are passed through as the database
 * sends them; the page formats them (whole numbers bare, otherwise two
 * decimals).
 *
 * The transaction feed carries `Category Id` so the page keys on an id rather
 * than on a display name (the Eating Pass badge used to match two reason
 * strings the current categories do not use, so it never drew). It no longer
 * carries `Medium` or `Transfer Id`: 0239 sends digital rows only, so a payout is one
 * row and there is no pair to collapse.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SITE_THEME_KEY, THEME_BOOT_MARKER, themeBootTable } from '$lib/theme';

/** Read actions the public endpoint will serve. Nothing else is reachable. */
export const PUBLIC_COIN_ACTIONS = new Set([
	'summary',
	'transactions',
	'student',
	'contracts',
	'reasons',
	'roles',
	'roleQuestions',
	'sections'
]);

/** How many ledger rows the public transaction feed carries. */
const TRANSACTION_LIMIT = 5000;

export interface CoinPublicResult {
	body: string;
	contentType: string;
}

/** RFC4180-ish: quote a field only when it needs it. */
function csvField(value: unknown): string {
	const s = value === null || value === undefined ? '' : String(value);
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: unknown[][]): string {
	const lines = [headers.map(csvField).join(',')];
	for (const row of rows) lines.push(row.map(csvField).join(','));
	return lines.join('\r\n');
}

/**
 * The Ledger renders dates with `new Date(value)` and prints them verbatim,
 * so a local-time string is what it wants — an ISO instant would read as UTC
 * on a page whose whole audience is in one timezone.
 */
function ledgerDate(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return (
		`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
		`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
	);
}

interface LeaderboardRow {
	student_id: string;
	name: string;
	section: string | null;
	balance: number | string;
	weekly_wage: number | string;
	wage_tier: number;
	eating_pass: boolean | null;
}

interface TransactionRow {
	occurred_at: string;
	name: string;
	amount: number | string;
	type: string;
	reason: string;
	category_id: string | null;
}

interface ContractRow {
	id: string;
	title: string;
	description: string | null;
	payout_amount: number;
	max_contractors: number;
	claimed_count: number;
	status: string;
	section: string | null;
	contractors: string;
	created_at: string;
	completed_at: string | null;
	cancelled_at: string | null;
	cancel_reason: string | null;
}

interface RoleRow {
	section_id: string;
	section: string;
	role_id: string;
	role: string;
	description: string | null;
	capacity: number;
	held: number;
	open: number;
}

/**
 * Runs one read action. `client` is the caller's own request-scoped Supabase
 * client — anonymous is fine and is the normal case, since every RPC here is
 * granted to `anon`. There is deliberately no service-role client anywhere in
 * this path: the disclosure boundary is the database's, not this module's.
 */
export async function readCoinPublic(
	client: SupabaseClient,
	action: string,
	params: URLSearchParams
): Promise<CoinPublicResult> {
	switch (action) {
		case 'summary': {
			const { data, error } = await client.rpc('coin_public_leaderboard');
			if (error) throw new Error(error.message);
			const rows = (data ?? []) as LeaderboardRow[];
			return {
				contentType: 'text/csv; charset=utf-8',
				body: toCsv(
					[
						'Name',
						'Section',
						'Wage',
						'Coin Balance',
						'Wage Tier',
						'Eating Pass',
						'Student Id'
					],
					rows.map((r) => [
						r.name,
						r.section ?? '',
						// This student's own weekly wage (base x tier), exactly as
						// the database computes it. The page shows this figure and
						// adds nothing to it.
						r.weekly_wage,
						// THE one balance: the sum of digital rows. Signed; a
						// negative number is the debt.
						r.balance,
						r.wage_tier,
						// Whether an Eating Pass is active right now
						// (`coin_eating_pass_active`), so the badge keys on data
						// and never on a reason string.
						r.eating_pass === true ? 'true' : 'false',
						r.student_id
					])
				)
			};
		}

		case 'transactions': {
			const { data, error } = await client.rpc('coin_public_transactions', {
				p_limit: TRANSACTION_LIMIT
			});
			if (error) throw new Error(error.message);
			const rows = (data ?? []) as TransactionRow[];
			return {
				contentType: 'text/csv; charset=utf-8',
				body: toCsv(
					['Date / Time', 'Name', 'Amount', 'Type', 'Reason', 'Category Id'],
					rows.map((r) => [
						ledgerDate(r.occurred_at),
						r.name,
						// The STORED SIGNED amount, never an absolute value: the
						// sign is the ledger's, and the page renders it rather
						// than reconstructing one from the type string.
						r.amount,
						r.type,
						r.reason,
						r.category_id ?? ''
					])
				)
			};
		}

		case 'student': {
			const id = (params.get('student') ?? '').trim();
			const { data, error } = await client.rpc('coin_public_student', { p_student_id: id });
			if (error) throw new Error(error.message);
			const detail = (data ?? { ok: false, reason: 'unknown_student' }) as Record<
				string,
				unknown
			>;
			const history = Array.isArray(detail.history)
				? (detail.history as { occurred_at: string }[]).map((h) => ({
						...h,
						occurred_at: ledgerDate(h.occurred_at)
					}))
				: [];
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify({ ...detail, history })
			};
		}

		case 'contracts': {
			const { data, error } = await client.rpc('coin_public_contracts');
			if (error) throw new Error(error.message);
			const rows = (data ?? []) as ContractRow[];
			// Field names are the ones the page's contract cards already read
			// (name / totalPayout / status / contractors / notes /
			// dateCompleted), plus the three the claim control needs.
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify(
					rows.map((r) => ({
						id: r.id,
						name: r.title,
						notes: r.description ?? '',
						totalPayout: r.payout_amount,
						maxContractors: r.max_contractors,
						claimedCount: r.claimed_count,
						status: r.status,
						section: r.section ?? '',
						contractors: r.contractors,
						rateLabel:
							r.max_contractors > 1 ? `split ${r.max_contractors} ways` : '',
						dateCompleted: ledgerDate(r.completed_at),
						dateCancelled: ledgerDate(r.cancelled_at),
						cancelReason: r.cancel_reason ?? ''
					}))
				)
			};
		}

		case 'reasons': {
			const { data, error } = await client.rpc('coin_public_reasons');
			if (error) throw new Error(error.message);
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify(data ?? [])
			};
		}

		case 'roles': {
			const { data, error } = await client.rpc('coin_public_roles');
			if (error) throw new Error(error.message);
			const rows = (data ?? []) as RoleRow[];
			// Grouped per section, the shape the role modal already walks:
			// [{ section, appsOpen, roles: [{ role, open }] }].
			const bySection = new Map<
				string,
				{ section: string; appsOpen: boolean; roles: { roleId: string; role: string; open: number; capacity: number; description: string }[] }
			>();
			for (const r of rows) {
				let entry = bySection.get(r.section);
				if (!entry) {
					entry = { section: r.section, appsOpen: false, roles: [] };
					bySection.set(r.section, entry);
				}
				entry.roles.push({
					roleId: r.role_id,
					role: r.role,
					open: r.open,
					capacity: r.capacity,
					description: r.description ?? ''
				});
				if (r.open > 0) entry.appsOpen = true;
			}
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify([...bySection.values()])
			};
		}

		case 'roleQuestions': {
			const roleId = (params.get('role') ?? '').trim();
			const { data, error } = await client.rpc('coin_public_role_questions', {
				p_role_id: roleId
			});
			if (error) throw new Error(error.message);
			const rows = (data ?? []) as {
				question_id: string;
				sequence: number;
				type: string;
				question_text: string;
				options: string[] | null;
			}[];
			// A role with no configured questions is a legitimate state (0076:
			// the real quiz text is hand-maintained in the database and never
			// committed here), so this is an empty array, not an error.
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify(
					rows.map((q) => ({
						questionId: q.question_id,
						sequence: q.sequence,
						type: q.type === 'mc' ? 'MC' : 'FREE',
						question: q.question_text,
						options: Array.isArray(q.options) ? q.options : []
					}))
				)
			};
		}

		case 'sections': {
			const { data, error } = await client.rpc('coin_public_sections');
			if (error) throw new Error(error.message);
			return {
				contentType: 'application/json; charset=utf-8',
				body: JSON.stringify(data ?? [])
			};
		}

		default:
			throw new Error(`unsupported action: ${action}`);
	}
}

/* ===========================================================================
   THE LEDGER FOLLOWS THE SITE THEME, AND THE DECISION IS THE SITE'S.

   The Ledger is standalone HTML, so it cannot mount `ThemeRoot`. Its route
   injects this script at `THEME_BOOT_MARKER` instead. The answers come from
   `themeBootTable`, which asks `themeAttrFor` (the ONE decision: session gate,
   default and route scope) for every theme on `/coins`, so this page paints
   exactly what the site would paint there and never a second idea of it: a
   signed-out visitor gets nothing, and a scoped theme whose scope does not
   cover `/coins` is not in the table. The script only LOOKS UP the stored
   value, then follows a change made in another tab through the `storage`
   event (`themeFromStorageEvent`'s rule: a cleared or unknown value is the
   default), announcing it as `idea-theme-change` so the page can repaint
   what its own script drew.
   =========================================================================== */
/** The path the Ledger answers on, for the theme decision. */
export const LEDGER_THEME_PATH = '/coins';

export function ledgerThemeScript(signedIn: boolean): string {
	const table = themeBootTable(LEDGER_THEME_PATH, signedIn);
	if (Object.keys(table).length === 0) return '';
	const json = JSON.stringify(table).replace(/</g, '\\u003c');
	const key = JSON.stringify(SITE_THEME_KEY);
	return (
		'<script>(function(){try{' +
		`var m=${json},k=${key},d=document.documentElement;` +
		'function has(v){return v!==null&&Object.prototype.hasOwnProperty.call(m,v)}' +
		'function put(v){if(has(v))d.setAttribute("data-theme",m[v].a);else d.removeAttribute("data-theme")}' +
		'var s=null;try{s=localStorage.getItem(k)}catch(e){}' +
		'if(has(s))put(s);' +
		'window.addEventListener("storage",function(e){if(e.key!==null&&e.key!==k)return;' +
		'put(e.key===null?null:e.newValue);' +
		'try{window.dispatchEvent(new CustomEvent("idea-theme-change"))}catch(x){}});' +
		'}catch(e){}})()</script>'
	);
}

/** The Ledger's HTML with its theme script at the boot marker (or nothing there). */
export function injectLedgerTheme(html: string, signedIn: boolean): string {
	return html.replace(THEME_BOOT_MARKER, ledgerThemeScript(signedIn));
}
