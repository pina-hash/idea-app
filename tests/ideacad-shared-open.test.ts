// tests/ideacad-shared-open.test.ts
//
// THE PURE LAYER of the shared-open path: the row shaping, the total order, the
// summary and the words. No browser, no database.
//
// WHY THIS IS AUTOMATED. Two of these regress silently:
//
//   * A LIST THAT RESHUFFLES BETWEEN TWO RENDERS. Two documents shared by one
//     person tie on the owner address, and a comparator with no tie break leaves
//     their order to the engine. A list a student cannot point at reads as a
//     glitch nobody reports.
//
//   * A LABEL RESTATED RATHER THAN LOOKED UP. `sharing.ts` owns the words the
//     owner reads on the same screen; a second spelling here would look correct
//     and disagree with the chip beside it.
//
// The expected values come from `sharing.ts`'s own tables, which
// `tests/db/ideacad-sharing-pure.test.ts` pins against `0205`'s text -- not from
// this module's output.

import { describe, expect, it } from 'vitest';
import {
	IDEACAD_SHARED_ACCESS_LOST,
	IDEACAD_SHARED_UNAVAILABLE,
	ideacadSharedIsOpen,
	ideacadSharedOff,
	ideacadSharedOn,
	ideacadSharedRows,
	ideacadSharedSummary
} from '../src/lib/ideacad/shared-open';
import { IDEACAD_ROLE_LABELS, IDEACAD_ROLE_NOTES } from '../src/lib/ideacad/sharing';
import type { IdeacadSharedDocument } from '../src/lib/ideacad/sharing';

const doc = (
	documentId: string,
	ownerEmail: string,
	role: 'editor' | 'viewer'
): IdeacadSharedDocument => ({
	documentId,
	ownerEmail,
	role,
	grantedAt: '2026-09-12T17:00:00Z',
	updatedAt: '2026-09-13T00:00:00Z'
});

describe('ideacadSharedRows', () => {
	it('takes the label and the note from sharing.ts rather than restating them', () => {
		const [row] = ideacadSharedRows([doc('d1', 'ana@boscotech.net', 'viewer')]);
		expect(row.label).toBe(IDEACAD_ROLE_LABELS.viewer);
		expect(row.note).toBe(IDEACAD_ROLE_NOTES.viewer);
		expect(row.canWrite).toBe(false);
	});

	it('marks an editor writeable and a viewer not', () => {
		const rows = ideacadSharedRows([
			doc('d1', 'ana@boscotech.net', 'editor'),
			doc('d2', 'bea@boscotech.net', 'viewer')
		]);
		expect(rows.map((r) => r.canWrite)).toEqual([true, false]);
	});

	it('orders by owner address, case-insensitively', () => {
		const rows = ideacadSharedRows([
			doc('d1', 'Zoe@BoscoTech.net', 'viewer'),
			doc('d2', 'ana@boscotech.net', 'editor')
		]);
		expect(rows.map((r) => r.documentId)).toEqual(['d2', 'd1']);
	});

	it('BREAKS A TIE ON THE DOCUMENT ID, so the order is total', () => {
		// One person sharing two documents on one item is the tie, and without a
		// second term the two could swap between renders.
		const forward = ideacadSharedRows([
			doc('bbb', 'ana@boscotech.net', 'viewer'),
			doc('aaa', 'ana@boscotech.net', 'editor')
		]);
		const reversed = ideacadSharedRows([
			doc('aaa', 'ana@boscotech.net', 'editor'),
			doc('bbb', 'ana@boscotech.net', 'viewer')
		]);
		expect(forward.map((r) => r.documentId)).toEqual(['aaa', 'bbb']);
		// THE SAME ANSWER FROM EITHER INPUT ORDER is the property that matters;
		// asserting one ordering alone would pass on an unstable comparator.
		expect(reversed.map((r) => r.documentId)).toEqual(forward.map((r) => r.documentId));
	});

	it('does not mutate the list it was handed', () => {
		const input = [doc('bbb', 'zoe@boscotech.net', 'viewer'), doc('aaa', 'ana@boscotech.net', 'editor')];
		const before = input.map((d) => d.documentId);
		ideacadSharedRows(input);
		expect(input.map((d) => d.documentId)).toEqual(before);
	});
});

describe('ideacadSharedSummary', () => {
	it('is NULL for an empty list, never an empty string', () => {
		// Null is what lets a caller write `{#if summary}` without putting a blank
		// line on screen. Private by default is the normal state.
		expect(ideacadSharedSummary([])).toBeNull();
	});

	it('counts the two kinds separately and says the total', () => {
		const rows = ideacadSharedRows([
			doc('d1', 'ana@boscotech.net', 'editor'),
			doc('d2', 'bea@boscotech.net', 'viewer'),
			doc('d3', 'cal@boscotech.net', 'viewer')
		]);
		expect(ideacadSharedSummary(rows)).toBe('3 documents shared with you (1 you can edit, 2 to look at)');
	});

	it('names one document in the singular and omits the empty half', () => {
		const one = ideacadSharedRows([doc('d1', 'ana@boscotech.net', 'viewer')]);
		expect(ideacadSharedSummary(one)).toBe('1 document shared with you (1 to look at)');
		const editable = ideacadSharedRows([doc('d1', 'ana@boscotech.net', 'editor')]);
		// NO "0 to look at" CLAUSE. A zero half is omitted rather than printed.
		expect(ideacadSharedSummary(editable)).toBe('1 document shared with you (1 you can edit)');
	});
});

describe('ideacadSharedIsOpen', () => {
	it('compares the document id and never the owner', () => {
		// One person can share two documents on one item, so an owner comparison
		// would mark both rows open.
		const [a, b] = ideacadSharedRows([
			doc('aaa', 'ana@boscotech.net', 'editor'),
			doc('bbb', 'ana@boscotech.net', 'viewer')
		]);
		expect(ideacadSharedIsOpen(a, 'aaa')).toBe(true);
		expect(ideacadSharedIsOpen(b, 'aaa')).toBe(false);
	});

	it('is false when nothing is open', () => {
		const [a] = ideacadSharedRows([doc('aaa', 'ana@boscotech.net', 'editor')]);
		expect(ideacadSharedIsOpen(a, null)).toBe(false);
	});
});

describe('the capability ladder', () => {
	it('starts OFF with a reason and is turned on only deliberately', () => {
		expect(ideacadSharedOff()).toEqual({ ready: false, reason: IDEACAD_SHARED_UNAVAILABLE });
		expect(ideacadSharedOn()).toEqual({ ready: true, reason: null });
	});
});

describe('the words', () => {
	it('are DIFFERENT sentences for different states, and none duplicates a role note', () => {
		// "this deployment cannot ask" and "your access was removed" are two
		// different facts, and one sentence covering both is a lie about one.
		const all = [IDEACAD_SHARED_UNAVAILABLE, IDEACAD_SHARED_ACCESS_LOST];
		expect(new Set(all).size).toBe(2);
		// AND NEITHER RESTATES A ROLE NOTE. A third constant saying what
		// `IDEACAD_ROLE_NOTES.viewer` already says is the duplication rasterizing
		// caught: two paragraphs, one under the other, in different words.
		for (const note of Object.values(IDEACAD_ROLE_NOTES)) {
			expect(all).not.toContain(note);
		}
		for (const sentence of all) {
			// STUDENT-READABLE: no table, function or migration names, and no em dash.
			expect(sentence).not.toMatch(/ideacad_|_ideacad|0205|jsonb|RPC/);
			expect(sentence).not.toContain('—');
			expect(sentence.trim()).toBe(sentence);
		}
	});

	it('says what is still true before what is gone, in the access-lost sentence', () => {
		// A student who reads "access removed" and nothing else assumes the screen
		// is about to be taken away from them.
		expect(IDEACAD_SHARED_ACCESS_LOST).toContain('What is on screen is still here');
		expect(IDEACAD_SHARED_ACCESS_LOST).toMatch(/ask the owner/i);
	});
});
