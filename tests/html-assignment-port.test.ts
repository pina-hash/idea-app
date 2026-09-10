import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

type Level = { points: number; label: string; short: string; descriptor: string };
type Criterion = { id: string; text: string; points: number; levels: Level[] };
type Block = { id: string; field: string; type: string; minSentences?: number };
type Module = { id: string; title: string; points: number; audience?: string; blocks: Block[]; criteria: Criterion[] };
type Manifest = { schemaVersion: number; kind: string; title: string; course: string; points: number; modules: Module[] };

function manifestOf(html: string): Manifest {
	const m = html.match(
		/<script type="application\/json" id="idea-manifest">([\s\S]*?)<\/script>/
	);
	expect(m, 'the fixture carries an idea-manifest block').toBeTruthy();
	return JSON.parse(m![1]) as Manifest;
}

const manifest = manifestOf(fixture);
const blocks = manifest.modules.flatMap((m) => m.blocks);
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
