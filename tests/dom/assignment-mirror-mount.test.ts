// tests/dom/assignment-mirror-mount.test.ts
//
// 0070: "Homework progress didn't save."
//
// THE MEASUREMENT THIS FILE IS BUILT ON, taken against the real
// `AssignmentEngine` BEFORE the mirror existed: sixty characters typed at
// 110ms a character produced ZERO `saveResponse` dispatches over 6694ms and
// ZERO keys in `localStorage`. Every keystroke cancels and re-arms the 800ms
// debounce, so the window is not 800ms -- it is the whole of the typing plus
// 800ms -- and for that entire time the answer existed in one `$state` record
// and nowhere else. A tab the browser reclaims inside it loses the answer with
// nothing dispatched, so nothing fails, nothing is reported, and the student
// finds their work gone.
//
// WHY `tests/dom/`. The guarantee is about what a REAL mounted component does
// with real effects and real `localStorage` across a real unmount and remount,
// and this is the only project where `mount()` runs an effect at all. Nothing
// here measures a box, a ratio or a tap target: happy-dom has no layout engine
// and every such read there is a vacuous zero. Those belong to
// `npm run verify:browser` and its `assignment-mirror.mjs` spec.
//
// EVERY ASSERTION IS PAIRED WITH A POSITIVE CONTROL, because a drive that
// silently typed nothing satisfies "the answer came back" exactly as well as a
// working mirror does.
//
// MUTATION-PROVEN IN BOTH DIRECTIONS against a `cp` copy of
// `AssignmentEngine.svelte`, restored and md5-checked; the numbers are in this
// bundle's history entry. `git checkout --` was never run.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { Component } from 'svelte';
import AssignmentEngine from '$lib/classroom/AssignmentEngine.svelte';
import { mountInto, viewerIs, type Mounted } from './mount';
import {
	ASSIGNMENT_MIRROR_PREFIX,
	assignmentMirrorKey,
	type AssignmentMirror
} from '$lib/classroom/assignment-draft-mirror';
import type {
	AssignmentSpec,
	ResponseRow,
	ResponseValue,
	StudentEngineData
} from '$lib/classroom/assignment-spec';

const ITEM_ID = 'item-1';
const BLOCK = 'b-text';
const SENTENCE = 'The lower chord buckled first because it was in compression.';

const SPEC = {
	version: '1.1',
	kind: 'assignment',
	meta: { assignmentId: 'idea100-bridge-01', title: 'Bridge lab', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Analysis',
			blocks: [
				{ type: 'instructions', content: 'Answer below.' },
				{ type: 'textField', id: BLOCK, prompt: 'What failed first, and why?' }
			]
		}
	]
} as unknown as AssignmentSpec;

const ITEM = { id: ITEM_ID, kind: 'assignment', title: 'Bridge lab', attachments: [] };

function engineData(responses: ResponseRow[] = []): StudentEngineData {
	return { spec: SPEC, rubric: null, submission: null, responses, files: [], approvals: [] };
}

function row(blockId: string, value: ResponseValue): ResponseRow {
	return { item_id: ITEM_ID, student_email: 'stu@boscotech.net', block_id: blockId, value };
}

interface Drive {
	m: Mounted;
	/** Writes the server ACKNOWLEDGED. */
	saves: { blockId: string; value: ResponseValue }[];
	/** Writes the client dispatched, acknowledged or not. */
	attempts: { blockId: string; value: ResponseValue }[];
}

/**
 * HOW THE SERVER ANSWERS, and `hang` is the one that models the defect.
 *
 * A tab being reclaimed is not a tab that got a refusal. `SaveState.attach()`
 * flushes on `visibilitychange`, so a write IS dispatched -- and then the page
 * freezes and the browser abandons the request, which from the client's side
 * is a promise that never settles. A transport that resolved `ok` there would
 * be modelling a save that worked, where the whole question is what happens
 * when one does not.
 */
type SaveMode = 'ok' | 'hang' | 'fail';

/** Mount the real engine with in-memory transports that record every write. */
function mount(data: StudentEngineData, mode: SaveMode = 'ok'): Drive {
	const saves: { blockId: string; value: ResponseValue }[] = [];
	const attempts: { blockId: string; value: ResponseValue }[] = [];
	const transports = {
		async saveResponse(_itemId: string, blockId: string, value: ResponseValue) {
			attempts.push({ blockId, value });
			if (mode === 'hang') return new Promise<never>(() => {});
			if (mode === 'fail') return { ok: false as const, message: 'the network went away' };
			saves.push({ blockId, value });
			return { ok: true as const, data: { ok: true } };
		},
		async reloadStudent() {
			return { ok: true as const, data };
		},
		async submitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		async unsubmitAssignment() {
			return { ok: true as const, data: { ok: true } };
		},
		async uploadSubmissionFile() {
			return { ok: false as const, message: 'not in this test' };
		},
		async deleteSubmissionFile() {
			return { ok: true as const, data: { ok: true } };
		},
		async setFileCaption() {
			return { ok: true as const, data: { ok: true } };
		}
	};
	const m = mountInto(AssignmentEngine as unknown as Component<Record<string, unknown>>, {
		item: ITEM,
		data,
		transports,
		uploadEnabled: false
	});
	return { m, saves, attempts };
}

const rest = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Type a string a character at a time, the way a student produces one. */
async function type(m: Mounted, text: string, perChar = 12): Promise<void> {
	const ta = m.one<HTMLTextAreaElement>('textarea');
	for (let i = 1; i <= text.length; i++) {
		ta.value = text.slice(0, i);
		ta.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		await rest(perChar);
	}
}

/** What is in the answer field right now. */
const shown = (m: Mounted) => m.one<HTMLTextAreaElement>('textarea').value;

/** Background the tab the way a phone does when the student switches apps. */
function hideTab(): void {
	Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
	document.dispatchEvent(new Event('visibilitychange'));
	flushSync();
}
function showTab(): void {
	Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
	document.dispatchEvent(new Event('visibilitychange'));
	flushSync();
}

const mirrorKeys = () =>
	Object.keys(localStorage).filter((k) => k.startsWith(ASSIGNMENT_MIRROR_PREFIX));

const readSlot = (key: string): AssignmentMirror | null => {
	const raw = localStorage.getItem(key);
	return raw ? (JSON.parse(raw) as AssignmentMirror) : null;
};

let restoreViewer: () => void;

beforeEach(() => {
	localStorage.clear();
	restoreViewer = viewerIs('stu-1');
});

afterEach(() => {
	showTab();
	restoreViewer();
	localStorage.clear();
});

// ---------------------------------------------------------------------------
// CONTROL 1: type, lose the tab inside the debounce window, come back.
// ---------------------------------------------------------------------------

describe('a discarded tab', () => {
	it('gives the answer back on the next load, with nothing ever dispatched', async () => {
		const a = mount(engineData(), 'hang');
		await type(a.m, SENTENCE);

		// THE POSITIVE CONTROL FOR THE PREMISE. If the drive typed nothing, or
		// if the debounce had already fired and landed, "the mirror saved us"
		// would be a claim about a case that never happened.
		expect(shown(a.m)).toBe(SENTENCE);
		expect(a.attempts).toHaveLength(0);

		// The tab is backgrounded, so the save net dispatches -- and the page is
		// then frozen and the request abandoned, which is the `hang`. Nothing is
		// ever acknowledged.
		hideTab();
		await a.m.settle();
		expect(a.attempts).toHaveLength(1);
		expect(a.saves).toHaveLength(0);

		const key = assignmentMirrorKey('stu-1', ITEM_ID);
		const slot = readSlot(key);
		expect(slot?.values?.[BLOCK]?.text).toBe(SENTENCE);

		await a.m.stop();

		// A FRESH LOAD, with the server still holding nothing -- which is the
		// state a lost write leaves it in.
		const b = mount(engineData());
		b.m.flush();
		await b.m.settle();

		expect(shown(b.m)).toBe(SENTENCE);
		// AND IT IS ON ITS WAY, not merely on screen: a restore that only put
		// text in the box would leave the student looking at an answer the
		// server still does not have.
		await rest(900);
		b.m.flush();
		await b.m.settle();
		expect(b.saves.map((s) => [s.blockId, s.value.text])).toEqual([[BLOCK, SENTENCE]]);

		// And the student is told, in words.
		const note = b.m.target.querySelector('[data-testid="engine-mirror-note"]');
		expect(note?.textContent).toContain('put back from this browser');
		await b.m.stop();
	});

	it('keeps two students on one machine apart', async () => {
		const a = mount(engineData(), 'hang');
		await type(a.m, 'Mine, not yours.');
		hideTab();
		await a.m.settle();
		await a.m.stop();
		expect(mirrorKeys()).toHaveLength(1);

		// Positive control: the same viewer DOES get it back (proved above), so
		// an empty field below is the key scoping and not a broken drive.
		restoreViewer();
		restoreViewer = viewerIs('stu-2');
		const b = mount(engineData());
		b.m.flush();
		await b.m.settle();
		expect(shown(b.m)).toBe('');
		expect(b.m.target.querySelector('[data-testid="engine-mirror-note"]')).toBeNull();
		await b.m.stop();
	});
});

// ---------------------------------------------------------------------------
// The hide flush, which is what closes the window rather than narrowing it.
// ---------------------------------------------------------------------------

describe('backgrounding the tab', () => {
	it('writes the mirror SYNCHRONOUSLY, well inside the 400ms debounce', async () => {
		const d = mount(engineData(), 'hang');
		const ta = d.m.one<HTMLTextAreaElement>('textarea');
		ta.value = 'j';
		ta.dispatchEvent(new Event('input', { bubbles: true }));
		d.m.flush();

		// THE POSITIVE CONTROL, AND IT IS THE WHOLE ASSERTION'S PREMISE. At this
		// instant the debounce has not run, so there is nothing in storage --
		// which is exactly the state a hard kill would find.
		expect(mirrorKeys()).toEqual([]);

		// No await anywhere between here and the read: `localStorage.setItem` has
		// completed before the handler returns, which is the difference between
		// this and the save's own flush. That one is a `fetch` a freezing page is
		// free to abandon; this one cannot be.
		hideTab();
		expect(mirrorKeys()).toHaveLength(1);
		expect(readSlot(assignmentMirrorKey('stu-1', ITEM_ID))?.values?.[BLOCK]?.text).toBe('j');
		await d.m.stop();
	});
});

// ---------------------------------------------------------------------------
// CONTROL 2: a successful save clears the slot.
// ---------------------------------------------------------------------------

describe('the slot lives exactly as long as the work is unacknowledged', () => {
	it('is written while dirty and gone once the server acknowledges', async () => {
		const d = mount(engineData());
		await type(d.m, 'Half a sentence');
		await rest(500);
		d.m.flush();

		// THE POSITIVE CONTROL: it was there to be cleared.
		expect(mirrorKeys()).toHaveLength(1);

		await rest(900);
		d.m.flush();
		await d.m.settle();

		expect(d.saves).toHaveLength(1);
		expect(mirrorKeys()).toEqual([]);
		await d.m.stop();
	});

	it('SURVIVES a failed write, because a failure is exactly when it is needed', async () => {
		const d = mount(engineData(), 'fail');
		await type(d.m, 'This one cannot reach the server');
		// Past the debounce and every backoff attempt the machine will make.
		await rest(1400);
		d.m.flush();
		await d.m.settle();
		expect(d.saves).toHaveLength(0);
		expect(mirrorKeys()).toHaveLength(1);
		await d.m.stop();
	});
});

// ---------------------------------------------------------------------------
// CONTROL 3: a newer server answer is never silently overwritten.
// ---------------------------------------------------------------------------

describe('a server answer that moved under the mirror', () => {
	it('wins on screen, and the browser copy is handed back rather than dropped', async () => {
		const a = mount(engineData(), 'hang');
		await type(a.m, 'Typed on the phone, never saved.');
		hideTab();
		await a.m.settle();
		await a.m.stop();
		expect(readSlot(assignmentMirrorKey('stu-1', ITEM_ID))).not.toBeNull();

		// The student carried on somewhere else and THAT answer reached the
		// server. This load comes back holding it.
		const server = 'Written on the laptop, and saved.';
		const b = mount(engineData([row(BLOCK, { text: server })]));
		b.m.flush();
		await b.m.settle();

		// THE SAVED ANSWER IS WHAT IS ON SCREEN. Overwriting it with an older
		// local copy is the data loss this whole branch exists to refuse.
		expect(shown(b.m)).toBe(server);

		// AND NOTHING WAS DISPATCHED, so the server row is untouched too.
		await rest(900);
		b.m.flush();
		await b.m.settle();
		expect(b.saves).toEqual([]);

		// NOR WAS THE LOCAL COPY THROWN AWAY. It is on screen, in words, with
		// its own control.
		const conflicts = b.m.target.querySelector('[data-testid="engine-mirror-conflicts"]');
		expect(conflicts?.textContent).toContain('Typed on the phone, never saved.');
		expect(b.m.target.querySelector('[data-testid="engine-mirror-note"]')?.textContent).toContain(
			'NOT put back'
		);
		expect(b.m.target.querySelectorAll('[data-testid="engine-mirror-copy"]')).toHaveLength(1);
		await b.m.stop();
	});

	it('offers nothing at all when the lost write turns out to have landed', async () => {
		const a = mount(engineData(), 'hang');
		await type(a.m, 'It did arrive after all.');
		hideTab();
		await a.m.settle();
		await a.m.stop();
		// The positive control: there IS a slot, so an absent card below is the
		// comparison doing its job and not an empty drive.
		expect(mirrorKeys()).toHaveLength(1);

		const b = mount(engineData([row(BLOCK, { text: 'It did arrive after all.' })]));
		b.m.flush();
		await b.m.settle();

		expect(b.m.target.querySelector('[data-testid="engine-mirror-note"]')).toBeNull();
		expect(mirrorKeys()).toEqual([]);
		await b.m.stop();
	});
});
