/**
 * Legacy Sheets migration: plain types + pure helpers (client-safe, the
 * coin-desk.ts convention). Everything here is math and parsing over the
 * pulled snapshot; the authority is migration 0084's RPCs, which re-validate
 * everything server-side -- these helpers exist so the wizard can show the
 * admin what WILL happen (and block early on what would be refused) before a
 * single row is written.
 *
 * The snapshot shape (`LegacyPull`) is the contract between the PULL
 * endpoint (src/routes/coin-desk/migrate/pull/+server.ts), the batch row's
 * `raw` jsonb, and 0084's coin_admin_import_legacy, which reads exactly
 * these keys.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Snapshot types -- one row per sheet row, keys as 0084 reads them.
// ---------------------------------------------------------------------------

export interface LegacySummaryRow {
	row: number;
	name: string;
	section: string;
	wage: number;
	awarded: number;
	fines: number;
	spent: number;
	coin_balance: number;
	paid_out: number;
	bank_balance: number;
	debt: number;
}

export interface LegacyTransactionRow {
	row: number;
	/** Naive local timestamp, verbatim from the sheet ('YYYY-MM-DD HH:MM').
	 * 0084 interprets it as America/Los_Angeles. */
	date: string;
	name: string;
	/** Positive magnitude; the TYPE carries the sign (see signedAmount). */
	amount: number;
	type: string;
	reason: string;
}

export interface LegacyContractRow {
	row: number;
	name: string;
	base_payout: number;
	rate_label: string;
	quantity: number;
	total_payout: number;
	status: string;
	/** Parsed from the ledger's pipe-separated "Last, First|Last, First". */
	contractors: string[];
	split: string;
	notes: string;
	date_added: string;
	date_completed: string;
}

export interface LegacyPull {
	source: Record<string, string>;
	summary: LegacySummaryRow[];
	transactions: LegacyTransactionRow[];
	contracts: LegacyContractRow[];
	contract_history: unknown[];
	/** False when the ledger could not be reached (COIN_API_KEY unset, a
	 * network failure): the import proceeds with zero contracts and the
	 * wizard says so, rather than blocking the whole migration. */
	contracts_available: boolean;
}

export interface ImportBatchRow {
	id: string;
	raw: LegacyPull;
	pulled_at: string;
	committed_at: string | null;
	committed_by: string | null;
	report: ImportReport | null;
}

export interface ImportReport {
	mappings: Record<string, string>;
	students: number;
	transactions: number;
	contracts: number;
	claims: number;
	results: ImportResultRow[];
}

export interface ImportResultRow {
	email: string;
	name: string;
	ok: boolean;
	transactions: number;
	amount: number;
	reason?: string;
}

export interface ReconcileRow {
	name: string;
	email: string;
	expected: number;
	actual: number;
	diff: number;
	live_balance: number;
}

export interface ReconcileResponse {
	ok: boolean;
	reason?: string;
	all_zero?: boolean;
	rows?: ReconcileRow[];
	totals?: {
		students: number;
		expected_sum: number;
		actual_sum: number;
		mismatches: number;
		batch_transactions: number;
		batch_contracts: number;
		batch_claims: number;
		live_circulation: number;
		live_debt: number;
		live_transactions: number;
	};
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC 4180-lite: quotes, escaped quotes, CRLF). Local on
// purpose: classroom.ts has its own roster-shaped parser with different
// header policies; a 30-line spec-stable parser beats a cross-module
// dependency between two unrelated tools.
// ---------------------------------------------------------------------------

export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			row.push(cur);
			cur = '';
		} else if (ch === '\n') {
			row.push(cur);
			rows.push(row);
			row = [];
			cur = '';
		} else if (ch !== '\r') {
			cur += ch;
		}
	}
	if (cur.length || row.length) {
		row.push(cur);
		rows.push(row);
	}
	return rows;
}

function headerIndex(header: string[], required: string[]): Record<string, number> {
	const normalized = header.map((h) => h.trim().toLowerCase());
	const index: Record<string, number> = {};
	for (const col of required) {
		const at = normalized.indexOf(col);
		if (at === -1) {
			throw new Error(`The CSV is missing the "${col}" column (found: ${header.filter(Boolean).join(', ')}).`);
		}
		index[col] = at;
	}
	return index;
}

function numberAt(cells: string[], at: number | undefined, context: string, strict: boolean): number {
	const raw = (at === undefined ? '' : (cells[at] ?? '')).trim();
	if (raw === '') return 0;
	const n = Number(raw);
	if (!Number.isFinite(n)) {
		if (strict) throw new Error(`${context}: "${raw}" is not a number.`);
		return 0;
	}
	return n;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;

/** The summary sheet: one row per student. Throws on a malformed pull. */
export function parseSummaryCsv(text: string): LegacySummaryRow[] {
	const rows = parseCsv(text);
	if (!rows.length) throw new Error('The summary CSV is empty.');
	const idx = headerIndex(rows[0], ['name', 'section', 'awarded', 'fines', 'spent', 'paid out']);
	const soft = rows[0].map((h) => h.trim().toLowerCase());
	const softIdx = (col: string) => (soft.indexOf(col) === -1 ? undefined : soft.indexOf(col));
	const out: LegacySummaryRow[] = [];
	rows.slice(1).forEach((cells, i) => {
		if (!cells.some((c) => c.trim() !== '')) return;
		const name = (cells[idx['name']] ?? '').trim();
		if (!name) throw new Error(`Summary row ${i + 2} has no name.`);
		const ctx = `Summary row ${i + 2} (${name})`;
		out.push({
			row: i + 2,
			name,
			section: (cells[idx['section']] ?? '').trim(),
			wage: numberAt(cells, softIdx('wage'), ctx, false),
			awarded: numberAt(cells, idx['awarded'], `${ctx} Awarded`, true),
			fines: numberAt(cells, idx['fines'], `${ctx} Fines`, true),
			spent: numberAt(cells, idx['spent'], `${ctx} Spent`, true),
			coin_balance: numberAt(cells, softIdx('coin balance'), ctx, false),
			paid_out: numberAt(cells, idx['paid out'], `${ctx} Paid Out`, true),
			bank_balance: numberAt(cells, softIdx('bank balance'), ctx, false),
			debt: numberAt(cells, softIdx('debt'), ctx, false)
		});
	});
	if (!out.length) throw new Error('The summary CSV parsed to zero students.');
	return out;
}

/** The transaction log. Throws on a malformed pull (a bad date or amount
 * here would only be refused later by 0084's own validation, so failing the
 * pull with the row named is the kinder failure). */
export function parseTransactionsCsv(text: string): LegacyTransactionRow[] {
	const rows = parseCsv(text);
	if (!rows.length) throw new Error('The transactions CSV is empty.');
	const idx = headerIndex(rows[0], ['date / time', 'name', 'amount', 'type', 'reason']);
	const out: LegacyTransactionRow[] = [];
	rows.slice(1).forEach((cells, i) => {
		if (!cells.some((c) => c.trim() !== '')) return;
		const name = (cells[idx['name']] ?? '').trim();
		const date = (cells[idx['date / time']] ?? '').trim();
		if (!name) throw new Error(`Transaction row ${i + 2} has no name.`);
		if (!DATE_RE.test(date)) {
			throw new Error(`Transaction row ${i + 2} (${name}) has an unreadable date: "${date}".`);
		}
		const amount = Number((cells[idx['amount']] ?? '').trim());
		if (!Number.isFinite(amount) || amount < 0) {
			throw new Error(`Transaction row ${i + 2} (${name}) has a bad amount: "${cells[idx['amount']]}".`);
		}
		out.push({
			row: i + 2,
			date,
			name,
			amount,
			type: (cells[idx['type']] ?? '').trim(),
			reason: (cells[idx['reason']] ?? '').trim()
		});
	});
	return out;
}

/** The contracts action's JSON, normalized to snake_case with contractors
 * split into names -- tolerant of the ledger's key casing the same way the
 * legacy coins page is. */
export function parseContractsPayload(payload: unknown): LegacyContractRow[] {
	if (!Array.isArray(payload)) return [];
	const g = (row: Record<string, unknown>, keys: string[]): unknown => {
		for (const k of keys) {
			if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
		}
		return '';
	};
	return payload
		.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
		.map((r, i) => {
			const base = Number(g(r, ['basePayout', 'base_payout'])) || 0;
			const quantity = Number(g(r, ['quantity'])) || 1;
			const total = Number(g(r, ['totalPayout', 'total_payout'])) || base * quantity;
			const contractors = String(g(r, ['contractors', 'Contractors']))
				.split('|')
				.map((n) => n.trim())
				.filter(Boolean);
			return {
				row: Number(g(r, ['row'])) || i + 2,
				name: String(g(r, ['name', 'Name', 'contract', 'Contract'])).trim(),
				base_payout: base,
				rate_label: String(g(r, ['rateLabel', 'rate_label'])).trim(),
				quantity,
				total_payout: total,
				status: String(g(r, ['status', 'Status'])).trim() || 'Open',
				contractors,
				split: String(g(r, ['split'])).trim(),
				notes: String(g(r, ['notes', 'Notes'])).trim(),
				date_added: String(g(r, ['dateAdded', 'date_added'])).trim(),
				date_completed: String(g(r, ['dateCompleted', 'date_completed'])).trim()
			};
		})
		.filter((c) => c.name !== '');
}

// ---------------------------------------------------------------------------
// Type semantics -- must stay in lock-step with 0084's own CASE expressions.
// ---------------------------------------------------------------------------

export const LEGACY_TYPES = ['Award', 'Award - Held', 'Fine', 'Fine - Owed', 'Purchase', 'Payout'] as const;

export function isKnownLegacyType(type: string): boolean {
	return (LEGACY_TYPES as readonly string[]).includes(type.trim());
}

export function isAwardType(type: string): boolean {
	const t = type.trim();
	return t === 'Award' || t === 'Award - Held';
}

/** The sheet stores positive magnitudes; the type carries the direction. */
export function signedAmount(t: LegacyTransactionRow): number {
	return isAwardType(t.type) ? Math.round(t.amount) : -Math.round(t.amount);
}

export function legacyCategoryForType(type: string): string {
	const t = type.trim();
	if (t === 'Award' || t === 'Award - Held') return 'legacy_award';
	if (t === 'Fine' || t === 'Fine - Owed') return 'legacy_fine';
	if (t === 'Purchase') return 'legacy_purchase';
	return 'legacy_payout';
}

/** The migrating balance: Awarded - Fines - Spent - Paid Out. The summary's
 * Coin/Bank/Debt columns are old physical-coin bookkeeping and never enter
 * this number. */
export function expectedBalance(s: LegacySummaryRow): number {
	return Math.round(s.awarded) - Math.round(s.fines) - Math.round(s.spent) - Math.round(s.paid_out);
}

// ---------------------------------------------------------------------------
// Name handling. Token-set comparison is the resolveApplicant idea
// (src/lib/server/coin-ledger.ts nameTokens) restated client-side: "Last,
// First" and "First Last" agree because both reduce to the same sorted token
// set. Kept as a small local copy because that module is $lib/server and can
// never be imported into a browser bundle.
// ---------------------------------------------------------------------------

export function nameKey(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function nameTokens(name: string): string[] {
	return name
		.normalize('NFKD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}

export function tokenKey(name: string): string {
	return [...nameTokens(name)].sort().join(' ');
}

export interface ImportProfile {
	email: string | null;
	full_name: string | null;
	display_name: string | null;
}

/**
 * A UNIQUE exact token-set match against profiles, or null -- ambiguity and
 * absence are the same answer here (a guess is worse than a blank the admin
 * fills in by hand).
 */
export function matchProfileEmail(name: string, profiles: ImportProfile[]): string | null {
	const key = tokenKey(name);
	if (!key || nameTokens(name).length < 2) return null;
	const hits = new Set<string>();
	for (const p of profiles) {
		const email = (p.email ?? '').trim().toLowerCase();
		if (!email) continue;
		if ((p.full_name && tokenKey(p.full_name) === key) || (p.display_name && tokenKey(p.display_name) === key)) {
			hits.add(email);
		}
	}
	return hits.size === 1 ? [...hits][0] : null;
}

// ---------------------------------------------------------------------------
// Email patterns -- the bulk prefill for rows no profile matches.
// ---------------------------------------------------------------------------

export const BOSCO_DOMAIN = '@boscotech.net';

export interface EmailPattern {
	id: string;
	label: string;
}

export const EMAIL_PATTERNS: EmailPattern[] = [
	{ id: 'first.last', label: '{first}.{last}' },
	{ id: 'flast', label: '{f}{last}' },
	{ id: 'firstl', label: '{first}{l}' },
	{ id: 'firstlast', label: '{first}{last}' },
	{ id: 'last.first', label: '{last}.{first}' },
	{ id: 'lastf', label: '{last}{f}' }
];

/** "Last, First" (or "First Last") into its two parts, or null when the name
 * only has one usable token -- some External rows are partial names and no
 * pattern can be built for them. */
export function splitLegacyName(name: string): { first: string; last: string } | null {
	const clean = (s: string) =>
		s
			.normalize('NFKD')
			.replace(/\p{Diacritic}/gu, '')
			.toLowerCase()
			.replace(/[^a-z0-9\s]/g, ' ')
			.trim();
	const comma = name.indexOf(',');
	let first: string;
	let last: string;
	if (comma !== -1) {
		last = clean(name.slice(0, comma)).replace(/\s+/g, '');
		// The given-name side can carry a middle initial ("Diego S."); the
		// pattern's {first} is the first token only.
		first = clean(name.slice(comma + 1)).split(/\s+/)[0] ?? '';
	} else {
		const tokens = clean(name).split(/\s+/).filter(Boolean);
		if (tokens.length < 2) return null;
		first = tokens[0];
		last = tokens.slice(1).join('');
	}
	if (!first || !last) return null;
	return { first, last };
}

export function patternEmail(patternId: string, name: string): string | null {
	const parts = splitLegacyName(name);
	if (!parts) return null;
	const { first, last } = parts;
	const local = {
		'first.last': `${first}.${last}`,
		flast: `${first[0]}${last}`,
		firstl: `${first}${last[0]}`,
		firstlast: `${first}${last}`,
		'last.first': `${last}.${first}`,
		lastf: `${last}${first[0]}`
	}[patternId];
	return local ? `${local}${BOSCO_DOMAIN}` : null;
}

// ---------------------------------------------------------------------------
// The mapping table the MAP step edits.
// ---------------------------------------------------------------------------

export type MappingStatus = 'unmapped' | 'profile' | 'pattern' | 'hand' | 'external';

export interface MappingRow {
	legacy_name: string;
	/** The sheet's Section for summary names; '' for names that appear only
	 * in the transaction log or a contract's contractors list. */
	section: string;
	email: string;
	status: MappingStatus;
	/** splitLegacyName failed: the pattern generator skips this row. */
	partial: boolean;
	inSummary: boolean;
}

export interface SavedMappingRow {
	legacy_name: string;
	email: string | null;
	status: string;
}

/**
 * The union of every name the import must resolve: the summary roster (in
 * sheet order), then any name that appears only in transactions or a
 * contract's contractors list (none in the real data -- the verified facts
 * -- but a stray one must be mappable, not a dead end at commit).
 *
 * Prefill order per row: the saved draft wins wholesale, else a unique
 * profile token-set match, else blank. Rows whose sheet section is
 * 'External' start as status 'external' (relaxed domain), never
 * profile-matched -- outsiders have no boscotech account to match.
 */
export function buildMappingRows(
	pull: LegacyPull,
	saved: SavedMappingRow[],
	profiles: ImportProfile[]
): MappingRow[] {
	const savedByKey = new Map(saved.map((s) => [nameKey(s.legacy_name), s]));
	const seen = new Set<string>();
	const rows: MappingRow[] = [];

	const push = (name: string, section: string, inSummary: boolean) => {
		const key = nameKey(name);
		if (!key || seen.has(key)) return;
		seen.add(key);
		const external = section.trim().toLowerCase() === 'external';
		const draft = savedByKey.get(key);
		let email = '';
		let status: MappingStatus = external ? 'external' : 'unmapped';
		if (draft) {
			email = (draft.email ?? '').trim().toLowerCase();
			const s = draft.status as MappingStatus;
			status = ['unmapped', 'profile', 'pattern', 'hand', 'external'].includes(s)
				? s
				: external
					? 'external'
					: 'unmapped';
		} else if (!external) {
			const match = matchProfileEmail(name, profiles);
			if (match) {
				email = match;
				status = 'profile';
			}
		}
		rows.push({
			legacy_name: name.trim(),
			section: section.trim(),
			email,
			status,
			partial: splitLegacyName(name) === null,
			inSummary
		});
	};

	for (const s of pull.summary) push(s.name, s.section, true);
	for (const t of pull.transactions) push(t.name, '', false);
	for (const c of pull.contracts) for (const n of c.contractors) push(n, '', false);
	return rows;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MappingIssues {
	unmapped: string[];
	invalidEmails: string[];
	wrongDomain: string[];
	/** email -> the legacy names sharing it (only entries with 2+). */
	duplicates: { email: string; names: string[] }[];
	ok: boolean;
}

export function mappingIssues(rows: MappingRow[]): MappingIssues {
	const unmapped: string[] = [];
	const invalidEmails: string[] = [];
	const wrongDomain: string[] = [];
	const byEmail = new Map<string, string[]>();
	for (const r of rows) {
		const email = r.email.trim().toLowerCase();
		if (!email) {
			unmapped.push(r.legacy_name);
			continue;
		}
		if (!EMAIL_RE.test(email)) {
			invalidEmails.push(r.legacy_name);
			continue;
		}
		if (r.status !== 'external' && !email.endsWith(BOSCO_DOMAIN)) {
			wrongDomain.push(r.legacy_name);
		}
		byEmail.set(email, [...(byEmail.get(email) ?? []), r.legacy_name]);
	}
	const duplicates = [...byEmail.entries()]
		.filter(([, names]) => names.length > 1)
		.map(([email, names]) => ({ email, names }));
	return {
		unmapped,
		invalidEmails,
		wrongDomain,
		duplicates,
		ok: !unmapped.length && !invalidEmails.length && !wrongDomain.length && !duplicates.length
	};
}

// ---------------------------------------------------------------------------
// Preview math + flags.
// ---------------------------------------------------------------------------

export interface PreviewRow {
	name: string;
	email: string;
	expected: number;
	computed: number;
	diff: number;
	transactions: number;
}

/** Expected (summary columns) vs the sum of the parsed transactions under
 * the mapping -- 0 diff for every row is what the verified sheet facts
 * promise, and anything else blocks the commit. */
export function previewRows(pull: LegacyPull, rows: MappingRow[]): PreviewRow[] {
	const emailByName = new Map(rows.map((r) => [nameKey(r.legacy_name), r.email.trim().toLowerCase()]));
	const sums = new Map<string, { total: number; count: number }>();
	for (const t of pull.transactions) {
		const email = emailByName.get(nameKey(t.name)) ?? '';
		const cur = sums.get(email) ?? { total: 0, count: 0 };
		cur.total += signedAmount(t);
		cur.count += 1;
		sums.set(email, cur);
	}
	return pull.summary.map((s) => {
		const email = emailByName.get(nameKey(s.name)) ?? '';
		const computed = sums.get(email) ?? { total: 0, count: 0 };
		const expected = expectedBalance(s);
		return {
			name: s.name,
			email,
			expected,
			computed: computed.total,
			diff: computed.total - expected,
			transactions: computed.count
		};
	});
}

/** Contractor names that do not resolve to a valid mapped email. */
export function unresolvedContractors(pull: LegacyPull, rows: MappingRow[]): string[] {
	const emailByName = new Map(rows.map((r) => [nameKey(r.legacy_name), r.email.trim().toLowerCase()]));
	const missing = new Set<string>();
	for (const c of pull.contracts) {
		for (const n of c.contractors) {
			const email = emailByName.get(nameKey(n));
			if (!email || !EMAIL_RE.test(email)) missing.add(n);
		}
	}
	return [...missing];
}

export interface EatingPassFlag {
	name: string;
	amount: number;
	reason: string;
	row: number;
}

/** Docs v3 item 9: old Basic/Executive pass purchases are refund-only; the
 * new pass is never auto-granted. Detected by Reason + Purchase type. */
export function eatingPassPurchases(pull: LegacyPull): EatingPassFlag[] {
	return pull.transactions
		.filter((t) => t.type.trim() === 'Purchase' && /eating pass/i.test(t.reason))
		.map((t) => ({ name: t.name, amount: Math.round(t.amount), reason: t.reason, row: t.row }));
}

export interface PullFlags {
	eatingPasses: EatingPassFlag[];
	externalNames: string[];
	transactionOnlyNames: string[];
	summaryOnlyCount: number;
	unknownTypes: string[];
}

export function pullFlags(pull: LegacyPull): PullFlags {
	const summaryKeys = new Set(pull.summary.map((s) => nameKey(s.name)));
	const txnKeys = new Set(pull.transactions.map((t) => nameKey(t.name)));
	return {
		eatingPasses: eatingPassPurchases(pull),
		externalNames: pull.summary
			.filter((s) => s.section.trim().toLowerCase() === 'external')
			.map((s) => s.name),
		transactionOnlyNames: [
			...new Set(pull.transactions.filter((t) => !summaryKeys.has(nameKey(t.name))).map((t) => t.name))
		],
		summaryOnlyCount: pull.summary.filter((s) => !txnKeys.has(nameKey(s.name))).length,
		unknownTypes: [...new Set(pull.transactions.map((t) => t.type.trim()).filter((t) => !isKnownLegacyType(t)))]
	};
}

// ---------------------------------------------------------------------------
// The guided eating-pass refund (VERIFY step).
// ---------------------------------------------------------------------------

export const REFUND_NOTE = 'Legacy eating pass refund - refund-only policy (v3 item 9)';
const REFUND_NOTE_PREFIX = 'Legacy eating pass refund';

/**
 * Which of the flagged purchasers already have a refund correction logged --
 * what pre-disables a refund button across a reload. A plain RLS-scoped
 * read (admins see every coin_transactions row); the note prefix is the
 * marker, matching what the one-click refund writes.
 */
export async function loadLoggedRefunds(supabase: SupabaseClient, emails: string[]): Promise<Set<string>> {
	if (!emails.length) return new Set();
	const { data, error } = await supabase
		.from('coin_transactions')
		.select('student_email, note')
		.eq('category_id', 'balance_correction')
		.in('student_email', emails);
	if (error || !data) return new Set();
	return new Set(
		(data as { student_email: string; note: string | null }[])
			.filter((r) => (r.note ?? '').startsWith(REFUND_NOTE_PREFIX))
			.map((r) => r.student_email)
	);
}

// ---------------------------------------------------------------------------
// Assembling the snapshot (the PULL endpoint and the dev harness both build
// raw through this, so the jsonb 0084 reads is one shape with two writers).
// ---------------------------------------------------------------------------

export function buildRawSnapshot(input: {
	summary: LegacySummaryRow[];
	transactions: LegacyTransactionRow[];
	contracts: LegacyContractRow[];
	contractHistory: unknown[];
	contractsAvailable: boolean;
	source: Record<string, string>;
}): LegacyPull {
	return {
		source: input.source,
		summary: input.summary,
		transactions: input.transactions,
		contracts: input.contracts,
		contract_history: input.contractHistory,
		contracts_available: input.contractsAvailable
	};
}
