/**
 * A STUDENT'S OWN COIN ROWS AS A FILE (2.14). `coin_export('student', <their
 * own address>)` (0249) answers every row of theirs, raw; this module turns
 * that answer into a CSV a spreadsheet opens, client-side, so no second
 * server path exists for it. Pure and client-safe.
 *
 * The CSV is RFC 4180: every field quoted when it holds a comma, a quote or a
 * line break, a quote doubled, CRLF between records. A field starting with a
 * formula character (=, +, -, @) that is NOT a plain number is prefixed with a
 * single quote, so a note a person typed cannot run as a spreadsheet formula
 * when the file is opened; an amount like -5 stays a number.
 */

export interface CoinExportRow {
	id: string;
	created_at: string;
	category_id: string;
	category: string;
	kind: string;
	amount: number | string | null;
	medium: string | null;
	quantity: number | string | null;
	note: string | null;
	actor: string | null;
	transfer_id: string | null;
}

/** The columns, in order, with their header words. */
export const COIN_EXPORT_COLUMNS: { key: keyof CoinExportRow; header: string }[] = [
	{ key: 'created_at', header: 'When' },
	{ key: 'category', header: 'Reason' },
	{ key: 'category_id', header: 'Category id' },
	{ key: 'kind', header: 'Kind' },
	{ key: 'amount', header: 'Amount' },
	{ key: 'medium', header: 'Medium' },
	{ key: 'quantity', header: 'Quantity' },
	{ key: 'note', header: 'Note' },
	{ key: 'actor', header: 'Logged by' },
	{ key: 'transfer_id', header: 'Transfer id' },
	{ key: 'id', header: 'Row id' }
];

function cell(v: unknown): string {
	if (v === null || v === undefined) return '';
	let s = typeof v === 'string' ? v : String(v);
	if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The rows of a `coin_export` answer, validated. Anything not an object is dropped. */
export function parseExportRows(raw: unknown): CoinExportRow[] {
	const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
	const rows = Array.isArray(r.rows) ? r.rows : [];
	const s = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? null : String(v));
	return rows
		.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
		.map((o) => ({
			id: s(o.id) ?? '',
			created_at: s(o.created_at) ?? '',
			category_id: s(o.category_id) ?? '',
			category: s(o.category) ?? s(o.category_id) ?? '',
			kind: s(o.kind) ?? '',
			amount: (o.amount as number | string | null) ?? null,
			medium: s(o.medium),
			quantity: (o.quantity as number | string | null) ?? null,
			note: s(o.note),
			actor: s(o.actor),
			transfer_id: s(o.transfer_id)
		}));
}

/** Every row as CSV text, a header line first, CRLF between records. */
export function coinRowsCsv(rows: readonly CoinExportRow[]): string {
	const lines = [COIN_EXPORT_COLUMNS.map((c) => cell(c.header)).join(',')];
	for (const row of rows) lines.push(COIN_EXPORT_COLUMNS.map((c) => cell(row[c.key])).join(','));
	return lines.join('\r\n') + '\r\n';
}

/** "idea-coins-2026-10-15" for a file name, on the school's day. */
export function coinExportName(now: number): string {
	const day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
	return `idea-coins-${day}`;
}
