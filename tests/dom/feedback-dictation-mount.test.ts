// tests/dom/feedback-dictation-mount.test.ts
//
// DICTATION NEVER SILENTLY OVERWRITES WHAT SOMEBODY TYPED, proven on the
// MOUNTED box with a scripted recogniser, in the shape
// feedback-send-once-mount.test.ts set for this component.
//
// THE RULE, READ OFF THE CODE AND THEN MEASURED HERE. `FeedbackBox` resolves
// a speech constructor once at mount and, on every FINAL result, does
// `message = join.append(message, text, pauseMs)` -- reading the field FRESH
// at that moment, so text typed after DICTATE was pressed is still the prefix
// of what lands. The interim text is drawn grey OVER the field by
// `DictationGhost` and never written into it.
//
// REPORT 5ab3adb6 ADDED THREE BEHAVIOURS THAT LOSE WORK WHEN WRONG, and each
// is driven here: Escape while dictating stops listening and KEEPS the box
// (it used to close it and discard the report); SEND while dictating waits
// for the sentence in flight (it used to send without it); and the meter a
// box opened is closed when the box goes away.
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import FeedbackBox from '$lib/feedback/FeedbackBox.svelte';
import { DICTATION_STOP_GRACE_MS } from '$lib/feedback/dictation';
import type {
	MicMeter,
	SpeechRecognitionCtor,
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';
import type { FeedbackEntry } from '$lib/feedback/feedback';
import { mountInto, type Mounted } from './mount';

type Box = Component<Record<string, unknown>>;
const Fixed = FeedbackBox as unknown as Box;

const ROOT = process.cwd();
const BOX_PATH = join(ROOT, 'src/lib/feedback/FeedbackBox.svelte');

/** The append, as the shipping file spells it; the mutant replaces it. */
const APPEND_LINE = '\t\t\t\t\t\tmessage = join.append(message, text, pauseMs);\n';
const MUTANT_LINE = '\t\t\t\t\t\tmessage = text;\n';

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
	/** Words the service is still finishing: delivered as a final on stop(), as Chrome does. */
	pending: string | null = null;
	/** When true, stop() does not end the session (a service that never answers). */
	static hang = false;
	/** When true, stop() finishes the sentence and ends on a later task, as Chrome does. */
	static later = false;
	constructor() {
		Fake.last = this;
	}
	start() {
		this.calls.push('start');
		this.onstart?.({});
	}
	stop() {
		this.calls.push('stop');
		if (Fake.hang) return;
		const finish = () => {
			if (this.pending !== null) {
				const text = this.pending;
				this.pending = null;
				this.say(text, true);
			}
			this.onend?.({});
		};
		if (Fake.later) setTimeout(finish, 5);
		else finish();
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
	// Interim text is drawn over the field, never written into it: the grey
	// is exactly what the final will add, and the value is untouched.
	expect(field(m).value).toBe('I typed this first');
	expect(m.one('.dg-ghost').textContent).toBe(' the launch');
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
		// The typed text stops mid-sentence, so the first dictated chunk
		// continues it rather than opening a capitalised sentence of its own;
		// and no period lands mid-way any more (report 5ab3adb6): the value is
		// read before STOP, which is what would close the last sentence.
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

	/**
	 * ON A PHONE THE FIELD IS NOT FOCUSED FOR THEM (report R08). Focusing a text
	 * field on a coarse pointer raises the on-screen keyboard over the box, on
	 * open and again every time dictation stops. Both directions on one mount
	 * shape: a fine pointer gets the field (the test above), a coarse one gets
	 * the box and keeps it through a whole dictation session.
	 */
	it('on a coarse pointer, neither opening the box nor ending dictation focuses the field', () => {
		const original = window.matchMedia;
		window.matchMedia = ((q: string) =>
			({ matches: q === '(pointer: coarse)', media: q }) as unknown as MediaQueryList) as typeof window.matchMedia;
		try {
			const m = open(Fixed);
			m.flush();
			expect(document.activeElement).not.toBe(field(m));
			// Focus stays inside the dialog, on the box itself.
			expect(document.activeElement).toBe(m.one('.fb-box'));
			click(control(m));
			m.flush();
			Fake.last!.say('the launch button did nothing', true);
			m.flush();
			click(control(m));
			m.flush();
			expect(control(m).textContent?.trim()).toBe('DICTATE');
			expect(field(m).value).toBe('The launch button did nothing.');
			expect(document.activeElement).not.toBe(field(m));
		} finally {
			window.matchMedia = original;
		}
	});

	it('on a fine pointer, opening the box puts the caret in the field', () => {
		const m = open(Fixed);
		m.flush();
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

/**
 * REPORT 5ab3adb6: THE BOX KEEPS WHAT IS BEING SAID. Escape and SEND both used
 * to lose work while dictating -- Escape closed the box (and the report with
 * it), SEND left before the sentence in flight arrived. Both directions are
 * asserted on one mount shape: the same key at rest still closes the box.
 */
describe('the box keeps what is being said', () => {
	function key(init: KeyboardEventInit) {
		window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
	}

	it('Escape while dictating stops listening and keeps the box; Escape at rest closes it', () => {
		let closes = 0;
		const m = open(Fixed, { onClose: () => (closes += 1), micLevel: null });
		click(control(m));
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('true');
		key({ key: 'Escape' });
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('false');
		expect(closes).toBe(0);
		expect(m.all('#fb-msg')).toHaveLength(1);
		// At rest the same key closes, once.
		key({ key: 'Escape' });
		m.flush();
		expect(closes).toBe(1);
	});

	it('a click on the shade while dictating only stops listening', () => {
		let closes = 0;
		const m = open(Fixed, { onClose: () => (closes += 1), micLevel: null });
		click(control(m));
		m.flush();
		click(m.one('.fb-scrim'));
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('false');
		expect(closes).toBe(0);
		click(m.one('.fb-scrim'));
		m.flush();
		expect(closes).toBe(1);
	});

	it('Ctrl+Shift+Space starts and stops dictation, and says so beside the control', () => {
		const m = open(Fixed, { micLevel: null });
		expect(control(m).getAttribute('aria-keyshortcuts')).toMatch(/Shift\+Space/);
		expect(m.one('.fb-dictate-keys').textContent).toMatch(/Shift\+Space starts and stops dictation/);
		key({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true });
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('true');
		key({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true });
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('false');
		// Without Shift it is not the key.
		key({ key: ' ', code: 'Space', ctrlKey: true });
		m.flush();
		expect(control(m).getAttribute('aria-pressed')).toBe('false');
	});

	/**
	 * SEND MID-SENTENCE. The fake finishes the sentence in flight on stop(), as
	 * Chrome does, so the entry is what the box would have sent with and without
	 * the wait. The positive control is the same press with the wait removed:
	 * built from the shipping source, it sends without the last sentence.
	 */
	async function sendMidSentence(component: Box): Promise<FeedbackEntry[]> {
		const sent: FeedbackEntry[] = [];
		const m = open(component, {
			micLevel: null,
			submit: async (entry: FeedbackEntry) => {
				sent.push(entry);
				return { error: null, retryable: false };
			}
		});
		typeInto(m, field(m), 'The save button');
		click(control(m));
		m.flush();
		Fake.last!.say('does nothing', false);
		Fake.last!.pending = 'does nothing on the second try';
		m.flush();
		// The service finishes the sentence on a later task, as a real one does.
		Fake.later = true;
		try {
			click(m.one('.fb-btn-primary'));
			await m.settle();
		} finally {
			Fake.later = false;
		}
		return sent;
	}

	it('SEND while dictating waits for the sentence in flight, and sends it closed', async () => {
		const sent = await sendMidSentence(Fixed);
		expect(sent).toHaveLength(1);
		expect(sent[0]!.message).toBe('The save button does nothing on the second try.');
	});

	it('the old order (stop, then send at once) loses that sentence, so the assertion above bites', async () => {
		const src = readFileSync(BOX_PATH, 'utf8').replace(/\r\n/g, '\n');
		const WAIT = '\t\tif (dict?.listening) {\n\t\t\tfinishing = true;';
		expect(src.split(WAIT)).toHaveLength(2);
		// The mutant: stop and send in the same tick, the shipping order before this.
		const mutant = src.replace(WAIT, '\t\tif (dict?.listening && false) {\n\t\t\tfinishing = true;').replace(
			'\t\tsendNow();\n\t}\n\n\tfunction sendNow() {',
			'\t\tdict?.stop();\n\t\tsendNow();\n\t}\n\n\tfunction sendNow() {'
		);
		expect(mutant).not.toBe(src);
		const mutantPath = join(ROOT, 'src/lib/feedback', `FeedbackBox.mutant-${randomUUID()}.svelte`);
		writeFileSync(mutantPath, mutant);
		try {
			const mod = (await import(/* @vite-ignore */ mutantPath)) as { default: Box };
			const sent = await sendMidSentence(mod.default);
			expect(sent).toHaveLength(1);
			expect(sent[0]!.message).not.toContain('second try');
		} finally {
			rmSync(mutantPath, { force: true });
		}
	});

	it('a service that never finishes is given up on after the grace, and the report still goes', async () => {
		vi.useFakeTimers();
		Fake.hang = true;
		try {
			const sent: FeedbackEntry[] = [];
			const m = open(Fixed, {
				micLevel: null,
				submit: async (entry: FeedbackEntry) => {
					sent.push(entry);
					return { error: null, retryable: false };
				}
			});
			typeInto(m, field(m), 'It froze');
			click(control(m));
			m.flush();
			click(m.one('.fb-btn-primary'));
			m.flush();
			expect(m.one('.fb-btn-primary').textContent?.trim()).toBe('FINISHING');
			expect(sent).toHaveLength(0);
			await vi.advanceTimersByTimeAsync(DICTATION_STOP_GRACE_MS + 10);
			m.flush();
			expect(sent).toHaveLength(1);
			expect(sent[0]!.message).toBe('It froze');
			expect(Fake.last!.calls).toEqual(['start', 'stop', 'abort']);
		} finally {
			Fake.hang = false;
			vi.useRealTimers();
		}
	});

	it('the meter a box opened is closed when the box goes away', async () => {
		const log: string[] = [];
		const meter: MicMeter = {
			open: () => log.push('open'),
			close: () => log.push('close')
		};
		const m = open(Fixed, { micLevel: meter });
		click(control(m));
		m.flush();
		expect(log).toEqual(['open']);
		await m.stop();
		expect(log).toEqual(['open', 'close']);
	});

	it('the level bars appear inside STOP once a level arrives, and not before', () => {
		let emit: (l: number) => void = () => {};
		const meter: MicMeter = {
			open: (cb) => (emit = cb),
			close: () => {}
		};
		const m = open(Fixed, { micLevel: meter });
		click(control(m));
		m.flush();
		expect(m.all('.fb-dictate [data-dictation-level]')).toHaveLength(0);
		emit(0.5);
		m.flush();
		expect(m.all('.fb-dictate [data-dictation-level]')).toHaveLength(1);
		expect(control(m).textContent?.trim()).toBe('STOP');
		// No meter at all: the dot alone, as before.
		const plain = open(Fixed, { micLevel: null });
		click(control(plain));
		plain.flush();
		expect(plain.all('.fb-dictate-dot')).toHaveLength(1);
		expect(plain.all('[data-dictation-level]')).toHaveLength(0);
	});
});
