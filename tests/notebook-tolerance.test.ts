// tests/notebook-tolerance.test.ts
//
// The notebook composer's tolerance callout: the four mechanical checks, the
// rate, and the seven bands.
//
// WHY THIS EARNS A TEST. Two silent failure modes, and the band boundaries are
// the worse one. A ceiling read as inclusive rather than exclusive moves every
// note sitting exactly on a boundary into the wrong band, and there is nothing
// to see: the callout renders a plausible tolerance either way, on every note,
// forever. The other is the minimum word count -- a callout that renders for a
// nine word note is arithmetic pretending to be a measurement, and it looks
// exactly like a callout working.
//
// THE EXPECTED VALUES ARE COUNTED BY HAND. Each case below states its word
// count and its error count in a comment, taken off the fixture text rather
// than from `countIssues`, so a check that stops firing changes an answer here
// instead of quietly agreeing with itself.

import { describe, expect, it } from 'vitest';
import {
	IN_SPEC,
	TOLERANCE_BANDS,
	TOLERANCE_MIN_WORDS,
	bandFor,
	countIssues,
	countWords,
	errorRate,
	noteBlocks,
	toleranceFor,
	toleranceForNote,
	type TextBlock
} from '../src/lib/notebook/tolerance';
import { editorDoc, noteSchema, pmBullets, pmDoc, pmItem, pmPara, pmText } from './rich-text-fixtures';

const p = (text: string): TextBlock => ({ text, kind: 'p' });
const li = (text: string): TextBlock => ({ text, kind: 'li' });

/**
 * The label `bandFor` answers, having first asserted there IS one.
 *
 * `bandFor` is nullable because a note below the minimum has no band at all,
 * and every case in the boundary block below is deliberately above it -- so
 * the assertion is a real one rather than a `!` silencing the type: a
 * boundary case that fell under the minimum would fail HERE, naming what
 * happened, instead of reading `undefined` as a wrong label.
 */
function label(errors: number, words: number): string {
	const band = bandFor(errors, words);
	expect(band, `no band for ${errors} errors in ${words} words`).not.toBeNull();
	return band!.label;
}

/**
 * Exactly `count` words of clean, correctly written prose.
 *
 * NO WORD REPEATS BACK TO BACK, and that is not decoration: the first version
 * of this fixture was `part part part ...`, which is a doubled word on every
 * pair, so a note built to have zero errors had twenty-three of them and
 * landed in the worst band there is. A fixture has to be a thing its producer
 * could emit AND a thing that means what the test says it means.
 */
function cleanWords(count: number): TextBlock {
	const vocabulary = ['milled', 'cut', 'faced', 'drilled', 'reamed', 'checked', 'filed', 'sanded'];
	const body = Array.from({ length: count - 1 }, (_, i) => vocabulary[i % vocabulary.length]);
	return p(`Today ${body.join(' ')}.`);
}

describe('the bands are exactly the seven the callout may render', () => {
	it('says what it was told to say and nothing else', () => {
		expect(IN_SPEC.label).toBe('IN SPEC');
		expect(TOLERANCE_BANDS.map((band) => band.label)).toEqual([
			'± 0.001 in',
			'± 0.005 in',
			'± 0.010 in',
			'± 1/32 in',
			'± 1/16 in',
			'± 1/2 in, eyeballed'
		]);
	});

	it('the ceilings are the ones the specification names', () => {
		expect(TOLERANCE_BANDS.map((band) => band.max)).toEqual([1, 2, 4, 8, 15, Infinity]);
	});
});

describe('every band boundary lands on the right side of the line', () => {
	// "under 1 per 100" is EXCLUSIVE. Each pair below straddles one ceiling by
	// the smallest step the denominator allows, so a ceiling read as `<=`
	// reddens the second half of every pair.
	//
	// 1000 words is the denominator throughout: it makes one error exactly 0.1
	// per 100, so any integer rate is reachable exactly.
	const WORDS = 1000;

	it('0 errors is IN SPEC, whatever the length', () => {
		expect(bandFor(0, WORDS)).toBe(IN_SPEC);
		expect(bandFor(0, TOLERANCE_MIN_WORDS)).toBe(IN_SPEC);
	});

	// IN SPEC is keyed on the COUNT, not the rate. One error in a thousand
	// words is 0.1 per 100 -- comfortably "under 1" -- and is still not clean.
	it('one error in a thousand words is NOT in spec', () => {
		expect(errorRate(1, WORDS)).toBeCloseTo(0.1, 10);
		expect(label(1, WORDS)).toBe('± 0.001 in');
	});

	it('under 1 per 100 -> ± 0.001 in, and exactly 1 is not under 1', () => {
		expect(errorRate(9, WORDS)).toBeCloseTo(0.9, 10);
		expect(label(9, WORDS)).toBe('± 0.001 in');
		expect(errorRate(10, WORDS)).toBeCloseTo(1, 10);
		expect(label(10, WORDS)).toBe('± 0.005 in');
	});

	it('under 2 per 100 -> ± 0.005 in, and exactly 2 is not under 2', () => {
		expect(label(19, WORDS)).toBe('± 0.005 in');
		expect(errorRate(20, WORDS)).toBeCloseTo(2, 10);
		expect(label(20, WORDS)).toBe('± 0.010 in');
	});

	it('under 4 per 100 -> ± 0.010 in, and exactly 4 is not under 4', () => {
		expect(label(39, WORDS)).toBe('± 0.010 in');
		expect(errorRate(40, WORDS)).toBeCloseTo(4, 10);
		expect(label(40, WORDS)).toBe('± 1/32 in');
	});

	it('under 8 per 100 -> ± 1/32 in, and exactly 8 is not under 8', () => {
		expect(label(79, WORDS)).toBe('± 1/32 in');
		expect(errorRate(80, WORDS)).toBeCloseTo(8, 10);
		expect(label(80, WORDS)).toBe('± 1/16 in');
	});

	it('under 15 per 100 -> ± 1/16 in, and exactly 15 is not under 15', () => {
		expect(label(149, WORDS)).toBe('± 1/16 in');
		expect(errorRate(150, WORDS)).toBeCloseTo(15, 10);
		expect(label(150, WORDS)).toBe('± 1/2 in, eyeballed');
	});

	it('past 15 per 100 stays eyeballed and never runs out of bands', () => {
		expect(label(500, WORDS)).toBe('± 1/2 in, eyeballed');
		expect(label(5000, WORDS)).toBe('± 1/2 in, eyeballed');
	});
});

describe('a short note renders nothing at all', () => {
	it('answers null below the minimum, on both entry points', () => {
		expect(bandFor(0, TOLERANCE_MIN_WORDS - 1)).toBeNull();
		expect(bandFor(3, TOLERANCE_MIN_WORDS - 1)).toBeNull();
		expect(toleranceFor([p('It worked.')])).toBeNull();
		expect(toleranceFor([])).toBeNull();
		expect(toleranceForNote(null)).toBeNull();
		expect(toleranceForNote({ type: 'doc', content: [] })).toBeNull();
	});

	// The positive control: the SAME note one word longer does render. Without
	// it, a `toleranceFor` that returned null unconditionally would pass every
	// assertion above.
	it('and renders at exactly the minimum', () => {
		const short = cleanWords(TOLERANCE_MIN_WORDS - 1);
		const atMin = cleanWords(TOLERANCE_MIN_WORDS);
		expect(countWords([short])).toBe(TOLERANCE_MIN_WORDS - 1);
		expect(countWords([atMin])).toBe(TOLERANCE_MIN_WORDS);
		expect(toleranceFor([short])).toBeNull();
		expect(toleranceFor([atMin])?.band.label).toBe('IN SPEC');
	});
});

describe('the four mechanical checks, one at a time', () => {
	// Each fixture below isolates ONE check: the surrounding prose is
	// deliberately clean, so the count named in the comment is the whole of it.

	it('a doubled word', () => {
		const issues = countIssues([p('I cut the the part to length.')]);
		expect(issues.doubledWords).toBe(1);
		expect(issues.total).toBe(1);
	});

	it('a paragraph with no ending punctuation', () => {
		const issues = countIssues([p('I milled the bracket and then I drilled the mounting holes')]);
		expect(issues.unpunctuated).toBe(1);
		expect(issues.total).toBe(1);
	});

	it('a sentence starting lowercase', () => {
		const issues = countIssues([p('I cut the stock. then I faced it.')]);
		expect(issues.lowercaseSentences).toBe(1);
		expect(issues.total).toBe(1);
	});

	it('a space before a comma or a period', () => {
		expect(countIssues([p('I cut it , then faced it.')]).spaceBeforePunctuation).toBe(1);
		expect(countIssues([p('I cut it .')]).spaceBeforePunctuation).toBe(1);
	});

	it('a misspelling the map knows', () => {
		const issues = countIssues([p('I had to seperate the two halves.')]);
		expect(issues.misspellings).toBe(1);
		expect(issues.total).toBe(1);
	});

	// THE CLEAN CONTROL. The same shapes, written correctly, count nothing --
	// which is what stops any of the four from being a check that always fires.
	it('correctly written prose counts nothing', () => {
		const issues = countIssues([
			p('I milled the bracket. Then I drilled the mounting holes and deburred them.')
		]);
		expect(issues).toMatchObject({
			misspellings: 0,
			doubledWords: 0,
			unpunctuated: 0,
			lowercaseSentences: 0,
			spaceBeforePunctuation: 0,
			total: 0
		});
	});
});

describe('the checks refuse the cases that would make them wrong', () => {
	// A grammar check that fires on correct writing teaches a student that
	// something they wrote properly is an error, which is the outcome the
	// four-check limit exists to avoid. These are the cases that nearly did.

	it('an abbreviation is not the end of a sentence', () => {
		// `in.` `ft.` `approx.` are the vocabulary this course writes in.
		expect(countIssues([p('It is 0.5 in. of clearance at the top.')]).lowercaseSentences).toBe(0);
		expect(countIssues([p('Cut it to 3 ft. and then deburr the end.')]).lowercaseSentences).toBe(0);
	});

	it('a decimal point is not the end of a sentence', () => {
		expect(countIssues([p('The gap measured 0.005 and the shim was 0.010 thick.')]).total).toBe(0);
	});

	it('a list item needs no ending punctuation', () => {
		expect(countIssues([li('cut three pieces')]).unpunctuated).toBe(0);
		// And the positive control: the same text as a PARAGRAPH is long enough
		// to be prose, so it is checked.
		expect(
			countIssues([p('cut three pieces and then deburr both of the ends')]).unpunctuated
		).toBe(1);
	});

	it('a short paragraph is a label, not an unfinished sentence', () => {
		// Under the eight word floor: a caption or a heading-shaped line.
		expect(countIssues([p('Bracket revision two')]).unpunctuated).toBe(0);
	});

	// THE GLOSSARY, on the counting side. A word autocorrect is forbidden to
	// touch must not be counted against the note either -- that would be a band
	// a student cannot improve without deleting their own vocabulary.
	it('a glossary word is never counted as a misspelling', () => {
		const issues = countIssues([p('I added a fillet and a chamfer, then deburred the kerf.')]);
		expect(issues.misspellings).toBe(0);
		expect(issues.total).toBe(0);
	});
});

describe('code is counted nowhere', () => {
	it('an error inside a code span is not an error', () => {
		expect(countIssues([p('I ran `teh teh` and it worked.')]).total).toBe(0);
	});

	it('and its words are not in the denominator either', () => {
		// `I ran and it worked` is five words; the two inside the ticks are not.
		expect(countWords([p('I ran `alpha beta` and it worked')])).toBe(5);
	});

	it('a code BLOCK contributes neither words nor errors', () => {
		const blocks: TextBlock[] = [{ text: 'teh teh teh', kind: 'code' }];
		expect(countIssues(blocks).total).toBe(0);
		expect(countWords(blocks)).toBe(0);
	});
});

describe('the projection from the editor document', () => {
	// Built through the REAL note schema, so the fixture is a document Tiptap
	// could actually hold -- the rich-text-fixtures rule.
	it('reads paragraphs as paragraphs and list items as items', () => {
		const doc = editorDoc(
			noteSchema,
			pmDoc(
				pmPara(pmText('I milled the bracket.')),
				pmBullets(pmItem(pmPara(pmText('cut three pieces'))))
			)
		);
		expect(noteBlocks(doc)).toEqual([
			{ text: 'I milled the bracket.', kind: 'p' },
			{ text: 'cut three pieces', kind: 'li' }
		]);
	});

	it('drops empty blocks rather than counting them', () => {
		const doc = editorDoc(noteSchema, pmDoc(pmPara(), pmPara(pmText('Done.'))));
		expect(noteBlocks(doc)).toEqual([{ text: 'Done.', kind: 'p' }]);
	});
});
