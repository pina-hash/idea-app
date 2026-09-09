// tests/feedback-dictation.test.ts
//
// VOICE TO TEXT FOR THE REPORT BOX, the half that is pure. Three of the four
// constraints prompt 0111 set are things that FAIL SILENTLY, which is what
// earns them a test here rather than a harness drive alone:
//
//   1. NOTHING IS SENT ANYWHERE BUT THE BROWSER'S OWN SPEECH SERVICE. The
//      module is swept for every way a browser can make a request; a fetch
//      added "to log a transcript" would type-check and render identically.
//   2. AN UNSUPPORTED BROWSER GETS THE PLAIN TEXTAREA. `dictationConstructor`
//      answers null for no window, no constructor, and a non-callable stub,
//      and the box renders NO control under `svelte/server`, where there is
//      no window -- asserted beside the positive control of a fake
//      constructor making it appear, so absence cannot pass vacuously.
//   3. DICTATION NEVER REMOVES A CHARACTER. `appendDictation` is asserted as
//      a PREFIX INVARIANT over a corpus of typed text, not as a few examples
//      of the happy path.
//
// The fourth (degrading to a textarea rather than an error when pressed) is a
// runtime claim and lives in tests/dom/feedback-dictation-mount.test.ts.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackBox from '../src/lib/feedback/FeedbackBox.svelte';
import {
	DICTATION_NOTE,
	Dictation,
	appendDictation,
	dictationConstructor,
	dictationErrorMessage,
	dictationLang,
	type SpeechRecognitionCtor,
	type SpeechRecognitionErrorLike,
	type SpeechRecognitionEventLike,
	type SpeechRecognitionLike
} from '../src/lib/feedback/dictation';

const ROOT = new URL('../', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');

/** A recogniser the test drives by hand: every event is a method call. */
class Fake implements SpeechRecognitionLike {
	static instances: Fake[] = [];
	lang = '';
	continuous = false;
	interimResults = false;
	onstart: ((ev: unknown) => void) | null = null;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
	onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
	onend: ((ev: unknown) => void) | null = null;
	calls: string[] = [];
	constructor() {
		Fake.instances.push(this);
	}
	start() {
		this.calls.push('start');
		this.onstart?.({});
	}
	stop() {
		this.calls.push('stop');
	}
	abort() {
		this.calls.push('abort');
	}
	/** Deliver results the way the browser does: a list, and an index to start from. */
	deliver(resultIndex: number, results: { isFinal: boolean; text: string }[]) {
		this.onresult?.({
			resultIndex,
			results: results.map((r) => ({ isFinal: r.isFinal, length: 1, 0: { transcript: r.text } }))
		});
	}
	fail(error: string) {
		this.onerror?.({ error });
	}
	end() {
		this.onend?.({});
	}
}
const FakeCtor = Fake as unknown as SpeechRecognitionCtor;

function driver() {
	const finals: string[] = [];
	const interims: string[] = [];
	const listening: boolean[] = [];
	const errors: string[] = [];
	const d = new Dictation(
		FakeCtor,
		{
			onFinal: (t) => finals.push(t),
			onInterim: (t) => interims.push(t),
			onListening: (on) => listening.push(on),
			onError: (m) => errors.push(m)
		},
		'en-US'
	);
	return { d, finals, interims, listening, errors, rec: () => Fake.instances.at(-1)! };
}

describe('nothing leaves the browser but through its own speech service', () => {
	// CODE, NOT PROSE: the header names Supabase and fetch as the things the
	// module does not use, which is the rule stated, not the rule broken.
	const src = read('src/lib/feedback/dictation.ts')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/^\s*\/\/.*$/gm, '');
	it('the module makes no request of any kind', () => {
		for (const way of [
			/\bfetch\s*\(/,
			/XMLHttpRequest/,
			/WebSocket/,
			/EventSource/,
			/navigator\.sendBeacon/,
			/\bimport\s*\(/,
			/supabase/i,
			/MediaRecorder/,
			/getUserMedia/
		]) {
			expect(src, String(way)).not.toMatch(way);
		}
		// Positive control for the sweep: the file does name the one API it drives.
		expect(src).toMatch(/webkitSpeechRecognition/);
	});
	it('says so in the sentence beside the control, in words', () => {
		expect(DICTATION_NOTE).toMatch(/browser/);
		expect(DICTATION_NOTE).toMatch(/speech service/);
		expect(DICTATION_NOTE).toMatch(/Nothing you say is recorded by the portal/);
	});
});

describe('an unsupported browser gets the plain textarea', () => {
	it('answers null with no window, no constructor, or a stub that is not callable', () => {
		expect(dictationConstructor(undefined)).toBeNull();
		expect(dictationConstructor(null)).toBeNull();
		expect(dictationConstructor({})).toBeNull();
		expect(dictationConstructor({ webkitSpeechRecognition: {} })).toBeNull();
		expect(dictationConstructor({ SpeechRecognition: 'yes' })).toBeNull();
	});
	it('takes the unprefixed constructor first and the prefixed one otherwise', () => {
		class A {}
		class B {}
		expect(dictationConstructor({ SpeechRecognition: A, webkitSpeechRecognition: B })).toBe(A);
		expect(dictationConstructor({ webkitSpeechRecognition: B })).toBe(B);
	});
	it('the default argument is the window, which a server render does not have', () => {
		// `svelte/server` has no window, so the box resolves null and renders
		// no control at all; the positive control beside it is the same render
		// with a constructor handed in, which renders exactly one.
		const props = {
			app: 'harness',
			submit: async () => ({ error: null, retryable: false }),
			onClose: () => {}
		};
		const absent = render(FeedbackBox, { props }).body;
		const present = render(FeedbackBox, { props: { ...props, dictation: FakeCtor } }).body;
		const refused = render(FeedbackBox, { props: { ...props, dictation: null } }).body;
		expect((absent.match(/fb-dictate\b/g) ?? []).length).toBe(0);
		expect(absent).not.toContain('DICTATE');
		expect(absent).not.toContain(DICTATION_NOTE);
		expect((present.match(/class="fb-btn fb-dictate/g) ?? []).length).toBe(1);
		expect(present).toContain('DICTATE');
		expect(present).toContain(DICTATION_NOTE);
		expect((refused.match(/fb-dictate\b/g) ?? []).length).toBe(0);
		// And the textarea is there in every case: the control is optional, the field is not.
		for (const body of [absent, present, refused]) expect(body).toContain('id="fb-msg"');
	});
	it('the shell mount threads the constructor through and asks the box for nothing else', () => {
		const site = read('src/lib/feedback/SiteFeedback.svelte');
		expect(site).toMatch(/\{dictation\}/);
		expect(site).not.toMatch(/webkitSpeechRecognition/);
	});
	it('asks for the document language, then the browser one, then en-US', () => {
		expect(dictationLang({ documentElement: { lang: 'es-MX' } }, { language: 'fr' })).toBe('es-MX');
		expect(dictationLang({ documentElement: { lang: '' } }, { language: 'fr' })).toBe('fr');
		expect(dictationLang(undefined, undefined)).toBe('en-US');
	});
});

describe('dictation never removes a character', () => {
	const typed = [
		'',
		'a',
		'The launch button did nothing.',
		'ends with a space ',
		'ends with a newline\n',
		'two\n\nparagraphs',
		'   leading spaces kept',
		'unicode café ✓',
		'x'.repeat(1999)
	];
	const spoken = ['then the page went blank', ' with a leading space', 'trailing ', '', '   ', 'one'];

	it('the result always starts with the existing text, verbatim, for every pair', () => {
		let cases = 0;
		for (const t of typed) {
			for (const s of spoken) {
				const out = appendDictation(t, s);
				expect(out.startsWith(t), JSON.stringify([t, s])).toBe(true);
				expect(out.length).toBeGreaterThanOrEqual(t.length);
				cases++;
			}
		}
		expect(cases).toBe(typed.length * spoken.length);
	});
	it('adds one space where the text does not already end in whitespace, and nothing for silence', () => {
		expect(appendDictation('', 'hello')).toBe('hello');
		expect(appendDictation('a', 'b')).toBe('a b');
		expect(appendDictation('a ', 'b')).toBe('a b');
		expect(appendDictation('a\n', 'b')).toBe('a\nb');
		expect(appendDictation('a', '  b  ')).toBe('a b');
		expect(appendDictation('a', '')).toBe('a');
		expect(appendDictation('a', '   ')).toBe('a');
	});
});

describe('the session wrapper', () => {
	it('configures continuous interim recognition in the given language and reports listening from the browser events', () => {
		const { d, listening, rec } = driver();
		expect(d.listening).toBe(false);
		d.start();
		const r = rec();
		expect(r.lang).toBe('en-US');
		expect(r.continuous).toBe(true);
		expect(r.interimResults).toBe(true);
		expect(r.calls).toEqual(['start']);
		expect(listening).toEqual([true]);
		expect(d.listening).toBe(true);
		// A second start while listening is a no-op, not a second microphone.
		d.start();
		expect(Fake.instances.filter((i) => i === r).length).toBe(1);
		expect(r.calls).toEqual(['start']);
		d.stop();
		expect(r.calls).toEqual(['start', 'stop']);
		// Listening ends when the BROWSER says so, not when stop was asked for.
		expect(d.listening).toBe(true);
		r.end();
		expect(listening).toEqual([true, false]);
		expect(d.listening).toBe(false);
	});
	it('commits a final result once and shows interim text beside it', () => {
		const { d, finals, interims, rec } = driver();
		d.start();
		const r = rec();
		r.deliver(0, [{ isFinal: false, text: 'the launch' }]);
		r.deliver(0, [{ isFinal: true, text: 'the launch button did nothing' }]);
		expect(finals).toEqual(['the launch button did nothing']);
		expect(interims).toEqual(['the launch', '']);
	});
	it('walks from resultIndex, so a re-delivered earlier result (Safari) is not committed twice', () => {
		const { d, finals, rec } = driver();
		d.start();
		const r = rec();
		r.deliver(0, [{ isFinal: true, text: 'first sentence' }]);
		r.deliver(1, [
			{ isFinal: true, text: 'first sentence' },
			{ isFinal: true, text: 'second sentence' }
		]);
		expect(finals).toEqual(['first sentence', 'second sentence']);
	});
	it('reports every refusal in the person’s words and never as a code', () => {
		for (const code of [
			'not-allowed',
			'service-not-allowed',
			'audio-capture',
			'no-speech',
			'network',
			'language-not-supported',
			'aborted',
			'bad-grammar',
			null
		]) {
			const m = dictationErrorMessage(code);
			expect(m.length).toBeGreaterThan(10);
			expect(m).not.toContain('-allowed');
			expect(m).not.toContain('audio-capture');
			expect(m).not.toContain('no-speech');
		}
		// The ones a person can act on say what to do; the fallback says typing still works.
		expect(dictationErrorMessage('not-allowed')).toMatch(/microphone/);
		expect(dictationErrorMessage('network')).toMatch(/network/);
		expect(dictationErrorMessage('whatever')).toMatch(/Typing still works/);
		const { d, errors, rec } = driver();
		d.start();
		rec().fail('not-allowed');
		expect(errors).toEqual([dictationErrorMessage('not-allowed')]);
	});
	it('a constructor that throws is a refusal, not an exception out of a click handler', () => {
		const errors: string[] = [];
		const Throws = class {
			constructor() {
				throw new Error('nope');
			}
		} as unknown as SpeechRecognitionCtor;
		const d = new Dictation(
			Throws,
			{ onFinal: () => {}, onInterim: () => {}, onListening: () => {}, onError: (m) => errors.push(m) },
			'en-US'
		);
		expect(() => d.start()).not.toThrow();
		expect(errors).toHaveLength(1);
		expect(d.listening).toBe(false);
	});
	it('teardown aborts the microphone and unhooks the events', () => {
		const { d, finals, listening, rec } = driver();
		d.start();
		const r = rec();
		d.destroy();
		expect(r.calls).toEqual(['start', 'abort']);
		expect(d.listening).toBe(false);
		// Events after teardown reach nothing: the component is gone.
		r.deliver(0, [{ isFinal: true, text: 'late' }]);
		r.end();
		expect(finals).toEqual([]);
		expect(listening).toEqual([true]);
	});
});
