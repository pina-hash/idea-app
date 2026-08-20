// tests/notebook-history.test.ts
//
// The per-entry timeline (0119). No database: this is a pure function over rows
// the notebook already stores, which is the whole design -- there is no event
// log table, so there is nothing here that could disagree with the rows.
//
// TWO GUARANTEES ARE WORTH PINNING, and both fail silently rather than loudly.
//
//   1. ABSENT IS NOT NULL. Every optional stamp is `undefined` on a read from a
//      narrower rung of the select ladder, where the column does not exist. An
//      event may be emitted only from a stamp that is actually there -- a
//      timeline that read `undefined` as "now" or as a real value would invent
//      history that never happened, on exactly the projects least able to argue
//      with it.
//   2. A DELETED NOTE KEEPS ITS HISTORY HERE. Everywhere else in the notebook a
//      deleted note is dropped; the timeline is the ONE surface that must show
//      it, because it is what a student is reading when they decide whether to
//      restore it. Collapsing it to a single "a note was removed" line would
//      make the history useless for the one job it has.

import { describe, expect, it } from 'vitest';
import { entryTimeline, hasTimeline, type TimelineEntry } from '../src/lib/notebook-history';
import type { NotebookNoteRow } from '../src/lib/notebook-notes';
import type { NotebookPhoto } from '../src/lib/notebook';

function note(
	noteId: string,
	revision: number,
	createdAt: string,
	deletedAt: string | null = null
): NotebookNoteRow {
	return {
		id: `${noteId}-r${revision}`,
		entry_id: 'e1',
		note_id: noteId,
		revision,
		content: [{ type: 'p', runs: [{ text: `revision ${revision}` }] }],
		created_at: createdAt,
		deleted_at: deletedAt
	};
}

function photo(id: string, seq: number, extra: Partial<NotebookPhoto> = {}): NotebookPhoto {
	return {
		id,
		drive_file_id: `drive-${id}`,
		variant: 'original',
		sequence_order: seq,
		original_filename: `${id}.jpg`,
		...extra
	};
}

/** Stamps chosen so every event lands on its own distinct instant. */
const T = {
	created: '2026-03-01T09:00:00.000Z',
	photo1: '2026-03-01T09:05:00.000Z',
	note1: '2026-03-01T09:10:00.000Z',
	note2: '2026-03-02T09:00:00.000Z',
	photoGone: '2026-03-02T10:00:00.000Z',
	noteGone: '2026-03-02T11:00:00.000Z',
	submitted: '2026-03-03T08:00:00.000Z',
	reviewed: '2026-03-04T08:00:00.000Z',
	entryGone: '2026-03-05T08:00:00.000Z'
};

describe('entryTimeline', () => {
	it('assembles every kind of event, oldest first', () => {
		const entry: TimelineEntry = {
			upload_timestamp: T.created,
			submitted_at: T.submitted,
			reviewed_at: T.reviewed,
			deleted_at: T.entryGone,
			photos: [photo('p1', 1, { created_at: T.photo1, removed_at: T.photoGone })],
			notes: [note('n1', 1, T.note1), note('n1', 2, T.note2, T.noteGone)]
		};

		expect(entryTimeline(entry).map((e) => [e.kind, e.at])).toEqual([
			['entry_created', T.created],
			['photo_added', T.photo1],
			['note_written', T.note1],
			['note_edited', T.note2],
			['photo_removed', T.photoGone],
			['note_deleted', T.noteGone],
			['entry_submitted', T.submitted],
			['entry_reviewed', T.reviewed],
			['entry_deleted', T.entryGone]
		]);
	});

	it('keeps a deleted note’s revisions, and a removed photo’s upload', () => {
		// The exclusion everywhere else, inverted here on purpose. Both threads
		// are on one entry so the assertion has its own positive control: the
		// live note is present too, and the deleted one is not merely everything.
		const entry: TimelineEntry = {
			upload_timestamp: T.created,
			photos: [photo('p1', 1, { created_at: T.photo1, removed_at: T.photoGone })],
			notes: [
				note('gone', 1, T.note1, T.noteGone),
				note('gone', 2, T.note2, T.noteGone),
				note('kept', 1, '2026-03-02T09:30:00.000Z')
			]
		};
		const events = entryTimeline(entry);

		// Both revisions of the deleted note survived into the history, with the
		// removal after them, and the note's text came along for each.
		const gone = events.filter((e) => e.noteId === 'gone');
		expect(gone.map((e) => e.kind)).toEqual(['note_written', 'note_edited', 'note_deleted']);
		expect(gone[0].revision).toBe(1);
		expect(gone[1].revision).toBe(2);
		expect(gone[1].note?.content).toEqual([{ type: 'p', runs: [{ text: 'revision 2' }] }]);
		// Positive control: the live note is here as well, and was NOT deleted.
		const kept = events.filter((e) => e.noteId === 'kept');
		expect(kept.map((e) => e.kind)).toEqual(['note_written']);
		// And the removed photo kept the event that put it there.
		expect(events.filter((e) => e.photo?.id === 'p1').map((e) => e.kind)).toEqual([
			'photo_added',
			'photo_removed'
		]);
	});

	it('emits nothing for a stamp the read never asked for', () => {
		// A pre-0119 read: no photo `created_at`, no `reviewed_at`, no note
		// `deleted_at` anywhere. Exactly one event, and it is the only stamp that
		// is never optional.
		const entry: TimelineEntry = {
			upload_timestamp: T.created,
			photos: [photo('p1', 1)],
			notes: [{ ...note('n1', 1, T.note1), deleted_at: undefined }]
		};
		const events = entryTimeline(entry);
		expect(events.map((e) => e.kind)).toEqual(['entry_created', 'note_written']);
		expect(events.some((e) => e.kind === 'photo_added')).toBe(false);
		expect(events.some((e) => e.kind === 'entry_reviewed')).toBe(false);
		expect(events.some((e) => e.kind === 'note_deleted')).toBe(false);

		// POSITIVE CONTROL: hand in the same entry from a WIDE read and all three
		// appear, so the absences above are the missing stamps and not a function
		// that emits nothing.
		const wide: TimelineEntry = {
			...entry,
			reviewed_at: T.reviewed,
			photos: [photo('p1', 1, { created_at: T.photo1 })],
			notes: [note('n1', 1, T.note1, T.noteGone)]
		};
		const wideKinds = entryTimeline(wide).map((e) => e.kind);
		expect(wideKinds).toContain('photo_added');
		expect(wideKinds).toContain('entry_reviewed');
		expect(wideKinds).toContain('note_deleted');
	});

	it('breaks a tie causally, not arbitrarily', () => {
		// notebook_create_note_entry writes the entry and its first note in ONE
		// transaction, so these genuinely share an instant. The entry must come
		// first: a note on an entry that does not exist yet is not a history.
		const entry: TimelineEntry = {
			upload_timestamp: T.created,
			submitted_at: T.created,
			photos: [photo('p1', 1, { created_at: T.created })],
			notes: [note('n1', 1, T.created)]
		};
		expect(entryTimeline(entry).map((e) => e.kind)).toEqual([
			'entry_created',
			'photo_added',
			'note_written',
			'entry_submitted'
		]);
	});

	it('orders a note’s own revisions by revision, never by chance', () => {
		// Two revisions written inside the same clock tick. `revision` is the
		// only thing that can order them, and it is what the sort falls back to.
		const entry: TimelineEntry = {
			upload_timestamp: T.created,
			photos: [],
			notes: [note('n1', 2, T.note1), note('n1', 1, T.note1)]
		};
		expect(entryTimeline(entry).map((e) => e.revision)).toEqual([undefined, 1, 2]);
	});
});

describe('hasTimeline', () => {
	it('is false for an entry whose only event is its own creation', () => {
		// Every entry ever made has that one, so a disclosure keyed on it would
		// appear on all of them and say nothing.
		expect(hasTimeline({ upload_timestamp: T.created, photos: [], notes: [] })).toBe(false);
	});

	it('is true as soon as anything else has happened', () => {
		expect(
			hasTimeline({
				upload_timestamp: T.created,
				submitted_at: T.submitted,
				photos: [],
				notes: []
			})
		).toBe(true);
	});
});
