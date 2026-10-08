// tests/dom/feedback-edit-mount.test.ts
//
// AN ADMIN'S OPEN EDIT OF A FILED REPORT NEVER VANISHES WITH ITS WORDS
// (0233, report d362bfb3), driven on the MOUNTED console with the REAL edit
// form inside it.
//
// The defect this pins: the form was mounted inside its report's card and
// was the only holder of what had been typed, so anything that took the card
// off the list -- the card's own Seen key, a bulk move, a filter tab --
// destroyed the typing with no question asked, and left the console's
// "unsaved work" flag set with no form anywhere on screen, so every other
// report's Edit key refused until the admin found the hidden one. Every one of
// those fails QUIETLY in a browser: nothing throws, the page looks fine, and
// the words are simply gone.
//
// What is held here, each with its positive control beside the absence:
//   * the card with its form open does not move from its own keys, and says
//     why in words, while another card's keys still move it;
//   * a filter that hides the open edit keeps it on screen under "Being
//     edited" with the words typed, and the list takes it back unchanged;
//   * a bulk move that hides it does the same, and a save from there lands
//     against the revision the edit was opened on;
//   * Edit on another report is refused only while the open one holds words
//     (and that form is always on screen), and opens once it holds none;
//   * a retry whose first attempt landed reads as a saved edit, not as
//     "nothing changed".
//
// Structure and events only: happy-dom has no layout engine, so nothing here
// measures a box. Geometry is the browser-verify spec
// feedback-view-console-edit-drive.mjs.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
import type {
	FeedbackEditInput,
	FeedbackEditResult,
	FeedbackHorizon,
	FeedbackRow,
	FeedbackStatus
} from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Console = FeedbackConsole as unknown as Box;

function row(id: string, message: string): FeedbackRow {
	return {
		id,
		app: 'portal',
		context: '/classroom',
		kind: 'bug',
		message,
		meta: { route: '/classroom', path: '/classroom' },
		status: 'new',
		created_at: '2026-10-06T09:02:00.000Z',
		reviewed_at: null,
		reviewed_by: null,
		submitter_name: 'A Student',
		submitter_email: 'a@boscotech.net',
		edit: null
	};
}

const ROWS = [row('a', 'first report'), row('b', 'second report'), row('c', 'third report')];
const TYPED = 'The first report, corrected by an admin.';

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

/**
 * Mount the console with recording transports. `answer` decides what the
 * edit transport says; by default every save lands as the next revision.
 */
function open(answer?: (input: FeedbackEditInput) => FeedbackEditResult) {
	const statusCalls: [string, FeedbackStatus][] = [];
	const horizonCalls: [string, FeedbackHorizon][] = [];
	const editCalls: [string, FeedbackEditInput][] = [];
	const setStatus = async (id: string, status: FeedbackStatus) => {
		statusCalls.push([id, status]);
		return { ok: true };
	};
	const setHorizon = async (id: string, horizon: FeedbackHorizon) => {
		horizonCalls.push([id, horizon]);
		return { ok: true };
	};
	const editFeedback = async (id: string, input: FeedbackEditInput): Promise<FeedbackEditResult> => {
		editCalls.push([id, input]);
		return answer ? answer(input) : { ok: true, changed: true, revision: input.baseRevision + 1 };
	};
	const m = mountInto(Console, { rows: ROWS, setStatus, setHorizon, editFeedback });
	mounted.push(m);
	return { m, statusCalls, horizonCalls, editCalls };
}

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}
function tick(el: HTMLInputElement): void {
	el.checked = !el.checked;
	el.dispatchEvent(new Event('change', { bubbles: true }));
}
function type(el: HTMLTextAreaElement, words: string): void {
	el.value = words;
	el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A card, by its report id. */
const card = (m: Mounted, id: string) => m.one(`[data-testid="fbc-select-${id}"]`).closest('article')!;
/** A card's own button, by its word. */
function cardButton(m: Mounted, id: string, word: string): HTMLButtonElement {
	const btn = Array.from(card(m, id).querySelectorAll('button')).find((b) => b.textContent?.trim() === word);
	if (!btn) throw new Error(`no ${word} button on report ${id}`);
	return btn as HTMLButtonElement;
}
/** A status filter tab, by its word ("Seen (2)" answers to "Seen"). */
function statusTab(m: Mounted, word: string): HTMLButtonElement {
	const btn = m
		.all<HTMLButtonElement>('.filters[aria-label="Status filter"] button')
		.find((b) => b.textContent?.trim().startsWith(`${word} (`));
	if (!btn) throw new Error(`no ${word} status tab`);
	return btn;
}
/** The open form's message box, wherever the form is. */
const messageBox = (m: Mounted) => m.one<HTMLTextAreaElement>('[data-testid="fbc-edit-form"] [data-testid="fbe-message"]');
const forms = (m: Mounted) => m.all('[data-testid="fbc-edit-form"]');
const pinned = (m: Mounted) => m.all('[data-testid="fbc-editing-hidden"]');
/** The ids in the filtered list, the "Being edited" section excluded. */
const listed = (m: Mounted) =>
	m
		.all('article.fb-row')
		.filter((a) => !a.closest('[data-testid="fbc-editing-hidden"]'))
		.map((a) => a.querySelector('input[data-testid^="fbc-select-"]')!.getAttribute('data-testid')!.slice('fbc-select-'.length));

/** Press Save edit: the form's own submit, which is what the button does. */
function save(m: Mounted): void {
	m.one('[data-testid="fbc-edit-form"]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

async function openAndType(m: Mounted, id: string, words = TYPED) {
	click(m.one(`[data-testid="fbc-edit-${id}"]`));
	await m.settle();
	type(messageBox(m), words);
	await m.settle();
}

describe('an open edit on the feedback console', () => {
	it('keeps its card in place: the card\'s own keys do not move it, and say why, while another card still moves', async () => {
		const { m, statusCalls, horizonCalls } = open();
		await openAndType(m, 'a');

		const seen = cardButton(m, 'a', 'Seen');
		expect(seen.getAttribute('aria-disabled')).toBe('true');
		const hold = m.one('[data-testid="fbc-edit-hold"]');
		expect(seen.getAttribute('aria-describedby')).toBe(hold.id);
		expect(hold.textContent).toContain('Save or discard the edit to move this report.');
		const later = cardButton(m, 'a', 'Move to long-term');
		expect(later.getAttribute('aria-disabled')).toBe('true');

		click(seen);
		click(later);
		await m.settle();
		expect(statusCalls).toEqual([]);
		expect(horizonCalls).toEqual([]);
		// Still there, still holding what was typed.
		expect(forms(m)).toHaveLength(1);
		expect(messageBox(m).value).toBe(TYPED);
		expect(listed(m)).toEqual(['a', 'b', 'c']);

		// POSITIVE CONTROL: the same keys on a card with no form open move it.
		expect(cardButton(m, 'b', 'Seen').getAttribute('aria-disabled')).toBeNull();
		click(cardButton(m, 'b', 'Seen'));
		await m.settle();
		click(cardButton(m, 'c', 'Move to long-term'));
		await m.settle();
		expect(statusCalls).toEqual([['b', 'seen']]);
		expect(horizonCalls).toEqual([['c', 'long_term']]);
		expect(m.all('[data-testid="fbc-edit-hold"]')).toHaveLength(1);
	});

	it('a filter that hides it keeps it on screen under Being edited with the words typed, and the list takes it back', async () => {
		const { m } = open();
		expect(pinned(m)).toHaveLength(0);
		await openAndType(m, 'a');
		expect(pinned(m)).toHaveLength(0);

		click(statusTab(m, 'Seen'));
		await m.settle();
		expect(listed(m)).toEqual([]);
		expect(pinned(m)).toHaveLength(1);
		expect(pinned(m)[0].textContent).toContain('These filters hide this report');
		expect(forms(m)).toHaveLength(1);
		expect(pinned(m)[0].contains(forms(m)[0])).toBe(true);
		expect(messageBox(m).value).toBe(TYPED);
		// The reopened form still reads as unsaved, so its Save is live.
		expect(m.one('[data-testid="fbe-save"]').getAttribute('aria-disabled')).toBe('false');

		click(statusTab(m, 'New'));
		await m.settle();
		expect(pinned(m)).toHaveLength(0);
		expect(listed(m)).toEqual(['a', 'b', 'c']);
		expect(card(m, 'a').contains(forms(m)[0])).toBe(true);
		expect(messageBox(m).value).toBe(TYPED);
	});

	it('a bulk move that hides it keeps it too, and a save from there lands against the revision it was opened on', async () => {
		const { m, statusCalls, editCalls } = open();
		tick(m.one<HTMLInputElement>('[data-testid="fbc-select-a"]'));
		tick(m.one<HTMLInputElement>('[data-testid="fbc-select-b"]'));
		await m.settle();
		await openAndType(m, 'a');

		click(m.one('[data-testid="fbc-bulk-seen"]'));
		await m.settle();
		expect(statusCalls).toEqual([
			['a', 'seen'],
			['b', 'seen']
		]);
		expect(listed(m)).toEqual(['c']);
		expect(pinned(m)).toHaveLength(1);
		expect(messageBox(m).value).toBe(TYPED);

		save(m);
		await m.settle();
		await m.settle();
		expect(editCalls).toHaveLength(1);
		expect(editCalls[0][0]).toBe('a');
		expect(editCalls[0][1].message).toBe(TYPED);
		expect(editCalls[0][1].baseRevision).toBe(0);
		// Saved: the form and the section close, and the note says it landed.
		expect(forms(m)).toHaveLength(0);
		expect(pinned(m)).toHaveLength(0);
		expect(m.one('[data-testid="fbc-edit-note"]').textContent).toContain('Saved your edit');
	});

	it('Edit on another report is refused only while the open one holds words, and that form is on screen', async () => {
		const { m } = open();
		await openAndType(m, 'a');
		click(m.one('[data-testid="fbc-edit-b"]'));
		await m.settle();
		expect(m.one('.feedback.error').textContent).toContain('Save or discard your edit to');
		expect(card(m, 'a').contains(forms(m)[0])).toBe(true);

		// Hidden by a filter, the form is still on screen to finish -- and
		// discarding it from there is what frees the Edit keys.
		click(statusTab(m, 'Seen'));
		await m.settle();
		expect(pinned(m)).toHaveLength(1);
		click(pinned(m)[0].querySelector('[data-testid="fbe-cancel"]')!);
		await m.settle();
		expect(forms(m)).toHaveLength(0);
		expect(pinned(m)).toHaveLength(0);
		click(statusTab(m, 'New'));
		await m.settle();
		click(m.one('[data-testid="fbc-edit-b"]'));
		await m.settle();
		expect(forms(m)).toHaveLength(1);
		expect(card(m, 'b').contains(forms(m)[0])).toBe(true);
		expect(m.all('.feedback.error')).toHaveLength(0);
	});

	it('an open edit holding no words is no reason to refuse, even when a filter hides it', async () => {
		const { m } = open();
		click(m.one('[data-testid="fbc-edit-a"]'));
		await m.settle();
		click(statusTab(m, 'Seen'));
		await m.settle();
		expect(pinned(m)).toHaveLength(1);
		click(statusTab(m, 'New'));
		await m.settle();
		click(m.one('[data-testid="fbc-edit-b"]'));
		await m.settle();
		expect(forms(m)).toHaveLength(1);
		expect(card(m, 'b').contains(forms(m)[0])).toBe(true);
		expect(m.all('.feedback.error')).toHaveLength(0);
	});

	it('a retry whose first attempt landed reads as a saved edit, not as "nothing changed"', async () => {
		// The database found the words already there at a revision past the one
		// the form sent: the first attempt landed and its answer was lost.
		const { m } = open(() => ({ ok: true, changed: false, revision: 1 }));
		await openAndType(m, 'a');
		save(m);
		await m.settle();
		await m.settle();
		expect(m.one('[data-testid="fbc-edit-note"]').textContent).toContain('Saved your edit');
		expect(card(m, 'a').querySelector('.fb-message')?.textContent).toBe(TYPED);
		expect(card(m, 'a').querySelector('[data-testid="fbc-edited-chip"]')).not.toBeNull();
	});

	it('POSITIVE CONTROL: an unchanged answer at the revision the form sent is "nothing changed"', async () => {
		const { m } = open(() => ({ ok: true, changed: false, revision: 0 }));
		await openAndType(m, 'a');
		save(m);
		await m.settle();
		await m.settle();
		expect(m.one('[data-testid="fbc-edit-note"]').textContent).toContain('Nothing changed');
		expect(card(m, 'a').querySelector('[data-testid="fbc-edited-chip"]')).toBeNull();
		expect(card(m, 'a').querySelector('.fb-message')?.textContent).toBe('first report');
	});
});
