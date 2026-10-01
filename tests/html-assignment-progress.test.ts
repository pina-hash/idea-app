// tests/html-assignment-progress.test.ts
//
// THE PROGRESS RAIL'S NUMBER, ASSERTED WHERE IT FAILS SILENTLY.
//
// A bar that weights by count instead of by points renders perfectly and reads
// as a bar. A bar that counts a one-sentence answer as met over a two-sentence
// floor reads 100% over a worksheet Submit refuses. A bar that shows "0%" to a
// student who has just answered their first block of forty is the one number
// it exists to move off. None of it type-checks wrong, none of it errors, and
// every one of them looks like a progress bar in a screenshot.
//
// WHERE THE EXPECTED VALUES COME FROM. The percentages are worked by hand from
// the fixture's point values (5, 1 and 4 over six blocks) and never recomputed
// through `hxProgress`. The sentence counts are counted by hand. The
// count-weighted alternative is stated beside every weighted case so the
// assertion cannot pass on a bar that fell back to counting.
//
// THE RENDER HALF uses `svelte/server`, which is enough to assert what is in
// the markup at a given value: the number, the stage word, the module segments
// with their weights, and the sentence that keeps this from reading as a
// grade. Geometry, colour and motion are the browser harness's
// (`tools/browser-verify/routes/html-progress.mjs`), not this file's.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import Progress from '$lib/classroom/html-assignment/Progress.svelte';
import {
	HX_PROGRESS_BAR_LABEL,
	HX_PROGRESS_COMPLETE_NOTE,
	HX_PROGRESS_NOT_A_GRADE,
	HX_PROGRESS_NOT_SAVED_LINE,
	HX_PROGRESS_SAVING_LINE,
	HX_PROGRESS_STAGES,
	hxBlockHasResponse,
	hxCompletion,
	hxProgress,
	hxProgressModuleLine,
	hxProgressNextLine,
	hxProgressPaint,
	hxProgressSaveLine,
	hxProgressStage,
	hxProgressSummary,
	hxTableHasContent
} from '$lib/classroom/html-assignment/progress';
import { hxIncompleteBlocks } from '$lib/classroom/html-assignment/answers';
import { HX_MIRROR_UNAVAILABLE } from '$lib/classroom/html-assignment/draft-mirror';
import {
	BRITISH_SPELLING_RE,
	WEEKDAYS,
	type HtmlAssignmentManifest
} from '$lib/classroom/html-assignment/manifest';
import type { HxImageState } from '$lib/classroom/html-assignment/bridge';

// ---------------------------------------------------------------------------
// The fixture: 5 + 1 + 4 points over 2 + 1 + 3 blocks, a header the bar must
// not count, one block of every type.
// ---------------------------------------------------------------------------

function bench(): HtmlAssignmentManifest {
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Bench setup and first cut',
		course: 'IDEA100',
		points: 10,
		header: [{ id: 'hb-name', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'setup',
				title: 'Bench setup',
				points: 5,
				blocks: [
					{ id: 's-staged', field: 'staged', type: 'text' },
					{ id: 's-notes', field: 'setupNotes', type: 'longText', minSentences: 2 }
				],
				criteria: []
			},
			{
				id: 'cut',
				title: 'First cut',
				points: 1,
				blocks: [{ id: 'c-photo', field: 'cutPhoto', type: 'image' }],
				criteria: []
			},
			{
				id: 'reflect',
				title: 'Reflection',
				points: 4,
				blocks: [
					{ id: 'r-why', field: 'why', type: 'longText', minSentences: 3 },
					{ id: 'r-table', field: 'measurements', type: 'table' },
					{ id: 'r-safe', field: 'safetyChecked', type: 'checkbox' }
				],
				criteria: []
			}
		]
	};
}

const PHOTO: HxImageState = { url: '/api/classroom/file/f1', name: 'cut.jpg', caption: '' };

const ALL = {
	studentName: 'Ana Reyes',
	staged: 'Vise, square, and the blank.',
	setupNotes: 'Bolted the vise down first. Squared the blank to the fence.',
	why: 'The cut drifted. The blank was not square. I re-squared it and cut again.',
	measurements: JSON.stringify([
		['pass', 'mm'],
		['1', '0.4']
	]),
	safetyChecked: true
} as const;

function pick(...fields: (keyof typeof ALL)[]): Record<string, string | boolean> {
	const out: Record<string, string | boolean> = {};
	for (const f of fields) out[f] = ALL[f];
	return out;
}

// ---------------------------------------------------------------------------
// The weighting. Every case states the count-weighted number it must not be.
// ---------------------------------------------------------------------------

describe('weighted by points, not by count', () => {
	it('the one-point module alone is 10%, where a count would say 17%', () => {
		const p = hxProgress(bench(), {}, { cutPhoto: PHOTO });
		expect(p.basis).toBe('points');
		expect(p.earned).toBe(1);
		expect(p.total).toBe(10);
		expect(p.percent).toBe(10);
		expect(p.metBlocks).toBe(1);
		expect(p.totalBlocks).toBe(6);
		// The count-weighted answer, worked by hand: 1 of 6 is 16.7, rounds 17.
		expect(p.percent).not.toBe(17);
	});

	it('the five-point module alone is 50%, where a count would say 33%', () => {
		const p = hxProgress(bench(), pick('staged', 'setupNotes'));
		expect(p.earned).toBe(5);
		expect(p.percent).toBe(50);
		expect(p.stage).toBe('halfway');
		expect(p.percent).not.toBe(33);
	});

	it("a module's points are spread evenly over its blocks", () => {
		const p = hxProgress(bench(), pick('staged'));
		// One of the two blocks in a 5-point module: 2.5 of 10.
		expect(p.earned).toBe(2.5);
		expect(p.percent).toBe(25);
		const setup = p.modules.find((m) => m.id === 'setup');
		expect(setup?.weight).toBe(5);
		expect(setup?.earned).toBe(2.5);
		expect(setup?.fraction).toBe(0.5);
		expect(setup?.done).toBe(false);
		const reflect = p.modules.find((m) => m.id === 'reflect');
		expect(reflect?.weight).toBe(4);
		for (const b of p.blocks.filter((b) => b.moduleId === 'reflect')) {
			expect(b.weight).toBeCloseTo(4 / 3, 10);
		}
	});

	it('the header is judged but never counted, under either basis', () => {
		const p = hxProgress(bench(), pick('studentName'));
		const name = p.blocks.find((b) => b.blockId === 'hb-name');
		expect(name).toBeDefined();
		expect(name?.weight).toBe(0);
		expect(name?.met).toBe(true);
		expect(p.percent).toBe(0);
		expect(p.started).toBe(false);
		expect(p.totalBlocks).toBe(6);

		// With every module at zero points the basis falls to count, and the
		// header STILL carries no weight.
		const m = bench();
		for (const mod of m.modules) mod.points = 0;
		const c = hxProgress(m, pick('studentName', 'staged'));
		expect(c.basis).toBe('count');
		expect(c.total).toBe(6);
		expect(c.earned).toBe(1);
		expect(c.percent).toBe(17);
		expect(c.blocks.find((b) => b.blockId === 'hb-name')?.weight).toBe(0);
	});

	it('a module with points but no blocks contributes nothing to the denominator', () => {
		const m = bench();
		m.modules.push({ id: 'obs', title: 'Observed', points: 90, blocks: [], criteria: [] });
		const p = hxProgress(m, pick('staged', 'setupNotes'));
		expect(p.total).toBe(10);
		expect(p.percent).toBe(50);
		const obs = p.modules.find((mod) => mod.id === 'obs');
		expect(obs?.weight).toBe(0);
		expect(obs?.done).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// The four states the brief names.
// ---------------------------------------------------------------------------

describe('the named states', () => {
	it('0%: nothing met, Not started, next is the first module in manifest order', () => {
		const p = hxProgress(bench(), {});
		expect(p.percent).toBe(0);
		expect(p.stage).toBe('blank');
		expect(p.started).toBe(false);
		expect(p.complete).toBe(false);
		expect(p.next?.blockId).toBe('s-staged');
		expect(hxProgressNextLine(p)).toBe('Next up: "Bench setup", answer 1 of 2, is empty.');
	});

	it('100%: everything met, All filled in, nothing next', () => {
		const p = hxProgress(bench(), { ...ALL }, { cutPhoto: PHOTO });
		expect(p.percent).toBe(100);
		expect(p.stage).toBe('complete');
		expect(p.complete).toBe(true);
		expect(p.next).toBeNull();
		expect(hxProgressNextLine(p)).toBeNull();
		expect(p.modules.every((m) => m.done)).toBe(true);
	});

	it('a one-module document: one counted module, half of it met is 50%', () => {
		const m: HtmlAssignmentManifest = {
			schemaVersion: 3,
			kind: 'html-assignment',
			title: 'One',
			course: 'IDEA100',
			points: 4,
			modules: [
				{
					id: 'only',
					title: 'Reflection',
					points: 4,
					blocks: [
						{ id: 'o-why', field: 'why', type: 'longText', minSentences: 1 },
						{ id: 'o-safe', field: 'safetyChecked', type: 'checkbox' }
					],
					criteria: []
				}
			]
		};
		const half = hxProgress(m, { safetyChecked: false });
		expect(half.modules).toHaveLength(1);
		expect(half.percent).toBe(50);
		expect(half.complete).toBe(false);
		const full = hxProgress(m, { safetyChecked: true, why: 'It drifted.' });
		expect(full.percent).toBe(100);
		expect(full.complete).toBe(true);
	});

	it('the only unmet block is an image: 90%, and the next line asks for a photo', () => {
		const p = hxProgress(bench(), { ...ALL }, {});
		expect(p.percent).toBe(90);
		expect(p.stage).toBe('nearly');
		expect(p.complete).toBe(false);
		expect(p.next?.blockId).toBe('c-photo');
		expect(p.next?.reason).toBe('empty');
		expect(hxProgressNextLine(p)).toBe('Next up: "First cut" is waiting for a photo.');
		// A picture with no url is not a picture.
		const blank = hxProgress(bench(), { ...ALL }, { cutPhoto: { url: '', name: 'x', caption: '' } });
		expect(blank.percent).toBe(90);
	});
});

// ---------------------------------------------------------------------------
// The met rule, per type, and the half of it that is the Submit gate's.
// ---------------------------------------------------------------------------

describe('when a block is met', () => {
	const values = { ...ALL } as Record<string, string | boolean>;
	const images = { cutPhoto: PHOTO };
	const blockOf = (id: string) => {
		for (const b of [...(bench().header ?? []), ...bench().modules.flatMap((m) => m.blocks)]) {
			if (b.id === id) return b;
		}
		throw new Error(id);
	};

	it('a sentence floor is judged by hxIncompleteBlocks and nothing else', () => {
		// Two sentences asked for, one given: the Submit gate says short, so the
		// bar says unmet. The block HAS a stored response, which is the case a
		// bar written against "has a value" alone gets wrong.
		const v = pick('staged');
		v.setupNotes = 'Bolted the vise down first.';
		const gate = hxIncompleteBlocks(bench(), v);
		expect(gate.map((g) => g.blockId)).toContain('s-notes');
		const p = hxProgress(bench(), v);
		const notes = p.blocks.find((b) => b.blockId === 's-notes');
		expect(notes?.met).toBe(false);
		expect(notes?.reason).toBe('short');
		expect(notes?.need).toBe(2);
		expect(notes?.have).toBe(1);
		expect(p.percent).toBe(25);
		expect(hxProgressNextLine(p)).toBe('Next up: "Bench setup", answer 2 of 2, needs 1 more sentence.');

		// Three asked, one given: the plural.
		const w = { ...values, why: 'It drifted.' };
		const q = hxProgress(bench(), w, images);
		expect(hxProgressNextLine(q)).toBe('Next up: "Reflection", answer 1 of 3, needs 2 more sentences.');
	});

	it('an empty string, whitespace, or a missing key is not a response', () => {
		expect(hxBlockHasResponse(blockOf('s-staged'), { staged: '' }, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('s-staged'), { staged: '   \n' }, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('s-staged'), {}, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('s-staged'), { staged: 'x' }, {})).toBe(true);
	});

	it('a checkbox counts once it holds any boolean, unticked included', () => {
		expect(hxBlockHasResponse(blockOf('r-safe'), { safetyChecked: false }, {})).toBe(true);
		expect(hxBlockHasResponse(blockOf('r-safe'), { safetyChecked: true }, {})).toBe(true);
		expect(hxBlockHasResponse(blockOf('r-safe'), {}, {})).toBe(false);
	});

	it("the value's own shape is believed over the block's type, and only ever widens (ledger 0360)", () => {
		// A checkbox that posted its `value` attribute: stored, so it counts.
		// This line asserted the OPPOSITE until report 8f78d5bd: a string in a
		// checkbox slot was "not a boolean" and the worksheet could never fill.
		expect(hxBlockHasResponse(blockOf('r-safe'), { safetyChecked: 'on' }, {})).toBe(true);
		// A boolean on a text, long-text or table block: stored, so it counts.
		expect(hxBlockHasResponse(blockOf('s-staged'), { staged: true }, {})).toBe(true);
		expect(hxBlockHasResponse(blockOf('s-staged'), { staged: false }, {})).toBe(true);
		expect(hxBlockHasResponse(blockOf('r-table'), { measurements: false }, {})).toBe(true);
		// THE NEGATIVE CONTROLS: an empty or blank string still counts for
		// nothing on a checkbox, and an image still needs a picture.
		expect(hxBlockHasResponse(blockOf('r-safe'), { safetyChecked: '' }, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('r-safe'), { safetyChecked: '  ' }, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('c-photo'), { cutPhoto: true }, {})).toBe(false);
		// And the whole worksheet fills with the checkbox holding a string.
		const p = hxProgress(bench(), { ...ALL, safetyChecked: 'on' }, { cutPhoto: PHOTO });
		expect(p.complete).toBe(true);
		expect(p.percent).toBe(100);
	});

	it('a table counts only when a cell holds something', () => {
		expect(hxTableHasContent('[]')).toBe(false);
		expect(hxTableHasContent('[["",""],["",""]]')).toBe(false);
		expect(hxTableHasContent('[["", " "]]')).toBe(false);
		expect(hxTableHasContent('[["",""],["0.4",""]]')).toBe(true);
		expect(hxTableHasContent('[{"mm": 0.4}]')).toBe(true);
		expect(hxTableHasContent('[{"mm": ""}]')).toBe(false);
		// Not JSON at all: judged as text.
		expect(hxTableHasContent('not json')).toBe(true);
		expect(hxTableHasContent('   ')).toBe(false);
		expect(hxBlockHasResponse(blockOf('r-table'), { measurements: '[["",""]]' }, {})).toBe(false);
	});

	it('an image counts only through images, never through values', () => {
		expect(hxBlockHasResponse(blockOf('c-photo'), { cutPhoto: 'cut.jpg' }, {})).toBe(false);
		expect(hxBlockHasResponse(blockOf('c-photo'), {}, images)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// The number's edges, the stages and the paint.
// ---------------------------------------------------------------------------

describe('the number', () => {
	it('is clamped to 1 and 99 while partial, and only 0 and 100 at the ends', () => {
		// Forty one-point modules, one block each: one met is 2.5%, rounds to 3.
		// Make it smaller: one block met out of 400 points is 0.25%, which
		// rounds to 0 and must read 1.
		const m: HtmlAssignmentManifest = {
			schemaVersion: 3,
			kind: 'html-assignment',
			title: 'Many',
			course: 'IDEA100',
			points: 400,
			modules: [
				{
					id: 'big',
					title: 'Big',
					points: 399,
					blocks: [{ id: 'b', field: 'b', type: 'text' }],
					criteria: []
				},
				{
					id: 'tiny',
					title: 'Tiny',
					points: 1,
					blocks: [{ id: 't', field: 't', type: 'text' }],
					criteria: []
				}
			]
		};
		expect(hxProgress(m, { t: 'x' }).percent).toBe(1);
		expect(hxProgress(m, { b: 'x' }).percent).toBe(99);
		expect(hxProgress(m, {}).percent).toBe(0);
		expect(hxProgress(m, { b: 'x', t: 'y' }).percent).toBe(100);
	});

	it('a manifest with nothing to count is 0 and never complete', () => {
		const m: HtmlAssignmentManifest = {
			schemaVersion: 3,
			kind: 'html-assignment',
			title: 'Empty',
			course: 'IDEA100',
			points: 0,
			header: [{ id: 'h', field: 'name', type: 'text' }],
			modules: []
		};
		const p = hxProgress(m, { name: 'Ana' });
		expect(p.percent).toBe(0);
		expect(p.complete).toBe(false);
		expect(p.total).toBe(0);
		expect(p.next).toBeNull();
	});

	it('the stages are ordered, distinct in word and glyph, and 100 alone is complete', () => {
		const mins = HX_PROGRESS_STAGES.map((s) => s.min);
		expect(mins).toEqual([...mins].sort((a, b) => a - b));
		expect(new Set(HX_PROGRESS_STAGES.map((s) => s.label)).size).toBe(HX_PROGRESS_STAGES.length);
		expect(new Set(HX_PROGRESS_STAGES.map((s) => s.glyph)).size).toBe(HX_PROGRESS_STAGES.length);
		expect(hxProgressStage(0)).toBe('blank');
		expect(hxProgressStage(1)).toBe('started');
		expect(hxProgressStage(24)).toBe('started');
		expect(hxProgressStage(25)).toBe('building');
		expect(hxProgressStage(50)).toBe('halfway');
		expect(hxProgressStage(75)).toBe('nearly');
		expect(hxProgressStage(99)).toBe('nearly');
		expect(hxProgressStage(100)).toBe('complete');
	});

	it('the paint runs crimson to amber to green through register tokens only', () => {
		expect(hxProgressPaint(0)).toEqual({ from: '--crimson', to: '--amber', t: 0 });
		expect(hxProgressPaint(25)).toEqual({ from: '--crimson', to: '--amber', t: 0.5 });
		expect(hxProgressPaint(50)).toEqual({ from: '--amber', to: '--green', t: 0 });
		expect(hxProgressPaint(100)).toEqual({ from: '--amber', to: '--green', t: 1 });
		expect(hxProgressPaint(-5).t).toBe(0);
		expect(hxProgressPaint(500).t).toBe(1);
	});

	it('the module line counts answers, never points', () => {
		const p = hxProgress(bench(), pick('staged'), { cutPhoto: PHOTO });
		const lines = p.modules.map(hxProgressModuleLine);
		expect(lines).toEqual(['Bench setup: 1 answer left', 'First cut: done', 'Reflection: 3 answers left']);
		for (const l of lines) expect(l).not.toMatch(/point/i);
		expect(hxProgressSummary(p)).toBe('35% filled in. Building up. 2 of 6 answers in.');
	});
});

// ---------------------------------------------------------------------------
// The copy. Not a grade, American, no dashes, no weekdays.
// ---------------------------------------------------------------------------

describe('the copy', () => {
	const every = [
		HX_PROGRESS_NOT_A_GRADE,
		HX_PROGRESS_COMPLETE_NOTE,
		HX_PROGRESS_BAR_LABEL,
		...HX_PROGRESS_STAGES.map((s) => s.label),
		hxProgressNextLine(hxProgress(bench(), {})) ?? '',
		...hxProgress(bench(), {}).modules.map(hxProgressModuleLine)
	];

	it('says in words that it is not a grade, at every value', () => {
		expect(HX_PROGRESS_NOT_A_GRADE).toMatch(/not how well/);
		expect(HX_PROGRESS_NOT_A_GRADE).toMatch(/[Gg]rades come from your teacher/);
		expect(HX_PROGRESS_COMPLETE_NOTE).toMatch(/not a grade/);
	});

	it('carries no em dash, no weekday name, no British spelling', () => {
		for (const s of every) {
			expect(s, s).not.toMatch(/—/);
			for (const day of WEEKDAYS) expect(s, s).not.toMatch(new RegExp(`\\b${day}\\b`));
			expect(s, s).not.toMatch(new RegExp(BRITISH_SPELLING_RE.source, 'i'));
		}
	});

	it('no stage word names a score, a mark or a point', () => {
		for (const s of HX_PROGRESS_STAGES) expect(s.label).not.toMatch(/score|grade|mark|point/i);
	});
});

// ---------------------------------------------------------------------------
// The render. What is in the markup at each value, on the real component.
// ---------------------------------------------------------------------------

describe('Progress.svelte renders the number, the words and the segments', () => {
	const strip = (html: string) => html.replace(/<!--.*?-->/gs, '');
	/** Visible text only: no tags, no attributes. */
	const text = (html: string) => strip(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

	it('at 0%: the number, Not started, three segments weighted 5/1/4, the note, and no completion note', () => {
		const html = strip(render(Progress, { props: { manifest: bench(), values: {}, images: {} } }).body);
		expect(html).toContain('data-percent="0"');
		expect(html).toContain('data-stage="blank"');
		expect(html).toContain('Not started');
		expect(html).toContain('aria-valuenow="0"');
		expect(html).toContain(`aria-label="${HX_PROGRESS_BAR_LABEL}"`);
		expect(html).toContain(HX_PROGRESS_NOT_A_GRADE);
		expect(html).not.toContain(HX_PROGRESS_COMPLETE_NOTE);
		expect(html).toContain('Next up: "Bench setup", answer 1 of 2, is empty.');
		const weights = [...html.matchAll(/data-hx-seg-weight="([^"]+)"/g)].map((m) => m[1]);
		expect(weights).toEqual(['5', '1', '4']);
		expect((html.match(/data-hx-mod=/g) ?? []).length).toBe(3);
		// The header never becomes a segment or a chip.
		expect(html).not.toContain('hb-name');
	});

	it('at 100%: All filled in, every segment done, the completion note AND the not-a-grade note', () => {
		const html = strip(
			render(Progress, { props: { manifest: bench(), values: { ...ALL }, images: { cutPhoto: PHOTO } } }).body
		);
		expect(html).toContain('data-percent="100"');
		expect(html).toContain('data-stage="complete"');
		expect(html).toContain('is-complete');
		expect(html).toContain('All filled in');
		expect(html).toContain(HX_PROGRESS_COMPLETE_NOTE);
		expect(html).toContain(HX_PROGRESS_NOT_A_GRADE);
		expect((html.match(/hxp-seg[^"]*is-done/g) ?? []).length).toBe(3);
		expect(html).not.toContain('Next up:');
	});

	it('at 50% the paint is at the amber stop and no points are printed anywhere', () => {
		const html = strip(
			render(Progress, { props: { manifest: bench(), values: pick('staged', 'setupNotes') } }).body
		);
		expect(html).toContain('data-percent="50"');
		expect(html).toContain('--hxp-from: var(--amber)');
		expect(html).toContain('--hxp-to: var(--green)');
		expect(html).toContain('--hxp-t: 0%');
		expect(html).toContain('Bench setup: done');
		// `data-basis="points"` is an attribute; what a student READS carries
		// no point value anywhere.
		expect(text(html)).not.toMatch(/\bpoints?\b/i);
		expect(text(html)).not.toMatch(/\b\d+ of \d+\b/);
	});
});

// ---------------------------------------------------------------------------
// The wiring. The rail is in ItemDetail's schema-3 branch, above the frame,
// keyed on the answer controller, and the note is never paraphrased there.
// ---------------------------------------------------------------------------

describe('ItemDetail mounts the rail above the frame', () => {
	const src = readFileSync('src/lib/classroom/ItemDetail.svelte', 'utf8');

	it('imports the real component and mounts it once, before HtmlAssignmentFrame, under htmlAnswers', () => {
		expect(src).toContain("import Progress from '$lib/classroom/html-assignment/Progress.svelte'");
		const mount = src.indexOf('<Progress');
		const frame = src.indexOf('<HtmlAssignmentFrame');
		expect(mount).toBeGreaterThan(-1);
		expect(frame).toBeGreaterThan(mount);
		expect((src.match(/<Progress\b/g) ?? []).length).toBe(1);
		const gate = src.slice(src.lastIndexOf('{#if', mount), mount);
		expect(gate).toContain('htmlAnswers');
		expect(gate).toContain('htmlProgressManifest');
	});

	it('hands the rail the controller records the frame is seeded from', () => {
		const block = src.slice(src.indexOf('<Progress'), src.indexOf('/>', src.indexOf('<Progress')));
		expect(block).toContain('values={htmlAnswers.values}');
		expect(block).toContain('images={htmlAnswers.images}');
	});

	it('does not restate the not-a-grade sentence anywhere else', () => {
		expect(src).not.toContain(HX_PROGRESS_NOT_A_GRADE);
		const svelte = readFileSync('src/lib/classroom/html-assignment/Progress.svelte', 'utf8');
		expect(svelte).not.toContain(HX_PROGRESS_NOT_A_GRADE);
		expect(svelte).toContain('{HX_PROGRESS_NOT_A_GRADE}');
	});
});

// ---------------------------------------------------------------------------
// LEDGER 0360. An optional block is judged and never counted; work the server
// has not acknowledged is not complete; the next line names the answer.
// Expected values are worked by hand from the fixture's points, never
// recomputed through `hxProgress`.
// ---------------------------------------------------------------------------

/** Portfolio-shaped: a 4-point Assembly module with one required photo, one
    OPTIONAL photo slot and a required three-sentence answer. */
/** Passed instead of a flag value, the slot carries no `optional` key at all. */
const NO_KEY = Symbol('no optional key');

function assembly(optionalFlag: unknown = true): HtmlAssignmentManifest {
	const slot: Record<string, unknown> = { id: 'a-photo-2', field: 'assemblyPhoto2', type: 'image' };
	if (optionalFlag !== NO_KEY) slot.optional = optionalFlag;
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Portfolio capture',
		course: 'IDEA209H',
		points: 6,
		header: [{ id: 'hb-name', field: 'studentName', type: 'text' }],
		modules: [
			{
				id: 'design',
				title: 'Design',
				points: 2,
				blocks: [{ id: 'd-notes', field: 'designNotes', type: 'longText' }],
				criteria: []
			},
			{
				id: 'assembly',
				title: 'Assembly',
				points: 4,
				blocks: [
					{ id: 'a-photo-1', field: 'assemblyPhoto1', type: 'image' },
					slot as never,
					{ id: 'a-why', field: 'assemblyWhy', type: 'longText', minSentences: 3 }
				],
				criteria: []
			}
		]
	};
}

const THREE = 'I glued the base first. Then I clamped the arm. The clamp held overnight.';
const FILLED = { studentName: 'Ana Reyes', designNotes: 'A tall trophy.', assemblyWhy: THREE };

describe('an optional block is judged and never counted (report 8f78d5bd)', () => {
	it('every required block filled with the optional slot EMPTY is 100% and complete', () => {
		const p = hxProgress(assembly(), FILLED, { assemblyPhoto1: PHOTO });
		expect(p.complete).toBe(true);
		expect(p.filled).toBe(true);
		expect(p.percent).toBe(100);
		expect(p.next).toBeNull();
		const slot = p.blocks.find((b) => b.blockId === 'a-photo-2');
		expect(slot?.optional).toBe(true);
		expect(slot?.weight).toBe(0);
		expect(slot?.met).toBe(false);
		expect(hxProgressModuleLine(p.modules.find((m) => m.id === 'assembly')!)).toBe('Assembly: done');
	});

	it("the module's points are spread over its REQUIRED blocks only: 4 over 2 is 2 each", () => {
		const p = hxProgress(assembly(), FILLED, { assemblyPhoto1: PHOTO });
		const weights = Object.fromEntries(p.blocks.map((b) => [b.blockId, b.weight]));
		// By hand: Design 2 points over 1 block; Assembly 4 points over 2
		// required blocks (photo 1, the answer); the optional slot and the
		// header 0. A count over all three Assembly blocks would give 4/3.
		expect(weights).toEqual({ 'hb-name': 0, 'd-notes': 2, 'a-photo-1': 2, 'a-photo-2': 0, 'a-why': 2 });
		expect(p.total).toBe(6);
		expect(p.totalBlocks).toBe(3);
	});

	it('THE POSITIVE CONTROL: the same slot NOT marked optional holds the bar at 78 forever', () => {
		// By hand: 6 points. Design is 2 over one block; Assembly is 4 over
		// THREE required blocks, 4/3 each, two of them met. Earned 2 + 8/3 =
		// 4.667 of 6 = 77.8%, which rounds to 78. Not complete, and the next
		// line names the photo slot by its position, the student's only clue.
		const p = hxProgress(assembly(NO_KEY), FILLED, { assemblyPhoto1: PHOTO });
		expect(p.complete).toBe(false);
		expect(p.percent).toBe(78);
		expect(p.next?.blockId).toBe('a-photo-2');
		expect(hxProgressNextLine(p)).toBe('Next up: "Assembly" is waiting for photo 2 of 2.');
	});

	it('a malformed optional value is ABSENT, never a guess: "yes" and 1 still count the block', () => {
		for (const bad of ['yes', 1, 'true', null]) {
			const p = hxProgress(assembly(bad), FILLED, { assemblyPhoto1: PHOTO });
			expect(p.complete, String(bad)).toBe(false);
		}
	});

	it('hxIncompleteBlocks skips an optional block, so the sentence count agrees with the bar', () => {
		const m = assembly();
		m.modules[1].blocks[1] = { id: 'a-extra', field: 'extra', type: 'longText', minSentences: 3, optional: true } as never;
		const gate = hxIncompleteBlocks(m, { ...FILLED, extra: 'Only one.' });
		expect(gate.map((g) => g.blockId)).toEqual([]);
		// Control: unmarked, the same short answer is reported.
		m.modules[1].blocks[1] = { id: 'a-extra', field: 'extra', type: 'longText', minSentences: 3 };
		expect(hxIncompleteBlocks(m, { ...FILLED, extra: 'Only one.' }).map((g) => g.blockId)).toEqual(['a-extra']);
	});

	it('a module whose every block is optional moves nothing and is never a chip', () => {
		const m = assembly();
		m.modules.push({
			id: 'extras',
			title: 'Extras',
			points: 3,
			blocks: [{ id: 'x-1', field: 'x1', type: 'text', optional: true } as never],
			criteria: []
		});
		const p = hxProgress(m, FILLED, { assemblyPhoto1: PHOTO });
		expect(p.complete).toBe(true);
		expect(p.modules.find((mod) => mod.id === 'extras')?.weight).toBe(0);
	});
});

describe('work the server has not acknowledged is not complete (report d983e776)', () => {
	it('filled with one counted field unsaved: filled, not complete, 99, and the saving line', () => {
		const p = hxProgress(bench(), { ...ALL }, { cutPhoto: PHOTO }, { unsaved: ['why'] });
		expect(p.filled).toBe(true);
		expect(p.complete).toBe(false);
		expect(p.unsavedBlocks).toBe(1);
		expect(p.percent).toBe(99);
		expect(p.next).toBeNull();
		expect(hxProgressSaveLine(p, false)).toBe(HX_PROGRESS_SAVING_LINE);
		expect(hxProgressSaveLine(p, true)).toBe(HX_PROGRESS_NOT_SAVED_LINE);
	});

	it('THE CONTROL: the same values with nothing unsaved are 100 and complete, with no save line', () => {
		const p = hxProgress(bench(), { ...ALL }, { cutPhoto: PHOTO }, { unsaved: [] });
		expect(p.complete).toBe(true);
		expect(p.percent).toBe(100);
		expect(hxProgressSaveLine(p, false)).toBeNull();
	});

	it('an unsaved HEADER field does not hold completion: identity is not counted work', () => {
		const p = hxProgress(bench(), { ...ALL }, { cutPhoto: PHOTO }, { unsaved: new Set(['studentName']) });
		expect(p.complete).toBe(true);
	});

	it('hxCompletion is unchanged: it passes no options, so stored rows alone decide', () => {
		const rows = Object.entries(ALL).map(([field, value]) => {
			const id = [...(bench().header ?? []), ...bench().modules.flatMap((m) => m.blocks)].find(
				(b) => b.field === field
			)!.id;
			return {
				block_id: id,
				value: typeof value === 'boolean' ? { checked: [value] } : { text: value },
				updated_at: '2026-09-29T15:00:00Z'
			};
		});
		const files = [{ id: 'f1', block_id: 'c-photo', filename: 'cut.jpg', created_at: '2026-09-29T15:01:00Z' }];
		const done = hxCompletion(bench(), rows, files as never);
		expect(done).toEqual({ complete: true, at: '2026-09-29T15:01:00.000Z' });
	});
});

describe('the next line names the answer (report 8f78d5bd)', () => {
	it('position among REQUIRED answers, plural modules only', () => {
		const v = pick('studentName', 'staged', 'setupNotes', 'why', 'safetyChecked');
		const p = hxProgress(bench(), v, { cutPhoto: PHOTO });
		expect(p.next?.blockId).toBe('r-table');
		expect(hxProgressNextLine(p)).toBe('Next up: "Reflection", answer 2 of 3, has an empty table.');
	});

	it('a one-answer module says nothing more than it did', () => {
		const p = hxProgress(bench(), pick('staged', 'setupNotes'));
		expect(p.next?.blockId).toBe('c-photo');
		expect(hxProgressNextLine(p)).toBe('Next up: "First cut" is waiting for a photo.');
	});
});

describe('Progress.svelte with a save status (ledger 0360)', () => {
	const strip = (html: string) => html.replace(/<!--.*?-->/gs, '');
	function status(overrides: Record<string, unknown> = {}) {
		return {
			unsaved: [],
			save: null,
			ack: null,
			itemId: 'item-1',
			restore: null,
			dismissRestore: null,
			mirror: 'off',
			...overrides
		} as never;
	}

	it('filled but unsaved renders 99 and the saving line, never All filled in', () => {
		const html = strip(
			render(Progress, {
				props: { manifest: bench(), values: { ...ALL }, images: { cutPhoto: PHOTO }, status: status({ unsaved: ['why'] }) }
			}).body
		);
		expect(html).toContain('data-percent="99"');
		expect(html).toContain(HX_PROGRESS_SAVING_LINE);
		expect(html).not.toContain(HX_PROGRESS_COMPLETE_NOTE);
		expect(html).not.toContain('is-complete');
	});

	it('THE CONTROL: the same rail with nothing unsaved is 100 and complete', () => {
		const html = strip(
			render(Progress, {
				props: { manifest: bench(), values: { ...ALL }, images: { cutPhoto: PHOTO }, status: status() }
			}).body
		);
		expect(html).toContain('data-percent="100"');
		expect(html).toContain(HX_PROGRESS_COMPLETE_NOTE);
		expect(html).not.toContain(HX_PROGRESS_SAVING_LINE);
	});

	it('a refused backup copy says so, and an ok one says nothing', () => {
		const off = strip(render(Progress, { props: { manifest: bench(), values: {}, status: status({ mirror: 'full' }) } }).body);
		expect(off).toContain(HX_MIRROR_UNAVAILABLE);
		const ok = strip(render(Progress, { props: { manifest: bench(), values: {}, status: status({ mirror: 'ok' }) } }).body);
		expect(ok).not.toContain(HX_MIRROR_UNAVAILABLE);
	});

	it('a restore notice renders the conflict copy verbatim and the photo limit', () => {
		const html = strip(
			render(Progress, {
				props: {
					manifest: bench(),
					values: {},
					status: status({
						restore: {
							restored: ['Bench setup: staged'],
							conflicts: [{ blockId: 'r-why', label: 'Reflection: why', lines: ['My own words, kept.'] }]
						},
						dismissRestore: () => {}
					})
				}
			}).body
		);
		expect(html).toContain('data-testid="hxp-restore"');
		expect(html).toContain('My own words, kept.');
		expect(html).toContain('Photos are not kept this way');
		expect(html).toContain('data-testid="hxp-restore-dismiss"');
	});
});
