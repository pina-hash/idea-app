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
//   3. DICTATION NEVER REMOVES A CHARACTER. `appendDictation` and
//      `DictationJoin` are asserted as a PREFIX INVARIANT over a corpus of
//      typed text, not as a few examples of the happy path.
//
// Report 5ab3adb6 added a fourth family that fails silently: a KEPT-ALIVE
// session. A restart loop that never stops throws nothing, an open microphone
// left behind by a teardown shows nothing, and a meter left open is a red
// light nobody sees. Those are driven here with a hand-moved clock.
//
// The fourth (degrading to a textarea rather than an error when pressed) is a
// runtime claim and lives in tests/dom/feedback-dictation-mount.test.ts.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FeedbackBox from '../src/lib/feedback/FeedbackBox.svelte';
import {
	DICTATION_IDLE_MS,
	DICTATION_KEEPS_STOPPING,
	DICTATION_MAX_QUICK_RESTARTS,
	DICTATION_NOTE,
	DICTATION_RESTART_RETRY_MS,
	DICTATION_SENTENCE_PAUSE_MS,
	Dictation,
	DictationJoin,
	appendDictation,
	closeDictation,
	coarsePointer,
	continuesSentence,
	dictationConstructor,
	dictationEndNote,
	dictationErrorMessage,
	dictationLang,
	isDictationChord,
	type DictationEnd,
	type DictationOptions,
	type MicMeter,
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
	/** Set to make the NEXT constructed instance's start() throw. */
	static throwNext = 0;
	#throws = false;
	constructor() {
		Fake.instances.push(this);
		if (Fake.throwNext > 0) {
			Fake.throwNext -= 1;
			this.#throws = true;
		}
	}
	start() {
		this.calls.push('start');
		if (this.#throws) throw new Error('InvalidStateError');
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

function driver(options?: DictationOptions) {
	const finals: string[] = [];
	const pauses: (number | null)[] = [];
	const interims: string[] = [];
	const listening: boolean[] = [];
	const whys: (DictationEnd | undefined)[] = [];
	const errors: string[] = [];
	const levels: number[] = [];
	const built = Fake.instances.length;
	const d = new Dictation(
		FakeCtor,
		{
			onFinal: (t, pause) => {
				finals.push(t);
				pauses.push(pause);
			},
			onInterim: (t) => interims.push(t),
			onListening: (on, why) => {
				listening.push(on);
				if (!on) whys.push(why);
			},
			onError: (m) => errors.push(m),
			onLevel: (l) => levels.push(l)
		},
		'en-US',
		options
	);
	return {
		d,
		finals,
		pauses,
		interims,
		listening,
		whys,
		errors,
		levels,
		rec: () => Fake.instances.at(-1)!,
		/** How many recognisers THIS driver has built. */
		built: () => Fake.instances.length - built
	};
}

/** A clock and timers the test moves by hand. */
function clock() {
	let t = 1_000;
	const timers = new Map<number, { at: number; fn: () => void }>();
	let seq = 0;
	return {
		now: () => t,
		setTimer: (fn: () => void, ms: number) => {
			const id = ++seq;
			timers.set(id, { at: t + ms, fn });
			return id;
		},
		clearTimer: (id: unknown) => {
			timers.delete(id as number);
		},
		pending: () => timers.size,
		advance(ms: number) {
			const until = t + ms;
			for (;;) {
				const due = [...timers].filter(([, v]) => v.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
				if (!due) break;
				timers.delete(due[0]);
				t = Math.max(t, due[1].at);
				due[1].fn();
			}
			t = until;
		}
	};
}

/** A meter that records what was asked of it. */
function fakeMeter() {
	const log: string[] = [];
	let cb: ((l: number) => void) | null = null;
	const meter: MicMeter = {
		open(onLevel) {
			log.push('open');
			cb = onLevel;
		},
		close() {
			log.push('close');
			cb = null;
		}
	};
	return { meter, log, emit: (l: number) => cb?.(l) };
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
	it('the loudness meter is its own module, and it records and sends nothing either', () => {
		const meter = read('src/lib/feedback/mic-level.ts')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/^\s*\/\/.*$/gm, '');
		for (const way of [
			/\bfetch\s*\(/,
			/XMLHttpRequest/,
			/WebSocket/,
			/EventSource/,
			/sendBeacon/,
			/\bimport\s*\(/,
			/supabase/i,
			/MediaRecorder/,
			/AudioWorklet/,
			/createScriptProcessor/,
			/localStorage|indexedDB|sessionStorage/
		]) {
			expect(meter, String(way)).not.toMatch(way);
		}
		// Positive controls: it does name the two calls it makes.
		expect(meter).toMatch(/getUserMedia/);
		expect(meter).toMatch(/createAnalyser/);
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
	// GENERALIZED TWICE. Report R03 put a period on every chunk; report
	// 5ab3adb6 took it off again, because a final arrives at every breath and
	// the period landed mid-sentence. The spacing rule this test is about never
	// moved: one space where the text does not already end in whitespace, none
	// after a space or a newline, nothing at all for silence.
	it('adds one space where the text does not already end in whitespace, and nothing for silence', () => {
		expect(appendDictation('', 'hello')).toBe('Hello');
		expect(appendDictation('a', 'b')).toBe('a b');
		expect(appendDictation('a ', 'b')).toBe('a b');
		expect(appendDictation('a\n', 'b')).toBe('a\nB');
		expect(appendDictation('a', '  b  ')).toBe('a b');
		expect(appendDictation('a', '')).toBe('a');
		expect(appendDictation('a', '   ')).toBe('a');
	});
});

/**
 * A SENTENCE IS CLOSED WHEN THE NEXT ONE STARTS (report 5ab3adb6). The speech
 * service hands back words with no punctuation and a final at every breath, so
 * a period per final put one mid-sentence ("the. Then", "but. Um"). Now the
 * append leaves a chunk OPEN and `DictationJoin` closes it: when the next
 * chunk is judged a new sentence, or when the session ends. Expected values
 * are written out here, never computed by the module's helpers.
 */
describe('a dictated sentence is closed when the next one starts, or at the end', () => {
	/** Drive a join the way a surface does: each chunk with its pause, then the end. */
	function joined(chunks: [string, number | null][], start = '', lang = 'en-US'): string {
		const j = new DictationJoin(lang);
		let text = start;
		for (const [said, pause] of chunks) text = j.append(text, said, pause);
		return j.close(text);
	}

	it('a long pause between two sentences closes the first and capitalises the second', () => {
		expect(
			joined([
				['the launch button did nothing', null],
				['then the page went blank', 2500],
				['it happened twice', 2500]
			])
		).toBe('The launch button did nothing. Then the page went blank. It happened twice.');
	});

	it('a short pause carries the sentence on, and the end of the session closes it', () => {
		expect(
			joined([
				['the bug is on the', null],
				['home page', 300]
			])
		).toBe('The bug is on the home page.');
		expect(
			joined([
				['clean weld', null],
				['on both sides', DICTATION_SENTENCE_PAUSE_MS - 1]
			])
		).toBe('Clean weld on both sides.');
		expect(
			joined([
				['clean weld', null],
				['the fillet is small', DICTATION_SENTENCE_PAUSE_MS]
			])
		).toBe('Clean weld. The fillet is small.');
	});

	it('a word a sentence cannot end on keeps it open, however long the pause (the corpus cases)', () => {
		// "Takes advantage of the. Latest themes" and "get to that but. Um" were
		// both in report 5ab3adb6's own export.
		expect(
			joined([
				['takes advantage of the', null],
				['latest themes', 2500]
			])
		).toBe('Takes advantage of the latest themes.');
		expect(
			joined([
				['we can get to that but', null],
				['um as close as possible', 2500]
			])
		).toBe('We can get to that but as close as possible.');
	});

	it('a next phrase that opens with a word that carries on, or with a spoken mark, keeps it open', () => {
		expect(
			joined([
				['I pressed save', null],
				['and nothing happened', 4000]
			])
		).toBe('I pressed save and nothing happened.');
		expect(
			joined([
				['first the save button', null],
				['comma then the page', 4000]
			])
		).toBe('First the save button, then the page.');
		// And a phrase that stopped on a spoken comma stays open after the end too.
		expect(joined([['clean weld comma', null]])).toBe('Clean weld,');
	});

	it('a chunk that is only fillers appends nothing and moves nothing', () => {
		const j = new DictationJoin();
		let text = j.append('', 'the weld is clean', null);
		const before = text;
		text = j.append(text, 'um', 4000);
		expect(text).toBe(before);
		text = j.append(text, 'uh erm', 4000);
		expect(text).toBe(before);
		// The join still knows the text as its own, so the end closes it.
		expect(j.close(text)).toBe('The weld is clean.');
	});

	it('typing between two chunks is never given a period: the text decides, as it always did', () => {
		const j = new DictationJoin();
		let text = j.append('', 'the bug is', null);
		text += ' on the home page.';
		text = j.append(text, 'then it froze', 4000);
		expect(text).toBe('The bug is on the home page. Then it froze');
		const k = new DictationJoin();
		let half = k.append('', 'the weld is', null);
		half += ' too';
		half = k.append(half, 'cold on the left', 4000);
		expect(half).toBe('The weld is too cold on the left');
		// And a field somebody typed into after the last chunk is not closed at the end.
		const m = new DictationJoin();
		const typedAfter = `${m.append('', 'the bug is', null)} and`;
		expect(m.close(typedAfter)).toBe('The bug is and');
	});

	it('keeps an end mark the service already put there, and adds no second one', () => {
		expect(appendDictation('', 'is this right?')).toBe('Is this right?');
		expect(appendDictation('Done.', 'wow!')).toBe('Done. Wow!');
		expect(closeDictation('She said "stop."')).toBe('She said "stop."');
		expect(closeDictation('And then…')).toBe('And then…');
		expect(closeDictation('Is this right?')).toBe('Is this right?');
	});

	it("does not capitalise a chunk that finishes somebody's typed half-sentence", () => {
		// Typing that stops mid-sentence is continued, not interrupted.
		expect(appendDictation('The bug is', 'on the home page')).toBe('The bug is on the home page');
		expect(appendDictation('The steps were:', 'open it')).toBe('The steps were: open it');
		// After typed punctuation, a new line, or nothing at all, it opens a sentence.
		expect(appendDictation('I pressed save.', 'nothing happened')).toBe('I pressed save. Nothing happened');
		expect(appendDictation('I pressed save! ', 'nothing happened')).toBe('I pressed save! Nothing happened');
		expect(appendDictation('First line\n', 'second line')).toBe('First line\nSecond line');
		expect(appendDictation('   ', 'blank before me')).toBe('   Blank before me');
	});

	it('capitalises only a lower-case first letter, and leaves a number or a capital alone', () => {
		expect(appendDictation('', '3 times')).toBe('3 times');
		expect(appendDictation('', 'Chrome froze')).toBe('Chrome froze');
		expect(appendDictation('', 'élan')).toBe('Élan');
	});

	it('closes only at the end of the text, and never at a space, a comma or nothing', () => {
		expect(closeDictation('')).toBe('');
		expect(closeDictation('   ')).toBe('   ');
		expect(closeDictation('ends with a space ')).toBe('ends with a space ');
		expect(closeDictation('ends with a newline\n')).toBe('ends with a newline\n');
		expect(closeDictation('comma,')).toBe('comma,');
		expect(closeDictation('colon:')).toBe('colon:');
		expect(closeDictation('the weld')).toBe('the weld.');
	});

	it('the words decide first and the pause only when they say nothing', () => {
		expect(continuesSentence('the save button', 'then it froze', 4000)).toBe(false);
		expect(continuesSentence('the save button', 'then it froze', 300)).toBe(true);
		expect(continuesSentence('next to the', 'save button', 4000)).toBe(true);
		expect(continuesSentence('it froze,', 'then it closed', 4000)).toBe(true);
		expect(continuesSentence('it froze', 'because it ran out', 4000)).toBe(true);
		expect(continuesSentence('it froze', ', then', 4000)).toBe(true);
		// A pause nobody measured is no evidence of a break.
		expect(continuesSentence('it froze', 'then it closed', null)).toBe(true);
		// Another language: only the pause speaks.
		expect(continuesSentence('el botón de la', 'página', 4000, 'es-MX')).toBe(false);
		expect(continuesSentence('el botón', 'y la página', 300, 'es-MX')).toBe(true);
	});

	it('the preview is EXACTLY what the next final will add, period and capital included', () => {
		const cases: [string, number | null][][] = [
			[['the launch button did nothing', null], ['then the page', 2500]],
			[['the bug is on the', null], ['home', 2500]],
			[['clean weld', null], ['on both', 300]],
			[['is this right question mark', null], ['yes', 4000]],
			[['line one new line', null], ['line two', 4000]]
		];
		let checked = 0;
		for (const chunks of cases) {
			const j = new DictationJoin();
			let text = '';
			for (const [said, pause] of chunks.slice(0, -1)) text = j.append(text, said, pause);
			const [next, pause] = chunks.at(-1)!;
			const suffix = j.preview(text, next, pause);
			// Previewing records nothing: the same append afterwards gives the same text.
			const after = j.append(text, next, pause);
			expect(text + suffix, JSON.stringify(chunks)).toBe(after);
			checked++;
		}
		expect(checked).toBe(cases.length);
		const j = new DictationJoin();
		const t = j.append('', 'the launch button did nothing', null);
		expect(j.preview(t, 'then the page', 2500)).toBe('. Then the page');
		expect(j.preview(t, 'and the page', 2500)).toBe(' and the page');
		expect(j.preview('I typed this first', 'the launch', null)).toBe(' the launch');
	});

	it('still never removes a character: the typed text is the prefix of every result', () => {
		// The prefix invariant over typed text x spoken chunks x every way a join
		// can be asked (an append at four pauses, then a close).
		const typed = ['', 'no end mark', 'ends.', 'ends!', 'colon:', 'comma,', 'nl\n', 'sp ', '"quoted."'];
		const spoken = [
			'lower start',
			'Upper start',
			'ends?',
			'trailing,',
			'  pad  ',
			'',
			'um',
			'comma and on',
			'new line next',
			'it broke period',
			'question mark'
		];
		const pauses = [0, 600, 2500, null];
		let cases = 0;
		for (const t of typed) {
			for (const s of spoken) {
				const out = appendDictation(t, s);
				expect(out.startsWith(t), JSON.stringify([t, s])).toBe(true);
				cases++;
				for (const pause of pauses) {
					const j = new DictationJoin();
					const first = j.append(t, 'the weld', null);
					expect(first.startsWith(t)).toBe(true);
					const second = j.append(first, s, pause);
					expect(second.startsWith(first), JSON.stringify([t, s, pause])).toBe(true);
					const closed = j.close(second);
					expect(closed.startsWith(second)).toBe(true);
					cases++;
				}
			}
		}
		expect(cases).toBe(typed.length * spoken.length * (1 + pauses.length));
	});
});

/**
 * SPOKEN PUNCTUATION AND FILLERS (report 5ab3adb6), shaped in the TRANSCRIPT
 * only, so the prefix rule above is untouched. "period" is everyday school
 * vocabulary and keeps the word wherever it names a class period.
 */
describe('spoken punctuation and fillers', () => {
	it('turns the spoken marks into marks, attached to the word before them', () => {
		expect(appendDictation('', 'is this right question mark')).toBe('Is this right?');
		expect(appendDictation('', 'first point comma second point')).toBe('First point, second point');
		expect(appendDictation('', 'line one new line line two')).toBe('Line one\nLine two');
		expect(appendDictation('', 'one new paragraph two')).toBe('One\n\nTwo');
		expect(appendDictation('', 'stop exclamation point')).toBe('Stop!');
		expect(appendDictation('', 'stop exclamation mark')).toBe('Stop!');
		expect(appendDictation('', 'the steps colon open it semicolon save it')).toBe(
			'The steps: open it; save it'
		);
		expect(appendDictation('', 'done full stop next')).toBe('Done. Next');
		expect(appendDictation('', 'it broke period')).toBe('It broke.');
	});

	it('keeps "period" wherever it names a class period, and "next line" is prose', () => {
		expect(appendDictation('', 'see me 4th period')).toBe('See me 4th period');
		expect(appendDictation('', 'during class period')).toBe('During class period');
		expect(appendDictation('', 'come by third period')).toBe('Come by third period');
		expect(appendDictation('', 'in 2 period')).toBe('In 2 period');
		expect(appendDictation('', 'a period of time is fine')).toBe('A period of time is fine');
		expect(appendDictation('', 'the next line is wrong')).toBe('The next line is wrong');
		// A word that only looks like a property name is a word.
		expect(appendDictation('', 'the constructor tool')).toBe('The constructor tool');
	});

	it('a chunk that begins with a mark joins the text before it with no space', () => {
		expect(appendDictation('Clean weld', 'comma but the fillet is small')).toBe(
			'Clean weld, but the fillet is small'
		);
		expect(appendDictation('Clean weld', 'new line next point')).toBe('Clean weld\nNext point');
		expect(appendDictation('', 'comma hello')).toBe('Hello');
	});

	it('drops the hesitation sounds and nothing that can carry meaning', () => {
		expect(appendDictation('', 'um as close as possible')).toBe('As close as possible');
		expect(appendDictation('', 'uh please fix it')).toBe('Please fix it');
		expect(appendDictation('', 'the save umm button')).toBe('The save button');
		expect(appendDictation('', 'Uh.')).toBe('');
		expect(appendDictation('x', 'um')).toBe('x');
		expect(appendDictation('', 'hmm like ah that')).toBe('Hmm like ah that');
	});

	it('outside English the words pass through as spoken', () => {
		const j = new DictationJoin('es-MX');
		expect(j.append('', 'el botón comma um', null)).toBe('El botón comma um');
	});
});

describe('the dictation key and the end-of-session sentences', () => {
	it('is Ctrl or Cmd with Shift and Space, and nothing else held', () => {
		expect(isDictationChord({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true })).toBe(true);
		expect(isDictationChord({ key: ' ', code: 'Space', metaKey: true, shiftKey: true })).toBe(true);
		expect(isDictationChord({ key: ' ', code: 'Space', ctrlKey: true })).toBe(false);
		expect(isDictationChord({ key: ' ', code: 'Space', shiftKey: true })).toBe(false);
		expect(isDictationChord({ key: ' ', code: 'Space', ctrlKey: true, shiftKey: true, altKey: true })).toBe(
			false
		);
		expect(isDictationChord({ key: 'k', code: 'KeyK', ctrlKey: true, shiftKey: true })).toBe(false);
	});

	it('says why a session ended itself, in words derived from the constant they describe', () => {
		expect(dictationEndNote('stopped')).toBe('');
		expect(dictationEndNote('failed')).toBe('');
		expect(dictationEndNote(undefined)).toBe('');
		expect(dictationEndNote('paused')).toBe('Paused. Press DICTATE to keep going.');
		expect(dictationEndNote('idle')).toBe('Stopped after a minute of silence. Press DICTATE to keep going.');
		expect(DICTATION_IDLE_MS).toBe(60_000);
		expect(dictationEndNote('idle', 30_000)).toBe(
			'Stopped after 30 seconds of silence. Press DICTATE to keep going.'
		);
		expect(dictationEndNote('idle', 120_000)).toBe(
			'Stopped after 2 minutes of silence. Press DICTATE to keep going.'
		);
		for (const why of ['paused', 'idle'] as const) expect(dictationEndNote(why)).not.toMatch(/—/);
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
 * THE DEFAULT SESSION IS THE OLD ONE, BYTE FOR BYTE. The palette's Speak
 * control constructs a `Dictation` with no options and must behave exactly as
 * it did: the service ending a session ends it, "nothing was heard" is said,
 * and `onListening` is [true, false]. Pinned here because a keep-alive leaking
 * into the default is a restart loop on the palette that throws nothing.
 */
describe('with no options a session is exactly what it was', () => {
	it('ends when the service ends it, and says nothing was heard', () => {
		const t = driver();
		t.d.start();
		t.rec().fail('no-speech');
		t.rec().end();
		expect(t.built()).toBe(1);
		expect(t.listening).toEqual([true, false]);
		expect(t.errors).toEqual([dictationErrorMessage('no-speech')]);
		expect(t.d.listening).toBe(false);
	});

	it('a service that ends on its own reports the end as a pause; a STOP as a stop', () => {
		const a = driver();
		a.d.start();
		a.rec().end();
		expect(a.whys).toEqual(['paused']);
		const b = driver();
		b.d.start();
		b.d.stop();
		b.rec().end();
		expect(b.whys).toEqual(['stopped']);
	});
});

/**
 * KEPT ALIVE (report 5ab3adb6, fine pointers only). Each of these fails
 * SILENTLY when wrong: a restart loop throws nothing, a STOP lost in the gap
 * between two recognisers leaves the microphone open, a meter left open is a
 * red light nobody sees. The clock and the timers are the test's.
 */
describe('a kept-alive session keeps listening through the service’s own ends', () => {
	function alive(extra: Partial<DictationOptions> = {}) {
		const c = clock();
		const t = driver({
			keepAlive: true,
			now: c.now,
			setTimer: c.setTimer,
			clearTimer: c.clearTimer,
			hidden: () => false,
			...extra
		});
		return { ...t, c };
	}

	it('an end it did not ask for opens a fresh recogniser, and listening never flickers', () => {
		const t = alive();
		t.d.start();
		t.rec().deliver(0, [F('the launch button did nothing')]);
		t.c.advance(5000);
		t.rec().end();
		expect(t.built()).toBe(2);
		expect(t.listening).toEqual([true]);
		expect(t.d.listening).toBe(true);
		t.c.advance(800);
		t.rec().deliver(0, [F('then the page went blank')]);
		expect(t.finals).toEqual(['the launch button did nothing', 'then the page went blank']);
		// STOP ends it once, and nothing restarts.
		t.d.stop();
		t.rec().end();
		expect(t.built()).toBe(2);
		expect(t.listening).toEqual([true, false]);
		expect(t.whys).toEqual(['stopped']);
	});

	it('"nothing was heard" and a network hiccup are not said out loud while it restarts', () => {
		const t = alive();
		t.d.start();
		t.c.advance(6000);
		t.rec().fail('no-speech');
		t.rec().end();
		t.c.advance(6000);
		t.rec().fail('network');
		t.rec().end();
		expect(t.errors).toEqual([]);
		expect(t.built()).toBe(3);
		expect(t.listening).toEqual([true]);
	});

	it('never restarts after the microphone is refused, or an abort it did not cause', () => {
		const terminal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported', 'aborted'];
		for (const code of terminal) {
			const t = alive();
			t.d.start();
			t.c.advance(5000);
			t.rec().fail(code);
			t.rec().end();
			expect(t.built(), code).toBe(1);
			expect(t.listening, code).toEqual([true, false]);
			expect(t.whys, code).toEqual(['failed']);
			expect(t.errors, code).toEqual([dictationErrorMessage(code)]);
		}
	});

	it('four quick ends in a row stop it with a sentence: exactly four recognisers, never a loop', () => {
		const t = alive();
		t.d.start();
		for (let i = 0; i < 10; i++) {
			if (!t.d.listening) break;
			t.c.advance(100);
			t.rec().end();
		}
		expect(t.built()).toBe(DICTATION_MAX_QUICK_RESTARTS + 1);
		expect(t.built()).toBe(4);
		expect(t.listening).toEqual([true, false]);
		expect(t.whys).toEqual(['failed']);
		expect(t.errors).toEqual([DICTATION_KEEPS_STOPPING]);
	});

	it('the guard names the network when that is what kept failing', () => {
		const t = alive();
		t.d.start();
		for (let i = 0; i < 10 && t.d.listening; i++) {
			t.c.advance(100);
			t.rec().fail('network');
			t.rec().end();
		}
		expect(t.built()).toBe(4);
		expect(t.errors).toEqual([dictationErrorMessage('network')]);
	});

	it('words heard reset the guard, so a healthy session with short sessions keeps going', () => {
		const t = alive();
		t.d.start();
		for (let i = 0; i < 8; i++) {
			t.c.advance(100);
			t.rec().deliver(0, [I('still talking')]);
			t.rec().end();
		}
		expect(t.built()).toBe(9);
		expect(t.listening).toEqual([true]);
	});

	it('a minute with nothing heard ends it, said as idle', () => {
		const t = alive();
		t.d.start();
		t.rec().deliver(0, [F('clean weld')]);
		t.c.advance(DICTATION_IDLE_MS - 1);
		expect(t.d.listening).toBe(true);
		t.c.advance(1);
		expect(t.rec().calls.at(-1)).toBe('stop');
		t.rec().end();
		expect(t.whys).toEqual(['idle']);
		expect(t.built()).toBe(1);
		expect(t.c.pending()).toBe(0);
	});

	it('the idle cap still ends a session whose restarts are slow, and says network when that was it', () => {
		const t = alive();
		t.d.start();
		for (let i = 0; i < 40 && t.d.listening; i++) {
			t.c.advance(2000);
			if (!t.d.listening) break;
			t.rec().fail('network');
			t.rec().end();
		}
		expect(t.d.listening).toBe(false);
		expect(t.whys).toEqual(['failed']);
		expect(t.errors).toEqual([dictationErrorMessage('network')]);
	});

	it('never restarts in a hidden tab: it pauses instead', () => {
		let hidden = false;
		const t = alive({ hidden: () => hidden });
		t.d.start();
		t.c.advance(5000);
		hidden = true;
		t.rec().end();
		expect(t.built()).toBe(1);
		expect(t.whys).toEqual(['paused']);
	});

	it('a STOP in the gap before a retry ends it, and no recogniser is built afterwards', () => {
		const t = alive();
		t.d.start();
		t.c.advance(5000);
		Fake.throwNext = 1;
		t.rec().end();
		expect(t.built()).toBe(2);
		expect(t.d.listening).toBe(true);
		t.d.stop();
		expect(t.listening).toEqual([true, false]);
		expect(t.whys).toEqual(['stopped']);
		t.c.advance(DICTATION_RESTART_RETRY_MS * 4);
		expect(t.built()).toBe(2);
	});

	it('a restart that throws twice pauses rather than looping', () => {
		const t = alive();
		t.d.start();
		t.c.advance(5000);
		Fake.throwNext = 2;
		t.rec().end();
		t.c.advance(DICTATION_RESTART_RETRY_MS);
		expect(t.built()).toBe(3);
		expect(t.whys).toEqual(['paused']);
		t.c.advance(DICTATION_RESTART_RETRY_MS * 4);
		expect(t.built()).toBe(3);
	});

	it('teardown in the gap builds nothing more and says nothing', () => {
		const t = alive();
		t.d.start();
		t.c.advance(5000);
		Fake.throwNext = 1;
		t.rec().end();
		t.d.destroy();
		t.c.advance(DICTATION_RESTART_RETRY_MS * 4);
		expect(t.built()).toBe(2);
		expect(t.listening).toEqual([true]);
		expect(t.d.listening).toBe(false);
		expect(t.c.pending()).toBe(0);
	});

	it('a second start while kept alive is a no-op, not a second microphone', () => {
		const t = alive();
		t.d.start();
		t.c.advance(5000);
		t.rec().end();
		t.d.start();
		expect(t.built()).toBe(2);
	});
});

describe('the pause before each phrase is measured from the last thing heard', () => {
	it('is null for the first phrase, then the gap from the last interim to the next first word', () => {
		const c = clock();
		const t = driver({ now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
		t.d.start();
		const r = t.rec();
		r.deliver(0, [I('the launch')]);
		c.advance(400);
		r.deliver(0, [I('the launch button did nothing')]);
		// The service's own end-of-phrase delay: the final comes later.
		c.advance(700);
		r.deliver(0, [F('the launch button did nothing')]);
		c.advance(1500);
		r.deliver(1, [F('the launch button did nothing'), I(' then')]);
		c.advance(300);
		r.deliver(1, [F('the launch button did nothing'), F(' then the page went blank')]);
		expect(t.finals).toEqual(['the launch button did nothing', ' then the page went blank']);
		// 700 + 1500 since the last interim of the first phrase, not 1500.
		expect(t.pauses).toEqual([null, 2200]);
	});

	it('a phrase with no interim results is measured from its final', () => {
		const c = clock();
		const t = driver({ now: c.now });
		t.d.start();
		t.rec().deliver(0, [F('first sentence')]);
		c.advance(900);
		t.rec().deliver(1, [F('first sentence'), F('second sentence')]);
		expect(t.pauses).toEqual([null, 900]);
	});
});

describe('the loudness meter opens once a session and never outlives it', () => {
	it('opens at the first start, not at each restart, and closes on STOP', () => {
		const m = fakeMeter();
		const c = clock();
		const t = driver({
			keepAlive: true,
			meter: m.meter,
			now: c.now,
			setTimer: c.setTimer,
			clearTimer: c.clearTimer,
			hidden: () => false
		});
		t.d.start();
		expect(m.log).toEqual(['open']);
		m.emit(0.4);
		expect(t.levels).toEqual([0.4]);
		c.advance(5000);
		t.rec().end();
		expect(t.built()).toBe(2);
		expect(m.log).toEqual(['open']);
		t.d.stop();
		t.rec().end();
		expect(m.log).toEqual(['open', 'close']);
		// Nothing it says after closing reaches the surface.
		m.emit(0.9);
		expect(t.levels).toEqual([0.4]);
	});

	it('closes on a failed session, on teardown, and when a stop throws', () => {
		const failed = fakeMeter();
		const a = driver({ meter: failed.meter });
		a.d.start();
		a.rec().fail('not-allowed');
		a.rec().end();
		expect(failed.log).toEqual(['open', 'close']);

		const torn = fakeMeter();
		const b = driver({ meter: torn.meter });
		b.d.start();
		b.d.destroy();
		expect(torn.log).toEqual(['open', 'close']);

		const thrown = fakeMeter();
		const c = driver({ meter: thrown.meter });
		c.d.start();
		c.rec().stop = () => {
			throw new Error('gone');
		};
		c.d.stop();
		expect(thrown.log).toEqual(['open', 'close']);
		expect(c.listening).toEqual([true, false]);
	});

	it('a meter that throws is no meter, never a failed dictation', () => {
		const t = driver({
			meter: {
				open() {
					throw new Error('no audio');
				},
				close() {
					throw new Error('no audio');
				}
			}
		});
		expect(() => t.d.start()).not.toThrow();
		t.rec().deliver(0, [F('still works')]);
		expect(() => t.d.destroy()).not.toThrow();
		expect(t.finals).toEqual(['still works']);
		expect(t.errors).toEqual([]);
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
		// And what reaches the field reads as two sentences, once the pause
		// between them is long enough and the session has ended.
		const j = new DictationJoin();
		let field = '';
		finals.forEach((t, i) => (field = j.append(field, t, i === 0 ? null : 2500)));
		field = j.close(field);
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
