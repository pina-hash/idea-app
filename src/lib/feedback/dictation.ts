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
 *   * Chrome on Android: `webkitSpeechRecognition`, but it does not keep the
 *     specification's promise that a final result never changes. In
 *     continuous mode, as react-speech-recognition models it in its own
 *     Android fixture and filters it in its own manager, every growing guess
 *     arrives marked final with a confidence of exactly 0, then the real
 *     final, then often that final AGAIN. Read naively that is "this this is
 *     this is a test this is a test this is a test" (report R08, "dictate is
 *     terrible and dysfunctional on mobile"). `FinalResults` below is the one
 *     place that is repaired. NOTHING ON THIS PLATFORM WAS MEASURED FROM THIS
 *     REPOSITORY: no container here has a phone, so the shape is that
 *     library's, and a real-device check is owed.
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
 *
 * A DICTATED SENTENCE ENDS WITH A PERIOD (report R03: a spoken report arrived
 * as one paragraph with no full stop in it). The speech service returns words
 * and no punctuation, and every FINAL result is the end of something the
 * person said before a pause, so `appendDictation` closes each one with a
 * period when it has no end mark of its own and capitalises the next one.
 * That is still append-only: the period is added to the END of the field,
 * inside the words being appended, never inserted behind somebody's typing.
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
	/**
	 * `confidence` is optional because a harness or a test may omit it; a real
	 * browser always sends one. Exactly `0` on a FINAL result is Android's
	 * provisional result, see `FinalResults`.
	 */
	[index: number]: { transcript: string; confidence?: number };
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
 * WHAT ENDS A SENTENCE: a period, a question mark, an exclamation mark or an
 * ellipsis, optionally followed by a closing quote or bracket. A comma, a
 * colon and a semicolon do not.
 */
const SENTENCE_END = /[.!?…]["'”’)\]]*$/;

/**
 * Whether text appended after `existing` begins a new sentence: the field is
 * empty (or blank), the last line is blank, or the text ends in an end mark.
 * Typing that stops mid-sentence ("the bug is") does NOT, so a dictated
 * sentence that finishes it is not capitalised in the middle.
 */
function opensSentence(existing: string): boolean {
	if (!existing.trim()) return true;
	if (/\n[ \t]*$/.test(existing)) return true;
	return SENTENCE_END.test(existing.trimEnd());
}

/**
 * ONE FINAL RESULT AS A SENTENCE: trailing comma, colon or semicolon dropped
 * (they would read ",."), a period added when there is no end mark, and the
 * first letter capitalised when it opens a sentence. It shapes only the
 * transcript; the text already in the field is never touched.
 */
function asSentence(spoken: string, opens: boolean): string {
	const trimmed = spoken.replace(/[,;:]+$/, '').trimEnd() || spoken;
	const closed = SENTENCE_END.test(trimmed) ? trimmed : `${trimmed}.`;
	if (!opens || !/^\p{Ll}/u.test(closed)) return closed;
	return closed.charAt(0).toLocaleUpperCase() + closed.slice(1);
}

/**
 * APPEND, NEVER REPLACE. The result always starts with `existing` verbatim;
 * what is added is a single space when the existing text does not already end
 * in whitespace, so two dictated sentences do not run together and a dictated
 * sentence after a typed newline stays on its own line, and then the
 * transcript as a sentence (`asSentence`). An empty or whitespace-only
 * transcript changes nothing at all.
 *
 * Every caller hands this ONE final result at a time (the report box, the
 * grading console's comment and criterion notes), so the call boundary IS the
 * result boundary the period belongs at.
 */
export function appendDictation(existing: string, transcript: string): string {
	const spoken = transcript.trim();
	if (!spoken) return existing;
	const sentence = asSentence(spoken, opensSentence(existing));
	if (!existing) return sentence;
	return /\s$/.test(existing) ? existing + sentence : `${existing} ${sentence}`;
}

/** A spoken word as a comparison key: lower case, edge punctuation removed. */
function wordKey(word: string): string {
	return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** The words of a transcript, each with its key; words that are only punctuation drop out. */
function wordsOf(text: string): { raw: string; key: string }[] {
	return text
		.trim()
		.split(/\s+/)
		.map((raw) => ({ raw, key: wordKey(raw) }))
		.filter((w) => w.key !== '');
}

/**
 * WHICH FINAL RESULTS ARE NEW WORDS, for one listening session (report R08).
 *
 * WHAT THE SPECIFICATION PROMISES AND WHAT ANDROID DOES. `results` is the
 * whole session's list, `resultIndex` is the lowest index that changed in this
 * event, and a result marked final never changes again -- so walking from
 * `resultIndex` and committing each final once is the whole algorithm on
 * desktop Chrome, Edge and Safari (Safari re-delivers earlier results, which
 * starting at `resultIndex` already skips). Chrome on Android breaks the third
 * promise in continuous mode. Modelled on the widely used
 * react-speech-recognition's own Android fixture and filter: every event is a
 * fresh one-result list at index 0; each growing guess arrives marked FINAL
 * with a confidence of exactly 0; the real final follows with a real
 * confidence; and that final is often delivered a second time, identical, in
 * the next event. Three rules repair it, and each is keyed on what the event
 * SAYS rather than on a user-agent sniff:
 *
 *  1. A FINAL WITH CONFIDENCE EXACTLY 0 IS PROVISIONAL. It is shown beside the
 *     field like interim text and HELD, not committed. It is committed later
 *     only if nothing confirms it: when a result at a HIGHER index arrives
 *     (per the specification, a result below `resultIndex` did not change, so
 *     a later index means the held one is finished) or when the session ends.
 *     A browser that reports 0 on every final therefore still gets every
 *     sentence, late rather than never. A confirmed final at the same or a
 *     higher index replaces the held guess.
 *  2. AN IDENTICAL RE-SEND IS DROPPED: a final whose words equal the last
 *     committed final, with no interim (or provisional) result heard in
 *     between. On desktop a person repeating a sentence produces interim
 *     results for the repeat first, so a genuine repeat still lands.
 *  3. A FINAL THAT EXTENDS THE LAST ONE contributes only its new words, under
 *     the same "nothing heard in between" condition. This is the brief's
 *     "growing finals" case for an Android build that marks the guesses with a
 *     real confidence; the words arrive once, split where the guesses were.
 *
 * Comparison is by words, case-insensitive, edge punctuation ignored. When no
 * rule applies the transcript is committed EXACTLY as it arrived, which is
 * what keeps the desktop output byte-identical to what it was before this.
 */
export class FinalResults {
	/** Word keys of the last committed final, whole (not just the part committed). */
	#last: string[] | null = null;
	/** Whether an interim or provisional result arrived since the last commit. */
	#heard = false;
	/** A provisional final waiting to be confirmed, replaced, or flushed. */
	#held: { index: number; text: string } | null = null;

	/** One `result` event: the text to commit, in order, and the preview to show. */
	take(ev: SpeechRecognitionEventLike): { commits: string[]; interim: string } {
		const commits: string[] = [];
		let interim = '';
		for (let i = ev.resultIndex; i < ev.results.length; i++) {
			// A result past the held one means the held one is finished.
			if (this.#held && i > this.#held.index) this.#release(commits);
			const r = ev.results[i];
			const alt = r[0];
			const text = alt?.transcript ?? '';
			if (!r.isFinal) {
				interim += text;
				if (text.trim()) this.#heard = true;
				continue;
			}
			if (alt?.confidence === 0) {
				this.#held = { index: i, text };
				interim += text;
				if (text.trim()) this.#heard = true;
				continue;
			}
			// A confirmed final supersedes a guess at its own index or before it.
			if (this.#held && this.#held.index <= i) this.#held = null;
			const out = this.#decide(text);
			if (out !== null) commits.push(out);
		}
		// A held guess the walk did not reach is still what is being heard.
		if (this.#held && this.#held.index < ev.resultIndex) interim = this.#held.text + interim;
		return { commits, interim };
	}

	/** The session ended: a guess nothing confirmed is committed rather than lost. */
	flush(): string[] {
		const commits: string[] = [];
		this.#release(commits);
		return commits;
	}

	#release(commits: string[]) {
		const held = this.#held;
		this.#held = null;
		if (!held) return;
		const out = this.#decide(held.text);
		if (out !== null) commits.push(out);
	}

	#decide(text: string): string | null {
		const words = wordsOf(text);
		// Silence is passed through as it always was; it moves no state.
		if (!words.length) return text;
		const keys = words.map((w) => w.key);
		const last = this.#last;
		const fresh = this.#heard;
		if (last && !fresh) {
			const extends_ = keys.length >= last.length && last.every((k, i) => keys[i] === k);
			if (extends_ && keys.length === last.length) return null;
			if (extends_) {
				this.#last = keys;
				return words
					.slice(last.length)
					.map((w) => w.raw)
					.join(' ');
			}
		}
		this.#last = keys;
		this.#heard = false;
		return text;
	}
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

/**
 * WHETHER THE DEVICE'S MAIN POINTER IS A FINGER, and so whether focusing a
 * text field would raise an on-screen keyboard (report R08). The report box
 * hands the caret back to its field when it opens and when dictation ends,
 * which is right with a keyboard and a mouse and wrong on a phone: the
 * keyboard slides up over the box the person is reading, every time they
 * stop speaking. `(pointer: coarse)` is the question, because it is about the
 * PRIMARY input, not about whether a touchscreen exists somewhere (a touch
 * laptop keeps its fine pointer and keeps the focus). No window, no
 * `matchMedia`, or a throw all answer false: the desktop behaviour.
 */
export function coarsePointer(
	w: { matchMedia?: (query: string) => { matches: boolean } } | undefined = typeof window ===
	'undefined'
		? undefined
		: window
): boolean {
	try {
		return w?.matchMedia?.('(pointer: coarse)').matches === true;
	} catch {
		return false;
	}
}

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
 * the microphone is actually hearing something. Which final results are new
 * words is `FinalResults`' question, asked with a fresh one per session: the
 * walk starts at `resultIndex` because Safari re-delivers earlier results in
 * the same list, and Android's provisional and repeated finals are sorted out
 * there. A guess still held when the session ends is committed at `end`,
 * before listening is reported over, so it lands in the field it was spoken
 * into.
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
	#finals = new FinalResults();

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
		const finals = new FinalResults();
		this.#finals = finals;
		rec.onresult = (ev) => {
			const { commits, interim } = finals.take(ev);
			for (const text of commits) this.#h.onFinal(text);
			this.#h.onInterim(interim);
		};
		rec.onerror = (ev) => {
			// `aborted` after our own stop() is the browser confirming, not a
			// failure worth a sentence; every other code is reported.
			if (ev.error !== 'aborted' || this.#rec !== null) this.#h.onError(dictationErrorMessage(ev.error));
		};
		rec.onend = () => {
			this.#rec = null;
			for (const text of finals.flush()) this.#h.onFinal(text);
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
			for (const text of this.#finals.flush()) this.#h.onFinal(text);
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
