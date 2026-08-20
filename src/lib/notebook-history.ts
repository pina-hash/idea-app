/**
 * Digital notebook, PER-ENTRY HISTORY (0119): what happened to one entry, and
 * when, assembled from rows the notebook already stores.
 *
 * Plain data + pure functions only (the notebook.ts / notebook-notes.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that cannot
 * run in a dev harness with no backend.
 *
 * THERE IS NO EVENT LOG TABLE, AND THERE MUST NOT BE. Every fact a timeline
 * needs is already a timestamp on a row that has to exist anyway:
 *
 *   the entry   upload_timestamp, submitted_at, reviewed_at, deleted_at
 *   a photo     created_at, removed_at
 *   a note      created_at (per revision), revision, deleted_at
 *
 * A log table would be a SECOND record of those same facts, free to disagree
 * with them -- a write that forgets to log, a log row for a write that rolled
 * back, a backfill that has no events for anything older than itself. This
 * schema derives rather than stores everywhere else (a coin balance is a
 * `sum()`, a note's current text is a `max()`), and the same argument applies
 * exactly: the rows ARE the log, so reading them cannot drift from them.
 *
 * WHAT THIS CANNOT SHOW, AND IT IS NOT AN OVERSIGHT. A title change writes no
 * timestamp -- `notebook_set_entry_label` overwrites `custom_label` in place --
 * so A RENAME IS INVISIBLE HERE. So are filing an entry into a folder and
 * pinning it, which are state rather than events. Nothing was added to the
 * schema to close that: a column added in passing, to a migration that was
 * about note deletion, is how a schema grows fields nobody can explain. The
 * timeline is honest about the events it can see and silent about the rest.
 *
 * ABSENT IS NOT NULL, throughout. Every optional field below is `undefined` on
 * a read from a narrower rung of the select ladder, where the column does not
 * exist -- and an event is emitted only from a stamp that is actually PRESENT.
 * So a pre-0119 read produces a shorter timeline, never a wrong one that claims
 * an entry was never reviewed because the column was not asked for.
 */

import type { NotebookPhoto } from '$lib/notebook';
import { deletedNoteThreads, noteThreads, type NotebookNoteRow } from '$lib/notebook-notes';

/**
 * The kinds of thing that can happen to an entry, which is exactly the set of
 * stamps listed above and deliberately no larger.
 */
export type NotebookEventKind =
	| 'entry_created'
	| 'photo_added'
	| 'note_written'
	| 'note_edited'
	| 'entry_submitted'
	| 'entry_reviewed'
	| 'photo_removed'
	| 'note_deleted'
	| 'entry_deleted';

export interface NotebookEvent {
	kind: NotebookEventKind;
	/** The stamp this event was read from, verbatim. */
	at: string;
	/** The photo, for the two `photo_*` kinds. */
	photo?: NotebookPhoto;
	/** The LOGICAL note id, for the three `note_*` kinds. */
	noteId?: string;
	/** Which revision was written, for `note_written` (1) and `note_edited` (2+). */
	revision?: number;
	/**
	 * The note's text at this revision, for `note_written` and `note_edited`, so
	 * a history can show what was actually written without a second lookup.
	 */
	note?: NotebookNoteRow;
}

/**
 * The subset of an entry a timeline reads. A STRUCTURAL TYPE rather than
 * `NotebookEntry`, so the student's feed, the review console and a harness can
 * each hand in what they hold without one of them having to fabricate the
 * fields it does not.
 */
export interface TimelineEntry {
	upload_timestamp: string;
	submitted_at?: string | null;
	reviewed_at?: string | null;
	deleted_at?: string | null;
	photos: NotebookPhoto[];
	notes: NotebookNoteRow[];
}

/**
 * Ties break by this order rather than arbitrarily, because several of these
 * genuinely share an instant: a note-only entry's creation and its first note
 * are written in one transaction (`notebook_create_note_entry`), and an entry
 * turned in the moment it is made carries the same stamp twice. The order is
 * causal -- a thing exists before it is added to, is added to before it is
 * turned in, is turned in before it is reviewed, and is removed last.
 */
const KIND_ORDER: NotebookEventKind[] = [
	'entry_created',
	'photo_added',
	'note_written',
	'note_edited',
	'entry_submitted',
	'entry_reviewed',
	'photo_removed',
	'note_deleted',
	'entry_deleted'
];

function rank(kind: NotebookEventKind): number {
	return KIND_ORDER.indexOf(kind);
}

/**
 * One entry's history, oldest first.
 *
 * NOTES COME THROUGH `noteThreads` / `deletedNoteThreads` RATHER THAN OFF THE
 * RAW ROWS, so the chain rule is applied once, where it is already written
 * down: a live thread contributes a `note_written` and one `note_edited` per
 * later revision, and a deleted thread contributes those SAME events plus the
 * `note_deleted` that ended it. A deleted note's history is the point -- it is
 * what a student is looking at when they decide whether to restore it -- so it
 * is included rather than collapsed to a single "a note was removed" line.
 *
 * A REMOVED PHOTO KEEPS ITS `photo_added` TOO, for the same reason.
 */
export function entryTimeline(entry: TimelineEntry): NotebookEvent[] {
	const events: NotebookEvent[] = [];

	events.push({ kind: 'entry_created', at: entry.upload_timestamp });

	for (const photo of entry.photos) {
		// `created_at` rides only the history rung of the select ladder; without
		// it there is no stamp to place the photo at, and inventing one from the
		// entry's own timestamp would report every photo as uploaded with it.
		if (photo.created_at) events.push({ kind: 'photo_added', at: photo.created_at, photo });
		if (photo.removed_at) events.push({ kind: 'photo_removed', at: photo.removed_at, photo });
	}

	const threads = [...noteThreads(entry.notes), ...deletedNoteThreads(entry.notes)];
	for (const thread of threads) {
		const ordered = [...thread.history].reverse().concat(thread.current);
		for (const revision of ordered) {
			events.push({
				kind: revision.revision === 1 ? 'note_written' : 'note_edited',
				at: revision.created_at,
				noteId: thread.noteId,
				revision: revision.revision,
				note: revision
			});
		}
		if (thread.deletedAt) {
			events.push({ kind: 'note_deleted', at: thread.deletedAt, noteId: thread.noteId });
		}
	}

	if (entry.submitted_at) events.push({ kind: 'entry_submitted', at: entry.submitted_at });
	if (entry.reviewed_at) events.push({ kind: 'entry_reviewed', at: entry.reviewed_at });
	if (entry.deleted_at) events.push({ kind: 'entry_deleted', at: entry.deleted_at });

	return events.sort(
		(a, b) =>
			a.at.localeCompare(b.at) ||
			rank(a.kind) - rank(b.kind) ||
			(a.revision ?? 0) - (b.revision ?? 0) ||
			(a.noteId ?? a.photo?.id ?? '').localeCompare(b.noteId ?? b.photo?.id ?? '')
	);
}

/**
 * Whether an entry has any history worth showing beyond the bare fact that it
 * was created. One event is every entry ever made, so a surface that renders a
 * "History" disclosure on that would render it on all of them and say nothing.
 */
export function hasTimeline(entry: TimelineEntry): boolean {
	return entryTimeline(entry).length > 1;
}
