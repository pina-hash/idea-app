// tests/classroom-grading-dictation.test.ts
//
// DICTATED FEEDBACK: the two properties that fail SILENTLY.
//
// Most of this feature fails visibly the first time anybody presses the
// button, and belongs in the harness at `/dev/grading-rubric` (it is driven
// there, with a scripted recogniser and no microphone). Two do not:
//
//  * ONE FIELD AT A TIME. Two live recognisers do not throw and do not look
//    wrong in a screenshot -- what a grader sees is a second button lighting
//    up and their words arriving in the field they stopped dictating into.
//    The bug is in the WORDS' destination, which no presence check can see.
//
//  * A REFUSAL OUTLIVES THE SESSION THAT PRODUCED IT. A denied microphone
//    ends the session, so a message rendered only while the field is still
//    listening is a message nobody ever sees: the control flicks back to
//    DICTATE and explains nothing. That was MEASURED on this surface before
//    the `errorKey` split -- the browser pass reported `error=ABSENT` beside a
//    correctly cleared listening state -- which is what a silent failure looks
//    like from outside: everything tidy and nothing said.
//
//  * A SENTENCE LANDS IN THE STUDENT IT WAS SPOKEN ABOUT (report 5ab3adb6).
//    Every field is keyed the same for every student, so a sentence still in
//    flight when the console switched students used to land in the NEXT
//    student's comment. `settle()` is what the console waits on; a wrong
//    destination here is invisible until somebody reads the comment.
//
// THE RECOGNISER IS A FAKE AND IS DRIVEN BY HAND, so every event's ORDER is
// the assertion rather than a timer's. The shapes it emits are the ones a real
// recogniser can emit: `error` is always followed by `end` (the session is
// over, so it ends), and the ONE path with no `end` at all is `start()`
// THROWING, which is what Chrome does on a second start and which
// `Dictation.start` catches.

import { describe, expect, test } from 'vitest';
import { GradingDictation, type DictationTarget } from '$lib/classroom/grading-dictation.svelte';
import {
	DICTATION_STOP_GRACE_MS,
	type SpeechRecognitionErrorLike,
	type SpeechRecognitionEventLike,
	type SpeechRecognitionLike
} from '$lib/feedback/dictation';

/** Every recogniser this fake has handed out, newest last. */
type Fake = SpeechRecognitionLike & {
	started: boolean;
	stops: number;
	fire: {
		start(): void;
		interim(text: string): void;
		final(text: string): void;
		guess(text: string): void;
		error(code: string): void;
		end(): void;
	};
};

function fakeCtor(opts: { throwOnStart?: boolean } = {}) {
	const made: Fake[] = [];
	class FakeRecognition implements SpeechRecognitionLike {
		lang = '';
		continuous = false;
		interimResults = false;
		onstart: ((ev: unknown) => void) | null = null;
		onresult: ((ev: SpeechRecognitionEventLike) => void) | null = null;
		onerror: ((ev: SpeechRecognitionErrorLike) => void) | null = null;
		onend: ((ev: unknown) => void) | null = null;
		started = false;
		stops = 0;
		constructor() {
			made.push(this as unknown as Fake);
			(this as unknown as Fake).fire = {
				start: () => this.onstart?.({}),
				interim: (text) => this.onresult?.(result(false, text)),
				final: (text) => this.onresult?.(result(true, text)),
				// A final at confidence 0: Chrome on Android's provisional guess.
				guess: (text) =>
					this.onresult?.({
						resultIndex: 0,
						results: [{ isFinal: true, length: 1, 0: { transcript: text, confidence: 0 } }]
					}),
				error: (code) => this.onerror?.({ error: code }),
				end: () => this.onend?.({})
			};
		}
		start() {
			if (opts.throwOnStart) throw new Error('InvalidStateError');
			this.started = true;
			this.onstart?.({});
		}
		stop() {
			/* The session ends when the test fires `end`, exactly as a real one
			   finishes the sentence in flight before ending. */
			this.stops += 1;
		}
		abort() {
			this.started = false;
		}
	}
	const result = (isFinal: boolean, transcript: string): SpeechRecognitionEventLike => ({
		resultIndex: 0,
		results: [{ isFinal, length: 1, 0: { transcript } }]
	});
	return { ctor: FakeRecognition as unknown as new () => SpeechRecognitionLike, made };
}

/** A field in memory: what the console's `read`/`write` closures do over its own state. */
function field(key: string, initial = ''): DictationTarget & { value: string; writes: string[] } {
	const f = {
		key,
		value: initial,
		writes: [] as string[],
		read: () => f.value,
		write: (v: string) => {
			f.value = v;
			f.writes.push(v);
		}
	};
	return f;
}

/** A clock and timers the test moves by hand. */
function clock() {
	let t = 0;
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
		advance(ms: number) {
			t += ms;
			for (const [id, timer] of [...timers]) {
				if (timer.at <= t) {
					timers.delete(id);
					timer.fn();
				}
			}
		}
	};
}

describe('a browser with no speech service gets no control at all', () => {
	test('available is false, and that is the whole mechanism', () => {
		const d = new GradingDictation(null);
		expect(d.available).toBe(false);
		expect(d.listeningKey).toBeNull();
	});

	test('toggling an unavailable controller does nothing rather than throwing', () => {
		const d = new GradingDictation(null);
		expect(() => d.toggle(field('comment'))).not.toThrow();
		expect(d.listeningKey).toBeNull();
	});
});

describe('one field at a time', () => {
	test('a second field takes the session over, and only one is ever listening', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment = field('comment');
		const note = field('crit:c1');

		d.toggle(comment);
		expect(d.listeningKey).toBe('comment');
		expect(made).toHaveLength(1);

		// Press the note's control while the comment is still live.
		d.toggle(note);
		// THE SWITCH IS NOT INSTANT, and that is the point of the queue: the
		// first session is still ending, so no second recogniser exists yet.
		expect(made).toHaveLength(1);

		made[0]!.fire.end();

		// Now, and only now, the second session exists.
		expect(d.listeningKey).toBe('crit:c1');
		expect(made).toHaveLength(2);

		made[1]!.fire.final('the fillet radius is undersized');
		// THE WORDS WENT TO THE FIELD THAT IS LISTENING, and the abandoned one
		// got nothing. This is the assertion no screenshot can make.
		expect(note.value).toBe('The fillet radius is undersized');
		expect(comment.value).toBe('');
		expect(comment.writes).toEqual([]);
	});

	test('a sentence that lands before the switch belongs to the field that was open, closed there', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment = field('comment');
		const note = field('crit:c1');
		d.toggle(comment);
		made[0]!.fire.final('good work overall');
		d.toggle(note);
		// The outgoing field's sentence is still open until its session ends...
		expect(comment.value).toBe('Good work overall');
		made[0]!.fire.end();
		// ...and the period lands THERE, before the next session starts.
		expect(comment.value).toBe('Good work overall.');
		made[1]!.fire.final('but the weld is cold');
		expect(note.value).toBe('But the weld is cold');
		expect(comment.value).toBe('Good work overall.');
	});

	test('pressing the field that is already listening stops it rather than restarting', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment = field('comment');
		d.toggle(comment);
		d.toggle(comment);
		made[0]!.fire.end();
		expect(d.listeningKey).toBeNull();
		// No queued second session: stopping is not a switch to nowhere.
		expect(made).toHaveLength(1);
	});

	test('interim text is held for the grey preview and never written to the field', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment = field('comment', 'Typed first');
		d.toggle(comment);
		made[0]!.fire.interim('clean w');
		expect(d.heard).toBe('clean w');
		expect(comment.writes).toEqual([]);
		// The preview is exactly what the final would add, for the listening field only.
		expect(d.preview('comment', comment.value)).toBe(' clean w');
		expect(d.preview('crit:c1', '')).toBe('');
		made[0]!.fire.final('clean weld');
		expect(comment.value).toBe('Typed first clean weld');
		expect(d.preview('comment', comment.value)).toBe('');
	});
});

describe('a refusal is said out loud, and outlives the session it ended', () => {
	test('a denied microphone clears the listening state and KEEPS the sentence', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		// A real recogniser errors and then ends: the session is over.
		made[0]!.fire.error('not-allowed');
		made[0]!.fire.end();

		expect(d.listeningKey).toBeNull();
		// THE HALF THAT WAS MEASURED MISSING. Gated on `listening`, this is
		// null by now and the control says nothing.
		expect(d.error).toMatch(/did not allow the microphone/i);
		expect(d.errorKey).toBe('comment');
	});

	test('the sentence is keyed to the field that earned it, not shown under all five', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('crit:c2'));
		made[0]!.fire.error('audio-capture');
		made[0]!.fire.end();
		expect(d.errorKey).toBe('crit:c2');
		expect(d.errorKey).not.toBe('comment');
	});

	test('pressing again is what clears it, because that is the act that means "dealt with"', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		made[0]!.fire.error('no-speech');
		made[0]!.fire.end();
		expect(d.error).not.toBeNull();
		d.toggle(field('comment'));
		expect(d.error).toBeNull();
		expect(d.errorKey).toBeNull();
	});

	/**
	 * THE ONE PATH WITH NO `end` EVENT, and the reason the controller clears
	 * itself from `onError` as well. `Dictation.start` catches a throwing
	 * `start()`, reports through `onError` and has ALREADY dropped its own
	 * reference -- so nothing will ever announce that the session finished.
	 * Without the guard the button reads STOP forever over a microphone that
	 * was never listening.
	 */
	test('a start() that throws leaves nothing listening, with no end event to rely on', () => {
		const { ctor, made } = fakeCtor({ throwOnStart: true });
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		expect(made).toHaveLength(1);
		expect(d.listeningKey).toBeNull();
		expect(d.error).not.toBeNull();
		expect(d.errorKey).toBe('comment');
	});

	test('and the control is usable again afterwards', () => {
		const { ctor } = fakeCtor({ throwOnStart: true });
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		// A second press is a fresh attempt, not a no-op against stale state.
		expect(() => d.toggle(field('comment'))).not.toThrow();
		expect(d.listeningKey).toBeNull();
	});
});

describe('teardown', () => {
	test('destroy drops the session and every trace of it', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		made[0]!.fire.interim('half a sen');
		d.destroy();
		expect(d.listeningKey).toBeNull();
		expect(d.heard).toBe('');
		expect(d.error).toBeNull();
		expect(d.errorKey).toBeNull();
	});

	test('a field whose control unmounts stops only its own session', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('crit:c1'));
		// Another field's control going away touches nothing.
		d.stopField('comment');
		expect(made[0]!.stops).toBe(0);
		expect(d.listeningKey).toBe('crit:c1');
		// Its own does: the session is asked to end, and does.
		d.stopField('crit:c1');
		expect(made[0]!.stops).toBe(1);
		made[0]!.fire.end();
		expect(d.listeningKey).toBeNull();
	});

	test('a queued field whose control unmounts is taken out of the queue', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		d.toggle(field('crit:c1'));
		d.stopField('crit:c1');
		made[0]!.fire.end();
		expect(d.listeningKey).toBeNull();
		expect(made).toHaveLength(1);
	});
});

/**
 * THE GRADING CONSOLE SHARES THE REPORT BOX'S TEXT RULES (reports R03, R08,
 * 5ab3adb6). The controller holds a `DictationJoin` per field, so a sentence
 * is closed when the next one starts or the session ends, and a phone's
 * repeated finals land once. Expected values are written out by hand.
 */
describe('a dictated comment reads as sentences, once', () => {
	test('two finals a long pause apart become two sentences; a short pause carries one on', () => {
		const { ctor, made } = fakeCtor();
		const c = clock();
		const d = new GradingDictation(ctor, { now: c.now });
		const comment = field('comment');
		d.toggle(comment);
		made[0]!.fire.interim('clean weld');
		made[0]!.fire.final('clean weld');
		c.advance(2500);
		made[0]!.fire.interim('the fillet');
		made[0]!.fire.final('the fillet radius is undersized');
		expect(comment.value).toBe('Clean weld. The fillet radius is undersized');
		c.advance(300);
		made[0]!.fire.interim('on the left side');
		made[0]!.fire.final('on the left side');
		expect(comment.value).toBe('Clean weld. The fillet radius is undersized on the left side');
		d.toggle(comment);
		made[0]!.fire.end();
		expect(comment.value).toBe('Clean weld. The fillet radius is undersized on the left side.');
	});

	test("a phone's provisional and repeated finals land in the field once", () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const note = field('crit:c1');
		d.toggle(note);
		made[0]!.fire.guess(' clean');
		made[0]!.fire.guess(' clean weld');
		made[0]!.fire.final('clean weld');
		made[0]!.fire.final('clean weld');
		expect(note.value).toBe('Clean weld');
		// The guesses were the preview, never the field.
		made[0]!.fire.guess(' but');
		expect(d.heard).toBe(' but');
		expect(note.value).toBe('Clean weld');
	});

	test('a guess nothing confirmed lands in the field that was listening, not the next one', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment = field('comment');
		const note = field('crit:c1');
		d.toggle(comment);
		made[0]!.fire.guess('good work');
		// Switch fields while the guess is still held: the session ends first.
		d.toggle(note);
		made[0]!.fire.end();
		expect(comment.value).toBe('Good work.');
		expect(note.value).toBe('');
		expect(d.listeningKey).toBe('crit:c1');
	});

	test('typing between two sentences is never given a period by the join', () => {
		const { ctor, made } = fakeCtor();
		const c = clock();
		const d = new GradingDictation(ctor, { now: c.now });
		const comment = field('comment');
		d.toggle(comment);
		made[0]!.fire.final('the weld is');
		// The grader types the end of the thought themselves.
		comment.value += ' cold';
		c.advance(3000);
		made[0]!.fire.final('see me after class');
		expect(comment.value).toBe('The weld is cold see me after class');
	});
});

/**
 * SWITCHING STUDENTS WAITS FOR THE SENTENCE IN FLIGHT (report 5ab3adb6). The
 * console awaits `settle()` before it reads the comment, switches, saves or
 * returns. A misdirected sentence is invisible until somebody reads the
 * comment, which is what earns this a test.
 */
describe('settle: the last sentence lands where it was spoken, then nothing is listening', () => {
	test('resolves at once when nothing is listening', async () => {
		const { ctor } = fakeCtor();
		const d = new GradingDictation(ctor);
		let done = false;
		void d.settle().then(() => (done = true));
		await Promise.resolve();
		expect(done).toBe(true);
	});

	test('stops the session, waits for its end, and the late final lands in ITS field', async () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		// The console's own shape: one `comment` variable, re-pointed at the
		// next student when the switch happens.
		let comment = '';
		const target = { key: 'comment', read: () => comment, write: (v: string) => (comment = v) };
		d.toggle(target);
		made[0]!.fire.interim('good use of');
		let settled = false;
		const waiting = d.settle().then(() => (settled = true));
		expect(made[0]!.stops).toBe(1);
		await Promise.resolve();
		expect(settled).toBe(false);
		// The service finishes the sentence, then ends.
		made[0]!.fire.final('good use of fillets');
		made[0]!.fire.end();
		await waiting;
		expect(settled).toBe(true);
		const first = comment;
		expect(first).toBe('Good use of fillets.');
		// Only now does the console switch: the next student's comment opens empty
		// and nothing reaches it.
		comment = '';
		made[0]!.fire.final('a stray late result');
		expect(comment).toBe('');
		expect(d.listeningKey).toBeNull();
	});

	test('cancels a queued field, so settling never starts a second session', async () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		d.toggle(field('crit:c1'));
		const waiting = d.settle();
		made[0]!.fire.end();
		await waiting;
		expect(made).toHaveLength(1);
		expect(d.listeningKey).toBeNull();
	});

	test('a session that never ends is dropped after the grace, and the promise still resolves', async () => {
		const { ctor, made } = fakeCtor();
		const c = clock();
		const d = new GradingDictation(ctor, { setTimer: c.setTimer, clearTimer: c.clearTimer });
		const comment = field('comment');
		d.toggle(comment);
		made[0]!.fire.final('nice chamfer');
		let settled = false;
		const waiting = d.settle().then(() => (settled = true));
		c.advance(DICTATION_STOP_GRACE_MS - 1);
		await Promise.resolve();
		expect(settled).toBe(false);
		c.advance(1);
		await waiting;
		expect(settled).toBe(true);
		expect(d.listeningKey).toBeNull();
		// What had landed is kept and closed; the session is gone.
		expect(comment.value).toBe('Nice chamfer.');
		made[0]!.fire.final('too late');
		expect(comment.value).toBe('Nice chamfer.');
	});
});

describe('keep-alive is the console’s choice, and off by default', () => {
	test('with no options the service ending a session ends it (the phone behaviour)', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle(field('comment'));
		made[0]!.fire.end();
		expect(d.listeningKey).toBeNull();
		expect(made).toHaveLength(1);
	});

	test('kept alive, the service ending a session opens a fresh one in the same field', () => {
		const { ctor, made } = fakeCtor();
		const c = clock();
		const d = new GradingDictation(ctor, {
			keepAlive: true,
			now: c.now,
			setTimer: c.setTimer,
			clearTimer: c.clearTimer
		});
		const comment = field('comment');
		d.toggle(comment);
		made[0]!.fire.final('clean weld');
		// The service cuts the session off mid-thought (its own time limit).
		c.advance(200);
		made[0]!.fire.end();
		expect(made).toHaveLength(2);
		expect(d.listeningKey).toBe('comment');
		// No period at a restart: the sentence is still the speaker's.
		expect(comment.value).toBe('Clean weld');
		c.advance(300);
		made[1]!.fire.final('on both sides');
		expect(comment.value).toBe('Clean weld on both sides');
		d.toggle(comment);
		made[1]!.fire.end();
		expect(comment.value).toBe('Clean weld on both sides.');
		expect(d.listeningKey).toBeNull();
		expect(made).toHaveLength(2);
	});
});
