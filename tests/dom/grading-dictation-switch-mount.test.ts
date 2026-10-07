// tests/dom/grading-dictation-switch-mount.test.ts
//
// REPORT 5ab3adb6: A DICTATED SENTENCE LANDS IN THE STUDENT IT WAS SPOKEN
// ABOUT. Mounts the REAL `GradingConsole` with a scripted recogniser.
//
// THE DEFECT. Every dictation field on the console is keyed the same for every
// student (`comment`, `crit:<criterion id>`), and nothing stopped the session
// on a student switch -- so a sentence still in flight when the grader pressed
// N landed in the NEXT student's comment, where it is invisible until somebody
// reads it. Now the console waits for the session to finish (`settle`) before
// it switches, and the unsaved-work guard then sees the sentence in the
// student it belongs to.
//
// THE RECOGNISER FINISHES ON A LATER TASK, which is what a real one does: on
// `stop()` it delivers the sentence it was still hearing, then `end`. A fake
// that finished synchronously inside `stop()` could not tell the two orders
// apart, and the mutation proof below would pass on the broken code.
//
// Structure, events and values only; happy-dom has no layout. The grey preview
// and the overlay's alignment are `npm run verify:browser`'s.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GradingConsole from '$lib/classroom/GradingConsole.svelte';
import type {
	SpeechRecognitionCtor,
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

class Fake implements SpeechRecognitionLike {
	static last: Fake | null = null;
	static made = 0;
	lang = '';
	continuous = false;
	interimResults = false;
	onstart: ((ev: unknown) => void) | null = null;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
	onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
	onend: ((ev: unknown) => void) | null = null;
	calls: string[] = [];
	/** The sentence the service is still finishing when stop() arrives. */
	pending: string | null = null;
	constructor() {
		Fake.last = this;
		Fake.made += 1;
	}
	start() {
		this.calls.push('start');
		this.onstart?.({});
	}
	stop() {
		this.calls.push('stop');
		setTimeout(() => {
			if (this.pending !== null) {
				const text = this.pending;
				this.pending = null;
				this.say(text, true);
			}
			this.onend?.({});
		}, 5);
	}
	abort() {
		this.calls.push('abort');
	}
	say(text: string, isFinal: boolean) {
		this.onresult?.({ resultIndex: 0, results: [{ isFinal, length: 1, 0: { transcript: text } }] });
	}
}
const FakeCtor = Fake as unknown as SpeechRecognitionCtor;

const SECTION = { id: 's1', label: 'Period 1', course: { code: 'IDEA100', title: 'Design' } };
const ITEM = { id: 'i1', kind: 'assignment' as const, title: 'Bridge Sketch', body: 'Do it.', points: 20, published: true };
const ROSTER = ['ana', 'ben', 'cruz'].map((n) => ({
	student_email: `${n}@boscotech.net`,
	display_name: `${n[0].toUpperCase()}${n.slice(1)} Student`,
	active: true
}));
const GRADING = { roster: ROSTER, submissions: [], responses: [], files: [], approvals: [] };
const LEVELS = [
	{ label: 'Proficient', short: 'P', points: 10, descriptor: 'Clear.' },
	{ label: 'Developing', short: 'D', points: 5, descriptor: 'Rough.' },
	{ label: 'Not yet', short: 'NY', points: 0, descriptor: 'Nothing.' }
];
const RUBRIC = [
	{ id: 'c1', criterion: 'Sketch', levels: LEVELS },
	{ id: 'c2', criterion: 'Labels', levels: LEVELS }
];

function mountConsole(): Mounted {
	return mountInto(GradingConsole as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: ITEM,
		spec: null,
		rubric: RUBRIC,
		transports: {
			loadGrading: async () => ({ ok: true, data: GRADING }),
			saveDraft: async () => ({ ok: true }),
			grade: async () => ({ ok: true })
		},
		speech: FakeCtor
	});
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
function windowKey(k: string): void {
	document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
}
function click(el: Element): void {
	el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
const comment = (m: Mounted) => m.one<HTMLTextAreaElement>('#grade-comment');
const openStudent = async (m: Mounted, name: string) => {
	const row = m.all<HTMLButtonElement>('.roster-row').find((r) => r.textContent?.includes(name));
	expect(row, `no roster row for ${name}`).toBeTruthy();
	click(row!);
	await m.settle();
};

/** Open Ana, dictate into her comment, and press N while a sentence is still in flight. */
async function switchMidSentence(m: Mounted): Promise<void> {
	await m.settle();
	await openStudent(m, 'Ana');
	expect(m.one('.work-name').textContent?.trim()).toBe('Ana Student');
	click(m.one('[data-testid="dictate-comment"]'));
	m.flush();
	const rec = Fake.last!;
	rec.say('good use of', false);
	m.flush();
	rec.pending = 'good use of fillets';
	// Off every text field, so N is the console's key.
	(document.activeElement as HTMLElement | null)?.blur?.();
	windowKey('n');
	await wait(40);
	await m.settle();
}

describe('a sentence in flight lands in the student it was spoken about', () => {
	it('N waits for the sentence; it lands, closed, in Ana, and the unsaved guard asks about Ana', async () => {
		mounted = mountConsole();
		await switchMidSentence(mounted);
		// Still on Ana: the switch was held for her unsaved comment.
		expect(comment(mounted).value).toBe('Good use of fillets.');
		const bar = mounted.all('[role="alertdialog"]');
		expect(bar).toHaveLength(1);
		expect(bar[0].textContent).toContain('Ana Student');
		// Nothing is listening any more.
		expect(mounted.one('[data-testid="dictate-comment"]').getAttribute('aria-pressed')).toBe('false');
		// Discard and switch: Ben opens EMPTY, and nothing late reaches him.
		const discard = mounted.all<HTMLButtonElement>('[role="alertdialog"] button').find((b) =>
			b.textContent?.includes('Discard')
		)!;
		click(discard);
		await mounted.settle();
		expect(mounted.one('.work-name').textContent?.trim()).toBe('Ben Student');
		expect(comment(mounted).value).toBe('');
		Fake.last!.say('a stray result', true);
		await mounted.settle();
		expect(comment(mounted).value).toBe('');
	});

	it('a roster click mid-sentence waits too (the one way in every switch goes through)', async () => {
		mounted = mountConsole();
		await mounted.settle();
		await openStudent(mounted, 'Cruz');
		click(mounted.one('[data-testid="dictate-comment"]'));
		mounted.flush();
		Fake.last!.say('strong', false);
		Fake.last!.pending = 'strong dimensions';
		const ben = mounted.all<HTMLButtonElement>('.roster-row').find((r) => r.textContent?.includes('Ben'))!;
		click(ben);
		await wait(40);
		await mounted.settle();
		expect(mounted.one('.work-name').textContent?.trim()).toBe('Cruz Student');
		expect(comment(mounted).value).toBe('Strong dimensions.');
		expect(mounted.all('[role="alertdialog"]')).toHaveLength(1);
	});

	it('Escape while dictating stops it and keeps the student open', async () => {
		mounted = mountConsole();
		await mounted.settle();
		await openStudent(mounted, 'Cruz');
		click(mounted.one('[data-testid="dictate-comment"]'));
		mounted.flush();
		expect(mounted.one('[data-testid="dictate-comment"]').getAttribute('aria-pressed')).toBe('true');
		// From inside the comment box itself, which every other key ignores.
		comment(mounted).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
		await wait(20);
		await mounted.settle();
		expect(mounted.one('[data-testid="dictate-comment"]').getAttribute('aria-pressed')).toBe('false');
		expect(mounted.one('.work-name').textContent?.trim()).toBe('Cruz Student');
		expect(mounted.all('#grade-comment')).toHaveLength(1);
		// At rest, Escape off a field closes the student, as it always did.
		(document.activeElement as HTMLElement | null)?.blur?.();
		windowKey('Escape');
		await mounted.settle();
		expect(mounted.all('#grade-comment')).toHaveLength(0);
	});

	it('D dictates the comment, and pressing it again stops', async () => {
		mounted = mountConsole();
		await mounted.settle();
		await openStudent(mounted, 'Ben');
		(document.activeElement as HTMLElement | null)?.blur?.();
		windowKey('d');
		mounted.flush();
		expect(mounted.one('[data-testid="dictate-comment"]').getAttribute('aria-pressed')).toBe('true');
		Fake.last!.say('nice labels', true);
		windowKey('d');
		await wait(20);
		await mounted.settle();
		expect(mounted.one('[data-testid="dictate-comment"]').getAttribute('aria-pressed')).toBe('false');
		expect(comment(mounted).value).toBe('Nice labels.');
	});

	it('closing a criterion note while it listens stops the session: no microphone without a STOP', async () => {
		mounted = mountConsole();
		await mounted.settle();
		await openStudent(mounted, 'Ana');
		const toggle = mounted.all<HTMLButtonElement>('.override-toggle')[0];
		click(toggle);
		await mounted.settle();
		click(mounted.one('[data-testid="dictate-crit:c1"]'));
		mounted.flush();
		const rec = Fake.last!;
		expect(rec.calls).toEqual(['start']);
		// Picking a level closes the override box, and the note and its control with it.
		click(mounted.all<HTMLButtonElement>('.override-toggle')[0]);
		await wait(20);
		await mounted.settle();
		expect(mounted.all('[data-testid="dictate-crit:c1"]')).toHaveLength(0);
		expect(rec.calls).toContain('stop');
		// And no control anywhere still reads STOP.
		expect(mounted.all('[aria-pressed="true"]').filter((b) => b.textContent?.includes('STOP'))).toHaveLength(0);
	});
});
