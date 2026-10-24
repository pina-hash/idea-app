// tests/html-assignment-live-lock.test.ts
//
// LEDGER 0431: the pieces of "closing flips an open worksheet" and "Answers
// left" that are plain functions, with no browser. The browser half (the
// sentence appearing, the jump scrolling the page, full page filling the
// window) is tools/browser-verify/routes/html-assignment-live*.mjs.
//
// Silent if wrong:
//   * a refusal as shut that never tells the page, so the worksheet keeps
//     taking typing while every save is refused (the reported bug);
//   * what was typed after a close never sent once the teacher reopens, so the
//     student sees it on screen and the server never gets it;
//   * an Answers left list that disagrees with the rail's own count;
//   * a heartbeat `lock` key read as something other than the student's row.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HxAnswers, type HxAnswerTransports } from '../src/lib/classroom/html-assignment/answers';
import {
	hxAnswerWant,
	hxAnswersLeft,
	hxAnswersLeftCount,
	hxUnsavedAnswers
} from '../src/lib/classroom/html-assignment/answers-left';
import { hxProgress, hxProgressModuleLine } from '../src/lib/classroom/html-assignment/progress';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import { assignmentLockState } from '../src/lib/classroom/html-assignment/lock';
import { presenceLockOf } from '../src/lib/classroom/presence/transports';
import { HX_FOCUS_TYPE, hxFocusMessage } from '../src/lib/classroom/html-assignment/bridge';

function manifest(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Shop Fix Design 1',
		course: 'IDEA209H',
		points: 10,
		header: [{ id: 'who', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'm1',
				title: 'Measure it',
				points: 6,
				blocks: [
					{ id: 'm1-reading', field: 'reading', type: 'text', prompt: 'What does the caliper read?' } as never,
					{ id: 'm1-why', field: 'why', type: 'longText', minSentences: 2 },
					{ id: 'm1-shot', field: 'benchPhoto', type: 'image' },
					{ id: 'm1-extra', field: 'extra', type: 'longText', optional: true } as never
				],
				criteria: []
			},
			{
				id: 'm2',
				title: 'Check it',
				points: 4,
				blocks: [{ id: 'm2-done', field: 'checkedOff', type: 'checkbox' }],
				criteria: []
			}
		]
	} as HtmlAssignmentManifest;
}

describe('Answers left is the rail, as a list', () => {
	it('lists exactly the counted, unmet answers, grouped by module in order', () => {
		const m = manifest();
		const values = { studentName: '', reading: '2.50', why: 'One sentence.' };
		const progress = hxProgress(m, values, {});
		const groups = hxAnswersLeft(m, progress);
		expect(groups.map((g) => g.title)).toEqual(['Measure it', 'Check it']);
		expect(groups.flatMap((g) => g.items.map((i) => i.field))).toEqual(['why', 'benchPhoto', 'checkedOff']);
		// The header and the optional block are never listed, as the rail never counts them.
		expect(groups.flatMap((g) => g.items.map((i) => i.field))).not.toContain('studentName');
		expect(groups.flatMap((g) => g.items.map((i) => i.field))).not.toContain('extra');
		// The list and the chip are one answer: the count is the chip's number.
		expect(hxAnswersLeftCount(progress)).toBe(3);
		const m1 = progress.modules.find((x) => x.id === 'm1')!;
		expect(hxProgressModuleLine(m1)).toBe('Measure it: 2 answers left');
		expect(groups[0].items).toHaveLength(2);
	});

	it('names each row by its prompt, or by its place, and says what it wants', () => {
		const m = manifest();
		const progress = hxProgress(m, {}, {});
		const rows = hxAnswersLeft(m, progress).flatMap((g) => g.items);
		expect(rows.find((r) => r.field === 'reading')).toMatchObject({ label: 'What does the caliper read?', want: 'Empty' });
		expect(rows.find((r) => r.field === 'why')).toMatchObject({ label: 'Answer 2 of 3', want: 'Needs 2 sentences' });
		expect(rows.find((r) => r.field === 'benchPhoto')).toMatchObject({ label: 'Photo', want: 'Needs a photo' });
		expect(rows.find((r) => r.field === 'checkedOff')).toMatchObject({ want: 'Box to check' });
		const short = hxProgress(m, { why: 'One.' }, {}).blocks.find((b) => b.field === 'why')!;
		expect(hxAnswerWant(short)).toBe('1 more sentence');
	});

	it('is empty when everything is in (the control for the rows above)', () => {
		const m = manifest();
		const values = { reading: '2.50', why: 'It slipped. Now it holds.', checkedOff: true };
		const images = { benchPhoto: { url: '/x', name: 'b.png', caption: '' } };
		expect(hxAnswersLeft(m, hxProgress(m, values, images))).toEqual([]);
	});

	it('takes the student there through the bridge, by field name only', () => {
		expect(hxFocusMessage('why')).toEqual({ type: HX_FOCUS_TYPE, field: 'why' });
		expect(HX_FOCUS_TYPE).toBe('idea:focus');
	});
});

describe('what was typed after a close', () => {
	it('lists unsaved text with where it belongs, and counts the rest', () => {
		const m = manifest();
		const out = hxUnsavedAnswers(m, { why: 'Typed after the close.', checkedOff: true, reading: '' }, ['why', 'checkedOff', 'reading']);
		expect(out.answers).toEqual([{ field: 'why', where: 'Measure it', text: 'Typed after the close.' }]);
		expect(out.others).toBe(2);
		expect(hxUnsavedAnswers(m, { why: 'Saved.' }, [])).toEqual({ answers: [], others: 0 });
	});
});

describe('the heartbeat lock key', () => {
	it('reads the two columns the lock predicate reads, and nothing else', () => {
		expect(presenceLockOf({ state: 'submitted', submitted_at: null })).toEqual({ state: 'submitted', submitted_at: null });
		expect(assignmentLockState(presenceLockOf({ state: 'submitted', submitted_at: null }) as never)).toBe('closed');
		expect(assignmentLockState(presenceLockOf({ state: 'submitted', submitted_at: '2026-10-23T10:00:00Z' }) as never)).toBe('turned-in');
		expect(assignmentLockState(presenceLockOf({ state: 'draft', submitted_at: null }) as never)).toBe('open');
		// No row, or a shape that is not one, is "open", never a guess at closed.
		expect(presenceLockOf(null)).toBeNull();
		expect(presenceLockOf({ submitted_at: null })).toBeNull();
		expect(presenceLockOf('submitted')).toBeNull();
		expect(assignmentLockState(null)).toBe('open');
	});
});

describe('HxAnswers: a refusal as shut, and the reopen', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	function shop() {
		const state = { closed: false, calls: [] as string[], rows: new Map<string, unknown>() };
		const transports: HxAnswerTransports = {
			async saveResponse(_item, blockId, value) {
				state.calls.push(blockId);
				if (state.closed) return { ok: true, data: { ok: false, reason: 'locked' } };
				state.rows.set(blockId, value);
				return { ok: true, data: { ok: true } };
			}
		} as HxAnswerTransports;
		return { state, transports };
	}

	it('tells the page at the first refused write, keeps the text, and sends it again on reopen', async () => {
		const { state, transports } = shop();
		let locked = 0;
		const hx = new HxAnswers({ itemId: 'i', manifest: manifest(), transports, onlocked: () => (locked += 1) });

		state.closed = true;
		hx.change({ blockId: 'm1-why', field: 'why', value: 'Typed after the close.' });
		await vi.advanceTimersByTimeAsync(20_000);
		expect(locked).toBe(1);
		expect(state.calls).toEqual(['m1-why']);
		// Kept, not lost: the value is still the controller's, and still owed.
		expect(hx.values.why).toBe('Typed after the close.');
		expect(hx.unsavedFields()).toEqual(['why']);
		expect(state.rows.has('m1-why')).toBe(false);

		// A refusal is never retried on its own (one call above, after twenty seconds).
		state.closed = false;
		expect(hx.resendAfterReopen()).toBe(1);
		await vi.advanceTimersByTimeAsync(2_000);
		expect(state.rows.get('m1-why')).toEqual({ text: 'Typed after the close.' });
		expect(hx.unsavedFields()).toEqual([]);
		// Nothing left to resend the second time.
		expect(hx.resendAfterReopen()).toBe(0);
		hx.destroy();
	});

	it('an ordinary save never calls onlocked (the control)', async () => {
		const { transports } = shop();
		let locked = 0;
		const hx = new HxAnswers({ itemId: 'i', manifest: manifest(), transports, onlocked: () => (locked += 1) });
		hx.change({ blockId: 'm1-why', field: 'why', value: 'Open and saving.' });
		await vi.advanceTimersByTimeAsync(2_000);
		expect(locked).toBe(0);
		expect(hx.resendAfterReopen()).toBe(0);
		hx.destroy();
	});
});
