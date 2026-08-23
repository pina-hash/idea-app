// tests/spec-instructions-budget.test.ts
//
// THE 300-WORD INSTRUCTIONS CEILING, over every assignment spec in the repo.
//
// IDEA_MATERIAL_SPEC v2.1 (docs/standards/IDEA_MATERIAL_SPEC_v2.md, modules[])
// splits the instructions budget in two: 250 words per module is the authoring
// TARGET and 300 is the enforced CEILING. The split exists because "roughly
// 250" is not a number a test can fail against, and a budget nothing can fail
// against is a preference. This file is the enforcement half. The other half
// -- a non-blocking warning between 251 and 300 -- is `validateSpec`'s, and is
// what a teacher sees in the importer before anything is published.
//
// WHY IT IS A TEST AND NOT A REVIEW HABIT. The cost of an over-budget module is
// invisible on the surface where it is authored (a JSON file) and paid on a
// surface nobody re-opens after publishing (the item page, where instructions
// and the input tables share one scroll column, so every paragraph of teaching
// pushes the working surface further down). That is the silent-regression shape
// automated tests exist for in this repo.
//
// THE COUNT COMES FROM THE RENDERER'S OWN PARSE. `instructionsWordCount` walks
// `parseMarkdown` output, which is exactly what MarkdownText walks, so the
// number this file fails on is the number of words on the page. A regex-based
// syntax stripper here would be a second, worse implementation of the parser
// and would charge an author for their own list markers.
//
// POSITIVE CONTROLS. A sweep that finds nothing passes, and clean is what
// nobody investigates, so this file asserts its own case counts: how many specs
// it read, how many modules it counted, and that it actually detected the
// known over-ceiling modules. It also proves the guard against CONSTRUCTED
// specs at exactly 300 and exactly 301 -- the catalog cannot demonstrate a
// boundary it does not happen to sit on.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	INSTRUCTIONS_WORD_CEILING,
	INSTRUCTIONS_WORD_TARGET,
	instructionsWordCount,
	validateSpec,
	type AssignmentSpec,
	type SpecModule
} from '$lib/classroom/assignment-spec';

const ROOT = process.cwd();
const MATERIALS = path.join(ROOT, 'materials');

/**
 * THE ONLY THINGS OVER THE CEILING TODAY, exempted BY EXACT PATH.
 *
 * All three are the same bytes -- byte-identical authoring test copies of one
 * spec, kept because they are what the importer and the item page were
 * exercised against. They are not course material and nothing renders them to
 * a class.
 *
 * THE HASH IS PART OF THE EXEMPTION, not a comment about it. A path-only
 * exemption is a licence to keep writing: someone edits one of these three
 * files, adds four hundred more words, and the ceiling silently stops applying
 * to it. Pinning the bytes means the exemption covers THESE bytes and nothing
 * else, and the moment one of them is genuinely edited this test says so and
 * the entry has to be re-earned or dropped.
 *
 * THE HASH IS OF THE CONTENT, NOT OF THE CHECKOUT -- `md5()` below
 * normalizes CRLF to LF before hashing, and the value here is what that
 * normalized read produces, which is also exactly `git show HEAD:<path>`'s
 * own bytes (git stores these files LF). This bit a real CI run: git's
 * `core.autocrlf` is a per-checkout SETTING, not a property of the file, so
 * a Windows checkout with autocrlf on translates these to CRLF on disk and a
 * RAW-byte hash of the working tree read a different value than the one
 * committed here, which had been computed the same CRLF way. Every Linux
 * checkout -- including CI -- reads LF and disagreed, so this test was
 * failing on every real CI run once CI got far enough to reach it, while
 * passing silently on the machine that produced the wrong constant.
 * Normalizing removes the checkout as a variable; regenerate this value with
 * `git show HEAD:<path> | md5sum`, never by hashing a possibly-translated
 * working-tree file directly.
 *
 * THE LIST MAY NOT GROW PAST THREE. Asserted below, so a fourth over-budget
 * spec is a standards conversation rather than a one-line addition here.
 */
const EXEMPT: Record<string, string> = {
	'materials/idea209h/a/assignment.json': 'fec592042fd3b70443fe913ca49d4baa',
	'materials/idea209h/lab-1-checkpoint-1/assignment.json': 'fec592042fd3b70443fe913ca49d4baa',
	'materials/idea209h/test/assignment.json': 'fec592042fd3b70443fe913ca49d4baa'
};

const MAX_EXEMPTIONS = 3;

interface ModuleCount {
	/** Repo-relative, forward slashes, so a message is the same on any OS. */
	file: string;
	moduleId: string;
	moduleTitle: string;
	words: number;
	exempt: boolean;
}

function walkJson(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walkJson(full));
		else if (entry.toLowerCase().endsWith('.json')) out.push(full);
	}
	return out;
}

function repoPath(full: string): string {
	return path.relative(ROOT, full).split(path.sep).join('/');
}

/**
 * CRLF-NORMALIZED, so the hash reflects the CONTENT rather than the
 * checkout. `core.autocrlf` is a per-machine git setting, not a property of
 * the file: a Windows checkout with it on reads these files back as CRLF
 * while git stores (and every Linux checkout, CI included, reads) LF. A raw
 * byte hash disagrees with itself across that boundary for a file nobody
 * touched, which is exactly the false failure `readFileSync` this way
 * produced before it was normalized here.
 */
function md5(full: string): string {
	const normalized = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
	return createHash('md5').update(normalized, 'utf8').digest('hex');
}

/**
 * Every ASSIGNMENT spec under materials/, found by SHAPE rather than by
 * filename: `material.json`, `rubric.json` and the reference documents all live
 * in the same folders, and a spec that someone names something else must not
 * escape the sweep by doing so.
 */
function assignmentSpecs(): { file: string; spec: AssignmentSpec }[] {
	if (!existsSync(MATERIALS)) return [];
	const found: { file: string; spec: AssignmentSpec }[] = [];
	for (const full of walkJson(MATERIALS)) {
		let json: unknown;
		try {
			json = JSON.parse(readFileSync(full, 'utf-8'));
		} catch {
			continue;
		}
		if (typeof json !== 'object' || json === null) continue;
		const candidate = json as Record<string, unknown>;
		if (candidate.kind === 'reference') continue;
		if (!Array.isArray(candidate.modules)) continue;
		found.push({ file: repoPath(full), spec: candidate as unknown as AssignmentSpec });
	}
	return found;
}

function countAll(): ModuleCount[] {
	const counts: ModuleCount[] = [];
	for (const { file, spec } of assignmentSpecs()) {
		for (const mod of spec.modules ?? []) {
			counts.push({
				file,
				moduleId: String(mod.id ?? '(no id)'),
				moduleTitle: String(mod.title ?? ''),
				words: instructionsWordCount(mod),
				exempt: file in EXEMPT
			});
		}
	}
	return counts;
}

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

describe('instructions budget: the catalog under materials/', () => {
	const counts = countAll();

	it('read a real catalog (positive control for the sweep)', () => {
		const files = new Set(counts.map((c) => c.file));
		// If either of these ever reads zero, every absence assertion below is
		// passing vacuously and the ceiling is being enforced over nothing.
		expect(files.size).toBeGreaterThanOrEqual(5);
		expect(counts.length).toBeGreaterThanOrEqual(10);
	});

	it('reports the distribution', () => {
		const sorted = [...counts].sort((a, b) => b.words - a.words);
		const buckets = [0, 51, 101, 151, 201, 251, 301];
		const label = (i: number) =>
			i === buckets.length - 1 ? `${buckets[i]}+` : `${buckets[i]}-${buckets[i + 1] - 1}`;
		const lines = buckets.map((low, i) => {
			const high = i === buckets.length - 1 ? Infinity : buckets[i + 1] - 1;
			const n = counts.filter((c) => c.words >= low && c.words <= high).length;
			return `  ${label(i).padStart(8)} words: ${'#'.repeat(n)} ${n}`;
		});
		const live = sorted.filter((c) => !c.exempt);
		console.log(
			[
				`instructions budget: ${counts.length} modules across ${new Set(counts.map((c) => c.file)).size} specs`,
				`  max overall:      ${sorted[0]?.words ?? 0} (${sorted[0]?.file} ${sorted[0]?.moduleId})`,
				`  max non-exempt:   ${live[0]?.words ?? 0} (${live[0]?.file} ${live[0]?.moduleId})`,
				`  target ${INSTRUCTIONS_WORD_TARGET} / ceiling ${INSTRUCTIONS_WORD_CEILING}`,
				...lines,
				'  over target (251-300), non-exempt:',
				...live
					.filter((c) => c.words > INSTRUCTIONS_WORD_TARGET)
					.map((c) => `    ${c.words}  ${c.file}  ${c.moduleId}`),
				'  over ceiling (301+), all:',
				...sorted
					.filter((c) => c.words > INSTRUCTIONS_WORD_CEILING)
					.map((c) => `    ${c.words}  ${c.file}  ${c.moduleId}${c.exempt ? '  [exempt]' : ''}`)
			].join('\n')
		);
		expect(sorted.length).toBeGreaterThan(0);
	});

	it('holds every non-exempt module at or under the ceiling', () => {
		const over = counts
			.filter((c) => !c.exempt && c.words > INSTRUCTIONS_WORD_CEILING)
			.map((c) => `${c.file} module "${c.moduleId}" (${c.moduleTitle}): ${c.words} words`);
		expect(over).toEqual([]);
	});

	it('detected the known over-ceiling modules (positive control for the check)', () => {
		// Without this, "no non-exempt module is over" could equally mean the
		// counter returns zero for everything.
		const over = counts.filter((c) => c.words > INSTRUCTIONS_WORD_CEILING);
		expect(over.length).toBeGreaterThan(0);
		expect(over.every((c) => c.exempt)).toBe(true);
	});
});

describe('instructions budget: the exemption list', () => {
	it('holds no more than three entries', () => {
		expect(Object.keys(EXEMPT).length).toBeLessThanOrEqual(MAX_EXEMPTIONS);
	});

	it('exempts exactly the bytes it was written for', () => {
		for (const [rel, hash] of Object.entries(EXEMPT)) {
			const full = path.join(ROOT, rel);
			expect(existsSync(full), `exempt spec is missing: ${rel}`).toBe(true);
			expect(md5(full), `exempt spec changed: ${rel}. The exemption covers the bytes it was written for. Bring the module under ${INSTRUCTIONS_WORD_CEILING} words and drop the entry, or re-earn it deliberately.`).toBe(hash);
		}
	});

	it('carries no entry that no longer exempts anything', () => {
		const counts = countAll();
		for (const rel of Object.keys(EXEMPT)) {
			const mine = counts.filter((c) => c.file === rel);
			expect(mine.length, `exempt path matched no spec: ${rel}`).toBeGreaterThan(0);
			expect(
				mine.some((c) => c.words > INSTRUCTIONS_WORD_CEILING),
				`${rel} is now under the ceiling -- remove its exemption`
			).toBe(true);
		}
	});
});
