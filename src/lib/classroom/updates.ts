/**
 * The student-facing classroom update log.
 *
 * The content lives in `classroom-updates.json` at the repo root and is
 * imported as plain JSON (the mdm-drill-banks.json convention -- data, not a
 * parsed markdown seed, so there is no parser to get wrong and no build step to
 * fail). It is client-safe: everything in it is written to be read by students.
 *
 * STANDING RULE, also stated in CLAUDE.md: every session that changes
 * classroom-facing behaviour appends a dated, student-readable entry to that
 * file before committing. "Student-readable" is the whole bar -- an entry
 * naming a migration, a table or an RPC is a commit message that wandered into
 * the wrong file.
 */

import raw from '../../../classroom-updates.json';

export interface ClassroomUpdate {
	/** YYYY-MM-DD. */
	date: string;
	title: string;
	body: string;
	/** Where in the classroom this lands ("Stream", "Classwork", ...). */
	tags: string[];
}

const entries = ((raw as { entries?: unknown[] }).entries ?? []) as Record<string, unknown>[];

/** Newest first. Entries may be appended anywhere in the file; this sorts. */
export const CLASSROOM_UPDATES: ClassroomUpdate[] = entries
	.map((e) => ({
		date: String(e.date ?? ''),
		title: String(e.title ?? ''),
		body: String(e.body ?? ''),
		tags: Array.isArray(e.tags) ? (e.tags as string[]) : []
	}))
	.filter((e) => e.date && e.title)
	.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

/** The compact panel on the classroom home shows only the newest few. */
export function recentUpdates(limit = 3): ClassroomUpdate[] {
	return CLASSROOM_UPDATES.slice(0, limit);
}

/** "Aug 11, 2026" from the YYYY-MM-DD in the file, parsed as a LOCAL date. */
export function updateDateLabel(date: string): string {
	const [y, m, d] = date.split('-').map((n) => Number.parseInt(n, 10));
	if (!y || !m || !d) return date;
	// Deliberately not new Date('2026-08-11'), which parses as UTC midnight and
	// renders as the day BEFORE for anyone west of Greenwich -- including every
	// student here.
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

/** One calendar month of the log: its key (`YYYY-MM`), its name, its entries newest first. */
export interface UpdateMonth {
	key: string;
	label: string;
	entries: ClassroomUpdate[];
}

/**
 * THE LOG BY MONTH, newest month first (ledger 0297, LEARN). The page used to
 * be one list of every entry -- 176 of them, 42,751px tall at 1440 -- so the
 * newest month is open and every older month folds behind its own name.
 * Grouping reads the month straight off the `YYYY-MM-DD` in the file, never
 * through a `Date`, so no time zone can move an entry into its neighbour.
 * The label is en-US, fixed, so the server and the browser print the same one.
 */
export function updatesByMonth(updates: readonly ClassroomUpdate[] = CLASSROOM_UPDATES): UpdateMonth[] {
	const months: UpdateMonth[] = [];
	for (const u of updates) {
		const key = u.date.slice(0, 7);
		let month = months.find((m) => m.key === key);
		if (!month) {
			month = { key, label: monthLabel(key), entries: [] };
			months.push(month);
		}
		month.entries.push(u);
	}
	return months.sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * One month's entries by DAY, newest first, keeping the file's order inside a
 * day. The day is printed once as a heading instead of on every entry, which
 * is most of what made the page long: 84 entries in one month is about a dozen
 * days.
 */
export function updatesByDay(entries: readonly ClassroomUpdate[]): { date: string; entries: ClassroomUpdate[] }[] {
	const days: { date: string; entries: ClassroomUpdate[] }[] = [];
	for (const u of entries) {
		let day = days.find((d) => d.date === u.date);
		if (!day) {
			day = { date: u.date, entries: [] };
			days.push(day);
		}
		day.entries.push(u);
	}
	return days.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** "September 2026" from "2026-09". */
export function monthLabel(key: string): string {
	const [y, m] = key.split('-').map((n) => Number.parseInt(n, 10));
	if (!y || !m) return key;
	return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}
