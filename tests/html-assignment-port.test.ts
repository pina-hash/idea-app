import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	HTML_ID_RE,
	manifestBlocks,
	validateHtmlManifest,
	type HtmlAssignmentManifest
} from '../src/lib/classroom/html-assignment/manifest.ts';

/**
 * THE PORTED FIXTURE'S SILENT GUARANTEES.
 *
 * Everything asserted here fails INVISIBLY if it regresses, which is the only
 * reason this file exists (`CLAUDE.md`: add a test for a guarantee whose
 * regression would be silent, and verify everything else in a harness). A
 * renamed block id orphans student work with no error anywhere; a reintroduced
 * `localStorage` call takes the page down only inside the opaque origin, which
 * no local check reaches; `allow-same-origin` beside `allow-scripts` cancels
 * the sandbox outright and looks identical on screen.
 *
 * The BEHAVIOUR of the port -- what crosses the bridge, whether the read-only
 * render has anything to write with, whether the fonts survive the CSP -- is
 * verified in a real browser through `/dev/html-assignment/fixtures`, because
 * none of it is answerable without layout and a real opaque origin.
 */

const ROOT = resolve(__dirname, '..');
const FIXTURE = resolve(ROOT, 'src/routes/dev/html-assignment/fixtures/idea100-blade-01.ported.html');
const HARNESS = resolve(ROOT, 'src/routes/dev/html-assignment/fixtures/+page.svelte');
const ORIGINAL = resolve(ROOT, 'src/lib/legacy/assignments/idea100-blade-01.html');

const fixture = readFileSync(FIXTURE, 'utf8');
const harness = readFileSync(HARNESS, 'utf8');

/*
	THE SHAPE COMES FROM `manifest.ts`, NOT FROM A SECOND COPY OF IT HERE.

	This file used to declare its own `Level`, `Criterion`, `Block`, `Module` and
	`Manifest`, which is the duplication rule in its quietest form: the copy was
	written before `header` existed, so it did not have the field, and a test
	reading `manifest.header` off it was a type error in a file that had not
	changed. A local shape also cannot go stale loudly -- it simply describes a
	manifest that no longer exists while every assertion over it keeps passing.

	`HtmlAssignmentManifest` is what the validator returns and what every real
	caller holds, so asking for it here is what keeps this file describing the
	same object the importer does.
*/
type Manifest = HtmlAssignmentManifest;

function manifestOf(html: string): Manifest {
	const m = html.match(
		/<script type="application\/json" id="idea-manifest">([\s\S]*?)<\/script>/
	);
	expect(m, 'the fixture carries an idea-manifest block').toBeTruthy();
	return JSON.parse(m![1]) as Manifest;
}

const manifest = manifestOf(fixture);
/*
	`manifestBlocks` RATHER THAN A SECOND FLATTEN, AND THE DIFFERENCE IS
	`header`. This read used to be `manifest.modules.flatMap((m) => m.blocks)`,
	which was every block there was while identity fields lived in a 0-point
	module. They live in `header` now, where the contract puts them so a grading
	console does not render a student's name as something to score -- and the
	hand-written flatten silently stopped seeing ten of them. It did not fail as
	"ten blocks are missing"; it failed as "ten fields in the document have no
	block", which reads as a defect in the DOCUMENT.

	The shipped helper is what every real caller uses to answer "what blocks does
	this manifest have", so asking it here is what keeps the test and the
	importer answering the same question. A second flatten is the thing that
	stops matching.
*/
const blocks = manifestBlocks(manifest);
const criteria = manifest.modules.flatMap((m) => m.criteria);

/**
 * Every `data-field` the document declares STATICALLY. The document also builds
 * `mfg-${n}-*` from a template literal at runtime (`addMfgRow`), which is the
 * one field family the manifest cannot name and is a stated contract finding,
 * not a defect in this sweep, so the template forms are excluded by shape.
 */
function staticFields(html: string): string[] {
	return [...html.matchAll(/data-field="([^"]+)"/g)]
		.map((x) => x[1])
		.filter((f) => !f.includes('${'));
}

describe('the ported fixture is a port, not a rewrite', () => {
	it('leaves the live IDEA100 assignment byte-identical to what students are working in', () => {
		// The original is read only to prove this file never edits it. If a bundle
		// ever needs to change it, that is its own authorisation and its own line
		// in CLAUDE.md's freeze section.
		const original = readFileSync(ORIGINAL, 'utf8');
		expect(original).toContain('function saveToStorage()');
		expect(original).toContain('function downloadHTML()');
		expect(original).not.toContain('idea:change');
	});

	it('keeps every widget, counter and demo the port was told to leave alone', () => {
		for (const kept of [
			'function countSentences(',
			'function updateCounter(',
			'function autoResize(',
			'window.spinDemo',
			'function toggleRubric(',
			'function addMfgRow(',
			'function openLightbox(',
			'@media print',
			'class="print-mirror"'
		]) {
			expect(fixture, `the port kept ${kept}`).toContain(kept);
		}
	});
});

describe('nothing that touches an opaque origin survives the port', () => {
	// A POSITIVE CONTROL FIRST: the sweep below is a set of absence assertions,
	// and an absence assertion over a file that failed to load reads exactly like
	// a pass. This is the case it is known to find.
	it('the sweep can find a token that is really there', () => {
		expect(fixture).toContain('idea:change');
	});

	it.each([
		['localStorage', /localStorage/],
		['saveToStorage', /saveToStorage/],
		['loadFromStorage', /loadFromStorage/],
		['downloadHTML', /downloadHTML/],
		['__IB_DATA__', /__IB_DATA__/],
		['STORAGE_KEY', /STORAGE_KEY/],
		['setInterval', /setInterval/]
	])('%s appears in no executable line', (_name, re) => {
		// Comments explaining WHY a thing is gone are the point of the port and are
		// not a reintroduction, so the sweep reads the file with its block comments
		// stripped -- the same reason `tools/claude-md-check.mjs` strips a
		// migration's comments before reading it.
		const code = fixture.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');
		expect(code).not.toMatch(re);
	});

	it('offers no Download with Data control and no Save Progress control', () => {
		expect(fixture).not.toMatch(/<button[^>]*>\s*\[ Download with Data \]/);
		expect(fixture).not.toMatch(/<button[^>]*>\s*\[ Save Progress \]/);
		// The control that replaced them is the parent's, so the document must not
		// grow one of its own: Submit is parent chrome.
		expect(fixture).not.toMatch(/<button[^>]*onclick="[^"]*submit/i);
	});
});

describe('the frame is sandboxed and must stay that way', () => {
	it('grants exactly allow-scripts, and allow-same-origin in no configuration', () => {
		// The ATTRIBUTE's own token set, not the absence of a string in the file:
		// the paragraph above this assertion says `allow-same-origin` out loud, and
		// a sweep that could not tell a warning from a grant would be reporting on
		// its own comments.
		const attrs = [...harness.matchAll(/<iframe[^>]*\ssandbox="([^"]*)"/g)].map((m) => m[1]);
		// Scoped to the <iframe> element, because the prose above it also spells the
		// attribute out and a file-wide match would be counting the explanation.
		expect(attrs.length, 'the harness frames the fixture exactly once').toBe(1);
		const tokens = attrs[0].split(/\s+/).filter(Boolean);
		expect(tokens).toEqual(['allow-scripts']);
		// Together the pair lets the frame remove its own sandbox attribute. There
		// is no configuration of this fixture in which it is correct.
		expect(tokens).not.toContain('allow-same-origin');
		expect(tokens).not.toContain('allow-top-navigation');
		expect(tokens).not.toContain('allow-popups-to-escape-sandbox');
	});

	it('the document addresses its parent as a parent and never names a block id', () => {
		expect(fixture).toContain("window.parent.postMessage");
		// A frame naming a block_id directly is writing to an arbitrary row. The
		// parent maps `field` through the manifest it stored at import.
		const code = fixture.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(code).not.toMatch(/block_id|blockId/);
	});
});

/*
	THE ASSERTION WHOSE ABSENCE LET A FIXTURE SHIP THAT THE IMPORTER REFUSES.

	Twenty-six checks in this file described the fixture accurately and every one
	of them passed while `validateHtmlManifest` -- the function the import path
	actually calls -- reported SIXTY-SIX errors on the same bytes. The checks were
	hand-written expectations about what a good port looks like; none of them was
	the shipped gate, and the two had drifted apart on the one rule nobody had
	written down (the id charset) and on level arithmetic.

	CLAUDE.md's rule is that a test's expected value must not come from the thing
	it is testing. The mirror of it is this: where a real gate exists, the fixture
	goes THROUGH it, or the file is a description of the fixture rather than a
	check on it.
*/
describe('the fixture is one the shipped importer accepts', () => {
	it('passes the real validator with no errors at all', () => {
		const v = validateHtmlManifest(fixture);
		expect(v.errors, v.errors.join('\n')).toEqual([]);
		expect(v.manifest, 'a manifest with no errors parses').not.toBeNull();
	});

	/*
		The positive control: the validator this test leans on can still find a
		fault. Without it, a validator that returned `{ errors: [] }` for
		everything would make the assertion above pass over any bytes at all.
	*/
	it('and that validator still refuses a manifest it should', () => {
		const broken = fixture.replace(/"schemaVersion": 3/, '"schemaVersion": 2');
		expect(broken).not.toBe(fixture);
		expect(validateHtmlManifest(broken).errors.length).toBeGreaterThan(0);
	});

	/*
		THE ID CHARSET, PINNED AGAINST THE RULE THE DATABASE ENFORCES. Migration
		0195 is applied to production and refuses any id outside
		`^[A-Za-z0-9_-]{1,40}$` -- the same rule 0086 set for
		`classroom_responses.block_id`. This port carried dotted ids
		(`identity.mood`), which no surface in this repository would have accepted.
		A block id is PERMANENT because it is the join key for stored answers, so
		the moment one document is imported this is no longer a fixture question.
	*/
	it('gives every id the charset the applied migration enforces', () => {
		const ids = [
			...manifestBlocks(manifest).map((b) => b.id),
			...manifest.modules.map((m) => m.id),
			...criteria.map((c) => c.id)
		];
		expect(ids.length).toBeGreaterThan(50);
		for (const id of ids) expect(HTML_ID_RE.test(id), `id ${JSON.stringify(id)}`).toBe(true);
		// The control: the rule that admits every id above genuinely refuses a dot.
		expect(HTML_ID_RE.test('identity.mood')).toBe(false);
	});

	/*
		IDENTITY FIELDS LIVE IN `header`, NOT IN A 0-POINT MODULE. A 0-point module
		renders in the grading console as something to score, which is what the
		contract added `header` to end. Asserted in both directions so a later port
		cannot quietly put them back.
	*/
	it('carries its identity fields in header and grades no 0-point module', () => {
		expect((manifest.header ?? []).length).toBeGreaterThan(0);
		for (const m of manifest.modules) {
			expect(m.points, `module ${m.id} carries points`).toBeGreaterThan(0);
			expect(m.criteria.length, `module ${m.id} has criteria`).toBeGreaterThan(0);
		}
	});
});

describe('the manifest agrees with the document it is embedded in', () => {
	it('is schemaVersion 3 and declares the assignment total', () => {
		expect(manifest.schemaVersion).toBe(3);
		expect(manifest.kind).toBe('html-assignment');
		expect(manifest.points).toBe(50);
		expect(manifest.modules.reduce((s, m) => s + m.points, 0)).toBe(manifest.points);
	});

	it('names every static data-field in the document, and invents none', () => {
		const declared = new Set(blocks.map((b) => b.field));
		const inDocument = new Set(staticFields(fixture));
		expect([...inDocument].filter((f) => !declared.has(f)), 'fields with no block').toEqual([]);
		expect([...declared].filter((f) => !inDocument.has(f)), 'blocks with no field').toEqual([]);
		expect(inDocument.size).toBeGreaterThan(40);
	});

	it('gives every block a unique, permanent id that a classroom_responses row can hold', () => {
		const ids = blocks.map((b) => b.id);
		expect(new Set(ids).size, 'block ids are unique across the manifest').toBe(ids.length);
		for (const id of ids) {
			// 0086: block_id text check (char_length between 1 and 64).
			expect(id.length, `${id} fits classroom_responses.block_id`).toBeGreaterThanOrEqual(1);
			expect(id.length, `${id} fits classroom_responses.block_id`).toBeLessThanOrEqual(64);
		}
	});

	it('uses only the block types the contract declares', () => {
		const allowed = new Set(['text', 'longText', 'checkbox', 'radio', 'image', 'table']);
		for (const b of blocks) expect(allowed.has(b.type), `${b.id} is ${b.type}`).toBe(true);
	});

	it('carries the sentence minimum the document itself enforces, for every counted field', () => {
		// The document's counters are the authority; a manifest claiming a
		// different minimum would put one number on screen and another in the
		// grading console with nothing to say which is right.
		const inDocument = new Map(
			[...fixture.matchAll(/data-min="(\d+)" data-field-ref="([^"]+)"/g)].map((m) => [m[2], Number(m[1])])
		);
		expect(inDocument.size).toBeGreaterThan(6);
		for (const [field, min] of inDocument) {
			const block = blocks.find((b) => b.field === field);
			expect(block, `${field} has a block`).toBeTruthy();
			expect(block!.minSentences, `${field} minimum`).toBe(min);
		}
	});
});

describe('every criterion is leveled to IDEA_RUBRIC_STANDARDS', () => {
	it('has criteria to check', () => {
		expect(criteria.length).toBeGreaterThan(15);
		expect(criteria.flatMap((c) => c.levels).length).toBeGreaterThan(50);
	});

	it('sums each graded module to the module total', () => {
		for (const m of manifest.modules) {
			if (!m.criteria.length) continue;
			expect(m.criteria.reduce((s, c) => s + c.points, 0), `module ${m.id}`).toBe(m.points);
		}
	});

	it.each(['three or four levels, never two', 'strictly decreasing', 'top equals the maximum', 'bottom is zero'])(
		'%s',
		(rule) => {
			for (const c of criteria) {
				if (rule === 'three or four levels, never two') {
					expect(c.levels.length, c.id).toBeGreaterThanOrEqual(3);
					expect(c.levels.length, c.id).toBeLessThanOrEqual(4);
				} else if (rule === 'strictly decreasing') {
					for (let i = 1; i < c.levels.length; i++) {
						expect(c.levels[i].points, `${c.id} level ${i + 1}`).toBeLessThan(c.levels[i - 1].points);
					}
				} else if (rule === 'top equals the maximum') {
					expect(c.levels[0].points, c.id).toBe(c.points);
				} else {
					expect(c.levels[c.levels.length - 1].points, c.id).toBe(0);
				}
			}
		}
	);

	it('gives every level a label, a descriptor and a short of six words or fewer', () => {
		for (const c of criteria) {
			for (const l of c.levels) {
				expect(l.label.trim(), c.id).not.toBe('');
				expect(l.descriptor.trim(), c.id).not.toBe('');
				expect(l.short.trim(), c.id).not.toBe('');
				expect(l.short.trim().split(/\s+/).length, `${c.id}: "${l.short}"`).toBeLessThanOrEqual(6);
				expect(/[.!?]$/.test(l.short.trim()), `${c.id}: "${l.short}" has terminal punctuation`).toBe(false);
			}
		}
	});

	it('writes no em dash into student-facing copy', () => {
		for (const c of criteria) {
			expect(c.text).not.toContain('—');
			for (const l of c.levels) {
				expect(l.short).not.toContain('—');
				expect(l.descriptor).not.toContain('—');
			}
		}
	});
});
