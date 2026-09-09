/**
 * VOICE TO TEXT FOR THE REPORT BOX, through the browser's own speech service
 * and nothing else.
 *
 * WHAT THIS IS AND IS NOT. The Web Speech API's `SpeechRecognition` is the
 * whole mechanism: the browser listens to the microphone, hands audio to the
 * speech service IT ships with (Google's for Chrome and Edge, Apple's for
 * Safari and iPadOS), and returns text. No audio and no transcript goes
 * through this repo, a Supabase function, or any endpoint of ours; the text
 * lands in the message field and leaves this browser only when the person
 * presses SEND, exactly as if they had typed it. There is no second path.
 *
 * WHERE IT WORKS, said plainly because the constraint is a school's devices:
 *   * Chrome and Edge on Windows: `webkitSpeechRecognition`, online only
 *     (the service is remote), interim results, continuous listening.
 *   * Safari on iPadOS 14.5+: `webkitSpeechRecognition`, with Siri and
 *     Dictation enabled in Settings; iOS stops a session on its own after a
 *     pause and reports `end`, which is why NOTHING here auto-restarts.
 *   * Firefox, and every third-party browser on an iPad (Chrome for iOS is a
 *     WebKit shell that does not expose the API): NO constructor, so
 *     `dictationConstructor()` answers null and the control is NOT RENDERED.
 *     Absence is the mechanism, the same as every other optional control in
 *     this subsystem: a plain textarea, never a microphone button that
 *     errors when pressed.
 *
 * THE ONE RULE ABOUT TEXT: DICTATION NEVER REMOVES A CHARACTER. A final
 * transcript is APPENDED to whatever is in the field at the moment it
 * arrives -- typed, pasted, or dictated a minute ago -- through
 * `appendDictation`, which only ever returns a string with the existing text
 * as its prefix. Inserting at the caret was considered and refused: a caret
 * with a selection behind it REPLACES the selection, which is precisely the
 * silent overwrite this rule exists to prevent, and a person who looks away
 * to speak does not know where their caret is. Interim (not yet final) text
 * is shown BESIDE the field, never written into it, so the field only ever
 * gains words the service has committed to.
 */

/** The subset of `SpeechRecognition` this module drives. Structural, so a
 *  harness or a test can hand in a fake with no microphone behind it. */
export interface SpeechRecognitionLike {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	start(): void;
	stop(): void;
	abort(): void;
	onstart: ((ev: unknown) => void) | null;
	onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
	onerror: ((ev: SpeechRecognitionErrorLike) => void) | null;
	onend: ((ev: unknown) => void) | null;
}

export interface SpeechRecognitionEventLike {
	resultIndex: number;
	results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionResultLike {
	isFinal: boolean;
	length: number;
	[index: number]: { transcript: string };
}

export interface SpeechRecognitionErrorLike {
	error: string;
	message?: string;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/**
 * THE FEATURE TEST, and the only place the two vendor spellings are named.
 * Chrome, Edge and Safari all ship the prefixed form; the unprefixed one is
 * checked first so a browser that graduates it keeps working. Anything that
 * is not a function -- absent, or a stub that is not constructible -- is null.
 */
export function dictationConstructor(
	w: unknown = typeof window === 'undefined' ? undefined : window
): SpeechRecognitionCtor | null {
	if (!w || typeof w !== 'object') return null;
	const g = w as Record<string, unknown>;
	const ctor = g.SpeechRecognition ?? g.webkitSpeechRecognition;
	return typeof ctor === 'function' ? (ctor as SpeechRecognitionCtor) : null;
}

/**
 * APPEND, NEVER REPLACE. The result always starts with `existing` verbatim;
 * the only thing added between the two is a single space when the existing
 * text does not already end in whitespace, so two dictated sentences do not
 * run together and a dictated sentence after a typed newline stays on its own
 * line. An empty or whitespace-only transcript changes nothing at all.
 */
export function appendDictation(existing: string, transcript: string): string {
	const spoken = transcript.trim();
	if (!spoken) return existing;
	if (!existing) return spoken;
	return /\s$/.test(existing) ? existing + spoken : `${existing} ${spoken}`;
}

/**
 * THE REFUSALS, IN THE PERSON'S TERMS. Every code the specification names,
 * plus a sentence for anything else, so a control never fails silently and
 * never shows an identifier. Each says what to do next: the plain field is
 * always there, and several of these are settings on the device, not on us.
 */
export function dictationErrorMessage(code: string | null | undefined): string {
	switch (code) {
		case 'not-allowed':
		case 'service-not-allowed':
			return 'The browser did not allow the microphone. Allow it for this site in the address bar, or just type.';
		case 'audio-capture':
			return 'No microphone was found. Plug one in or check the device settings, or just type.';
		case 'no-speech':
			return 'Nothing was heard. Press DICTATE and try again, closer to the microphone, or just type.';
		case 'network':
			return 'Speech to text needs a network connection and could not reach one. Typing still works.';
		case 'language-not-supported':
			return 'This browser cannot transcribe the page language. Typing still works.';
		case 'aborted':
			return 'Dictation stopped.';
		default:
			return 'Dictation stopped unexpectedly. Typing still works.';
	}
}

/** The sentence beside the control, saying where the audio goes. */
export const DICTATION_NOTE =
	'Uses your browser’s own speech service. Nothing you say is recorded by the portal; only the text you send is.';

/** The language the recogniser is asked for: the document’s, then the browser’s. */
export function dictationLang(
	doc: { documentElement?: { lang?: string } } | undefined = typeof document === 'undefined'
		? undefined
		: document,
	nav: { language?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator
): string {
	return doc?.documentElement?.lang || nav?.language || 'en-US';
}

export interface DictationHandlers {
	/** A committed sentence. Append it; never replace with it. */
	onFinal: (text: string) => void;
	/** What the service is hearing right now, or '' when nothing is pending. */
	onInterim: (text: string) => void;
	/** Listening began or ended. `false` arrives exactly once per session. */
	onListening: (listening: boolean) => void;
	/** A refusal or a failure, already in the person's words. */
	onError: (message: string) => void;
}

/**
 * ONE SESSION AT A TIME, with the four events above as its whole interface.
 *
 * `continuous` and `interimResults` are both on: the person reports in
 * sentences with pauses between them, and the live preview is what tells them
 * the microphone is actually hearing something. The result walk starts at
 * `resultIndex` because Safari re-delivers earlier results in the same list;
 * a final result is committed the moment it is marked final and never again.
 *
 * `stop()` asks the service to finish the sentence in flight and then fire
 * `end`; `abort()` (used on teardown) drops it. Either way `onListening(false)`
 * comes from the `end` event alone, so the control's state follows what the
 * browser actually did and not what was asked of it.
 */
export class Dictation {
	#ctor: SpeechRecognitionCtor;
	#h: DictationHandlers;
	#lang: string;
	#rec: SpeechRecognitionLike | null = null;

	constructor(ctor: SpeechRecognitionCtor, handlers: DictationHandlers, lang = dictationLang()) {
		this.#ctor = ctor;
		this.#h = handlers;
		this.#lang = lang;
	}

	get listening(): boolean {
		return this.#rec !== null;
	}

	start(): void {
		if (this.#rec) return;
		let rec: SpeechRecognitionLike;
		try {
			rec = new this.#ctor();
		} catch {
			this.#h.onError(dictationErrorMessage(null));
			return;
		}
		rec.lang = this.#lang;
		rec.continuous = true;
		rec.interimResults = true;
		rec.onstart = () => this.#h.onListening(true);
		rec.onresult = (ev) => {
			let interim = '';
			for (let i = ev.resultIndex; i < ev.results.length; i++) {
				const r = ev.results[i];
				const text = r[0]?.transcript ?? '';
				if (r.isFinal) this.#h.onFinal(text);
				else interim += text;
			}
			this.#h.onInterim(interim);
		};
		rec.onerror = (ev) => {
			// `aborted` after our own stop() is the browser confirming, not a
			// failure worth a sentence; every other code is reported.
			if (ev.error !== 'aborted' || this.#rec !== null) this.#h.onError(dictationErrorMessage(ev.error));
		};
		rec.onend = () => {
			this.#rec = null;
			this.#h.onInterim('');
			this.#h.onListening(false);
		};
		this.#rec = rec;
		try {
			rec.start();
		} catch {
			this.#rec = null;
			this.#h.onError(dictationErrorMessage(null));
		}
	}

	stop(): void {
		const rec = this.#rec;
		if (!rec) return;
		try {
			rec.stop();
		} catch {
			// A recogniser that throws on stop has already ended; fall through
			// to the teardown the `end` event would have done.
			this.#rec = null;
			this.#h.onInterim('');
			this.#h.onListening(false);
		}
	}

	/** Teardown: drop the session without waiting for a final sentence. */
	destroy(): void {
		const rec = this.#rec;
		if (!rec) return;
		this.#rec = null;
		rec.onresult = null;
		rec.onerror = null;
		rec.onend = null;
		try {
			rec.abort();
		} catch {
			/* already gone */
		}
	}
}
