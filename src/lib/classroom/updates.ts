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
