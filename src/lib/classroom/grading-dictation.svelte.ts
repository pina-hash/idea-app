// src/lib/classroom/grading-dictation.svelte.ts
//
// DICTATED FEEDBACK FOR THE GRADING CONSOLE (0288).
//
// Mr. Pina: "at the very least a transcription audio feedback would save me a
// ton of time." He grades by typing the same few sentences into a comment box
// forty times a period.
//
// THIS MODULE ADDS NO SPEECH CODE. `$lib/feedback/dictation.ts` is already a
// complete Web Speech wrapper -- the session, the four events, the refusal
// sentences, the language, and `appendDictation`, which never removes a
// character -- written for the site report box and general enough that nothing
// in it mentions feedback. It is imported, not copied: a second transcript
// path is a second set of failure semantics for the one control on this
// surface whose failure mode is a teacher speaking into a microphone that is
// not listening. What is HERE is only the part the report box did not need,
// which is that this surface has MANY fields and that box had one.
//
// STORED AUDIO IS NOT THIS. Nothing is recorded, uploaded or kept: the browser
// hands audio to the speech service it ships with and returns text, and the
// text lands in a textarea exactly as if it had been typed. Mr. Pina said he
// did not want to spend the storage, and this spends none.
//
// ONE SESSION FOR THE WHOLE CONSOLE, AND THAT IS WHY THIS IS A CONTROLLER
// RATHER THAN A FLAG ON A BUTTON.
//
// A rubric has three or four criteria, each with its own note, plus the
// comment to the student -- so the obvious shape, a `Dictation` per button,
// puts five recognisers on one screen. Two live at once is not a tidy-up
// question: the second `start()` either throws or quietly takes the microphone
// from the first, and what a grader sees is two buttons reading STOP while
// their words land in the field they stopped dictating into. `Dictation.start`
// already refuses a second session on ONE instance (`if (this.#rec) return`),
// so holding exactly one instance makes "only one field at a time" a property
// of the object graph rather than a rule every caller has to keep.
//
// SWITCHING FIELDS IS A QUEUE, NOT A RESTART, because `stop()` is not
// synchronous: it asks the service to finish the sentence in flight and the
// session ends when `end` fires. Starting the next field immediately would hit
// that same early return and silently do nothing -- the button would light up
// and no words would ever arrive. So a switch stops the current session and
// remembers where to go; `onListening(false)` is what starts the next one,
// AFTER it has closed the outgoing field's last sentence.
//
// AND SWITCHING STUDENTS WAITS FOR THE SENTENCE IN FLIGHT (report 5ab3adb6).
// The fields are keyed `comment` and `crit:<criterion id>`, which are the SAME
// keys for every student, so a sentence that arrived after the console had
// moved on landed in the NEXT student's comment. `settle()` is the console's
// way to wait: it stops the session and resolves when the last sentence has
// landed (or after `DICTATION_STOP_GRACE_MS`, dropping it), and the console
// awaits it before it switches, saves or returns.
//
// EACH FIELD OWNS ITS OWN `DictationJoin`, so a sentence is closed in the field
// it was spoken into and nowhere else. A target READS AND WRITES its field
// rather than receiving a transcript, which is what lets the join see whether
// somebody typed since its last word.

import {
	DICTATION_STOP_GRACE_MS,
	Dictation,
	DictationJoin,
	dictationConstructor,
	dictationLang,
	type MicMeter,
	type SpeechRecognitionCtor
} from '$lib/feedback/dictation';

/** Where a transcript is going, and how it gets there. */
export interface DictationTarget {
	/** Identifies the field. `comment`, or `crit:<criterion id>`. */
	key: string;
	/**
	 * READ THE FIELD FRESH. The caller closes over its own state, so anything
	 * typed while the person was also speaking is still there when the sentence
	 * lands -- the report box's rule, and the reason the transcript is never
	 * inserted at the caret.
	 */
	read: () => string;
	/** Put the new value in the field. Only ever a value `read()` is the prefix of. */
	write: (value: string) => void;
}

export interface GradingDictationOptions {
	/**
	 * KEEP LISTENING THROUGH THE SERVICE'S OWN STOPS. Defaults to FALSE, so a
	 * controller built with no options behaves exactly as before; the console
	 * passes `!coarsePointer()`.
	 */
	keepAlive?: boolean;
	meter?: MicMeter | null;
	lang?: string;
	/** Injected so a test can state the pause between two sentences. */
	now?: () => number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
}

export class GradingDictation {
	#dict: Dictation | null = null;
	#target: DictationTarget | null = null;
	/** Where to go once the session in flight has actually ended. */
	#pending: DictationTarget | null = null;
	#joins = new Map<string, DictationJoin>();
	#lang: string;
	#setTimer: (fn: () => void, ms: number) => unknown;
	#clearTimer: (id: unknown) => void;
	/** Everything waiting on `settle()`, and the grace timer behind them. */
	#settlers: (() => void)[] = [];
	#settleTimer: unknown = null;

	/** The field currently listening, or null. Read by every button. */
	listeningKey = $state<string | null>(null);
	/** What the service is hearing and has not committed. Drawn OVER the field,
	 *  never written into it. */
	heard = $state('');
	/** How long nothing was heard before the words in `heard` began. */
	heardPause = $state<number | null>(null);
	/** The microphone's loudness, 0 to 1, while a meter is open. */
	level = $state(0);
	/** The last refusal, already in the person's words. */
	error = $state<string | null>(null);
	/**
	 * WHICH FIELD THE REFUSAL BELONGS TO, and it is a separate piece of state
	 * because a refusal OUTLIVES the session that produced it.
	 *
	 * Measured: with the sentence rendered only while the field was still
	 * listening, a denied microphone cleared the listening state correctly --
	 * and took the explanation with it, so the button flicked back to DICTATE
	 * and said nothing at all. That is the silent failure this whole subsystem
	 * is written to avoid, one level down from where it was being guarded
	 * against. The message has to outlast the session or nobody reads it.
	 *
	 * It is KEYED rather than global because a rubric has five of these
	 * controls, and "the microphone was denied" printed under all five is four
	 * claims about fields nobody touched.
	 */
	errorKey = $state<string | null>(null);

	/**
	 * `ctor` is INJECTED so a harness can drive this with no microphone, which
	 * is the only way any of it is verifiable in a container. Passing `null`
	 * is the ordinary unsupported-browser case and is not an error: `available`
	 * answers false and every button declines to render.
	 */
	constructor(
		ctor: SpeechRecognitionCtor | null = dictationConstructor(),
		options: GradingDictationOptions = {}
	) {
		this.#lang = options.lang ?? dictationLang();
		this.#setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
		this.#clearTimer =
			options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
		if (!ctor) return;
		this.#dict = new Dictation(
			ctor,
			{
				onFinal: (text, pauseMs) => {
					const t = this.#target;
					if (!t) return;
					t.write(this.#join(t.key).append(t.read(), text, pauseMs));
				},
				onInterim: (text, pauseMs) => {
					this.heard = text;
					this.heardPause = pauseMs;
				},
				onListening: (on) => {
					if (on) return;
					this.#ended();
				},
				onError: (message) => {
					this.error = message;
					this.errorKey = this.#target?.key ?? this.listeningKey;
					// A SESSION THAT NEVER OPENED FIRES NO `end`. `Dictation.start`
					// reports the constructor throwing and the `start()` throwing
					// through `onError` alone, having already dropped its own
					// reference -- so without this the button would read STOP
					// forever over a microphone that was never listening.
					if (!this.#dict?.listening) {
						this.#target = null;
						this.#pending = null;
						this.listeningKey = null;
						this.heard = '';
						this.heardPause = null;
						this.#release();
					}
				},
				onLevel: (level) => (this.level = level)
			},
			this.#lang,
			{
				keepAlive: options.keepAlive === true,
				meter: options.meter ?? null,
				now: options.now,
				setTimer: options.setTimer,
				clearTimer: options.clearTimer
			}
		);
	}

	/** False on Firefox and every third-party iPad browser. No control renders. */
	get available(): boolean {
		return this.#dict !== null;
	}

	#join(key: string): DictationJoin {
		let j = this.#joins.get(key);
		if (!j) {
			j = new DictationJoin(this.#lang);
			this.#joins.set(key, j);
		}
		return j;
	}

	/** The session is over: close the field's last sentence, then go where the queue says. */
	#ended() {
		const t = this.#target;
		if (t) {
			const now = t.read();
			const closed = this.#join(t.key).close(now);
			if (closed !== now) t.write(closed);
		}
		this.#target = null;
		this.listeningKey = null;
		this.heard = '';
		this.heardPause = null;
		this.level = 0;
		this.#release();
		const next = this.#pending;
		this.#pending = null;
		if (next) this.#begin(next);
	}

	/** Resolve everything waiting on `settle()`. */
	#release() {
		if (this.#settleTimer !== null) this.#clearTimer(this.#settleTimer);
		this.#settleTimer = null;
		const waiting = this.#settlers;
		this.#settlers = [];
		for (const resolve of waiting) resolve();
	}

	#begin(target: DictationTarget) {
		this.#target = target;
		this.listeningKey = target.key;
		this.#join(target.key).reset();
		// A NEW ATTEMPT CLEARS THE LAST REFUSAL, and only then: pressing the
		// control again is the one act that means "I have dealt with that".
		this.error = null;
		this.errorKey = null;
		this.#dict?.start();
	}

	/**
	 * Press the control on a field: start there, stop if it is already
	 * listening, or move there from wherever the session currently is.
	 */
	toggle(target: DictationTarget) {
		if (!this.#dict) return;
		if (this.listeningKey === target.key) {
			this.#pending = null;
			this.#dict.stop();
			return;
		}
		if (this.listeningKey !== null) {
			// The queue. See the header: `stop()` ends a session on the `end`
			// event, so starting here would hit `Dictation`'s own early return
			// and light a button that never hears anything.
			this.#pending = target;
			this.#dict.stop();
			return;
		}
		this.#begin(target);
	}

	/**
	 * STOP ONE FIELD, if it is the one listening (or waiting in the queue). A
	 * field whose control unmounts calls this, so closing a criterion's
	 * override box cannot leave an open microphone with no STOP anywhere.
	 */
	stopField(key: string) {
		if (this.#pending?.key === key) this.#pending = null;
		if (this.listeningKey === key) this.#dict?.stop();
	}

	/**
	 * WAIT FOR THE SENTENCE IN FLIGHT, then nothing is listening. Resolves at
	 * once when nothing is; otherwise asks the service to finish, cancels any
	 * queued field, and resolves when the session ends (its last sentence
	 * landed and closed in the field it was spoken into), or after
	 * `DICTATION_STOP_GRACE_MS` with the session dropped and the sentence lost.
	 */
	settle(): Promise<void> {
		if (!this.#dict || this.listeningKey === null) return Promise.resolve();
		this.#pending = null;
		return new Promise<void>((resolve) => {
			this.#settlers.push(resolve);
			if (this.#settleTimer === null) {
				this.#settleTimer = this.#setTimer(() => {
					this.#settleTimer = null;
					// `destroy` says nothing, so the end is ours to perform.
					this.#dict?.destroy();
					this.#ended();
				}, DICTATION_STOP_GRACE_MS);
			}
			this.#dict?.stop();
		});
	}

	/**
	 * THE GREY TEXT FOR ONE FIELD: exactly what the next final would add to
	 * `existing`, or '' when this field is not the one hearing words.
	 */
	preview(key: string, existing: string): string {
		if (this.listeningKey !== key || !this.heard) return '';
		return this.#join(key).preview(existing, this.heard, this.heardPause);
	}

	/** Teardown. Drops the session without waiting for a final sentence. */
	destroy() {
		this.#pending = null;
		this.#target = null;
		this.listeningKey = null;
		this.heard = '';
		this.heardPause = null;
		this.level = 0;
		this.error = null;
		this.errorKey = null;
		this.#dict?.destroy();
		this.#release();
	}
}
