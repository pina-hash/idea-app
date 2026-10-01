// tests/classroom-live-work.test.ts
//
// THE CLASS LIST BESIDE AN OPEN WORKSHEET HEARS WHAT THE WORKSHEET KNOWS
// (ledger 0360, report d983e776), with no read.
//
// The section layout's `work` is read once per visit, so a student who
// finished a ported worksheet kept reading "Missing" in the list beside a rail
// that said "All filled in". Both failures here are silent: a row that stays
// Missing looks like any other Missing row, and a row that reads Complete over
// answers the server never got looks like finished work. So every case is a
// pair, and the expected chip comes from `studentWorkChip` over the overlaid
// row -- the same function the class page renders.

import { describe, expect, it } from 'vitest';
import { liveWorksheetCompletion, overlayWork } from '$lib/classroom/live-work';
import { hxProgress } from '$lib/classroom/html-assignment/progress';
import { studentWorkChip, type StudentWork } from '$lib/classroom/classroom';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const M: HtmlAssignmentManifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Concepts',
	course: 'IDEA100',
	points: 2,
	header: [],
	modules: [
		{
			id: 'm',
			title: 'Concepts',
			points: 2,
			blocks: [
				{ id: 'a', field: 'one', type: 'text' },
				{ id: 'b', field: 'two', type: 'text' }
			],
			criteria: []
		}
	]
};
const BOTH = { one: 'x', two: 'y' };
const ACK = { at: '2026-09-29T15:20:00.000Z', ok: true };
const ITEM = { kind: 'assignment' as const, due_at: '2026-09-29T06:59:00.000Z', points: 2 };
const NOW = '2026-09-29T15:30:00.000Z';

describe('liveWorksheetCompletion: an opinion only about stored work', () => {
	it('complete and stored: the instant of the last acknowledgement', () => {
		expect(liveWorksheetCompletion({ progress: hxProgress(M, BOTH), ack: ACK })).toBe(ACK.at);
	});

	it('nothing written this visit: no opinion, the server already said', () => {
		expect(liveWorksheetCompletion({ progress: hxProgress(M, BOTH), ack: null })).toBeUndefined();
	});

	it('filled but a counted field unsaved: no opinion (never Complete over unsaved work)', () => {
		const progress = hxProgress(M, BOTH, {}, { unsaved: ['two'] });
		expect(liveWorksheetCompletion({ progress, ack: ACK })).toBeUndefined();
	});

	it('an EMPTIED field still unsaved: no opinion either (the server still has the answer)', () => {
		const progress = hxProgress(M, { one: 'x' }, {}, { unsaved: ['two'] });
		expect(liveWorksheetCompletion({ progress, ack: ACK })).toBeUndefined();
	});

	it('not complete and that is stored: null', () => {
		expect(liveWorksheetCompletion({ progress: hxProgress(M, { one: 'x' }), ack: ACK })).toBeNull();
	});
});

describe('overlayWork: the server rows with the open worksheet on top', () => {
	const missing: Record<string, StudentWork> = {};
	const draft: Record<string, StudentWork> = { w: { state: 'in-progress', score: null } };

	it('a worksheet finished in this tab turns Missing into Complete, late, with no read', () => {
		expect(studentWorkChip(ITEM, missing.w, NOW).label).toBe('Missing');
		const out = overlayWork(missing, new Map([['w', ACK.at]]));
		expect(studentWorkChip(ITEM, out.w, NOW).label).toBe('Complete, late');
		const outDraft = overlayWork(draft, new Map([['w', ACK.at]]));
		expect(studentWorkChip(ITEM, outDraft.w, NOW).label).toBe('Complete, late');
	});

	it('THE CONTROL: no override, or an override for another item, changes nothing (same object)', () => {
		expect(overlayWork(draft, new Map())).toBe(draft);
		const other = overlayWork(draft, new Map([['x', ACK.at]]));
		expect(studentWorkChip(ITEM, other.w, NOW).label).toBe('Missing, draft saved');
	});

	it("never replaces the server's own completion instant with a later one", () => {
		const done: Record<string, StudentWork> = {
			w: { state: 'in-progress', score: null, completedAt: '2026-09-28T10:00:00.000Z' }
		};
		const out = overlayWork(done, new Map([['w', ACK.at]]));
		expect(out.w.completedAt).toBe('2026-09-28T10:00:00.000Z');
		expect(studentWorkChip(ITEM, out.w, NOW).label).toBe('Complete');
	});

	it('null takes a completion away once the emptying is stored', () => {
		const done: Record<string, StudentWork> = {
			w: { state: 'in-progress', score: null, completedAt: '2026-09-28T10:00:00.000Z' }
		};
		const out = overlayWork(done, new Map([['w', null]]));
		expect(out.w.completedAt).toBeUndefined();
		expect(studentWorkChip(ITEM, out.w, NOW).label).toBe('Missing, draft saved');
		expect(done.w.completedAt).toBe('2026-09-28T10:00:00.000Z');
	});

	it('never touches a submitted (closed) or returned row, in either direction', () => {
		const settled: Record<string, StudentWork> = {
			s: { state: 'submitted', score: null },
			r: { state: 'returned', score: 2, completedAt: '2026-09-28T10:00:00.000Z' }
		};
		const out = overlayWork(
			settled,
			new Map<string, string | null>([
				['s', ACK.at],
				['r', null]
			])
		);
		expect(out).toBe(settled);
		expect(studentWorkChip(ITEM, out.s, NOW).label).toBe('Submitted');
	});
});
