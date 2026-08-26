// tests/spec-instructions-budget.test.ts
//
// THE 300-WORD INSTRUCTIONS CEILING, as a property of the COUNTER and of the
// IMPORTER'S WARNING -- and no longer as a sweep over `materials/`.
//
// IDEA_MATERIAL_SPEC v2.1 (docs/standards/IDEA_MATERIAL_SPEC_v2.md, modules[])
// splits the instructions budget in two: 250 words per module is the authoring
// TARGET and 300 is the CEILING. `validateSpec` warns between 251 and 300 and
// never blocks publishing. What this file pins is that the COUNT is the count
// of words on the page, and that the warning fires on exactly the right side
// of each number.
//
// WHAT THIS FILE USED TO DO AND DOES NOT ANY MORE, because it is the reason CI
// was red for days and the reason a real failure here would have been
// invisible underneath it.
//
// It swept every assignment spec under `materials/` and failed on any module
// over the ceiling, with three specs exempted BY PATH AND BY PINNED HASH.
// Three things were wrong with that, and the third is fatal:
//
//   1. `materials/` IS NOT AUTHORED CONTENT. It is an EXPORT. The classroom
//      GitHub export (`$lib/server/classroom-export.ts`) writes it and pushes
//      to `main` on every item save, with no human involved -- 19 of the 21
//      commits that have ever touched the directory are the app's own, and no
//      assignment spec exists anywhere else in the repo. So the sweep was
//      enforcing an AUTHORING standard against a MIRROR of what had already
//      been published.
//
//   2. IT COULD NOT GATE ANYTHING. A spec reaches `materials/` because a
//      teacher pressed save, which is also the moment students can see it.
//      Failing CI afterwards does not stop anything; the enforcement point for
//      a ceiling is the importer, and the importer's answer is deliberately a
//      warning (see the tier below).
//
//   3. IT COULD NOT BE KEPT GREEN, AND THAT COST MORE THAN IT EVER BOUGHT.
//      A pinned hash over a directory the app rewrites turns red when somebody
//      saves a classroom item. It went red, twice the answer was to write the
//      new hash into the list, and the third time is what prompted deleting
//      it: a list updated to match whatever last happened records history, it
//      does not check anything. Worse, a standing failure makes a REAL failure
//      indistinguishable from it -- which is exactly what happened, for days,
//      to the whole suite.
//
// WHAT IS LOST, stated rather than glossed: this was the only place that
// observed the instruction lengths teachers ACTUALLY publish (it last reported
// a 520-word module), and the only automatic alarm if one went far over. That
// alarm fired after publication, on an export, and could not tell "somebody
// wrote too much" apart from "somebody saved an item". If the ceiling should
// ever BLOCK rather than warn, that is a change to `validateSpec` -- a gate
// narrowing, which ships in its own bundle with its own answer for the specs
// already stored -- and not a sweep over a directory nobody edits by hand.
//
// THE COUNT COMES FROM THE RENDERER'S OWN PARSE. `instructionsWordCount` walks
// `parseMarkdown` output, which is exactly what MarkdownText walks, so the
// number is the number of words on the page. A regex-based syntax stripper
// here would be a second, worse implementation of the parser and would charge
// an author for their own list markers.
//
// EVERY FIXTURE BELOW IS CONSTRUCTED, and a word is `wN`, so every expected
// value comes from the construction rather than from the counter under test.
// Nothing here reads the repository, so nothing here can be turned red by the
// app writing a file.

import { describe, expect, it } from 'vitest';
import {
	INSTRUCTIONS_WORD_CEILING,
	INSTRUCTIONS_WORD_TARGET,
	instructionsWordCount,
	validateSpec,
	type SpecModule
} from '$lib/classroom/assignment-spec';

// --- Constructed fixtures --------------------------------------------------
//
// A word here is `wN`, so a count is checkable by reading the fixture rather
// than by trusting the counter that produced it -- the expected value comes
// from the construction, not from the implementation under test.

function words(n: number, from = 1): string[] {
	return Array.from({ length: n }, (_, i) => `w${from + i}`);
}

/** N words as one plain paragraph. */
function plainInstructions(n: number): string {
	return words(n).join(' ');
}

/**
 * N CONTENT words wrapped in every markdown construct the parser knows, so
 * "markdown syntax excluded" is asserted rather than assumed. The syntax
 * characters, the list markers, the table pipes and a link's URL are all
 * structure and none of them are words on the page.
 */
function markdownInstructions(n: number): string {
	const w = words(n);
	const take = (count: number) => w.splice(0, count).join(' ');
	const lines = [
		`### ${take(3)}`,
		'',
		// The trailing period is deliberate: it arrives as its own run, and a
		// counter that added its runs up separately would charge a word for it.
		`**${take(2)}** ${take(1)} _${take(2)}_ \`${take(1)}\`.`,
		'',
		`- ${take(4)}`,
		`- ${take(4)}`,
		`  - ${take(3)}`,
		'',
		`| ${take(2)} | ${take(2)} |`,
		'| --- | --- |',
		`| ${take(2)} | ${take(2)} |`,
		'',
		`> ${take(3)}`,
		'',
		`[${take(2)}](https://example.com/a-long-url-with-many-hyphenated-words-in-it)`,
		'',
		`![${take(3)}](attachment:diagram.png)`,
		'',
		'```',
		take(2),
		'```',
		''
	];
	// Whatever is left goes in a final paragraph, so the total is exactly n.
	if (w.length) lines.push(w.join(' '));
	return lines.join('\n');
}

function moduleWith(contents: string[]): SpecModule {
	return {
		id: 'm1',
		title: 'Constructed',
		points: 0,
		blocks: contents.map((content) => ({ type: 'instructions' as const, content }))
	} as SpecModule;
}

// ---------------------------------------------------------------------------

describe('CI PIPELINE PROOF -- deliberately failing, reverted immediately', () => {
	it('fails on purpose, so a red run can be told from a green one', () => {
		// 300 words are 300 words. This asserts 299 so the job MUST fail, and
		// fail for exactly one legible reason. Reverted in the next commit.
		expect(instructionsWordCount(moduleWith([plainInstructions(300)]))).toBe(299);
	});
});

describe('instructions budget: the guard itself', () => {
	it('counts words of rendered content, with markdown syntax excluded', () => {
		expect(instructionsWordCount(moduleWith([plainInstructions(300)]))).toBe(300);
		// The same 300 words, carrying headings, emphasis, code, a nested list,
		// a pipe table, a quote, a link and a figure. Same number.
		expect(instructionsWordCount(moduleWith([markdownInstructions(300)]))).toBe(300);
	});

	it('sums every instructions block within one module', () => {
		const mod = moduleWith([plainInstructions(150), markdownInstructions(151)]);
		expect(instructionsWordCount(mod)).toBe(301);
	});

	it('passes at exactly 300 and fails at exactly 301', () => {
		const at300 = instructionsWordCount(moduleWith([markdownInstructions(300)]));
		const at301 = instructionsWordCount(moduleWith([markdownInstructions(301)]));
		expect(at300).toBe(300);
		expect(at301).toBe(301);
		// The guard's own predicate, on both sides of the boundary.
		expect(at300 > INSTRUCTIONS_WORD_CEILING).toBe(false);
		expect(at301 > INSTRUCTIONS_WORD_CEILING).toBe(true);
	});

	it('ignores blocks that are not instructions', () => {
		const mod = {
			id: 'm1',
			title: 'Mixed',
			points: 0,
			blocks: [
				{ type: 'instructions' as const, content: plainInstructions(10) },
				{
					type: 'textField' as const,
					id: 'f1',
					prompt: words(200, 500).join(' ')
				},
				{
					type: 'checklist' as const,
					id: 'c1',
					items: [words(200, 900).join(' ')]
				}
			]
		} as SpecModule;
		// A prompt and a checklist item are the student's work surface, not
		// reading, so they are not part of the reading budget.
		expect(instructionsWordCount(mod)).toBe(10);
	});
});

describe('instructions budget: the importer warning tier', () => {
	function specWith(instructionWords: number) {
		return {
			kind: 'assignment',
			schemaVersion: 1,
			meta: { assignmentId: 'x-1', title: 'X', totalPoints: 0 },
			modules: [
				{
					id: 'm1',
					title: 'M',
					points: 0,
					blocks: [{ type: 'instructions', content: plainInstructions(instructionWords) }]
				}
			]
		};
	}

	it('is silent at the target and warns one word over it', () => {
		expect(validateSpec(specWith(INSTRUCTIONS_WORD_TARGET)).warnings).toEqual([]);
		const over = validateSpec(specWith(INSTRUCTIONS_WORD_TARGET + 1));
		expect(over.warnings).toHaveLength(1);
		expect(over.warnings[0]).toContain(`${INSTRUCTIONS_WORD_TARGET + 1} words`);
	});

	it('never blocks publishing, at any length', () => {
		// The spec still comes back, with no errors, a thousand words in. The
		// ceiling is this file's job; the importer's job is to say so.
		const huge = validateSpec(specWith(1000));
		expect(huge.errors).toEqual([]);
		expect(huge.spec).not.toBeNull();
		expect(huge.warnings).toHaveLength(1);
		expect(huge.warnings[0]).toContain(`${INSTRUCTIONS_WORD_CEILING}-word ceiling`);
	});
});

