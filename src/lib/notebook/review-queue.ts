/**
 * REVIEW IN ONE PASS (ledger 0297, package F4b): the approve queue for one
 * class day, and the one-specific-next-step comment that goes with an
 * approval instead of a bare checkmark.
 *
 * WHAT IS IN THE QUEUE. One class day is one check-in column of the grid. A
 * cell is in the queue when it has an entry, nobody has acknowledged it yet,
 * and it is not flagged: a flag is a conversation already under way, and
 * sweeping it into "approve all" would withdraw the flag without anybody
 * having read the resubmission. "Cannot tell" (a deployment without 0121,
 * where `reviewed` is absent) is treated as "not reviewed", never as
 * "reviewed", so nothing silently drops out of view.
 *
 * NEW SINCE YOU LAST LOOKED. `lastLooked` is the reviewer's own default, per
 * class, in the preferences store: the queue filters to entries uploaded
 * after it, and opening the queue moves it to now. It is never stored per
 * entry; "everything not reviewed" is one press away for anything older.
 *
 * WHAT AN APPROVAL WRITES. With no comment it is 0121's acknowledgement
 * (`notebook_accept_entry`), which records that somebody looked and changes
 * nothing about the verdict. With a comment it is `notebook_resolve_entry`,
 * the one RPC that writes `instructor_comment`: it marks the entry compliant
 * and reviewed and carries the comment to the student. Which one is a pure
 * decision (`approveAction`), so the button and the loop cannot disagree.
 *
 * Pure: no Svelte, no transports.
 */

import { cellReviewed, type GridCell, type GridStudent, type SectionGrid } from '$lib/notebook-review';
import {
	LAST_LOOKED_MAX,
	NOTEBOOK_COMMENT_LENGTH,
	NOTEBOOK_COMMENT_MAX
} from '$lib/preferences/classroom';

export type QueueFilter = 'new' | 'all';

export interface QueueRow {
	cell: GridCell;
	student: GridStudent | undefined;
	entryId: string;
	/** Uploaded after the reviewer last looked (always true when they never have). */
	isNew: boolean;
}

/** The cells a reviewer can approve for one class day, in roster order. */
export function reviewQueue(
	grid: SectionGrid | null,
	sessionId: string | null,
	lastLooked: string | null,
	filter: QueueFilter
): QueueRow[] {
	if (!grid || !sessionId) return [];
	const since = lastLooked ? Date.parse(lastLooked) : NaN;
	const byKey = new Map(grid.students.map((s) => [s.student_key, s]));
	const order = new Map(grid.students.map((s, i) => [s.student_key, i]));
	const rows: QueueRow[] = [];
	for (const cell of grid.cells) {
		if (cell.session_id !== sessionId || !cell.entry_id) continue;
		if (cell.status === 'flagged') continue;
		if (cellReviewed(cell) === true) continue;
		const at = cell.upload_timestamp ? Date.parse(cell.upload_timestamp) : NaN;
		const isNew = Number.isNaN(since) || Number.isNaN(at) || at > since;
		if (filter === 'new' && !isNew) continue;
		rows.push({ cell, student: byKey.get(cell.student_key), entryId: cell.entry_id, isNew });
	}
	return rows.sort(
		(a, b) => (order.get(a.cell.student_key) ?? 0) - (order.get(b.cell.student_key) ?? 0)
	);
}

/** The class day the queue opens on: today's check-in, else the latest past one, else the first. */
export function queueDefaultSession(grid: SectionGrid | null, today: string): string | null {
	const sessions = [...(grid?.sessions ?? [])].sort((a, b) => a.session_date.localeCompare(b.session_date));
	if (!sessions.length) return null;
	return (
		sessions.find((s) => s.session_date === today)?.id ??
		sessions.filter((s) => s.session_date < today).pop()?.id ??
		sessions[0].id
	);
}

/** Which RPC an approval is: an acknowledgement, or a resolve that carries the comment. */
export function approveAction(comment: string | null | undefined): 'accept' | 'resolve' {
	return (comment ?? '').trim() ? 'resolve' : 'accept';
}

/** The reviewer's last-looked map after looking at one class now; oldest dropped past the cap. */
export function recordLook(
	lastLooked: Readonly<Record<string, string>>,
	sectionId: string,
	now: Date
): Record<string, string> {
	const next = { ...lastLooked, [sectionId]: now.toISOString() };
	const pairs = Object.entries(next).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
	return Object.fromEntries(pairs.slice(0, LAST_LOOKED_MAX));
}

/** An edited comment list, as it will be stored: trimmed, non-empty, unique, capped. */
export function cleanComments(list: readonly string[]): string[] {
	const out: string[] = [];
	for (const raw of list) {
		const c = raw.trim().slice(0, NOTEBOOK_COMMENT_LENGTH);
		if (c && !out.includes(c)) out.push(c);
		if (out.length >= NOTEBOOK_COMMENT_MAX) break;
	}
	return out;
}

/** "since 2:14 PM" today, "since Sep 22" before; the school's own clock. */
export function sinceLabel(iso: string | null, now: Date): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const day = (x: Date) => x.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
	if (day(d) === day(now)) {
		return d.toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' });
}
