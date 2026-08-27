/**
 * THE TOLERANCE CALLOUT: a machining tolerance band for the note in front of
 * you, and nothing else.
 *
 * The reading is errors per 100 words, mapped to the band of a shop tolerance
 * it would correspond to. It says `± 0.005 in`. It does not say good, better,
 * improving, or keep it up. That is the entire copy rule and it is not a
 * stylistic preference: this is a student's own private notebook, the number
 * is about the TEXT and never about the person, and a callout that praises is
 * a callout that can also scold.
 *
 * WHAT IT IS NOT, and each of these is a hard constraint rather than a
 * feature that was left out:
 *   - it is the AUTHOR's, and reaches no instructor surface. The composer is
 *     the only place `NoteEditor` mounts, `EntryReview` renders notes through
 *     `NoteContent` with no editor at all, and nothing here is imported by
 *     either. `tests/notebook-tolerance-privacy.test.ts` sweeps for that.
 *   - it enters no grade, no rubric, no export, no print and no payload. It is
 *     computed in the browser from what is on screen and stored nowhere.
 *   - there is no streak, no history, no chart and no comparison. One note,
 *     one band, now.
 *   - below `TOLERANCE_MIN_WORDS` NOTHING RENDERS, because a rate per hundred
 *     words computed over nine of them is arithmetic pretending to be a
 *     measurement.
 *
 * THE FOUR MECHANICAL CHECKS ARE THE WHOLE OF THE GRAMMAR, deliberately. A
 * doubled word, a paragraph with no ending punctuation, a sentence starting
 * lowercase and a space before a comma or period are all decidable from the
 * characters with no model of meaning. Anything past them -- agreement, tense,
 * `their`/`there`, comma splices -- needs to understand the sentence, and a
 * wrong grammar correction in a notebook is worse than no feature: it teaches
 * a student that something they wrote correctly is wrong.
 *
 * Plain functions. No Svelte, no DOM, no `$lib/server`.
 */

import { codeRegions, inCodeRegion } from '$lib/notebook/autocorrect';
import { MISSPELLINGS } from '$lib/notebook/autocorrect-map';
import { inGlossary } from '$lib/notebook/glossary';

/**
 * Below this many words, the callout does not render at all.
 *
 * A rate per hundred words is a projection, and projecting from a two-word
 * note gives a number with no measurement under it: one slip in eight words is
 * "12.5 per 100", the worst band there is, for a note that is one sentence
 * long. Twenty-five words is roughly two written sentences, which is the point
 * at which the denominator starts meaning something.
 */
export const TOLERANCE_MIN_WORDS = 25;

/** One band of the callout: a rate ceiling and the tolerance it reads as. */
export interface ToleranceBand {
	id: string;
	/** Exactly what is rendered. No other words appear in the callout. */
	label: string;
	/**
	 * The EXCLUSIVE ceiling on errors per 100 words. A rate of exactly 1 is not
	 * "under 1 per 100" and lands in the band below; `Infinity` is the floor
	 * band, which everything reaches.
	 */
	max: number;
}

/**
 * The bands, worst-fit-last. `IN_SPEC` is not in this list because it is not a
 * rate at all -- see `bandFor`.
 */
export const TOLERANCE_BANDS: readonly ToleranceBand[] = [
	{ id: 'thou-1', label: '± 0.001 in', max: 1 },
	{ id: 'thou-5', label: '± 0.005 in', max: 2 },
	{ id: 'thou-10', label: '± 0.010 in', max: 4 },
	{ id: 'frac-32', label: '± 1/32 in', max: 8 },
	{ id: 'frac-16', label: '± 1/16 in', max: 15 },
	{ id: 'eyeballed', label: '± 1/2 in, eyeballed', max: Infinity }
];

/**
 * ZERO ERRORS, which is a different question from a low rate.
 *
 * It is keyed on the COUNT and not on the rate, because a rate rounds a clean
 * note in with a nearly clean one and those are not the same result. A note
 * with one error in a thousand words is 0.1 per 100 and is `± 0.001 in`; a
 * note with none is in spec.
 */
export const IN_SPEC: ToleranceBand = { id: 'in-spec', label: 'IN SPEC', max: 0 };

/** One block of a note's prose: a paragraph, or one item of a list. */
export interface TextBlock {
	text: string;
	/**
	 * A list item is exempt from the ending-punctuation check. A bullet reading
	 * `cut three pieces` is correctly written and a check that called it an
	 * error would fire on almost every note anybody writes.
	 *
	 * `code` is counted NOWHERE -- not as words and not as errors. The note
	 * schema has `codeBlock` off ($lib/rich-text-schema) so `noteBlocks` cannot
	 * currently produce one; it exists because the projection walks whatever
	 * document it is handed, and a block whose contents are code must not
	 * silently become prose if that schema ever widens.
	 */
	kind: 'p' | 'li' | 'code';
}

/**
 * Abbreviations that end in a period and are FOLLOWED by a lowercase word in
 * ordinary correct writing.
 *
 * Without this, `0.5 in. of clearance` reads as a sentence ending at `in.` and
 * a next sentence starting lowercase at `of` -- an error the student did not
 * make, in the exact vocabulary this course writes in. The check that "can
 * never be wrong" has to actually never be wrong.
 */
const ABBREVIATIONS = new Set([
	'in',
	'ft',
	'no',
	'approx',
	'fig',
	'vs',
	'etc',
	'e.g',
	'i.e',
	'eg',
	'ie',
	'mr',
	'mrs',
	'ms',
	'dr',
	'st',
	'max',
	'min',
	'dia',
	'qty',
	'ref',
	'est'
]);

/** The five counts behind a reading, kept apart so a test can name which moved. */
export interface NoteIssues {
	/** Words the curated map knows, that the glossary does not claim. */
	misspellings: number;
	doubledWords: number;
	unpunctuated: number;
	lowercaseSentences: number;
	spaceBeforePunctuation: number;
	total: number;
	words: number;
}

/** Words, counted the way the rate's denominator needs them: letters only. */
export function countWords(blocks: readonly TextBlock[]): number {
	let n = 0;
	for (const block of blocks) {
		if (block.kind === 'code') continue;
		const regions = codeRegions(block.text);
		for (const match of block.text.matchAll(/[A-Za-z][A-Za-z'’-]*/g)) {
			const from = match.index ?? 0;
			if (inCodeRegion(regions, from, from + match[0].length)) continue;
			n += 1;
		}
	}
	return n;
}

/**
 * Count every error in a note.
 *
 * CODE IS SKIPPED THROUGHOUT, by the same `codeRegions` the corrector uses --
 * one implementation, so the callout can never count an error in a span
 * autocorrect was forbidden to touch. Counting them would be the worst of both
 * behaviours: a band a student cannot improve without deleting their code.
 */
export function countIssues(blocks: readonly TextBlock[]): NoteIssues {
	let misspellings = 0;
	let doubledWords = 0;
	let unpunctuated = 0;
	let lowercaseSentences = 0;
	let spaceBeforePunctuation = 0;

	for (const block of blocks) {
		if (block.kind === 'code') continue;
		const text = block.text;
		const regions = codeRegions(text);
		const prose = (from: number, to: number) => !inCodeRegion(regions, from, to);

		// 1. Misspellings the map knows. The glossary wins, exactly as it does
		//    on the correcting side -- one predicate, so a word that is never
		//    corrected is also never counted against the note.
		for (const match of text.matchAll(/[A-Za-z'’]{2,}/g)) {
			const from = match.index ?? 0;
			const word = match[0];
			if (!prose(from, from + word.length)) continue;
			if (inGlossary(word)) continue;
			if (MISSPELLINGS[word.toLowerCase()]) misspellings += 1;
		}

		// 2. A doubled word. Case-insensitive, whitespace between them only.
		for (const match of text.matchAll(/\b([A-Za-z]{2,})(\s+)\1\b/gi)) {
			const from = match.index ?? 0;
			if (prose(from, from + match[0].length)) doubledWords += 1;
		}

		// 3. A space before a comma or a period.
		for (const match of text.matchAll(/\s+[,.]/g)) {
			const from = match.index ?? 0;
			if (prose(from, from + match[0].length)) spaceBeforePunctuation += 1;
		}

		const sentences = splitSentences(text);

		// 4. A paragraph that never ends. Only paragraphs, and only ones long
		//    enough to be prose rather than a label -- see TextBlock.kind.
		if (block.kind === 'p') {
			const trimmed = text.trim();
			const enough = (trimmed.match(/[A-Za-z]+/g) ?? []).length >= 8;
			if (trimmed && enough && !/[.!?][)"'’”]*$/.test(trimmed)) unpunctuated += 1;
		}

		// 5. A sentence starting lowercase.
		for (const sentence of sentences) {
			const first = sentence.text.match(/[A-Za-z]/);
			if (!first) continue;
			if (first[0] !== first[0].toLowerCase()) continue;
			const at = sentence.from + (first.index ?? 0);
			if (!prose(at, at + 1)) continue;
			if (sentence.afterAbbreviation) continue;
			lowercaseSentences += 1;
		}
	}

	const total =
		misspellings + doubledWords + unpunctuated + lowercaseSentences + spaceBeforePunctuation;
	return {
		misspellings,
		doubledWords,
		unpunctuated,
		lowercaseSentences,
		spaceBeforePunctuation,
		total,
		words: countWords(blocks)
	};
}

interface Sentence {
	text: string;
	from: number;
	/** The terminator before it was an abbreviation's period, so it is not one. */
	afterAbbreviation: boolean;
}

/**
 * Split a block into sentences on terminal punctuation FOLLOWED BY SPACE.
 *
 * The trailing space is what keeps `0.5` and `3.2mm` out of it: a period
 * between two digits terminates nothing. `ABBREVIATIONS` then handles the
 * other direction, where the punctuation is real but the sentence is not.
 */
function splitSentences(text: string): Sentence[] {
	const out: Sentence[] = [];
	let start = 0;
	let abbreviated = false;
	const re = /([.!?]+)\s+/g;
	for (const match of text.matchAll(re)) {
		const at = match.index ?? 0;
		out.push({ text: text.slice(start, at), from: start, afterAbbreviation: abbreviated });
		const before = text.slice(0, at).match(/([A-Za-z.]+)$/);
		abbreviated = Boolean(before && ABBREVIATIONS.has(before[1].toLowerCase().replace(/\.$/, '')));
		start = at + match[0].length;
	}
	if (start < text.length)
		out.push({ text: text.slice(start), from: start, afterAbbreviation: abbreviated });
	return out;
}

/** Errors per 100 words. Zero words is zero, never a division by zero. */
export function errorRate(errors: number, words: number): number {
	if (words <= 0) return 0;
	return (errors / words) * 100;
}

/**
 * The band a count lands in, or null when the note is too short to have one.
 *
 * The ceilings are EXCLUSIVE, which is what "under 1 per 100" says: a rate of
 * exactly 1.0 is not under 1 and takes the next band down. That boundary is
 * pinned in both directions by `tests/notebook-tolerance.test.ts`.
 */
export function bandFor(errors: number, words: number): ToleranceBand | null {
	if (words < TOLERANCE_MIN_WORDS) return null;
	if (errors === 0) return IN_SPEC;
	const rate = errorRate(errors, words);
	return TOLERANCE_BANDS.find((band) => rate < band.max) ?? TOLERANCE_BANDS[TOLERANCE_BANDS.length - 1];
}

/** Everything a caller needs: the band, the counts and the rate behind it. */
export interface ToleranceReading {
	band: ToleranceBand;
	issues: NoteIssues;
	rate: number;
}

/** The reading for a note, or null when it is too short to have one. */
export function toleranceFor(blocks: readonly TextBlock[]): ToleranceReading | null {
	const issues = countIssues(blocks);
	const band = bandFor(issues.total, issues.words);
	if (!band) return null;
	return { band, issues, rate: errorRate(issues.total, issues.words) };
}

/**
 * Project the EDITOR's own document into the blocks the checks read.
 *
 * It takes Tiptap JSON rather than a stored `NoteDoc` because the callout
 * reads what is on screen RIGHT NOW, and what is on screen is the editor's
 * shape -- the normalizer that would turn it into a `NoteDoc` is `$lib/server`
 * and unreachable from here (the same reason `NoteEditor` takes `initialDoc`).
 *
 * A LIST ITEM'S PARAGRAPHS ARE ITS OWN BLOCK, so a bullet is exempt from the
 * ending-punctuation check no matter how deeply it is nested. Anything the
 * walk does not recognise contributes its text as a paragraph rather than
 * vanishing: an uncounted block would quietly shrink the denominator and move
 * the band, which is worse than counting it as ordinary prose.
 */
export function noteBlocks(node: unknown): TextBlock[] {
	const out: TextBlock[] = [];
	walkBlocks(node, 'p', out);
	return out.filter((block) => block.text.trim().length > 0);
}

function nodeText(node: unknown): string {
	if (!node || typeof node !== 'object') return '';
	const n = node as { type?: string; text?: string; content?: unknown[] };
	if (typeof n.text === 'string') return n.text;
	if (!Array.isArray(n.content)) return '';
	return n.content.map(nodeText).join('');
}

function walkBlocks(node: unknown, kind: TextBlock['kind'], out: TextBlock[]): void {
	if (!node || typeof node !== 'object') return;
	const n = node as { type?: string; content?: unknown[] };
	if (n.type === 'codeBlock') {
		out.push({ text: nodeText(n), kind: 'code' });
		return;
	}
	if (n.type === 'paragraph' || n.type === 'heading') {
		out.push({ text: nodeText(n), kind });
		return;
	}
	if (n.type === 'listItem') {
		for (const child of n.content ?? []) walkBlocks(child, 'li', out);
		return;
	}
	for (const child of n.content ?? []) walkBlocks(child, kind, out);
}

/**
 * A whole note's reading, straight from the editor's document.
 *
 * The one entry point a surface needs: null means render nothing, which is
 * both the too-short case and the empty case.
 */
export function toleranceForNote(node: unknown): ToleranceReading | null {
	return toleranceFor(noteBlocks(node));
}
