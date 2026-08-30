/**
 * The public read layer behind `/api/coin/*` — what the IDEA Coin Ledger
 * (`src/lib/legacy/coins/index.html`) reads instead of the frozen Google Sheets
 * export.
 *
 * TWO RULES GOVERN THIS MODULE.
 *
 * 1. NO EMAIL LEAVES IT, EVER. Every read below is an `anon`-granted
 *    SECURITY DEFINER RPC from migration 0089 that projects the email column
 *    away inside the database (see that file's header for why the boundary
 *    lives there rather than here). Nothing in this module reads a
 *    `student_email`, and a per-student request is addressed by the opaque
 *    `student_id` those RPCs mint. Adding a field here that carries an
 *    address would defeat the whole design — don't.
 *
 * 2. THE OUTPUT SHAPE IS CSV BECAUSE THE PAGE PARSES CSV. The Ledger's own
 *    `parseCSV` reads by HEADER NAME, so the two feeds below are emitted as
 *    CSV under names that page looks for, and the JSON feeds keep the field
 *    names it already reads. `Debt` is the total balance being negative.
 *
 * SINCE 0096 THE ECONOMY HAS TWO BALANCES, AND SINCE 0103 THIS LAYER SERVES
 * BOTH OF THEM RATHER THAN LEAVING THE PAGE TO INFER ONE. `Coin Balance` is
 * the TOTAL; `Physical Balance` (coins in the student's hand) and
 * `Digital Balance` (the part held in the system) are its two components and
 * always sum to it. They replace `Bank Balance`, the empty legacy slot 0089
 * served and 0096 temporarily borrowed for the digital figure — a stand-in
 * that only ever rendered when it was positive.
 *
 * The transaction feed carries `Medium` and `Transfer Id` for the same reason:
 * a payout is TWO linked rows sharing one transfer id, and the page collapses
 * that pair into the single event it was. Inferring the pairing from names and
 * timestamps would be guesswork over a key that is already stored.
 *
 * SINCE 0107 THERE IS A FOURTH BUCKET, `Adjustments`. An adjustment-kind row
 * is a correction of the record, not something earned or spent, so it is out
 * of `Awarded` and out of `Spent` whatever its sign, and its signed total is
 * its own column. The identity the page reconciles with is therefore
 * `Awarded - Fines - Spent + Adjustments = Coin Balance`, and Lifetime Earned
 * (`Awarded - Fines`) no longer counts a refund as an earning.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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
	awarded: number;
	fines: number;
	spent: number;
	adjustments: number;
	paid_out: number;
	balance: number;
	debt: number;
	weekly_wage: number;
	wage_tier: number;
	physical_balance: number;
	digital_balance: number;
}

interface TransactionRow {
	occurred_at: string;
	name: string;
	amount: number;
	type: string;
	reason: string;
	medium: string | null;
	transfer_id: string | null;
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
						'Awarded',
						'Fines',
						'Spent',
						'Adjustments',
						'Coin Balance',
						'Paid Out',
						'Physical Balance',
						'Digital Balance',
						'Debt',
						'Wage Tier',
						'Student Id'
					],
					rows.map((r) => [
						r.name,
						r.section ?? '',
						r.weekly_wage,
						r.awarded,
						r.fines,
						r.spent,
						// Adjustment-kind rows, at their STORED SIGN, in their own
						// bucket since 0107 -- excluded from `Awarded` and `Spent`
						// so a refund can no longer read as an earning and climb
						// the Lifetime Earned board. Always sent; the page renders
						// it only when it is nonzero.
						r.adjustments,
						// `Coin Balance` is the TOTAL (physical coins in hand plus
						// digital) since 0096 -- one number for "how much IDEA
						// Coin does this student have", which is what the column
						// has always meant to a reader.
						r.balance,
						r.paid_out,
						// The two components of that total, served explicitly
						// since 0103. Both are signed and both are always sent:
						// a negative physical balance is a real state (a student
						// fined past what they were holding) and the page shows
						// it rather than hiding it, unlike the positive-only
						// `Bank Balance` stand-in these replace.
						r.physical_balance,
						r.digital_balance,
						r.debt,
						r.wage_tier,
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
					['Date / Time', 'Name', 'Amount', 'Type', 'Reason', 'Medium', 'Transfer Id'],
					rows.map((r) => [
						ledgerDate(r.occurred_at),
						r.name,
						// The STORED SIGNED amount, never an absolute value: the
						// sign is the ledger's, and the page renders it rather
						// than reconstructing one from the type string.
						r.amount,
						r.type,
						r.reason,
						r.medium ?? '',
						r.transfer_id ?? ''
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
