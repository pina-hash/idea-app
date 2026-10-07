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
 * (The loudness meter beside the control is `mic-level.ts`, which measures on
 * this device and records nothing; it is a separate module precisely so this
 * one keeps its no-capture sweep.)
 *
 * WHERE IT WORKS, said plainly because the constraint is a school's devices:
 *   * Chrome and Edge on Windows: `webkitSpeechRecognition`, online only
 *     (the service is remote), interim results, continuous listening. The
 *     service ends a session on its own after a silence or a time limit, so
 *     ON A FINE POINTER a session asked for with `keepAlive` opens a fresh
 *     recogniser at each of those ends and keeps listening until the person
 *     presses STOP, a minute passes with nothing heard (`DICTATION_IDLE_MS`),
 *     or the ends come so fast that something is plainly wrong (the
 *     quick-restart guard below). Report 5ab3adb6: "as close to Claude's
 *     dictation as possible".
 *   * Safari on iPadOS 14.5+: `webkitSpeechRecognition`, with Siri and
 *     Dictation enabled in Settings; iOS stops a session on its own after a
 *     pause and reports `end`. ON A COARSE POINTER NOTHING HERE AUTO-RESTARTS
 *     (the surfaces pass `keepAlive` only for a fine one): iOS may refuse a
 *     start outside a tap, and Android Chrome chimes at every start, so a
 *     restart loop there would beep at each pause. The session ends and the
 *     box says "Paused" (docs/history/feedback-widget-theme-voice-zik6hw.md
 *     records the iOS reason, which still holds on a phone).
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
 * is never written into the field: the surfaces draw it OVER the field, in a
 * grey mirror (`DictationGhost`), exactly where `DictationJoin.preview` says
 * it will land, so the field only ever gains words the service committed to.
 *
 * A SENTENCE IS CLOSED WHEN THE NEXT ONE STARTS, NOT AT EVERY PAUSE (report
 * 5ab3adb6, reversing report R03's period-per-final). The service returns
 * words and no punctuation, and Chrome delivers a final at every breath, so a
 * period per final put "the. Then" and "but. Um" in the middle of sentences
 * (measured over that round's export: 48 sentence breaks, at least 6 after a
 * word that can never end a sentence, in 5 of 19 reports). Now
 * `appendDictation` appends a chunk OPEN, and `DictationJoin` is the one
 * thing that closes: when the next chunk is judged a new sentence by
 * `continuesSentence` (a word that cannot end one, a word that carries one
 * on, a spoken comma, or a pause shorter than `DICTATION_SENTENCE_PAUSE_MS`
 * all keep it open), or when the session ends. The period is still added to
 * the END of the field and only to text this session wrote itself, never
 * inserted behind somebody's typing. Fillers ("um", "uh") are dropped and
 * spoken punctuation ("comma", "question mark", "new line") becomes the mark,
 * in the transcript only.
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

/** The lexical rules below are English; another language gets plain joining. */
function isEnglish(lang: string | undefined): boolean {
	return /^en\b/i.test(lang ?? 'en');
}

/**
 * HESITATION SOUNDS, DROPPED (report 5ab3adb6: 9 of them in one round's
 * export, several capitalised into the start of a sentence). Standalone tokens
 * only, compared by `wordKey`. "ah", "hmm" and "like" are left alone because
 * they can carry meaning.
 */
export const DICTATION_FILLERS: readonly string[] = ['um', 'umm', 'uh', 'uhh', 'erm'];

/**
 * A PAUSE SHORTER THAN THIS KEEPS A SENTENCE OPEN; a longer one, with no word
 * saying otherwise, closes it. UNMEASURED: no microphone or speech service
 * reaches this container, so the number is a starting value to tune on a real
 * machine. It is measured from the last thing heard of one phrase (its last
 * interim result, which arrives while the person is still talking) to the
 * first thing heard of the next, never from the final's arrival, which comes
 * only after the service's own end-of-phrase delay and would understate every
 * silence by that much.
 */
export const DICTATION_SENTENCE_PAUSE_MS = 1000;

/** Words a sentence cannot end on: a phrase that stops here carries on. */
const NEVER_ENDS = new Set([
	'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'because', 'to', 'of', 'for', 'with', 'from',
	'at', 'by', 'into', 'onto', 'than', 'if', 'unless', 'my', 'your', 'our', 'their', 'its'
]);

/** Words that carry the previous sentence on rather than opening a new one. */
const CARRIES_ON = new Set([
	'and', 'but', 'or', 'nor', 'because', 'which', 'whose', 'than', 'unless', 'until',
	'although', 'though', 'whereas'
]);

/**
 * SPOKEN PUNCTUATION, two-word phrases first. "next line" is deliberately NOT
 * here: "the next line of the worksheet" is ordinary prose in a report.
 */
const SPOKEN_PAIRS = new Map<string, string>([
	['full stop', '.'],
	['question mark', '?'],
	['exclamation point', '!'],
	['exclamation mark', '!'],
	['new line', '\n'],
	['new paragraph', '\n\n']
]);
const SPOKEN_WORDS = new Map<string, string>([
	['comma', ','],
	['colon', ':'],
	['semicolon', ';'],
	['newline', '\n']
]);

/**
 * "PERIOD" IS EVERYDAY SCHOOL VOCABULARY, so it becomes a mark only as the
 * LAST word of a phrase and never after one of these ("see me 4th period",
 * "during class period" keep the word).
 */
const PERIOD_KEEPS = new Set([
	'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
	'eleventh', 'twelfth', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
	'ten', 'eleven', 'twelve', 'class', 'this', 'next', 'last', 'that', 'each', 'every', 'free',
	'lunch', 'passing', 'same', 'a', 'the', 'advisory', 'homeroom', 'zero', 'which', 'what', 'whole',
	'grading'
]);

function periodKeeps(before: string | null): boolean {
	if (before === null) return false;
	return PERIOD_KEEPS.has(before) || /^\d+(st|nd|rd|th)?$/.test(before);
}

/** A spoken word as a comparison key: lower case, edge punctuation removed. */
function wordKey(word: string): string {
	return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** The last word of some text, as a key, or null. */
function lastWordKey(text: string): string | null {
	const words = text.trim().split(/\s+/).filter((w) => wordKey(w) !== '');
	return words.length ? wordKey(words[words.length - 1]) : null;
}

/** The first letter as a capital when it is a lower-case letter; anything else is left alone. */
function capitalise(text: string): string {
	return /^\p{Ll}/u.test(text) ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

/**
 * ONE TRANSCRIPT, SHAPED: fillers dropped, spoken marks written as marks and
 * attached to the word before them, and the word after a spoken end mark or a
 * new line capitalised. NO PERIOD IS ADDED and the first word is left as
 * spoken; whether it opens a sentence is the append's question. `before` is
 * the last word already in the field, which decides a "period" that is the
 * whole chunk. Answers '' for silence and for a chunk that was only fillers.
 */
function shapeTranscript(transcript: string, lang: string | undefined, before: string | null): string {
	const tokens = transcript.trim().split(/\s+/).filter(Boolean);
	if (!tokens.length) return '';
	if (!isEnglish(lang)) return tokens.join(' ');
	let out = '';
	let capNext = false;
	let prev: string | null = before;
	const mark = (m: string) => {
		out = out.replace(/[ \t]+$/, '') + m;
		capNext = /[.?!\n]$/.test(m);
	};
	for (let i = 0; i < tokens.length; i++) {
		const key = wordKey(tokens[i]);
		const pair = i + 1 < tokens.length ? SPOKEN_PAIRS.get(`${key} ${wordKey(tokens[i + 1])}`) : undefined;
		if (pair !== undefined) {
			mark(pair);
			i++;
			continue;
		}
		const single = SPOKEN_WORDS.get(key);
		if (single !== undefined && key === tokens[i].toLowerCase()) {
			mark(single);
			continue;
		}
		if (key === 'period' && i === tokens.length - 1 && !periodKeeps(prev)) {
			mark('.');
			continue;
		}
		if (DICTATION_FILLERS.includes(key)) continue;
		const word = capNext ? capitalise(tokens[i]) : tokens[i];
		capNext = false;
		out += out === '' || out.endsWith('\n') ? word : ` ${word}`;
		if (key !== '') prev = key;
	}
	return out;
}

/** A shaped chunk that begins with a mark joins the text before it with no space. */
const LEADS_WITH_MARK = /^[,.;:?!\n]/;

/**
 * APPEND, NEVER REPLACE, AND NEVER CLOSE. The result always starts with
 * `existing` verbatim; what is added is a single space when the existing text
 * does not already end in whitespace (none before a chunk that begins with a
 * spoken mark), then the shaped transcript, its first letter capitalised only
 * where a sentence opens. AN APPENDED CHUNK IS LEFT OPEN: no period is added
 * here, ever. Closing is `DictationJoin`'s, which is the only thing that knows
 * whether the next words continue this sentence. Silence, and a chunk that was
 * only fillers, change nothing at all.
 */
export function appendDictation(
	existing: string,
	transcript: string,
	opts: { lang?: string } = {}
): string {
	let chunk = shapeTranscript(transcript, opts.lang, lastWordKey(existing));
	if (!chunk) return existing;
	if (!existing.trim()) chunk = chunk.replace(/^[,.;:?!]+[ \t]*/, '');
	if (!chunk) return existing;
	if (LEADS_WITH_MARK.test(chunk)) return existing + chunk;
	if (opensSentence(existing)) chunk = capitalise(chunk);
	if (!existing) return chunk;
	return /\s$/.test(existing) ? existing + chunk : `${existing} ${chunk}`;
}

/**
 * CLOSE THE SENTENCE AT THE END OF THE FIELD: a period, appended, unless the
 * text already ends in an end mark, a comma, colon or semicolon (a spoken
 * comma left open is the speaker's), whitespace or nothing at all.
 */
export function closeDictation(existing: string): string {
	if (!existing.trim() || /\s$/.test(existing)) return existing;
	if (SENTENCE_END.test(existing) || /[,;:]$/.test(existing)) return existing;
	return `${existing}.`;
}

/**
 * DOES THE NEXT CHUNK CARRY THE LAST ONE ON? The words decide first, and the
 * pause only when they say nothing: a phrase that stopped on a word no
 * sentence ends on ("the", "but") or on a comma, colon or semicolon carries
 * on; so does one whose next words open with "and", "because" or a spoken
 * mark. Otherwise a pause shorter than `DICTATION_SENTENCE_PAUSE_MS` carries
 * on and a longer one starts a new sentence. A pause nobody measured (null)
 * is no evidence of a break. Outside English only the pause speaks.
 */
export function continuesSentence(
	prev: string,
	next: string,
	pauseMs: number | null,
	lang?: string
): boolean {
	if (isEnglish(lang)) {
		if (/[,;:]$/.test(prev.trimEnd())) return true;
		const last = lastWordKey(prev);
		if (last !== null && NEVER_ENDS.has(last)) return true;
		if (LEADS_WITH_MARK.test(next.trimStart())) return true;
		const first = next.trim().split(/\s+/)[0] ?? '';
		if (CARRIES_ON.has(wordKey(first))) return true;
	}
	return pauseMs === null || pauseMs < DICTATION_SENTENCE_PAUSE_MS;
}

/**
 * ONE FIELD'S SENTENCES, ACROSS ONE DICTATION SESSION. This is the one place a
 * dictated sentence is closed, and it closes only text it wrote: `#after` is
 * the field's value right after this join's last write, so a field somebody
 * has typed into since is never given a period (the append then decides from
 * the text alone, as it always has). What it appends is `appendDictation`'s;
 * what it adds before that is a period at the very end, so the prefix rule
 * holds for every call.
 */
export class DictationJoin {
	#lang: string;
	/** The field's value right after this join's last write, or null. */
	#after: string | null = null;
	/** The last chunk this join appended, shaped. */
	#last = '';

	constructor(lang = 'en') {
		this.#lang = lang;
	}

	#plan(existing: string, transcript: string, pauseMs: number | null) {
		const shaped = shapeTranscript(transcript, this.#lang, lastWordKey(existing));
		if (!shaped) return null;
		const ours = this.#after !== null && existing === this.#after;
		const base =
			ours && !continuesSentence(this.#last, shaped, pauseMs, this.#lang)
				? closeDictation(existing)
				: existing;
		const out = appendDictation(base, transcript, { lang: this.#lang });
		return out === base ? null : { out, shaped };
	}

	/** One final result into the field: the new value of the field. */
	append(existing: string, transcript: string, pauseMs: number | null): string {
		const plan = this.#plan(existing, transcript, pauseMs);
		if (!plan) return existing;
		this.#after = plan.out;
		this.#last = plan.shaped;
		return plan.out;
	}

	/** The session ended: close the sentence this join left open, if the field is still as it left it. */
	close(existing: string): string {
		const ours = this.#after !== null && existing === this.#after;
		this.reset();
		return ours ? closeDictation(existing) : existing;
	}

	/**
	 * EXACTLY WHAT `append` WOULD ADD for words still being heard, as the text
	 * to draw after the field's own (a closing period, a space, a capital
	 * included). Nothing is recorded.
	 */
	preview(existing: string, interim: string, pauseMs: number | null): string {
		const plan = this.#plan(existing, interim, pauseMs);
		return plan ? plan.out.slice(existing.length) : '';
	}

	reset(): void {
		this.#after = null;
		this.#last = '';
	}
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

/** Added beside it only where a loudness meter is shown (a computer). */
export const DICTATION_LEVEL_NOTE = 'The sound level beside STOP is measured on this device and goes nowhere.';

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

/**
 * THE DICTATION KEY: Ctrl+Shift+Space, or Cmd+Shift+Space on a Mac, and
 * nothing else held. A pure test of the event, so the report box and a harness
 * ask the same question. (On a Chromebook the chord switches the input method
 * before a page sees it; the control and its word are still there.)
 */
export function isDictationChord(e: {
	key: string;
	code?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	altKey?: boolean;
}): boolean {
	return (
		(!!e.ctrlKey || !!e.metaKey) &&
		!!e.shiftKey &&
		!e.altKey &&
		(e.code === 'Space' || e.key === ' ')
	);
}

/**
 * HOW LONG A KEPT-ALIVE SESSION MAY HEAR NOTHING BEFORE IT ENDS ON ITS OWN.
 * It bounds a forgotten open microphone, the palette's 20-second reasoning,
 * longer because a report is composed in sentences with thinking between them.
 */
export const DICTATION_IDLE_MS = 60_000;
/** A recogniser that ends within this long of its start ended "quickly". */
export const DICTATION_QUICK_END_MS = 1500;
/**
 * HOW MANY QUICK ENDS IN A ROW ARE RESTARTED. Three are; the fourth ends the
 * session with a sentence, so a service that refuses every start cannot spin
 * a restart loop that throws nothing. Any words heard reset the count.
 */
export const DICTATION_MAX_QUICK_RESTARTS = 3;
/** A restart whose `start()` throws is tried once more after this long. */
export const DICTATION_RESTART_RETRY_MS = 250;
/**
 * HOW LONG A SURFACE WAITS FOR THE SENTENCE IN FLIGHT after asking the service
 * to stop (SEND pressed mid-sentence, a student switched mid-sentence), before
 * it drops the session and goes on without it.
 */
export const DICTATION_STOP_GRACE_MS = 1500;

/** Why a session ended, for the sentence the surface shows. */
export type DictationEnd = 'stopped' | 'paused' | 'idle' | 'failed';

/** "a minute", "30 seconds", "2 minutes": a duration in the words a status line uses. */
function durationWords(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s % 60 === 0) {
		const m = s / 60;
		return m === 1 ? 'a minute' : `${m} minutes`;
	}
	return s === 1 ? 'a second' : `${s} seconds`;
}

/**
 * THE SENTENCE AFTER A SESSION THAT ENDED ITSELF, or '' when the person ended
 * it (or a refusal already said why). The idle wording is DERIVED from the
 * constant it describes, so the two cannot disagree.
 */
export function dictationEndNote(why: DictationEnd | undefined, idleMs = DICTATION_IDLE_MS): string {
	if (why === 'paused') return 'Paused. Press DICTATE to keep going.';
	if (why === 'idle') return `Stopped after ${durationWords(idleMs)} of silence. Press DICTATE to keep going.`;
	return '';
}

/** What a kept-alive session says when the service will not stay open. */
export const DICTATION_KEEPS_STOPPING =
	'Dictation keeps stopping on this device. Press DICTATE to try again, or just type.';

/**
 * THE LOUDNESS METER, as this module sees it: structural, so nothing here
 * imports the module that opens the microphone (`mic-level.ts`, which carries
 * its own no-request sweep). Opened once per person-started session, after the
 * service has the microphone, and closed on every end.
 */
export interface MicMeter {
	open(onLevel: (level: number) => void): void;
	close(): void;
}

export interface DictationHandlers {
	/**
	 * A committed sentence. Append it; never replace with it. `pauseMs` is how
	 * long nothing was heard before this phrase began (null for the first
	 * phrase of a session), which is what `DictationJoin` weighs.
	 */
	onFinal: (text: string, pauseMs: number | null) => void;
	/** What the service is hearing right now, or '' when nothing is pending. */
	onInterim: (text: string, pauseMs: number | null) => void;
	/**
	 * Listening began or ended. `false` arrives exactly once per session the
	 * person started, however many recognisers a kept-alive session used, and
	 * says why it ended.
	 */
	onListening: (listening: boolean, why?: DictationEnd) => void;
	/** A refusal or a failure, already in the person's words. */
	onError: (message: string) => void;
	/** The microphone's loudness, 0 to 1, while a meter is open. */
	onLevel?: (level: number) => void;
}

/** Everything optional, and the defaults are exactly the behaviour before any of it existed. */
export interface DictationOptions {
	/** Open a fresh recogniser when the service ends a session on its own. Fine pointers only. */
	keepAlive?: boolean;
	/** A kept-alive session that hears nothing for this long ends ('idle'). */
	idleMs?: number;
	/** The loudness meter, or null for none. */
	meter?: MicMeter | null;
	/** The clock pauses are measured with. Injected so a test can state a pause. */
	now?: () => number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (id: unknown) => void;
	/** Whether the page is hidden: a kept-alive session never restarts in a hidden tab. */
	hidden?: () => boolean;
}

/** Codes after which a kept-alive session must not restart: the service said no. */
const TERMINAL_CODES = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported']);

function pageHidden(): boolean {
	return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * ONE SESSION AT A TIME, with the events above as its whole interface.
 *
 * `continuous` and `interimResults` are both on: the person reports in
 * sentences with pauses between them, and the live preview is what tells them
 * the microphone is actually hearing something. Which final results are new
 * words is `FinalResults`' question, asked with a fresh one per recogniser:
 * the walk starts at `resultIndex` because Safari re-delivers earlier results
 * in the same list, and Android's provisional and repeated finals are sorted
 * out there. A guess still held when a recogniser ends is committed at `end`,
 * before listening is reported over, so it lands in the field it was spoken
 * into.
 *
 * `stop()` asks the service to finish the sentence in flight and then fire
 * `end`; `abort()` (used on teardown) drops it. Either way `onListening(false)`
 * comes from the `end` event (or a stop the service could not take), so the
 * control's state follows what the browser actually did and not what was asked
 * of it.
 *
 * KEPT ALIVE (`options.keepAlive`, a fine pointer only): an `end` the person
 * did not ask for opens a fresh recogniser in the same session, with no second
 * `onListening(true)`; "nothing was heard" and a network hiccup are not said
 * out loud while it does. It never restarts after a refusal of the microphone,
 * an `aborted` it did not cause (another session took the microphone), in a
 * hidden tab, after four quick ends in a row, or once `idleMs` has passed with
 * nothing heard. `listening` is true for the whole session, including the
 * instant between two recognisers, so a STOP pressed then is not lost and a
 * second `start()` cannot open a second microphone.
 */
export class Dictation {
	#ctor: SpeechRecognitionCtor;
	#h: DictationHandlers;
	#lang: string;
	#rec: SpeechRecognitionLike | null = null;
	#finals = new FinalResults();
	#keepAlive: boolean;
	#idleMs: number;
	#meter: MicMeter | null;
	#now: () => number;
	#setTimer: (fn: () => void, ms: number) => unknown;
	#clearTimer: (id: unknown) => void;
	#hidden: () => boolean;

	/** The person asked for this session and has not ended it. */
	#wanted = false;
	/** `onListening(true)` was said for this session. */
	#announced = false;
	/** The service refused: no restart. */
	#terminal = false;
	/** A refusal was said out loud this session. */
	#reported = false;
	/** The idle cap ended it. */
	#idled = false;
	/** The quick-restart guard ended it. */
	#gaveUp = false;
	#lastCode: string | null = null;
	#quickRestarts = 0;
	#retried = false;
	#startedAt = 0;
	#idleTimer: unknown = null;
	#retryTimer: unknown = null;
	/** Which meter callback is current; bumped on every close. */
	#meterGen = 0;
	#meterOpen = false;
	/* THE PAUSE INSTRUMENT. `#lastHeardAt` is when the last phrase was last
	   heard (its last interim result, or its final when it had none);
	   `#phraseStartAt` is when the current phrase was first heard, and
	   `#phrasePause` the gap between the two. */
	#lastHeardAt: number | null = null;
	#phraseStartAt: number | null = null;
	#phrasePause: number | null = null;
	#phraseHadInterim = false;

	constructor(
		ctor: SpeechRecognitionCtor,
		handlers: DictationHandlers,
		lang = dictationLang(),
		options: DictationOptions = {}
	) {
		this.#ctor = ctor;
		this.#h = handlers;
		this.#lang = lang;
		this.#keepAlive = options.keepAlive === true;
		this.#idleMs = options.idleMs ?? DICTATION_IDLE_MS;
		this.#meter = options.meter ?? null;
		this.#now = options.now ?? (() => Date.now());
		this.#setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
		this.#clearTimer =
			options.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
		this.#hidden = options.hidden ?? pageHidden;
	}

	get listening(): boolean {
		return this.#wanted || this.#rec !== null;
	}

	start(): void {
		if (this.#wanted || this.#rec) return;
		this.#wanted = true;
		this.#announced = false;
		this.#terminal = false;
		this.#reported = false;
		this.#idled = false;
		this.#gaveUp = false;
		this.#lastCode = null;
		this.#quickRestarts = 0;
		this.#retried = false;
		this.#lastHeardAt = null;
		this.#endPhrase();
		if (this.#open()) return;
		// NEVER OPENED: no `start` and no `end` will come, so the refusal is the
		// whole answer, said with `listening` already false (a controller reads
		// that to know nothing is coming).
		this.#wanted = false;
		this.#h.onError(dictationErrorMessage(null));
	}

	/** One recogniser, wired. False when it could not be built or started. */
	#open(): boolean {
		let rec: SpeechRecognitionLike;
		try {
			rec = new this.#ctor();
		} catch {
			return false;
		}
		rec.lang = this.#lang;
		rec.continuous = true;
		rec.interimResults = true;
		const finals = new FinalResults();
		this.#finals = finals;
		rec.onstart = () => {
			// A RESTART'S `start` IS SWALLOWED: the session is already open.
			if (this.#announced) return;
			this.#announced = true;
			this.#h.onListening(true);
			this.#openMeter();
			this.#armIdle();
		};
		rec.onresult = (ev) => this.#result(finals, ev);
		rec.onerror = (ev) => this.#error(ev.error);
		rec.onend = () => this.#ended(rec, finals);
		this.#rec = rec;
		this.#startedAt = this.#now();
		try {
			rec.start();
		} catch {
			this.#rec = null;
			return false;
		}
		return true;
	}

	#result(finals: FinalResults, ev: SpeechRecognitionEventLike) {
		const { commits, interim } = finals.take(ev);
		const t = this.#now();
		const heardFinal = commits.some((c) => c.trim() !== '');
		const heardInterim = interim.trim() !== '';
		if (heardFinal || heardInterim) {
			// A HEALTHY SESSION: words arrived, so the quick-end count and the
			// idle cap start again.
			this.#quickRestarts = 0;
			this.#armIdle();
		}
		if (heardFinal) {
			if (this.#phraseStartAt === null) this.#beginPhrase(t);
			if (!this.#phraseHadInterim) this.#lastHeardAt = t;
			const pause = this.#phrasePause;
			for (const text of commits) this.#h.onFinal(text, pause);
			this.#endPhrase();
		} else {
			for (const text of commits) this.#h.onFinal(text, this.#phrasePause);
		}
		if (heardInterim) {
			if (this.#phraseStartAt === null) this.#beginPhrase(t);
			this.#phraseHadInterim = true;
			this.#lastHeardAt = t;
		}
		this.#h.onInterim(interim, heardInterim ? this.#phrasePause : null);
	}

	#beginPhrase(t: number) {
		this.#phraseStartAt = t;
		this.#phrasePause = this.#lastHeardAt === null ? null : t - this.#lastHeardAt;
	}

	#endPhrase() {
		this.#phraseStartAt = null;
		this.#phrasePause = null;
		this.#phraseHadInterim = false;
	}

	#error(code: string) {
		this.#lastCode = code;
		const ours = this.#rec !== null;
		if (TERMINAL_CODES.has(code) || (code === 'aborted' && ours)) this.#terminal = true;
		// KEPT ALIVE, the service's own "nothing heard" and a network hiccup are
		// the restart's business, not a sentence; the guard below says one if
		// they keep coming.
		if (this.#keepAlive && this.#wanted && (code === 'no-speech' || code === 'network')) return;
		// `aborted` after our own teardown is the browser confirming, not a
		// failure worth a sentence; every other code is reported.
		if (code !== 'aborted' || ours) {
			this.#reported = true;
			this.#h.onError(dictationErrorMessage(code));
		}
	}

	#ended(rec: SpeechRecognitionLike, finals: FinalResults) {
		if (this.#rec !== rec) return;
		this.#rec = null;
		const pause = this.#phrasePause;
		for (const text of finals.flush()) this.#h.onFinal(text, pause);
		this.#endPhrase();
		this.#h.onInterim('', null);
		if (this.#mayRestart()) {
			this.#restart();
			return;
		}
		this.#finish();
	}

	#mayRestart(): boolean {
		if (!this.#wanted || !this.#keepAlive || this.#terminal || this.#idled || this.#hidden()) {
			return false;
		}
		const quick = this.#now() - this.#startedAt < DICTATION_QUICK_END_MS;
		this.#quickRestarts = quick ? this.#quickRestarts + 1 : 0;
		if (this.#quickRestarts > DICTATION_MAX_QUICK_RESTARTS) {
			this.#gaveUp = true;
			return false;
		}
		return true;
	}

	#restart() {
		if (this.#open()) {
			this.#retried = false;
			return;
		}
		if (this.#retried) {
			this.#finish();
			return;
		}
		this.#retried = true;
		this.#retryTimer = this.#setTimer(() => {
			this.#retryTimer = null;
			if (this.#wanted && !this.#rec) this.#restart();
		}, DICTATION_RESTART_RETRY_MS);
	}

	#armIdle() {
		if (!this.#keepAlive || !this.#wanted) return;
		if (this.#idleTimer !== null) this.#clearTimer(this.#idleTimer);
		this.#idleTimer = this.#setTimer(() => {
			this.#idleTimer = null;
			if (!this.#wanted) return;
			// STILL WANTED until the end arrives, so the reason can be said while
			// the session still counts as open; `#idled` is what stops a restart.
			this.#idled = true;
			const rec = this.#rec;
			if (!rec) {
				this.#finish();
				return;
			}
			try {
				rec.stop();
			} catch {
				this.#rec = null;
				this.#finish();
			}
		}, this.#idleMs);
	}

	#openMeter() {
		const meter = this.#meter;
		if (!meter || this.#meterOpen) return;
		this.#meterOpen = true;
		const gen = ++this.#meterGen;
		try {
			meter.open((level) => {
				if (gen === this.#meterGen) this.#h.onLevel?.(level);
			});
		} catch {
			/* Best effort: a meter that fails is no meter, never a failed dictation. */
		}
	}

	#closeMeter() {
		if (!this.#meterOpen) return;
		this.#meterOpen = false;
		this.#meterGen++;
		try {
			this.#meter?.close();
		} catch {
			/* as above */
		}
	}

	#clearTimers() {
		if (this.#idleTimer !== null) this.#clearTimer(this.#idleTimer);
		if (this.#retryTimer !== null) this.#clearTimer(this.#retryTimer);
		this.#idleTimer = null;
		this.#retryTimer = null;
	}

	/**
	 * The session is over: say so once, and say why. A reason that is a
	 * refusal is said BEFORE `listening` turns false, so a controller still
	 * knows which field it belongs to.
	 */
	#finish() {
		const asked = this.#wanted;
		this.#rec = null;
		this.#clearTimers();
		this.#closeMeter();
		let why: DictationEnd;
		let message: string | null = null;
		if (this.#gaveUp) {
			message = this.#lastCode === 'network' ? dictationErrorMessage('network') : DICTATION_KEEPS_STOPPING;
			why = 'failed';
		} else if (this.#idled && this.#lastCode === 'network') {
			// Swallowed network failures that ran out the clock: that is the reason.
			message = dictationErrorMessage('network');
			why = 'failed';
		} else if (this.#terminal || this.#reported) why = 'failed';
		else if (this.#idled) why = 'idle';
		else why = asked ? 'paused' : 'stopped';
		if (message) {
			this.#reported = true;
			this.#h.onError(message);
		}
		this.#wanted = false;
		this.#announced = false;
		this.#h.onListening(false, why);
	}

	stop(): void {
		this.#wanted = false;
		const rec = this.#rec;
		if (!rec) {
			// THE GAP BETWEEN TWO RECOGNISERS (a restart waiting to retry): no
			// `end` is coming, so ending here is the only end there will be.
			if (this.#retryTimer !== null) this.#finish();
			return;
		}
		try {
			rec.stop();
		} catch {
			// A recogniser that throws on stop has already ended; fall through
			// to the teardown the `end` event would have done.
			this.#rec = null;
			for (const text of this.#finals.flush()) this.#h.onFinal(text, this.#phrasePause);
			this.#endPhrase();
			this.#h.onInterim('', null);
			this.#finish();
		}
	}

	/** Teardown: drop the session without waiting for a final sentence. Says nothing. */
	destroy(): void {
		this.#wanted = false;
		this.#announced = false;
		this.#clearTimers();
		this.#closeMeter();
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
