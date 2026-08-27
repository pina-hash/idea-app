/**
 * AUTOCORRECT: the pure arithmetic behind the notebook composer's corrections.
 *
 * Everything decidable without a browser lives here -- which word is a
 * candidate, whether it may be touched, what it becomes, and where the caret
 * ends up afterwards. `NoteEditor.svelte` owns only the ProseMirror half:
 * turning a text offset into a document position and dispatching the
 * transaction. That split is deliberate and it is what makes the hard part
 * testable, because the hard part is not the replacement, it is the caret.
 *
 * THE RULE IS INCLUSION, NOT EXCLUSION. Nothing is corrected unless
 * `MISSPELLINGS` names it (autocorrect-map.ts), and nothing is corrected if
 * `GLOSSARY` names it (glossary.ts), which is checked FIRST and wins. A
 * dictionary-driven checker would do the opposite -- treat every unrecognised
 * word as wrong -- and in a class whose vocabulary is `fillet`, `chamfer`,
 * `deburr`, `kerf` and `runout` that rewrites the student's meaning while
 * looking confident about it. See the header of glossary.ts.
 *
 * WHERE IT NEVER FIRES, each for its own reason:
 *   - inside a code region, fenced or inline (`codeRegions`), because code is
 *     not prose and `teh` may be a variable name;
 *   - on the word the caret is inside (`caretInsideWord`), because a word
 *     being typed is not yet a word;
 *   - on a word the student has already reverted this session (the declined
 *     set below), the way a phone keyboard stops arguing after the first time;
 *   - on anything carrying a digit, because `3mm`, `1/2` and `M5x0.8` are
 *     measurements and not spelling.
 *
 * Plain functions and plain data. No Svelte, no DOM, no `$lib/server`.
 */

import { MISSPELLINGS } from '$lib/notebook/autocorrect-map';
import { inGlossary } from '$lib/notebook/glossary';

/**
 * What ends a word and therefore ARMS a correction.
 *
 * A correction fires on the character AFTER the word, never while the word is
 * being typed -- which is the same contract a phone keyboard has and the
 * reason `caretInsideWord` exists. The apostrophes are absent on purpose:
 * they are word characters here, so `don't` is one word and not `don` plus a
 * fragment.
 */
export const BOUNDARY_CHARS = ' \t\n.,;:!?)]}"’”/—';

export function isBoundary(ch: string): boolean {
	return ch.length === 1 && BOUNDARY_CHARS.includes(ch);
}

/**
 * What counts as part of a word: letters, both apostrophes, and nothing else.
 *
 * The straight and curly apostrophes are both in, so a correctly typed
 * `don't` is read as one word (and therefore not found in the map, and
 * therefore left alone) rather than as a `t` fragment that happens to match
 * nothing. Digits are OUT, which is what keeps `3mm`, `1/2-13` and `M5x0.8`
 * away from the map entirely.
 */
export function isWordChar(ch: string): boolean {
	return /[A-Za-z'’]/.test(ch);
}

/** One correction, in offsets into the text it was planned against. */
export interface Correction {
	/** Start of the word being replaced, inclusive. */
	from: number;
	/** End of the word being replaced, exclusive. */
	to: number;
	/** Exactly what the student typed, casing included. */
	original: string;
	/** What replaces it, with the original's casing reapplied. */
	replacement: string;
}

/**
 * Reapply the ORIGINAL's casing to the replacement.
 *
 * `Teh` -> `The` and `TEH` -> `THE` with no second map entry, which is what
 * keeps the map a list of words rather than a list of words times three.
 *
 * A REPLACEMENT THAT ALREADY CARRIES A CAPITAL IS RETURNED VERBATIM, and that
 * is the load-bearing branch: `im` -> `I'm` and `ive` -> `I've` are typed
 * lowercase and must not come back lowercased to `i'm`. Detecting it from the
 * replacement rather than listing the exceptions means a new contraction added
 * to the map needs no code change here.
 */
export function matchCase(original: string, replacement: string): string {
	if (/[A-Z]/.test(replacement)) return replacement;
	const letters = original.replace(/[^A-Za-z]/g, '');
	if (letters.length > 1 && letters === letters.toUpperCase()) return replacement.toUpperCase();
	if (/^[A-Z]/.test(original)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
	return replacement;
}

/** A half-open span of text that is code and therefore off limits. */
export type CodeRegion = [start: number, end: number];

/**
 * Every code region in a piece of text: fenced blocks and inline spans.
 *
 * THIS IS A TEXTUAL CHECK ON PURPOSE, and it is not redundant with the
 * structural one. The note schema turns `code` and `codeBlock` OFF
 * ($lib/rich-text-schema), so a student who wants to show a line of code types
 * backticks and gets literal backticks in a paragraph -- which means the ONLY
 * representation of code a note can hold is the one a structural check cannot
 * see. `NoteEditor` still refuses a real `codeBlock` node and a real `code`
 * mark before calling any of this, because a document can reach the editor
 * from the draft mirror and the schema can widen later; that is defence in
 * depth, and THIS is the check that does the work today.
 *
 * AN UNTERMINATED FENCE RUNS TO THE END, because a student who has typed the
 * opening ``` is inside a code block by any reading and the next thing they
 * type is code. AN UNTERMINATED INLINE BACKTICK DOES NOT, and the asymmetry is
 * the point: a lone backtick in a sentence is a stray keystroke, and letting
 * it switch autocorrect off for the rest of the note would be a silent,
 * invisible failure of exactly the kind this feature must not have.
 */
export function codeRegions(text: string): CodeRegion[] {
	const out: CodeRegion[] = [];
	let i = 0;
	while (i < text.length) {
		if (text.startsWith('```', i)) {
			const close = text.indexOf('```', i + 3);
			const end = close === -1 ? text.length : close + 3;
			out.push([i, end]);
			i = end;
			continue;
		}
		if (text[i] === '`') {
			// Same line only: a closing backtick on a LATER line is a different
			// span of prose, not this one's terminator.
			const lineEnd = text.indexOf('\n', i + 1);
			const limit = lineEnd === -1 ? text.length : lineEnd;
			const close = text.indexOf('`', i + 1);
			if (close !== -1 && close < limit) {
				out.push([i, close + 1]);
				i = close + 1;
				continue;
			}
		}
		i += 1;
	}
	return out;
}

/** Does [from, to) touch any code region? Any overlap at all disqualifies it. */
export function inCodeRegion(regions: readonly CodeRegion[], from: number, to: number): boolean {
	return regions.some(([start, end]) => from < end && to > start);
}

/** A word located in a piece of text. */
export interface LocatedWord {
	word: string;
	from: number;
	to: number;
}

/**
 * The word ending immediately before `at`, or null if there is not one.
 *
 * `at` is the index of the boundary character, so the word is what runs
 * backwards from it over word characters.
 */
export function wordBefore(text: string, at: number): LocatedWord | null {
	let from = at;
	while (from > 0 && isWordChar(text[from - 1])) from -= 1;
	if (from === at) return null;
	return { word: text.slice(from, at), from, to: at };
}

/**
 * Is the caret INSIDE this word, rather than before or after it?
 *
 * A word being typed is not yet a word, so it is never corrected; touching the
 * caret's own word is how an autocorrect feature makes a text box unusable. A
 * caret exactly at either edge is NOT inside -- it is between two words, and
 * the one that just ended is a legitimate candidate.
 */
export function caretInsideWord(caret: number, from: number, to: number): boolean {
	return caret > from && caret < to;
}

/** The declined set: words this writing session has been told to leave alone. */
export class DeclinedWords {
	#words = new Set<string>();

	has(word: string): boolean {
		return this.#words.has(word.toLowerCase());
	}

	add(word: string): void {
		this.#words.add(word.toLowerCase());
	}

	get size(): number {
		return this.#words.size;
	}

	clear(): void {
		this.#words.clear();
	}
}

/**
 * THE SESSION's declined words, module-level and shared by every editor on the
 * page.
 *
 * Per PAGE VISIT rather than per editor instance, and that is the whole reason
 * it is not a field on the ledger: a student who reverts `wont` in one entry,
 * clicks another entry and types it again is the SAME person making the same
 * point, and an editor remount is not them changing their mind. It is
 * deliberately NOT persisted -- a permanent exception list is a preference the
 * student never asked to set and has no way to see or undo.
 */
export const sessionDeclined = new DeclinedWords();

/**
 * Decide whether the boundary character just typed at `caret - 1` should
 * correct the word before it.
 *
 * `text` is the prose the offsets are measured in and `caret` is where the
 * caret sits now, immediately after the boundary. Returns null far more often
 * than not, and every null is one of the documented refusals above.
 */
export function planCorrection(
	text: string,
	caret: number,
	declined: DeclinedWords = sessionDeclined
): Correction | null {
	if (caret < 2 || caret > text.length) return null;
	if (!isBoundary(text[caret - 1])) return null;

	const located = wordBefore(text, caret - 1);
	if (!located) return null;
	const { word, from, to } = located;

	// A word being typed is not yet a word. Unreachable from this trigger --
	// the caret is past the boundary by construction -- and asserted anyway,
	// because a second trigger added later would land on it first.
	if (caretInsideWord(caret, from, to)) return null;

	if (word.length < 2) return null;

	/*
	 * A WORD THAT ABUTS A DIGIT IS PART OF A LARGER TOKEN, NOT A WORD.
	 *
	 * `isWordChar` stops the backwards walk at a digit, so `3teh` hands back
	 * `teh` and a check on the word's OWN characters can never see the `3` --
	 * it was already excluded from the word. Measured: `cut it to 3teh ` was
	 * corrected to `cut it to 3the `. The question is what the word touches,
	 * so that is what is asked. It is what keeps `M5x0.8`, `1/2-13` and a part
	 * number like `A12-teh` out of the map entirely.
	 */
	if (/\d/.test(text[from - 1] ?? '')) return null;
	if (/\d/.test(text[to] ?? '')) return null;

	if (inGlossary(word)) return null;
	if (declined.has(word)) return null;
	if (inCodeRegion(codeRegions(text), from, to)) return null;

	const mapped = MISSPELLINGS[word.toLowerCase()];
	if (!mapped) return null;

	const replacement = matchCase(word, mapped);
	if (replacement === word) return null;

	return { from, to, original: word, replacement };
}

/**
 * WHERE THE CARET GOES after a replacement. This is the function the whole
 * feature is usable or unusable on.
 *
 * A correction fires on the character after a word, so in the ordinary case
 * the caret is PAST the replaced range and simply moves by the length
 * difference -- which is why a correction that shortens a word must not leave
 * the caret one character to the right of where the student is looking. The
 * other two cases are here because a correction can also be dispatched while
 * the caret sits elsewhere in the line (a student who typed a word, clicked
 * back and typed a space): before the range it does not move at all, and
 * inside it -- which `planCorrection` refuses but a revert can produce -- it
 * clamps to the end of what replaced it rather than to an offset that may no
 * longer exist.
 */
export function shiftCaret(
	caret: number,
	from: number,
	to: number,
	replacementLength: number
): number {
	if (caret <= from) return caret;
	if (caret >= to) return caret + (replacementLength - (to - from));
	return from + replacementLength;
}

/** A correction that has been applied and could still be reverted. */
export interface PendingCorrection extends Correction {
	/** Where the replacement now ends: `from + replacement.length`. */
	appliedTo: number;
}

/** What to put back when a revert fires. */
export interface RevertPlan {
	from: number;
	to: number;
	text: string;
}

/**
 * THE ONE-KEYSTROKE UNDO, which is the behaviour every phone keyboard has and
 * the reason a correction is tolerable at all: if the correction was wrong,
 * the cost of refusing it is one key.
 *
 * ARMED by the correction itself and DISARMED by literally anything else --
 * another character, a click, a selection change. Only the immediately next
 * keystroke can be the revert, because a backspace three words later is a
 * student deleting a letter and turning that into an undo would be a far worse
 * surprise than the correction was.
 *
 * A REVERT ALSO DECLINES THE WORD, which is the half that matters. Restoring
 * `teh` and then correcting it again on the next space is not an undo, it is
 * an argument, and the student loses. The decline is by lowercased word and
 * lasts the session (`sessionDeclined`).
 */
export class CorrectionLedger {
	#pending: PendingCorrection | null = null;
	#declined: DeclinedWords;

	constructor(declined: DeclinedWords = sessionDeclined) {
		this.#declined = declined;
	}

	/** Record a correction that has just been applied to the document. */
	arm(correction: Correction): void {
		this.#pending = { ...correction, appliedTo: correction.from + correction.replacement.length };
	}

	/** Anything that is not the revert keystroke. */
	disarm(): void {
		this.#pending = null;
	}

	armed(): PendingCorrection | null {
		return this.#pending;
	}

	/**
	 * Backspace, with a correction armed. Returns what to put back and where,
	 * declines the word, and disarms -- so a second backspace is an ordinary
	 * backspace. Null when nothing is armed, which is the caller's signal to let
	 * the key do its normal job.
	 */
	revert(): RevertPlan | null {
		const pending = this.#pending;
		if (!pending) return null;
		this.#pending = null;
		this.#declined.add(pending.original);
		return { from: pending.from, to: pending.appliedTo, text: pending.original };
	}

	isDeclined(word: string): boolean {
		return this.#declined.has(word);
	}
}
