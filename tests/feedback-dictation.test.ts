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
	coarsePointer,
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
	deliver(resultIndex: number, results: { isFinal: boolean; text: string; confidence?: number }[]) {
		this.onresult?.({
			resultIndex,
			results: results.map((r) => ({
				isFinal: r.isFinal,
				length: 1,
				0:
					r.confidence === undefined
						? { transcript: r.text }
						: { transcript: r.text, confidence: r.confidence }
			}))
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
	// GENERALIZED (report R03): every dictated chunk now ends as a sentence, so
	// the expected values carry its period. The spacing rule this test is about
	// did not move: one space where the text does not already end in
	// whitespace, none after a space or a newline, nothing at all for silence.
	it('adds one space where the text does not already end in whitespace, and nothing for silence', () => {
		expect(appendDictation('', 'hello')).toBe('Hello.');
		expect(appendDictation('a', 'b')).toBe('a b.');
		expect(appendDictation('a ', 'b')).toBe('a b.');
		expect(appendDictation('a\n', 'b')).toBe('a\nB.');
		expect(appendDictation('a', '  b  ')).toBe('a b.');
		expect(appendDictation('a', '')).toBe('a');
		expect(appendDictation('a', '   ')).toBe('a');
	});
});

/**
 * A DICTATED SENTENCE ENDS WITH A PERIOD (report R03). The speech service hands
 * back words with no punctuation, so a spoken report arrived as one paragraph.
 * Every call is one FINAL result, which is the end of something said before a
 * pause, so that is where the period goes; the next chunk then opens a sentence.
 * Expected values are written out here, never computed by the module's helpers.
 */
describe('a dictated chunk is a sentence', () => {
	it('ends a chunk with no end mark with a period, and capitalises the next one', () => {
		let text = '';
		for (const said of ['the launch button did nothing', 'then the page went blank', 'it happened twice']) {
			text = appendDictation(text, said);
		}
		expect(text).toBe('The launch button did nothing. Then the page went blank. It happened twice.');
	});

	it('keeps an end mark the service already put there, and adds no second one', () => {
		expect(appendDictation('', 'is this right?')).toBe('Is this right?');
		expect(appendDictation('Done.', 'wow!')).toBe('Done. Wow!');
		expect(appendDictation('', 'she said "stop."')).toBe('She said "stop."');
		expect(appendDictation('', 'and then…')).toBe('And then…');
	});

	it('drops a trailing comma, colon or semicolon rather than writing ",."', () => {
		expect(appendDictation('', 'clean weld,')).toBe('Clean weld.');
		expect(appendDictation('', 'the steps were:')).toBe('The steps were.');
		// A comma INSIDE the chunk is the speaker's and stays.
		expect(appendDictation('', 'clean weld, but the fillet is small')).toBe(
			'Clean weld, but the fillet is small.'
		);
	});

	it("does not capitalise a chunk that finishes somebody's typed half-sentence", () => {
		// Typing that stops mid-sentence is continued, not interrupted.
		expect(appendDictation('The bug is', 'on the home page')).toBe('The bug is on the home page.');
		expect(appendDictation('The steps were:', 'open it')).toBe('The steps were: open it.');
		// After typed punctuation, a new line, or nothing at all, it opens a sentence.
		expect(appendDictation('I pressed save.', 'nothing happened')).toBe('I pressed save. Nothing happened.');
		expect(appendDictation('I pressed save! ', 'nothing happened')).toBe('I pressed save! Nothing happened.');
		expect(appendDictation('First line\n', 'second line')).toBe('First line\nSecond line.');
		expect(appendDictation('   ', 'blank before me')).toBe('   Blank before me.');
	});

	it('capitalises only a lower-case first letter, and leaves a number or a capital alone', () => {
		expect(appendDictation('', '3 times')).toBe('3 times.');
		expect(appendDictation('', 'Chrome froze')).toBe('Chrome froze.');
		expect(appendDictation('', 'élan')).toBe('Élan.');
	});

	it('still never removes a character: the typed text is the prefix of every result', () => {
		// The same prefix invariant as above, over the punctuation corpus.
		const typed = ['', 'no end mark', 'ends.', 'ends!', 'colon:', 'comma,', 'nl\n', 'sp ', '"quoted."'];
		const spoken = ['lower start', 'Upper start', 'ends?', 'trailing,', '  pad  ', ''];
		let cases = 0;
		for (const t of typed) {
			for (const s of spoken) {
				const out = appendDictation(t, s);
				expect(out.startsWith(t), JSON.stringify([t, s])).toBe(true);
				cases++;
			}
		}
		expect(cases).toBe(typed.length * spoken.length);
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

/**
 * DICTATION ON A PHONE (report R08, "dictate is terrible and dysfunctional on
 * mobile"). Chrome on Android does not keep the specification's promise that a
 * final result never changes: in continuous mode it marks every growing guess
 * FINAL with a confidence of exactly 0, then sends the real final, then often
 * sends that final again. Read with the shipped loop that is the same words
 * appended four or five times over, which is SILENT in every sense that
 * matters here: nothing throws, the field fills, and it fills wrong.
 *
 * WHERE THE SEQUENCES COME FROM, since no phone is reachable from this
 * container. The Android shape is the one react-speech-recognition (the widely
 * used React wrapper) models in its own test fixture and filters in its own
 * RecognitionManager: a fresh one-result list at index 0 per event, every
 * intermediate guess `isFinal` with `confidence: 0`, the real final with a real
 * confidence, delivered twice. The desktop shape is the specification's: one
 * list for the session, `resultIndex` the lowest index that changed, interim
 * results before each final. A real-device check is still owed.
 *
 * "DESKTOP OUTPUT UNCHANGED" IS ASSERTED AGAINST THE SHIPPED LOOP, copied here
 * verbatim as the characterization of what every desktop user got before this
 * change, and against a hand-written expected list beside it.
 */
type Ev = [number, { isFinal: boolean; text: string; confidence?: number }[]];

/** The onresult loop exactly as it shipped before report R08, for comparison. */
function shippedLoop(events: Ev[]): string[] {
	const finals: string[] = [];
	for (const [resultIndex, results] of events) {
		for (let i = resultIndex; i < results.length; i++) {
			if (results[i].isFinal) finals.push(results[i].text);
		}
	}
	return finals;
}

function play(events: Ev[], end = true) {
	const t = driver();
	t.d.start();
	const r = t.rec();
	for (const [ri, results] of events) r.deliver(ri, results);
	if (end) r.end();
	return t;
}

const I = (text: string) => ({ isFinal: false, text });
const F = (text: string, confidence = 0.92) => ({ isFinal: true, text, confidence });
const P = (text: string) => ({ isFinal: true, text, confidence: 0 });

/** Desktop Chrome: one list for the session, interim results before each final. */
const DESKTOP: Ev[] = [
	[0, [I('the')]],
	[0, [I('the launch')]],
	[0, [I('the launch button did')]],
	[0, [F('the launch button did nothing')]],
	[1, [F('the launch button did nothing'), I(' then')]],
	[1, [F('the launch button did nothing'), I(' then the page')]],
	[1, [F('the launch button did nothing'), F(' then the page went blank')]]
];

/** A person saying the same short thing twice, on desktop. Both must land. */
const DESKTOP_REPEAT: Ev[] = [
	[0, [I('no')]],
	[0, [F('no')]],
	[1, [F('no'), I(' no')]],
	[1, [F('no'), F(' no')]]
];

/** Safari: re-delivers earlier results in the list, which resultIndex skips. */
const SAFARI: Ev[] = [
	[0, [{ isFinal: true, text: 'first sentence' }]],
	[
		1,
		[
			{ isFinal: true, text: 'first sentence' },
			{ isFinal: true, text: 'second sentence' }
		]
	]
];

/** Chrome on Android, continuous: provisional finals at confidence 0, then the real one twice. */
const ANDROID: Ev[] = [
	[0, [P(' this')]],
	[0, [P(' this is')]],
	[0, [P(' this is a')]],
	[0, [P(' this is a test')]],
	[0, [F('this is a test')]],
	[0, [F('this is a test')]],
	[0, [P(' okay')]],
	[0, [F('okay', 0.95)]],
	[0, [F('okay', 0.95)]]
];

/** A final that grows with a REAL confidence, the brief's "growing finals" shape. */
const GROWING: Ev[] = [
	[0, [F('this')]],
	[0, [F('this is a')]],
	[0, [F('this is a test')]],
	[0, [F('this is a test')]]
];

describe('dictation on a phone: a final that repeats or extends one already taken is not appended twice', () => {
	it('desktop Chrome is byte-for-byte what the shipped loop produced', () => {
		const { finals } = play(DESKTOP);
		expect(finals).toEqual(['the launch button did nothing', ' then the page went blank']);
		expect(finals).toEqual(shippedLoop(DESKTOP));
	});

	it('a sentence genuinely said twice on desktop lands twice, because interim text came between', () => {
		const { finals } = play(DESKTOP_REPEAT);
		expect(finals).toEqual(['no', ' no']);
		expect(finals).toEqual(shippedLoop(DESKTOP_REPEAT));
	});

	it('Safari is unchanged too', () => {
		const { finals } = play(SAFARI);
		expect(finals).toEqual(['first sentence', 'second sentence']);
		expect(finals).toEqual(shippedLoop(SAFARI));
	});

	it('Android: each sentence lands once, and the provisional guesses show beside the field instead', () => {
		const { finals, interims } = play(ANDROID);
		expect(finals).toEqual(['this is a test', 'okay']);
		// The instrument, measured the other way: the shipped loop appended
		// every guess and both copies of each final.
		expect(shippedLoop(ANDROID)).toHaveLength(9);
		// The guesses were not lost; they were the preview.
		expect(interims).toContain(' this is a');
		expect(interims).toContain(' okay');
		// And what reaches the field reads as two sentences.
		let field = '';
		for (const t of finals) field = appendDictation(field, t);
		expect(field).toBe('This is a test. Okay.');
	});

	it('a final that grows with a real confidence contributes only its new words', () => {
		const { finals } = play(GROWING);
		expect(finals).toEqual(['this', 'is a', 'test']);
		expect(finals.join(' ')).toBe('this is a test');
	});

	it('a provisional guess nothing confirmed is committed when the session ends, never lost', () => {
		// A browser that reports confidence 0 on its last final, or ends before
		// confirming: the words are the person's and they land at `end`.
		const { finals, listening } = play([[0, [P('the save button')]]]);
		expect(finals).toEqual(['the save button']);
		expect(listening).toEqual([true, false]);
	});

	it('the end-of-session commit lands BEFORE listening is reported over', () => {
		// The grading console switches fields on `onListening(false)`, so a
		// commit after it would land in the next field.
		const order: string[] = [];
		const d = new Dictation(
			FakeCtor,
			{
				onFinal: (t) => order.push(`final:${t}`),
				onInterim: () => {},
				onListening: (on) => order.push(`listening:${on}`),
				onError: () => {}
			},
			'en-US'
		);
		d.start();
		const r = Fake.instances.at(-1)!;
		r.deliver(0, [P('clean weld')]);
		r.end();
		expect(order).toEqual(['listening:true', 'final:clean weld', 'listening:false']);
	});

	it('a provisional result at a higher index finishes the one before it (the resultIndex rule)', () => {
		const { finals } = play(
			[
				[0, [P('first part')]],
				[1, [P('first part'), P(' second part')]]
			],
			false
		);
		// Index 0 is finished once a result at index 1 arrives; index 1 is still held.
		expect(finals).toEqual(['first part']);
	});

	it('a confirmed final replaces the provisional guess at its own index rather than joining it', () => {
		const { finals } = play([
			[0, [P('this is a text')]],
			[0, [F('this is a test')]]
		]);
		expect(finals).toEqual(['this is a test']);
	});

	it('a new session starts with no memory of the last one', () => {
		const t = driver();
		t.d.start();
		t.rec().deliver(0, [F('clean weld')]);
		t.rec().end();
		t.d.start();
		t.rec().deliver(0, [F('clean weld')]);
		t.rec().end();
		expect(t.finals).toEqual(['clean weld', 'clean weld']);
	});
});

describe('the keyboard stays down on a phone', () => {
	const mm = (coarse: boolean) => ({
		matchMedia: (q: string) => ({ matches: q === '(pointer: coarse)' && coarse })
	});
	it('answers true only for a coarse primary pointer', () => {
		expect(coarsePointer(mm(true))).toBe(true);
		expect(coarsePointer(mm(false))).toBe(false);
	});
	it('answers false, the desktop behaviour, when it cannot ask', () => {
		expect(coarsePointer(undefined)).toBe(false);
		expect(coarsePointer({})).toBe(false);
		expect(
			coarsePointer({
				matchMedia: () => {
					throw new Error('no');
				}
			})
		).toBe(false);
	});
});
