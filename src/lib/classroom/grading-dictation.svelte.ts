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
// remembers where to go; `onListening(false)` is what starts the next one.

import {
	Dictation,
	appendDictation,
	dictationConstructor,
	type SpeechRecognitionCtor
} from '$lib/feedback/dictation';

/** Where a transcript is going, and how it gets there. */
interface Target {
	/** Identifies the field. `comment`, or `crit:<criterion id>`. */
	key: string;
	/**
	 * READ THE FIELD FRESH AND APPEND. The caller closes over its own state, so
	 * anything typed while the person was also speaking is still there when the
	 * sentence lands -- the report box's rule, and the reason the transcript is
	 * never inserted at the caret.
	 */
	append: (transcript: string) => void;
}

export class GradingDictation {
	#dict: Dictation | null = null;
	#target: Target | null = null;
	/** Where to go once the session in flight has actually ended. */
	#pending: Target | null = null;

	/** The field currently listening, or null. Read by every button. */
	listeningKey = $state<string | null>(null);
	/** What the service is hearing and has not committed. Shown BESIDE the
	 *  field, never written into it. */
	heard = $state('');
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
	constructor(ctor: SpeechRecognitionCtor | null = dictationConstructor()) {
		if (!ctor) return;
		this.#dict = new Dictation(ctor, {
			onFinal: (text) => this.#target?.append(text),
			onInterim: (text) => (this.heard = text),
			onListening: (on) => {
				if (on) return;
				this.#target = null;
				this.listeningKey = null;
				this.heard = '';
				const next = this.#pending;
				this.#pending = null;
				if (next) this.#begin(next);
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
				}
			}
		});
	}

	/** False on Firefox and every third-party iPad browser. No control renders. */
	get available(): boolean {
		return this.#dict !== null;
	}

	#begin(target: Target) {
		this.#target = target;
		this.listeningKey = target.key;
		// A NEW ATTEMPT CLEARS THE LAST REFUSAL, and only then: pressing the
		// control again is the one act that means "I have dealt with that".
		this.error = null;
		this.errorKey = null;
		this.#dict?.start();
	}

	/**
	 * Press the control on `key`: start there, stop if it is already listening,
	 * or move there from wherever the session currently is.
	 */
	toggle(key: string, append: (transcript: string) => void) {
		if (!this.#dict) return;
		if (this.listeningKey === key) {
			this.#pending = null;
			this.#dict.stop();
			return;
		}
		if (this.listeningKey !== null) {
			// The queue. See the header: `stop()` ends a session on the `end`
			// event, so starting here would hit `Dictation`'s own early return
			// and light a button that never hears anything.
			this.#pending = { key, append };
			this.#dict.stop();
			return;
		}
		this.#begin({ key, append });
	}

	/** Teardown. Drops the session without waiting for a final sentence. */
	destroy() {
		this.#pending = null;
		this.#target = null;
		this.listeningKey = null;
		this.heard = '';
		this.error = null;
		this.errorKey = null;
		this.#dict?.destroy();
	}
}

/**
 * The append rule, re-exported so a caller writes ONE import rather than
 * reaching past this module into the feedback subsystem for the half of the
 * behaviour that is not on the controller. It is
 * `$lib/feedback/dictation`'s own function, unwrapped -- there is no second
 * implementation and this is not a place to add one.
 */
export { appendDictation };
