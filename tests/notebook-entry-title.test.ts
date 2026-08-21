// tests/notebook-entry-title.test.ts
//
// WHAT AN ENTRY IS CALLED once its pages have been deleted.
//
// WHY THIS EARNS A TEST when most of this repo is verified by a harness: every
// way of getting this wrong fails SILENTLY. `entryTitle` returns a printable
// string in all four cases below -- the feed renders, the review panel renders,
// search runs, the clipboard copies -- and the only symptom of a bad order is
// that an entry is named after something that is no longer in it, or loses the
// name it has always had. Nothing throws and nothing looks broken.
//
// THE ORDER UNDER TEST, and it is the whole subject:
//
//   session label -> custom_label -> a LIVE photo's filename -> the first
//   note's opening words -> a REMOVED photo's filename -> "Untitled entry"
//
// The two steps that used to be one are the point. Before this, ANY photo's
// filename outranked a note, so an entry whose pages were all deleted was
// still titled after a page that is gone. Filtering that step through
// `livePhotos` and accepting the fallthrough would have been the smaller
// change and is the wrong one: an entry with a removed page and a live note
// would land on "Untitled entry", which is what `isUntitled` then reports to
// the card, the review panel, search and the clipboard.
//
// THE NOTE FIXTURES GO THROUGH THE REAL PRODUCER. `normalizeNoteDoc` is the
// server-side translator every stored note is built by, so what these tests
// hand `entryTitle` is a document the app can actually hold rather than a
// hand-typed shape that may not be reachable.
//
// The PHOTO fixtures are hand-built notebook_entry_photos rows, because their
// producer is a SQL insert behind an RPC and there is no client-side function
// that emits one. They carry exactly the columns the select ladder asks for
// (src/lib/notebook-selects.ts) and nothing else.

import { describe, expect, it } from 'vitest';
import {
	UNTITLED_ENTRY,
	entryPlainText,
	entryTitle,
	isUntitled,
	type NotebookEntry,
	type NotebookPhoto
} from '$lib/notebook';
import { entrySearchText } from '$lib/notebook-folders';
import type { NotebookNoteRow } from '$lib/notebook-notes';
import { normalizeNoteDoc } from '$lib/server/notebook-notes';

/**
 * A stored note, built by the SAME translator the note route runs. A refusal
 * here is a broken fixture, not a result to reason about, so it throws.
 */
function note(text: string, overrides: Partial<NotebookNoteRow> = {}): NotebookNoteRow {
	const result = normalizeNoteDoc({
		type: 'doc',
		content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
	});
	if (!result.ok) throw new Error(`fixture note refused: ${result.error}`);
	return {
		id: 'note-1',
		entry_id: 'entry-1',
		note_id: 'note-1',
		revision: 1,
		content: result.doc,
		created_at: '2026-03-02T09:00:00Z',
		deleted_at: null,
		...overrides
	};
}

/** A notebook_entry_photos row as the feed rung selects it. */
function photo(overrides: Partial<NotebookPhoto> = {}): NotebookPhoto {
	return {
		id: 'photo-1',
		drive_file_id: 'drive-1',
		variant: 'original',
		sequence_order: 1,
		original_filename: 'bearing-teardown.jpg',
		removed_at: null,
		...overrides
	};
}

/**
 * An UNLABELED entry: no session, no custom_label. Every case below differs
 * only in its photos and notes, so the two steps above the ones under test are
 * held constant rather than re-stated in each one.
 */
function entry(photos: NotebookPhoto[], notes: NotebookNoteRow[]): NotebookEntry {
	return {
		id: 'entry-1',
		session_id: null,
		section_id: 'section-1',
		folder_id: null,
		pinned_at: null,
		custom_label: null,
		upload_timestamp: '2026-03-02T08:00:00Z',
		submitted_at: '2026-03-02T08:00:00Z',
		status: 'compliant',
		reviewed_at: null,
		flag_reason: null,
		instructor_comment: null,
		session: null,
		photos,
		notes
	};
}

const REMOVED = '2026-03-05T12:00:00Z';

describe('entryTitle: the four fallback cases', () => {
	it('a live photo names the entry', () => {
		const e = entry([photo()], []);
		expect(entryTitle(e)).toBe('bearing-teardown');
		expect(isUntitled(e)).toBe(false);
	});

	it('a removed photo plus a live note is named by the NOTE', () => {
		const e = entry([photo({ removed_at: REMOVED })], [note('Bore measured at 12.04 mm.')]);
		expect(entryTitle(e)).toBe('Bore measured at 12.04 mm.');
		expect(isUntitled(e)).toBe(false);
	});

	it('a removed photo with no note keeps the removed filename', () => {
		const e = entry([photo({ removed_at: REMOVED })], []);
		expect(entryTitle(e)).toBe('bearing-teardown');
		expect(isUntitled(e)).toBe(false);
	});

	it('nothing at all is the placeholder', () => {
		const e = entry([], []);
		expect(entryTitle(e)).toBe(UNTITLED_ENTRY);
		expect(isUntitled(e)).toBe(true);
	});
});

describe('entryTitle: the order between the steps', () => {
	// The POSITIVE CONTROL for the second case above: the same entry with its
	// photo still live is named by the PHOTO, so the note step is genuinely
	// reached by removal rather than by always winning.
	it('a live photo outranks a note', () => {
		const e = entry([photo()], [note('Bore measured at 12.04 mm.')]);
		expect(entryTitle(e)).toBe('bearing-teardown');
	});

	it('a live photo outranks a removed one, whatever their sequence order', () => {
		const e = entry(
			[
				photo({ id: 'p1', sequence_order: 1, original_filename: 'gone.jpg', removed_at: REMOVED }),
				photo({ id: 'p2', sequence_order: 2, original_filename: 'still-here.jpg' })
			],
			[]
		);
		expect(entryTitle(e)).toBe('still-here');
	});

	it('among live photos the lowest sequence order still wins', () => {
		const e = entry(
			[
				photo({ id: 'p2', sequence_order: 2, original_filename: 'page-two.jpg' }),
				photo({ id: 'p1', sequence_order: 1, original_filename: 'page-one.jpg' })
			],
			[]
		);
		expect(entryTitle(e)).toBe('page-one');
	});

	it('among removed photos the lowest sequence order still wins', () => {
		const e = entry(
			[
				photo({
					id: 'p2',
					sequence_order: 2,
					original_filename: 'page-two.jpg',
					removed_at: REMOVED
				}),
				photo({
					id: 'p1',
					sequence_order: 1,
					original_filename: 'page-one.jpg',
					removed_at: REMOVED
				})
			],
			[]
		);
		expect(entryTitle(e)).toBe('page-one');
	});

	// A photo with NO `removed_at` FIELD is live -- the pre-0116 read, where
	// the column does not exist and nothing can have been removed. Asserted
	// because the split now runs this shape through two filters instead of
	// none, and a `!== null` in either would silently reclassify every entry
	// read on a narrower rung as having no live pages.
	it('a photo read on a rung with no removed_at column is live', () => {
		const bare: NotebookPhoto = {
			id: 'photo-1',
			drive_file_id: 'drive-1',
			variant: 'original',
			sequence_order: 1,
			original_filename: 'bearing-teardown.jpg'
		};
		expect(entryTitle(entry([bare], [note('Bore measured at 12.04 mm.')]))).toBe(
			'bearing-teardown'
		);
	});

	it('a session label and a typed title still outrank every photo and note', () => {
		const photos = [photo({ removed_at: REMOVED })];
		const notes = [note('Bore measured at 12.04 mm.')];

		const titled: NotebookEntry = { ...entry(photos, notes), custom_label: 'Bearing teardown' };
		expect(entryTitle(titled)).toBe('Bearing teardown');

		const scheduled: NotebookEntry = {
			...titled,
			session_id: 'session-1',
			session: { session_label: 'Unit 3 check-in', unit_number: 3, session_date: '2026-03-02' }
		};
		expect(entryTitle(scheduled)).toBe('Unit 3 check-in');
	});
});

// ---------------------------------------------------------------------------
// The consumers
//
// entryTitle has four: the entry card (which also asks isUntitled), the review
// panel, entrySearchText, and entryPlainText. The card and the panel render the
// string this file already pins, so what is left to assert is the two that
// TRANSFORM it -- on the one entry state the reorder changes, which is a
// removed photo beside a live note.
// ---------------------------------------------------------------------------

describe('entryTitle consumers on an entry whose pages were all removed', () => {
	const removedWithNote = entry(
		[photo({ removed_at: REMOVED })],
		[note('Bore measured at 12.04 mm.')]
	);

	it('search still finds the entry by its removed page filename', () => {
		// entrySearchText adds every photo filename to the haystack separately,
		// live or not, so narrowing the TITLE narrows nothing a student can
		// search for. Both terms, so neither can pass on the other's presence.
		const haystack = entrySearchText(removedWithNote);
		expect(haystack).toContain('bearing-teardown');
		expect(haystack).toContain('bore measured');
	});

	it('the clipboard copy carries a title instead of starting at the date', () => {
		// entryPlainText omits the title line entirely when it is the
		// placeholder. Under the old order this entry was titled after a
		// deleted page; under the new one it is titled after what it says.
		const text = entryPlainText(removedWithNote);
		expect(text.split('\n')[0]).toBe('Bore measured at 12.04 mm.');
		expect(text).not.toContain(UNTITLED_ENTRY);
	});

	it('an entry with nothing left at all still omits the title line', () => {
		// The POSITIVE CONTROL for the assertion above: entryPlainText really
		// does drop the head line for a placeholder title, so the previous test
		// is checking something that can fail.
		const named = entryPlainText(entry([photo({ removed_at: REMOVED })], []));
		expect(named.split('\n')[0]).toBe('bearing-teardown');

		const bare = entryPlainText(entry([], []));
		expect(bare).not.toContain(UNTITLED_ENTRY);
		expect(bare.split('\n')[0]).toBe('March 2, 2026');
	});
});
