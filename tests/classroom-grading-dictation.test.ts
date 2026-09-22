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
// THE RECOGNISER IS A FAKE AND IS DRIVEN BY HAND, so every event's ORDER is
// the assertion rather than a timer's. The shapes it emits are the ones a real
// recogniser can emit: `error` is always followed by `end` (the session is
// over, so it ends), and the ONE path with no `end` at all is `start()`
// THROWING, which is what Chrome does on a second start and which
// `Dictation.start` catches.

import { describe, expect, test } from 'vitest';
import { GradingDictation } from '$lib/classroom/grading-dictation.svelte';
import type {
	SpeechRecognitionErrorLike,
	SpeechRecognitionEventLike,
	SpeechRecognitionLike
} from '$lib/feedback/dictation';

/** Every recogniser this fake has handed out, newest last. */
type Fake = SpeechRecognitionLike & {
	started: boolean;
	fire: {
		start(): void;
		interim(text: string): void;
		final(text: string): void;
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
		constructor() {
			made.push(this as unknown as Fake);
			(this as unknown as Fake).fire = {
				start: () => this.onstart?.({}),
				interim: (text) => this.onresult?.(result(false, text)),
				final: (text) => this.onresult?.(result(true, text)),
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

describe('a browser with no speech service gets no control at all', () => {
	test('available is false, and that is the whole mechanism', () => {
		const d = new GradingDictation(null);
		expect(d.available).toBe(false);
		expect(d.listeningKey).toBeNull();
	});

	test('toggling an unavailable controller does nothing rather than throwing', () => {
		const d = new GradingDictation(null);
		expect(() => d.toggle('comment', () => {})).not.toThrow();
		expect(d.listeningKey).toBeNull();
	});
});

describe('one field at a time', () => {
	test('a second field takes the session over, and only one is ever listening', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment: string[] = [];
		const note: string[] = [];

		d.toggle('comment', (t) => comment.push(t));
		expect(d.listeningKey).toBe('comment');
		expect(made).toHaveLength(1);

		// Press the note's control while the comment is still live.
		d.toggle('crit:c1', (t) => note.push(t));
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
		expect(note).toEqual(['the fillet radius is undersized']);
		expect(comment).toEqual([]);
	});

	test('a sentence that lands before the switch belongs to the field that was open', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const comment: string[] = [];
		const note: string[] = [];
		d.toggle('comment', (t) => comment.push(t));
		made[0]!.fire.final('good work overall');
		d.toggle('crit:c1', (t) => note.push(t));
		made[0]!.fire.end();
		made[1]!.fire.final('but the weld is cold');
		expect(comment).toEqual(['good work overall']);
		expect(note).toEqual(['but the weld is cold']);
	});

	test('pressing the field that is already listening stops it rather than restarting', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle('comment', () => {});
		d.toggle('comment', () => {});
		made[0]!.fire.end();
		expect(d.listeningKey).toBeNull();
		// No queued second session: stopping is not a switch to nowhere.
		expect(made).toHaveLength(1);
	});

	test('interim text is held beside the field and never handed to it', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		const got: string[] = [];
		d.toggle('comment', (t) => got.push(t));
		made[0]!.fire.interim('clean w');
		expect(d.heard).toBe('clean w');
		expect(got).toEqual([]);
		made[0]!.fire.final('clean weld');
		expect(got).toEqual(['clean weld']);
	});
});

describe('a refusal is said out loud, and outlives the session it ended', () => {
	test('a denied microphone clears the listening state and KEEPS the sentence', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle('comment', () => {});
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
		d.toggle('crit:c2', () => {});
		made[0]!.fire.error('audio-capture');
		made[0]!.fire.end();
		expect(d.errorKey).toBe('crit:c2');
		expect(d.errorKey).not.toBe('comment');
	});

	test('pressing again is what clears it, because that is the act that means "dealt with"', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle('comment', () => {});
		made[0]!.fire.error('no-speech');
		made[0]!.fire.end();
		expect(d.error).not.toBeNull();
		d.toggle('comment', () => {});
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
		d.toggle('comment', () => {});
		expect(made).toHaveLength(1);
		expect(d.listeningKey).toBeNull();
		expect(d.error).not.toBeNull();
		expect(d.errorKey).toBe('comment');
	});

	test('and the control is usable again afterwards', () => {
		const { ctor } = fakeCtor({ throwOnStart: true });
		const d = new GradingDictation(ctor);
		d.toggle('comment', () => {});
		// A second press is a fresh attempt, not a no-op against stale state.
		expect(() => d.toggle('comment', () => {})).not.toThrow();
		expect(d.listeningKey).toBeNull();
	});
});

describe('teardown', () => {
	test('destroy drops the session and every trace of it', () => {
		const { ctor, made } = fakeCtor();
		const d = new GradingDictation(ctor);
		d.toggle('comment', () => {});
		made[0]!.fire.interim('half a sen');
		d.destroy();
		expect(d.listeningKey).toBeNull();
		expect(d.heard).toBe('');
		expect(d.error).toBeNull();
		expect(d.errorKey).toBeNull();
	});
});
