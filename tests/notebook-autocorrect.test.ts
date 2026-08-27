// tests/notebook-autocorrect.test.ts
//
// The notebook composer's autocorrect: the curated map, the glossary that
// outranks it, and the caret.
//
// WHY THIS EARNS A TEST, against this repo's default of verifying by dev
// harness. Every failure mode here is SILENT. A correction that fires on a
// glossary word rewrites `fillet` into an ordinary English word in a note the
// student will not re-read and the instructor will read as written. A caret
// that lands one character off is not visible in a screenshot and is only
// discovered by a person typing a paragraph and finding their letters in the
// wrong order. A revert that re-applies looks, from the outside, exactly like
// a revert that worked. None of it is eyeballable and all of it is pure, so
// there is nothing to mount and no fixture to build.
//
// THE EXPECTED VALUES DO NOT COME FROM THE IMPLEMENTATION. The band, the
// glossary words and the misspellings below are typed out as literals; the
// caret positions are counted off the strings by hand in the comments. A case
// derived from the code's own rule cannot fail.

import { describe, expect, it, beforeEach } from 'vitest';
import {
	BOUNDARY_CHARS,
	CorrectionLedger,
	DeclinedWords,
	caretInsideWord,
	codeRegions,
	inCodeRegion,
	isBoundary,
	isWordChar,
	matchCase,
	planCorrection,
	shiftCaret,
	wordBefore
} from '../src/lib/notebook/autocorrect';
import {
	MISSPELLINGS,
	MISSPELLING_COUNT,
	MISSPELLING_SECTIONS
} from '../src/lib/notebook/autocorrect-map';
import { GLOSSARY, GLOSSARY_SECTIONS, inGlossary } from '../src/lib/notebook/glossary';

/** A fresh declined set per case, so one test's revert cannot silence another. */
let declined: DeclinedWords;
beforeEach(() => {
	declined = new DeclinedWords();
});

/** Plan a correction with the caret at the very end of `text`. */
const planAtEnd = (text: string) => planCorrection(text, text.length, declined);

describe('the data: the map and the glossary', () => {
	it('the map is a few hundred entries, all lowercase, none self-correcting', () => {
		expect(MISSPELLING_COUNT).toBeGreaterThanOrEqual(300);
		const keys = Object.keys(MISSPELLINGS);
		expect(keys).toHaveLength(MISSPELLING_COUNT);
		for (const key of keys) {
			expect(key, `${key} is not lowercase`).toBe(key.toLowerCase());
			expect(MISSPELLINGS[key].toLowerCase(), `${key} corrects to itself`).not.toBe(key);
			expect(MISSPELLINGS[key].length, `${key} corrects to nothing`).toBeGreaterThan(0);
		}
	});

	it('no word is in two map sections, disagreeing or not', () => {
		const seen = new Map<string, string>();
		const dupes: string[] = [];
		for (const [name, section] of Object.entries(MISSPELLING_SECTIONS)) {
			for (const key of Object.keys(section)) {
				if (seen.has(key)) dupes.push(`${key} (${seen.get(key)} and ${name})`);
				else seen.set(key, name);
			}
		}
		expect(dupes).toEqual([]);
	});

	it('the glossary is substantial and entirely lowercase', () => {
		expect(GLOSSARY.size).toBeGreaterThanOrEqual(400);
		for (const [name, words] of Object.entries(GLOSSARY_SECTIONS)) {
			expect(words.length, `${name} is empty`).toBeGreaterThan(0);
			for (const word of words) {
				expect(word, `${word} in ${name} is not lowercase`).toBe(word.toLowerCase());
			}
		}
	});

	// THE COLLISION SWEEP. A word in both files would make the two data files
	// disagree about one word, and the glossary's win would look like the map
	// silently missing an entry.
	it('no map key is also a glossary word', () => {
		const collisions = Object.keys(MISSPELLINGS).filter((key) => GLOSSARY.has(key));
		expect(collisions).toEqual([]);
	});

	// THE POSITIVE CONTROL for the sweep above: the two files really do both
	// hold words, so an empty collision list is not an empty comparison.
	it('the vocabulary this feature exists to protect is in the glossary', () => {
		for (const word of ['fillet', 'chamfer', 'deburr', 'kerf', 'swarf', 'runout', 'tolerance']) {
			expect(inGlossary(word), `${word} is not protected`).toBe(true);
		}
		expect(MISSPELLINGS['teh']).toBe('the');
		expect(MISSPELLINGS['seperate']).toBe('separate');
	});
});

describe('what is and is not a word boundary', () => {
	it('a space, a newline and the sentence punctuation all end a word', () => {
		for (const ch of [' ', '\n', '\t', '.', ',', ';', ':', '!', '?', ')']) {
			expect(isBoundary(ch), `${JSON.stringify(ch)} should be a boundary`).toBe(true);
		}
		expect(BOUNDARY_CHARS).toContain(' ');
	});

	it('a letter and an apostrophe are word characters, a digit is not', () => {
		expect(isWordChar('a')).toBe(true);
		expect(isWordChar("'")).toBe(true);
		expect(isWordChar('’')).toBe(true);
		expect(isWordChar('3')).toBe(false);
		expect(isBoundary('a')).toBe(false);
	});

	it('wordBefore reads back the word ending at the boundary', () => {
		//              0123456789
		const text = 'cut teh part';
		expect(wordBefore(text, 7)).toEqual({ word: 'teh', from: 4, to: 7 });
		expect(wordBefore(text, 3)).toEqual({ word: 'cut', from: 0, to: 3 });
		// Nothing before a leading boundary.
		expect(wordBefore(' teh', 0)).toBeNull();
	});
});

describe('a correction fires, and carries the casing across', () => {
	it('corrects a mapped word on the space after it', () => {
		//                     0123456789
		const plan = planAtEnd('I cut teh ');
		expect(plan).toEqual({ from: 6, to: 9, original: 'teh', replacement: 'the' });
	});

	it('fires on sentence punctuation too, not only on a space', () => {
		expect(planAtEnd('that is seperate.')?.replacement).toBe('separate');
		expect(planAtEnd('is it seperate?')?.replacement).toBe('separate');
		expect(planAtEnd('seperate, then')).toBeNull(); // caret is not at the comma
	});

	it('reapplies the original casing without a second map entry', () => {
		expect(matchCase('teh', 'the')).toBe('the');
		expect(matchCase('Teh', 'the')).toBe('The');
		expect(matchCase('TEH', 'the')).toBe('THE');
		expect(planAtEnd('Teh ')?.replacement).toBe('The');
		expect(planAtEnd('TEH ')?.replacement).toBe('THE');
	});

	// The branch that exists for `im` -> `I'm`: a replacement that already
	// carries a capital is returned verbatim, or a lowercase original would
	// lowercase it back to `i'm`.
	it('leaves a replacement that already carries a capital alone', () => {
		expect(matchCase('im', "I'm")).toBe("I'm");
		expect(matchCase('ive', "I've")).toBe("I've");
		expect(planAtEnd('im ')?.replacement).toBe("I'm");
	});

	it('a multi-word replacement is allowed', () => {
		expect(planAtEnd('there was alot ')?.replacement).toBe('a lot');
	});
});

describe('what is never corrected', () => {
	// THE GLOSSARY EXCLUSION. The single most important refusal in the feature.
	it('never corrects a course glossary word', () => {
		for (const word of ['fillet', 'chamfer', 'deburr', 'kerf', 'runout', 'swarf']) {
			expect(planAtEnd(`I did the ${word} `), `${word} was corrected`).toBeNull();
		}
	});

	// The positive control for the case above: the same sentence shape, with a
	// word that IS in the map, does produce a correction. Without this, a
	// planner that returned null for everything would pass the glossary test.
	it('the same sentence shape with a mapped word DOES correct', () => {
		expect(planAtEnd('I did the teh ')).not.toBeNull();
		expect(planAtEnd('I did the teh ')?.replacement).toBe('the');
	});

	// A WORD ABUTTING A DIGIT. The backwards walk stops at a digit, so `3teh`
	// hands back `teh` and the digit is already outside the word -- which is
	// exactly how the first version of this shipped correcting `3teh` to
	// `3the`. The rule is what the word TOUCHES, and both sides are asked.
	it('never corrects a word that abuts a digit on either side', () => {
		expect(planAtEnd('cut it to 3teh ')).toBeNull();
		expect(planAtEnd('part teh2 ')).toBeNull();
		expect(planAtEnd('the M5x0.8teh ')).toBeNull();
	});

	it('never corrects a one-letter word', () => {
		expect(planAtEnd('a ')).toBeNull();
	});

	it('never corrects a word that is not in the map', () => {
		expect(planAtEnd('sprocket ')).toBeNull();
		expect(planAtEnd('qwertyuiop ')).toBeNull();
	});

	it('never fires when the character before the caret is not a boundary', () => {
		expect(planCorrection('I cut teh', 9, declined)).toBeNull();
	});

	// "never on the word the caret is inside". Unreachable from the boundary
	// trigger by construction, and asserted anyway because a second trigger
	// added later lands on this predicate first.
	it('a caret inside a word is inside it; a caret at either edge is not', () => {
		expect(caretInsideWord(5, 4, 7)).toBe(true);
		expect(caretInsideWord(4, 4, 7)).toBe(false);
		expect(caretInsideWord(7, 4, 7)).toBe(false);
	});
});

describe('code is never corrected', () => {
	it('finds a fenced block, an inline span, and neither in plain prose', () => {
		expect(codeRegions('a ```teh``` b')).toEqual([[2, 11]]);
		expect(codeRegions('a `teh` b')).toEqual([[2, 7]]);
		expect(codeRegions('a teh b')).toEqual([]);
	});

	it('an unterminated fence runs to the end; an unterminated inline tick does not', () => {
		expect(codeRegions('a ```teh')).toEqual([[2, 8]]);
		expect(codeRegions('a `teh')).toEqual([]);
	});

	it('never corrects a word inside an inline code span', () => {
		//                     0123456789
		const text = 'run `teh` ';
		expect(inCodeRegion(codeRegions(text), 5, 8)).toBe(true);
		expect(planAtEnd(text)).toBeNull();
	});

	it('never corrects a word inside a fenced block, including one opened earlier', () => {
		expect(planCorrection('```\nteh ', 8, declined)).toBeNull();
		// The fence was opened in an earlier BLOCK -- blocks reach the planner
		// joined by newlines, which is why the fence is still open here.
		expect(planCorrection('notes\n```\nx = teh ', 18, declined)).toBeNull();
	});

	// The positive control: the identical words, out of the code region.
	it('the same word OUTSIDE the code region still corrects', () => {
		expect(planAtEnd('run `x` teh ')).not.toBeNull();
		expect(planCorrection('```\ny\n```\nteh ', 14, declined)?.replacement).toBe('the');
	});
});

describe('the caret survives a correction', () => {
	// `I cut teh part` -- `teh` occupies [6, 9) and becomes `the`, the SAME
	// length; then the shortening and lengthening cases below move it.
	it('a caret past the correction moves by the length difference', () => {
		// same length: nothing moves
		expect(shiftCaret(10, 6, 9, 3)).toBe(10);
		// `wich` (4) -> `which` (5): everything after gains one
		expect(shiftCaret(12, 6, 10, 5)).toBe(13);
		// `alot` (4) -> `a lot` (5)
		expect(shiftCaret(20, 6, 10, 5)).toBe(21);
		// a SHORTENING: `becuase` (7) -> `because` (7) is even; use `oclock`
		// (6) -> `o'clock` (7) reversed -- a 7 to 5 replacement loses two.
		expect(shiftCaret(20, 6, 13, 5)).toBe(18);
	});

	it('a caret before the correction does not move at all', () => {
		expect(shiftCaret(2, 6, 10, 5)).toBe(2);
		expect(shiftCaret(6, 6, 10, 5)).toBe(6);
	});

	it('a caret inside the replaced range clamps to the end of what replaced it', () => {
		expect(shiftCaret(8, 6, 10, 5)).toBe(11);
	});

	// THE THREE POSITIONS IN THE LINE the brief calls for, driven end to end
	// through the planner so the offsets are the ones the editor would use.
	//
	//   `I wrote teh word` -- w=0..1, `wrote`=2..7, `teh`=8..11, `word`=12..16
	//
	// The correction is `teh` -> `the`, [8, 11), replacement length 3.
	it('holds at the start, the middle and the end of the line', () => {
		const text = 'I wrote teh ';
		const plan = planCorrection(text, 12, declined);
		expect(plan).toEqual({ from: 8, to: 11, original: 'teh', replacement: 'the' });
		const { from, to, replacement } = plan!;

		// START of the line, before the corrected word: unmoved.
		expect(shiftCaret(0, from, to, replacement.length)).toBe(0);
		// MIDDLE, still before it: unmoved.
		expect(shiftCaret(7, from, to, replacement.length)).toBe(7);
		// END, where the student actually is: unmoved, because `teh` and `the`
		// are the same length.
		expect(shiftCaret(12, from, to, replacement.length)).toBe(12);
	});

	it('and holds all three when the replacement is LONGER than the original', () => {
		//              0123456789...
		const text = 'I wrote wich ';
		const plan = planCorrection(text, 13, declined);
		expect(plan).toEqual({ from: 8, to: 12, original: 'wich', replacement: 'which' });
		const { from, to, replacement } = plan!;

		expect(shiftCaret(0, from, to, replacement.length)).toBe(0); // start
		expect(shiftCaret(7, from, to, replacement.length)).toBe(7); // middle
		expect(shiftCaret(13, from, to, replacement.length)).toBe(14); // end, +1
	});
});

describe('an immediate backspace reverts, once, and stops arguing', () => {
	it('reverts to exactly what was typed, over the range the replacement took', () => {
		const ledger = new CorrectionLedger(declined);
		// `wich` -> `which` at [8, 12); the replacement now occupies [8, 13).
		ledger.arm({ from: 8, to: 12, original: 'wich', replacement: 'which' });
		expect(ledger.armed()).toEqual({
			from: 8,
			to: 12,
			original: 'wich',
			replacement: 'which',
			appliedTo: 13
		});
		expect(ledger.revert()).toEqual({ from: 8, to: 13, text: 'wich' });
	});

	it('a second backspace is an ordinary backspace, not a second undo', () => {
		const ledger = new CorrectionLedger(declined);
		ledger.arm({ from: 8, to: 12, original: 'wich', replacement: 'which' });
		expect(ledger.revert()).not.toBeNull();
		expect(ledger.revert()).toBeNull();
	});

	it('anything other than backspace disarms it', () => {
		const ledger = new CorrectionLedger(declined);
		ledger.arm({ from: 8, to: 12, original: 'wich', replacement: 'which' });
		ledger.disarm();
		expect(ledger.revert()).toBeNull();
	});

	// THE HALF THAT MATTERS. Reverting and then correcting the same word again
	// on the next space is not an undo, it is an argument.
	it('DOES NOT RE-APPLY to that word again in the session', () => {
		const ledger = new CorrectionLedger(declined);
		// It corrects the first time.
		expect(planAtEnd('I wrote wich ')).not.toBeNull();

		ledger.arm({ from: 8, to: 12, original: 'wich', replacement: 'which' });
		ledger.revert();

		// And never again, in any sentence, in any casing.
		expect(planAtEnd('I wrote wich ')).toBeNull();
		expect(planAtEnd('Wich ')).toBeNull();
		expect(planAtEnd('a different sentence with wich ')).toBeNull();
		expect(ledger.isDeclined('WICH')).toBe(true);
	});

	// The positive control: declining one word declines ONLY that word.
	it('a declined word does not silence the rest of the map', () => {
		const ledger = new CorrectionLedger(declined);
		ledger.arm({ from: 0, to: 4, original: 'wich', replacement: 'which' });
		ledger.revert();
		expect(planAtEnd('wich ')).toBeNull();
		expect(planAtEnd('teh ')?.replacement).toBe('the');
		expect(declined.size).toBe(1);
	});
});
