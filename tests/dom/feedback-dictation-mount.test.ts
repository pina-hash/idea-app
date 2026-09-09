// tests/dom/feedback-dictation-mount.test.ts
//
// DICTATION NEVER SILENTLY OVERWRITES WHAT SOMEBODY TYPED, proven on the
// MOUNTED box with a scripted recogniser, in the shape
// feedback-send-once-mount.test.ts set for this component.
//
// THE RULE, READ OFF THE CODE AND THEN MEASURED HERE. `FeedbackBox` resolves
// a speech constructor once at mount and, on every FINAL result, does
// `message = appendDictation(message, text)` -- reading the field FRESH at
// that moment, so text typed after DICTATE was pressed is still the prefix of
// what lands. The interim text goes to a preview element beside the field
// and never into it.
//
// THE MUTANT IS BUILT FROM THE SHIPPING SOURCE, not retyped: the one append
// line is replaced with the obvious wrong shape (`message = text`), the copy
// is written beside the original under a uuid name so relative imports
// resolve identically, driven through the IDENTICAL scenario, and deleted in
// `finally`. The mutant LOSING the typed text is what says the assertion on
// the real component measures the rule and not the instrument.
//
// WHY THIS CANNOT BE A SERVER RENDER: every claim here is about what an event
// does after mount. Structure, events and values only; happy-dom has no
// layout engine, so nothing here measures a box.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
import type {
	SpeechRecognitionCtor,
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Fixed = FeedbackBox as unknown as Box;

const ROOT = process.cwd();
const BOX_PATH = join(ROOT, 'src/lib/feedback/FeedbackBox.svelte');

/** The append, as the shipping file spells it; the mutant replaces it. */
const APPEND_LINE = '\t\t\t\t\tmessage = appendDictation(message, text);\n';
const MUTANT_LINE = '\t\t\t\t\tmessage = text;\n';

class Fake implements SpeechRecognitionLike {
	static last: Fake | null = null;
	lang = '';
	continuous = false;
	interimResults = false;
	onstart: ((ev: unknown) => void) | null = null;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
	onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
	onend: ((ev: unknown) => void) | null = null;
	calls: string[] = [];
	constructor() {
		Fake.last = this;
	}
	start() {
		this.calls.push('start');
		this.onstart?.({});
	}
	stop() {
		this.calls.push('stop');
		this.onend?.({});
	}
	abort() {
		this.calls.push('abort');
	}
	say(text: string, isFinal: boolean) {
		this.onresult?.({ resultIndex: 0, results: [{ isFinal, length: 1, 0: { transcript: text } }] });
	}
}
const FakeCtor = Fake as unknown as SpeechRecognitionCtor;

function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}
function typeInto(m: Mounted, el: HTMLTextAreaElement, value: string): void {
	el.value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
	m.flush();
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

function open(component: Box, extra: Record<string, unknown> = {}): Mounted {
	const m = mountInto(component, {
		app: 'harness',
		submit: async () => ({ error: null, retryable: false }),
		onClose: () => {},
		dictation: FakeCtor,
		...extra
	});
	mounted.push(m);
	return m;
}

const field = (m: Mounted) => m.one<HTMLTextAreaElement>('#fb-msg');
const control = (m: Mounted) => m.one<HTMLButtonElement>('.fb-dictate');

/** Type, dictate, keep typing, dictate again: what is in the field at the end. */
function scenario(component: Box): { value: string; sent: string[]; rec: Fake } {
	const m = open(component);
	typeInto(m, field(m), 'I typed this first');
	click(control(m));
	m.flush();
	const rec = Fake.last!;
	expect(rec.calls).toEqual(['start']);
	expect(control(m).getAttribute('aria-pressed')).toBe('true');
	rec.say('the launch', false);
	m.flush();
	// Interim text is beside the field, not in it.
	expect(field(m).value).toBe('I typed this first');
	expect(m.one('.fb-dictate-heard').textContent).toBe('the launch');
	rec.say('the launch button did nothing', true);
	m.flush();
	// Keep typing WHILE listening, then a second sentence lands.
	typeInto(m, field(m), field(m).value + ' and I kept typing');
	rec.say('then the page went blank', true);
	m.flush();
	const value = field(m).value;
	click(control(m));
	m.flush();
	return { value, sent: rec.calls, rec };
}

describe('dictation appends to what is typed, never replaces it', () => {
	it('the real component keeps every typed character across two dictated sentences', () => {
		const { value, sent } = scenario(Fixed);
		expect(value).toBe(
			'I typed this first the launch button did nothing and I kept typing then the page went blank'
		);
		expect(sent).toEqual(['start', 'stop']);
	});

	it('the mutant (assignment instead of append) loses the typed text, so the assertion above bites', async () => {
		const src = readFileSync(BOX_PATH, 'utf8').replace(/\r\n/g, '\n');
		expect(src.split(APPEND_LINE)).toHaveLength(2);
		const mutantPath = join(ROOT, 'src/lib/feedback', `FeedbackBox.mutant-${randomUUID()}.svelte`);
		writeFileSync(mutantPath, src.replace(APPEND_LINE, MUTANT_LINE));
		try {
			const mod = (await import(/* @vite-ignore */ mutantPath)) as { default: Box };
			const { value } = scenario(mod.default);
			expect(value).toBe('then the page went blank');
			expect(value).not.toContain('I typed this first');
		} finally {
			rmSync(mutantPath, { force: true });
		}
	});

	it('the control is a toggle: STOP while listening, DICTATE at rest, focus handed back to the field', () => {
		const m = open(Fixed);
		expect(control(m).textContent?.trim()).toBe('DICTATE');
		expect(control(m).getAttribute('aria-pressed')).toBe('false');
		click(control(m));
		m.flush();
		expect(control(m).textContent?.trim()).toBe('STOP');
		expect(m.one('[role="status"]').textContent).toMatch(/Listening/);
		click(control(m));
		m.flush();
		expect(control(m).textContent?.trim()).toBe('DICTATE');
		expect(m.one('[role="status"]').textContent?.trim()).toBe('');
		expect(document.activeElement).toBe(field(m));
	});

	it('a refused microphone is a sentence beside the field and the field still works', () => {
		const m = open(Fixed);
		click(control(m));
		m.flush();
		Fake.last!.onerror?.({ error: 'not-allowed' });
		Fake.last!.onend?.({});
		m.flush();
		expect(m.one('[role="alert"]').textContent).toMatch(/microphone/);
		expect(field(m).disabled).toBe(false);
		typeInto(m, field(m), 'typed after the refusal');
		expect(field(m).value).toBe('typed after the refusal');
	});

	it('renders no control with no constructor, and the field is unchanged by that', () => {
		const none = open(Fixed, { dictation: null });
		expect(none.all('.fb-dictate')).toHaveLength(0);
		expect(none.all('.fb-dictate-note')).toHaveLength(0);
		expect(none.all('#fb-msg')).toHaveLength(1);
		// Positive control: the same mount with a constructor renders exactly one.
		const some = open(Fixed);
		expect(some.all('.fb-dictate')).toHaveLength(1);
	});

	it('unmounting an open box aborts the microphone', async () => {
		const m = open(Fixed);
		click(control(m));
		m.flush();
		const rec = Fake.last!;
		await m.stop();
		expect(rec.calls).toEqual(['start', 'abort']);
	});
});
