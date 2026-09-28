// tests/dom/feedback-console-undo-mount.test.ts
//
// UNDO ON THE FEEDBACK CONSOLE (report R02), measured on the MOUNTED console:
// the wiring half. `tests/feedback-console-undo.test.ts` holds the pure
// bookkeeping; this holds what only a mount can see, and every one of these
// fails QUIETLY in a browser:
//
//   * the status an undo sends back is the one the report showed BEFORE the
//     press. Read after the write, the console's optimistic map already says
//     the new status, and an undo "back" to it lands and changes nothing;
//   * the undo reaches through the SAME transport the move used, and only for
//     the reports that landed;
//   * the LAST move only: a second move replaces the offer, so an undo never
//     reaches back past a press somebody just made;
//   * it is withdrawn after ten seconds on a real timer.
//
// Structure, events and a fake clock only; happy-dom has no layout engine, so
// nothing here measures a box. The 44px floor on the control is the source
// sweep in tests/feedback-coverage.test.ts, and its geometry is the
// browser-verify spec feedback-view-console.mjs.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
import type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Console = FeedbackConsole as unknown as Box;

function row(id: string, message: string, status: FeedbackStatus = 'new'): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: '/classroom',
		kind: 'bug',
		message,
		meta: { route: '/classroom', path: '/classroom' },
		status,
		created_at: '2026-09-25T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Student',
		submitter_email: 'a@boscotech.net'
	};
}

const ROWS = [row('a', 'first report'), row('b', 'second report'), row('c', 'third report')];

const mounted: Mounted[] = [];
afterEach(async () => {
	vi.useRealTimers();
	for (const m of mounted.splice(0)) await m.stop();
});

/** Mount the console with a recording transport that refuses the ids named. */
function open(refuse: string[] = []) {
	const calls: [string, FeedbackStatus][] = [];
	const setStatus = async (id: string, status: FeedbackStatus) => {
		calls.push([id, status]);
		return refuse.includes(id) ? { ok: false, message: 'Simulated refusal.' } : { ok: true };
	};
	const m = mountInto(Console, { rows: ROWS, setStatus });
	mounted.push(m);
	return { m, calls };
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}
function tick(el: HTMLInputElement): void {
	el.checked = !el.checked;
	el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** A row's own status button, by its word. */
function rowButton(m: Mounted, id: string, word: string): HTMLButtonElement {
	const article = m.one(`[data-testid="fbc-select-${id}"]`).closest('article')!;
	const btn = Array.from(article.querySelectorAll('button')).find((b) => b.textContent?.trim() === word);
	if (!btn) throw new Error(`no ${word} button on row ${id}`);
	return btn as HTMLButtonElement;
}

const undoButton = (m: Mounted) => m.all<HTMLButtonElement>('[data-testid="fbc-undo"]');
const note = (m: Mounted) => m.one('[data-testid="fbc-bulk-note"]').textContent?.trim() ?? '';
/** The ids on screen under the current tab. */
const shown = (m: Mounted) =>
	m.all('input[data-testid^="fbc-select-"]').map((el) => el.getAttribute('data-testid')!.slice('fbc-select-'.length));

describe('undo on the feedback console', () => {
	it('offers nothing before a move', () => {
		const { m } = open();
		expect(undoButton(m)).toHaveLength(0);
		expect(shown(m)).toEqual(['a', 'b', 'c']);
	});

	it('a single move says what moved, offers Undo in words, and Undo sends it back where it was', async () => {
		const { m, calls } = open();
		click(rowButton(m, 'a', 'Seen'));
		await m.settle();
		expect(calls).toEqual([['a', 'seen']]);
		// The report left the New tab, and the sentence says where it went.
		expect(shown(m)).toEqual(['b', 'c']);
		expect(note(m)).toContain('Moved 1 report to seen');
		expect(undoButton(m)).toHaveLength(1);
		expect(undoButton(m)[0].textContent?.trim()).toBe('Undo: back to new');

		click(undoButton(m)[0]);
		await m.settle();
		// THE SAME TRANSPORT, WITH THE STATUS FROM BEFORE THE PRESS.
		expect(calls).toEqual([
			['a', 'seen'],
			['a', 'new']
		]);
		expect(shown(m)).toEqual(['a', 'b', 'c']);
		expect(note(m)).toContain('Undid the move to seen: 1 report back to new');
		// Nothing is undoable in turn.
		expect(undoButton(m)).toHaveLength(0);
	});

	it('covers the LAST move only: a second move replaces the offer', async () => {
		const { m, calls } = open();
		click(rowButton(m, 'a', 'Seen'));
		await m.settle();
		click(rowButton(m, 'b', 'Spam'));
		await m.settle();
		expect(undoButton(m)).toHaveLength(1);
		click(undoButton(m)[0]);
		await m.settle();
		expect(calls).toEqual([
			['a', 'seen'],
			['b', 'spam'],
			['b', 'new']
		]);
		// `a` stays moved: the undo never reached back past `b`.
		expect(shown(m)).toEqual(['b', 'c']);
	});

	it('a bulk move offers an undo for exactly the reports that landed', async () => {
		const { m, calls } = open(['b']);
		for (const id of ['a', 'b', 'c']) tick(m.one<HTMLInputElement>(`[data-testid="fbc-select-${id}"]`));
		m.flush();
		click(m.one('[data-testid="fbc-bulk-resolved"]'));
		await m.settle();
		expect(calls.map(([id, s]) => `${id}:${s}`).sort()).toEqual(['a:resolved', 'b:resolved', 'c:resolved']);
		expect(undoButton(m)).toHaveLength(1);
		calls.length = 0;
		click(undoButton(m)[0]);
		await m.settle();
		// `b` was refused, never moved, and is not "undone".
		expect(calls.map(([id, s]) => `${id}:${s}`).sort()).toEqual(['a:new', 'c:new']);
		expect(shown(m)).toEqual(['a', 'b', 'c']);
	});

	it('is withdrawn after ten seconds, on a timer', async () => {
		vi.useFakeTimers();
		const { m } = open();
		click(rowButton(m, 'a', 'Seen'));
		// Let the transport's promise settle without the real-timer settle.
		await vi.advanceTimersByTimeAsync(0);
		m.flush();
		expect(undoButton(m)).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(9_999);
		m.flush();
		expect(undoButton(m)).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		m.flush();
		expect(undoButton(m)).toHaveLength(0);
		// The sentence about the move stays; only the way back expired.
		expect(note(m)).toContain('Moved 1 report to seen');
	});

	it('a move the server refused offers no undo of its own', async () => {
		const { m, calls } = open(['a']);
		click(rowButton(m, 'a', 'Seen'));
		await m.settle();
		expect(calls).toEqual([['a', 'seen']]);
		expect(undoButton(m)).toHaveLength(0);
		expect(shown(m)).toEqual(['a', 'b', 'c']);
	});
});
