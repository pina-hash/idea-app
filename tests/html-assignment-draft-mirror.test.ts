// tests/html-assignment-draft-mirror.test.ts
//
// A PORTED WORKSHEET'S BROWSER BACKUP COPY: the translation between the
// document's FIELDS and the column's BLOCK IDS, and the restore decision over
// it (ledger 0360, report d983e776).
//
// Every failure here is silent. A field mapped to the wrong block restores one
// answer into another question; a restore that ignores what the server holds
// writes an older answer over a newer one; a slot naming a block the manifest
// no longer declares restores into nothing and looks like it worked. The
// storage half (a real `localStorage`, the store's attach and teardown) is
// `tests/dom/html-assignment-answers-store.svelte.test.ts`, because only that
// project has a store.
//
// THE FIELDS AND BLOCK IDS ARE DIFFERENT STRINGS, so the identity function
// cannot pass for a working mapping.

import { describe, expect, it } from 'vitest';
import {
	hxMirrorBlockLabel,
	hxMirrorFrom,
	hxMirrorKey,
	hxMirrorValueLines,
	hxPlanRestore,
	hxRestoreMessage
} from '$lib/classroom/html-assignment/draft-mirror';
import { assignmentMirrorKey } from '$lib/classroom/assignment-draft-mirror';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const M: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Concept sketches',
	course: 'IDEA100',
	points: 4,
	header: [{ id: 'hdr-name', field: 'studentName', type: 'text' }],
	modules: [
		{
			id: 'concepts',
			title: 'Concepts',
			points: 4,
			blocks: [
				{ id: 'c-one', field: 'conceptOne', type: 'longText', prompt: 'Describe your first concept.' } as never,
				{ id: 'c-sure', field: 'confident', type: 'checkbox' },
				{ id: 'c-sketch', field: 'sketch', type: 'image' }
			],
			criteria: []
		}
	]
};

describe('the key is the spec mirror’s, per viewer and per item', () => {
	it('one shape, two segments', () => {
		expect(hxMirrorKey('user-a', 'item-1')).toBe(assignmentMirrorKey('user-a', 'item-1'));
		expect(hxMirrorKey('user-a', 'item-1')).not.toBe(hxMirrorKey('user-b', 'item-1'));
		expect(hxMirrorKey('user-a', 'item-1')).not.toBe(hxMirrorKey('user-a', 'item-2'));
	});
});

describe('hxMirrorFrom: fields to block ids, against what the server acknowledged', () => {
	it('every held value by block id, the image left out, the baseline only what was acknowledged', () => {
		const slot = hxMirrorFrom(
			M,
			'item-1',
			{ studentName: 'Ana', conceptOne: 'A cam.', confident: true, sketch: 'ignored' },
			{ 'hdr-name': { text: 'Ana' } },
			1000
		);
		expect(slot.v).toBe(1);
		expect(slot.itemId).toBe('item-1');
		expect(slot.at).toBe(1000);
		expect(slot.values).toEqual({
			'hdr-name': { text: 'Ana' },
			'c-one': { text: 'A cam.' },
			'c-sure': { checked: [true] }
		});
		expect(Object.keys(slot.baseline)).toEqual(['hdr-name']);
	});

	it('a field the manifest does not declare is not written', () => {
		const slot = hxMirrorFrom(M, 'item-1', { strayField: 'x' }, {}, 1);
		expect(slot.values).toEqual({});
	});
});

describe('hxPlanRestore: the three corners', () => {
	const slot = (values: Record<string, string | boolean>, acked: Record<string, unknown> = {}) =>
		hxMirrorFrom(M, 'item-1', values, acked as never, 1);

	it('RESTORE: the server never moved, so the browser copy is newer and goes back in by FIELD', () => {
		const plan = hxPlanRestore(M, slot({ conceptOne: 'Typed in the stall.' }), {});
		expect(plan?.values).toEqual({ conceptOne: 'Typed in the stall.' });
		expect(plan?.notice.restored).toEqual(['Concepts: "Describe your first concept."']);
		expect(plan?.notice.conflicts).toEqual([]);
	});

	it('LANDED: the write reached the server after all, so nothing is restored and the plan is null', () => {
		expect(hxPlanRestore(M, slot({ conceptOne: 'Saved fine.' }), { conceptOne: 'Saved fine.' })).toBeNull();
	});

	it('NOTHING OWED: the copy equals its own baseline, so nothing is restored', () => {
		expect(
			hxPlanRestore(M, slot({ conceptOne: 'Same.' }, { 'c-one': { text: 'Same.' } }), {})
		).toBeNull();
	});

	it('CONFLICT: both moved, so the saved answer wins and the browser copy is shown verbatim', () => {
		const plan = hxPlanRestore(
			M,
			slot({ conceptOne: 'My copy.\nSecond line.' }, { 'c-one': { text: 'Old.' } }),
			{ conceptOne: 'Newer, from another computer.' }
		);
		expect(plan?.values).toEqual({});
		expect(plan?.notice.conflicts).toEqual([
			{ blockId: 'c-one', label: 'Concepts: "Describe your first concept."', lines: ['My copy.', 'Second line.'] }
		]);
	});

	it('a block the manifest NO LONGER declares is dropped, never guessed at', () => {
		const stale = { ...slot({}), values: { 'gone-block': { text: 'orphan' } } };
		expect(hxPlanRestore(M, stale, {})).toBeNull();
	});

	it('a checkbox goes back as a boolean, its stored shape translated both ways', () => {
		const plan = hxPlanRestore(M, slot({ confident: false }), {});
		expect(plan?.values).toEqual({ confident: false });
		expect(hxMirrorValueLines({ checked: [false] })).toEqual(['Not checked']);
	});
});

describe('the words', () => {
	it('names a header block, a module block without a prompt, and an unknown id', () => {
		expect(hxMirrorBlockLabel(M, 'hdr-name')).toBe('Top of the page: studentName');
		expect(hxMirrorBlockLabel(M, 'c-sure')).toBe('Concepts: confident');
		expect(hxMirrorBlockLabel(M, 'nope')).toBe('nope');
	});

	it('the restore message says what happened, and that photos are not kept, with no em dash', () => {
		const one = hxRestoreMessage({ restored: ['x'], conflicts: [] });
		expect(one).toContain('An answer was put back from this computer');
		expect(one).toContain('Photos are not kept this way');
		const both = hxRestoreMessage({ restored: ['x', 'y'], conflicts: [{ blockId: 'b', label: 'l', lines: [] }] });
		expect(both).toContain('2 answers were put back');
		expect(both).toContain('One answer was not put back');
		expect(both).not.toContain('—');
	});
});
