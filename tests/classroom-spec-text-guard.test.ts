// tests/classroom-spec-text-guard.test.ts
//
// THE STRUCTURAL GUARD behind the in-place wording editor, tested on its own,
// because it is the reason that editor is safe to put in front of somebody who
// does not read JSON.
//
// WHY THIS IS A TEST AND NOT A HARNESS DRIVE. The rule this file exists for --
// "a wording edit can never change a point value" -- fails SILENTLY if it is
// wrong. The spec saves, the page renders, the assignment looks correct, and
// the damage shows up as a different total in a class taught by somebody with
// no way to debug a spec. That is exactly the "regression would be silent"
// bar CLAUDE.md sets for adding an automated test at all.
//
// THE EXPECTED VALUES DO NOT COME FROM THE THING BEING TESTED. Every refusal
// case below is a hand-written mutation of a fixture -- a number changed, a
// block type swapped, a module removed, a block added -- and the assertion is
// on WHICH PATH the guard names, not on a verdict the guard also computed.
//
// MUTATION PROOF, BOTH DIRECTIONS, run during this session against
// src/lib/classroom/spec-text-guard.ts and restored md5-identical afterwards:
//
//   PERMISSIVE (the leak): an early `return` at the top of `compare` -- i.e. a
//     guard that approves everything -- reddened 16 of 28 tests: every one of
//     the 13 refusal tests, plus the three permit tests that also assert WHICH
//     keys changed (that list is built in the same walk). This is the direction
//     that matters: a guard deleted outright still refuses nothing, so a
//     refusal test that stayed green would be worthless.
//   RESTRICTIVE (the uselessness): deleting the `if (w.allowed.has(key))`
//     branch from `compare` -- i.e. a guard that permits nothing -- reddened 9
//     of 28: all 7 permit tests, the "required field deleted" refusal (which
//     asserts the WORDING of the refusal, and that wording comes from the
//     deleted branch), and the save-path test. That half is the positive
//     control: a guard tightened into refusing every edit passes every refusal
//     test in this file and is completely useless, and only the permit half
//     catches it.
//
// The guard was restored md5-identical after each and this file re-run green.

import { describe, expect, it } from 'vitest';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';
import type { ReferenceSpec } from '$lib/classroom/reference-spec';
import { guardSpecTextEdit, prepareSpecTextSave } from '$lib/classroom/spec-text-guard';
import { applySpecTextEdits, specTextSurfaces } from '$lib/classroom/spec-text';

// ---------------------------------------------------------------------------
// Fixtures. One of every block type each schema knows, so the walk below is
// exercised against real shapes rather than a reduced one.
// ---------------------------------------------------------------------------

const ASSIGNMENT: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Density lab', totalPoints: 30, course: 'IDEA209H' },
	approvalGate: { afterModule: 'm1', label: 'Bench check' },
	modules: [
		{
			id: 'm1',
			title: 'Measure the samples',
			points: 20,
			aiLevel: 1,
			aiNote: 'AI may explain the arithmetic; the measurements are yours.',
			intro: 'Work with your bench partner.',
			blocks: [
				{ type: 'instructions', content: '### Weigh each sample\n\nRecord to two decimals.' },
				{
					type: 'table',
					id: 'readings',
					points: 10,
					minRows: 6,
					columns: [
						{ key: 'sample', label: 'Sample' },
						{ key: 'mass', label: 'Mass (g)', tip: 'Balance, two decimals' }
					]
				},
				{ type: 'textField', id: 'why', prompt: 'Why did sample 3 float?', minSentences: 2, points: 10 },
				{ type: 'checklist', id: 'safety', items: ['Goggles on', 'Balance zeroed'] },
				{ type: 'imageZone', id: 'photos', minImages: 1, captions: true },
				{ type: 'calc', id: 'calc1', tool: 'density', config: { units: 'metric' } }
			],
			rubric: [
				{
					id: 'accuracy',
					criterion: 'Measurements are accurate',
					levels: [
						{ points: 0, label: 'Missing', descriptor: 'No readings.' },
						{ points: 5, label: 'Partial', descriptor: 'Some readings.' },
						{ points: 10, label: 'Full', descriptor: 'All six, to two decimals.' }
					]
				}
			]
		},
		{
			id: 'm2',
			title: 'Identify the materials',
			points: 10,
			blocks: [{ type: 'instructions', content: 'Compare against the published table.' }]
		}
	]
};

const REFERENCE: ReferenceSpec = {
	schemaVersion: 2,
	kind: 'reference',
	meta: { referenceId: 'r-1', title: 'IDEA 209H syllabus', subtitle: 'Fall term' },
	navigation: 'tabs',
	sections: [
		{
			slug: 'grading',
			title: 'Grading',
			blurb: 'How the marks add up.',
			blocks: [
				{ type: 'instructions', content: 'Everything is out of 100.' },
				{ type: 'keyValue', title: 'At a glance', items: [{ label: 'Labs', value: '40%' }] },
				{
					type: 'dataTable',
					title: 'Weights',
					caption: 'Term one',
					columns: [
						{ key: 'cat', label: 'Category' },
						{ key: 'pct', label: 'Percent' }
					],
					rows: [{ cat: 'Labs', pct: '40' }]
				},
				{ type: 'callout', variant: 'warn', title: 'Late work', content: 'Two days, then a zero.' },
				{
					type: 'cardGrid',
					title: 'Links',
					cards: [{ title: 'Bench safety', url: 'https://example.edu/safety', body: 'Read first.' }]
				},
				{
					type: 'linkCard',
					title: 'Parts',
					links: [
						{ url: 'https://example.com/p', fallbackLabel: 'Caliper 0-150mm', label: 'Caliper', note: 'Any brand' }
					]
				},
				{
					type: 'calc',
					tool: 'gradeCalculator',
					title: 'Work out your mark',
					config: {
						categories: [{ name: 'Labs', pointsPossible: 400, weight: 0.4 }],
						disclaimer: 'An estimate only.'
					}
				}
			]
		}
	]
};

function clone<T>(v: T): T {
	return JSON.parse(JSON.stringify(v)) as T;
}

/** Edit one text surface by its path key, through the real writer. */
function edited<T extends AssignmentSpec | ReferenceSpec>(
	spec: T,
	kind: 'assignment' | 'reference',
	key: string,
	value: string
): T {
	return applySpecTextEdits(spec, kind, new Map([[key, value]]));
}

// ---------------------------------------------------------------------------
// PERMIT -- the positive control. A guard tightened into uselessness passes
// every refusal test in this file and fails all of these.
// ---------------------------------------------------------------------------

describe('the guard permits every legitimate text edit', () => {
	it('permits an edit to every single assignment text surface, one at a time', () => {
		const surfaces = specTextSurfaces(ASSIGNMENT, 'assignment');
		expect(surfaces.length).toBeGreaterThan(10);
		const refused: string[] = [];
		for (const s of surfaces) {
			const next = edited(ASSIGNMENT, 'assignment', s.key, `${s.value} (reworded)`);
			const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
			if (!verdict.ok) refused.push(`${s.key}: ${verdict.violations[0]?.message}`);
			else if (verdict.changed.length !== 1) refused.push(`${s.key}: changed ${verdict.changed.length}`);
		}
		expect(refused).toEqual([]);
		// The case count, so a sweep that generated nothing cannot pass. Counted
		// by hand off the fixture: the header title and the gate label (2), then
		// m1's title, intro and its five text-bearing blocks (10 -- the imageZone
		// and the calc contribute nothing), then m2's title, its absent-but-
		// optional intro, and one instructions block (3).
		expect(surfaces.length).toBe(15);
	});

	it('permits an edit to every single reference text surface, one at a time', () => {
		const surfaces = specTextSurfaces(REFERENCE, 'reference');
		const refused: string[] = [];
		for (const s of surfaces) {
			const next = edited(REFERENCE, 'reference', s.key, `${s.value} (reworded)`);
			const verdict = guardSpecTextEdit(REFERENCE, next, 'reference');
			if (!verdict.ok) refused.push(`${s.key}: ${verdict.violations[0]?.message}`);
		}
		expect(refused).toEqual([]);
		// Counted by hand: the title and subtitle (2), the section's title and
		// blurb (2), and the seven blocks' own text (20).
		expect(surfaces.length).toBe(24);
	});

	it('permits several edits at once and names each one', () => {
		const next = applySpecTextEdits(
			ASSIGNMENT,
			'assignment',
			new Map([
				['modules[0].title', 'Measure the six samples'],
				['modules[0].blocks[2].prompt', 'Why did sample 3 float in water?'],
				['meta.title', 'Density and measurement']
			])
		);
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(true);
		if (!verdict.ok) return;
		expect(verdict.changed.sort()).toEqual(
			['meta.title', 'modules[0].blocks[2].prompt', 'modules[0].title'].sort()
		);
	});

	it('permits ADDING an optional text field that was absent', () => {
		const bare = clone(ASSIGNMENT);
		delete bare.modules[1].intro;
		const next = edited(bare, 'assignment', 'modules[1].intro', 'Bring the published table.');
		expect(guardSpecTextEdit(bare, next, 'assignment').ok).toBe(true);
		expect(next.modules[1].intro).toBe('Bring the published table.');
	});

	it('permits REMOVING an optional text field by emptying it', () => {
		const next = edited(ASSIGNMENT, 'assignment', 'modules[0].intro', '   ');
		expect(guardSpecTextEdit(ASSIGNMENT, next, 'assignment').ok).toBe(true);
		expect('intro' in next.modules[0]).toBe(false);
	});

	it('permits a dataTable cell edit', () => {
		const next = edited(REFERENCE, 'reference', 'sections[0].blocks[2].rows[0].pct', '45');
		const verdict = guardSpecTextEdit(REFERENCE, next, 'reference');
		expect(verdict.ok).toBe(true);
		expect((next.sections[0].blocks[2] as { rows: Record<string, string>[] }).rows[0].pct).toBe('45');
	});

	it('permits a callout body edit and leaves the variant alone', () => {
		const next = edited(REFERENCE, 'reference', 'sections[0].blocks[3].content', 'One day, then a zero.');
		expect(guardSpecTextEdit(REFERENCE, next, 'reference').ok).toBe(true);
		expect((next.sections[0].blocks[3] as { variant: string }).variant).toBe('warn');
	});

	it('reports an identical document as ok with nothing changed', () => {
		const verdict = guardSpecTextEdit(ASSIGNMENT, clone(ASSIGNMENT), 'assignment');
		expect(verdict.ok).toBe(true);
		if (verdict.ok) expect(verdict.changed).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// ROUND TRIP -- the property the whole editor rests on.
// ---------------------------------------------------------------------------

describe('every text surface round-trips unchanged when nothing is edited', () => {
	it('an assignment with no edits comes out byte-identical', () => {
		const before = JSON.stringify(ASSIGNMENT);
		const next = applySpecTextEdits(ASSIGNMENT, 'assignment', new Map());
		expect(JSON.stringify(next)).toBe(before);
	});

	it('a reference document with no edits comes out byte-identical', () => {
		const before = JSON.stringify(REFERENCE);
		const next = applySpecTextEdits(REFERENCE, 'reference', new Map());
		expect(JSON.stringify(next)).toBe(before);
	});

	it('writing every surface back with its OWN value changes nothing at all', () => {
		// The strongest form: the editor hands back what it was given for every
		// field, which is what happens when somebody opens the panel, touches
		// each control, and puts the same words back.
		for (const kind of ['assignment', 'reference'] as const) {
			const spec = kind === 'assignment' ? ASSIGNMENT : (REFERENCE as never);
			const edits = new Map(specTextSurfaces(spec, kind).map((s) => [s.key, s.value]));
			expect(edits.size).toBeGreaterThan(kind === 'assignment' ? 14 : 23);
			const next = applySpecTextEdits(spec, kind, edits);
			expect(JSON.stringify(next)).toBe(JSON.stringify(spec));
			const verdict = guardSpecTextEdit(spec, next, kind);
			expect(verdict.ok).toBe(true);
			if (verdict.ok) expect(verdict.changed).toEqual([]);
		}
	});

	it('an edited sentence lands in the right block and moves nothing else', () => {
		const next = edited(
			ASSIGNMENT,
			'assignment',
			'modules[0].blocks[0].content',
			'### Weigh each sample\n\nRecord to three decimals.'
		);
		expect((next.modules[0].blocks[0] as { content: string }).content).toContain('three decimals');
		// Its neighbour is untouched, and so is the other module.
		expect((next.modules[0].blocks[2] as { prompt: string }).prompt).toBe(
			(ASSIGNMENT.modules[0].blocks[2] as { prompt: string }).prompt
		);
		expect(JSON.stringify(next.modules[1])).toBe(JSON.stringify(ASSIGNMENT.modules[1]));
		expect(next.meta.totalPoints).toBe(30);
	});
});

// ---------------------------------------------------------------------------
// REFUSE -- the leak. A guard that approves everything fails all of these.
// ---------------------------------------------------------------------------

describe('the guard refuses a structural change', () => {
	it('refuses a changed module point value, naming the path and both numbers', () => {
		const next = clone(ASSIGNMENT);
		next.modules[0].points = 25;
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (verdict.ok) return;
		expect(verdict.violations).toHaveLength(1);
		expect(verdict.violations[0].path).toBe('modules[0].points');
		expect(verdict.violations[0].message).toContain('20');
		expect(verdict.violations[0].message).toContain('25');
	});

	it('refuses a changed block point value', () => {
		const next = clone(ASSIGNMENT);
		(next.modules[0].blocks[1] as { points: number }).points = 99;
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.violations[0].path).toBe('modules[0].blocks[1].points');
	});

	it('refuses a changed assignment total', () => {
		const next = clone(ASSIGNMENT);
		next.meta.totalPoints = 40;
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.violations[0].path).toBe('meta.totalPoints');
	});

	it('refuses a block-type change', () => {
		const next = clone(ASSIGNMENT);
		(next.modules[0].blocks[2] as { type: string }).type = 'instructions';
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.violations.some((v) => v.path === 'modules[0].blocks[2].type')).toBe(true);
		}
	});

	it('refuses a removed module', () => {
		const next = clone(ASSIGNMENT);
		next.modules.splice(1, 1);
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.violations[0].path).toBe('modules');
			expect(verdict.violations[0].message).toContain('2');
			expect(verdict.violations[0].message).toContain('1');
		}
	});

	it('refuses an added block', () => {
		const next = clone(ASSIGNMENT);
		next.modules[1].blocks.push({ type: 'instructions', content: 'And one more thing.' });
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.violations[0].path).toBe('modules[1].blocks');
	});

	it('refuses a changed AI level, and a changed AI note', () => {
		const level = clone(ASSIGNMENT);
		level.modules[0].aiLevel = 3;
		const a = guardSpecTextEdit(ASSIGNMENT, level, 'assignment');
		expect(a.ok).toBe(false);
		if (!a.ok) expect(a.violations[0].path).toBe('modules[0].aiLevel');

		// The note is deliberately NOT a text surface: it is the level in words.
		const note = clone(ASSIGNMENT);
		note.modules[0].aiNote = 'Use whatever you like.';
		const b = guardSpecTextEdit(ASSIGNMENT, note, 'assignment');
		expect(b.ok).toBe(false);
		if (!b.ok) expect(b.violations[0].path).toBe('modules[0].aiNote');
	});

	it('refuses a rubric change: the criterion, a level label, and a level score', () => {
		const paths = [
			['criterion', (s: AssignmentSpec) => (s.modules[0].rubric![0].criterion = 'Something else'), 'modules[0].rubric[0].criterion'],
			['label', (s: AssignmentSpec) => (s.modules[0].rubric![0].levels[2].label = 'Complete'), 'modules[0].rubric[0].levels[2].label'],
			['points', (s: AssignmentSpec) => (s.modules[0].rubric![0].levels[2].points = 12), 'modules[0].rubric[0].levels[2].points']
		] as const;
		for (const [, mutate, path] of paths) {
			const next = clone(ASSIGNMENT);
			mutate(next);
			const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
			expect(verdict.ok).toBe(false);
			if (!verdict.ok) expect(verdict.violations[0].path).toBe(path);
		}
	});

	it('refuses a changed block id, and a changed module id', () => {
		const block = clone(ASSIGNMENT);
		(block.modules[0].blocks[2] as { id: string }).id = 'why2';
		expect(guardSpecTextEdit(ASSIGNMENT, block, 'assignment').ok).toBe(false);

		const mod = clone(ASSIGNMENT);
		mod.modules[0].id = 'm9';
		const verdict = guardSpecTextEdit(ASSIGNMENT, mod, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.violations[0].path).toBe('modules[0].id');
	});

	it('refuses a changed section slug and a changed link url', () => {
		const slug = clone(REFERENCE);
		slug.sections[0].slug = 'marks';
		expect(guardSpecTextEdit(REFERENCE, slug, 'reference').ok).toBe(false);

		const url = clone(REFERENCE);
		(url.sections[0].blocks[5] as { links: { url: string }[] }).links[0].url = 'https://evil.example';
		const verdict = guardSpecTextEdit(REFERENCE, url, 'reference');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) expect(verdict.violations[0].path).toBe('sections[0].blocks[5].links[0].url');
	});

	it('refuses a change inside a calc config, in either spec', () => {
		const ref = clone(REFERENCE);
		(ref.sections[0].blocks[6] as { config: { disclaimer: string } }).config.disclaimer = 'Guaranteed.';
		expect(guardSpecTextEdit(REFERENCE, ref, 'reference').ok).toBe(false);

		const asg = clone(ASSIGNMENT);
		(asg.modules[0].blocks[5] as { config: { units: string } }).config.units = 'imperial';
		expect(guardSpecTextEdit(ASSIGNMENT, asg, 'assignment').ok).toBe(false);
	});

	it('refuses a required text field being deleted outright', () => {
		const next = clone(ASSIGNMENT);
		delete (next.modules[0].blocks[0] as { content?: string }).content;
		const verdict = guardSpecTextEdit(ASSIGNMENT, next, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.violations[0].path).toBe('modules[0].blocks[0].content');
			expect(verdict.violations[0].message).toContain('required');
		}
	});

	it('refuses a whole-document replacement and stops collecting at the cap', () => {
		const other = clone(REFERENCE) as unknown as AssignmentSpec;
		const verdict = guardSpecTextEdit(ASSIGNMENT, other, 'assignment');
		expect(verdict.ok).toBe(false);
		if (!verdict.ok) {
			expect(verdict.violations.length).toBeGreaterThan(0);
			expect(verdict.violations.length).toBeLessThanOrEqual(25);
		}
	});
});

// ---------------------------------------------------------------------------
// The save path: the guard runs on the DOCUMENT, not on the intent.
// ---------------------------------------------------------------------------

describe('prepareSpecTextSave guards the document that would be sent', () => {
	it('returns the edited spec and the changed keys', () => {
		const res = prepareSpecTextSave(
			ASSIGNMENT,
			'assignment',
			new Map([['modules[0].title', 'Measure them']])
		);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.changed).toEqual(['modules[0].title']);
		expect(res.spec.modules[0].title).toBe('Measure them');
		// The ORIGINAL is untouched: the writer is immutable, so a refused save
		// cannot have already mutated what is on screen.
		expect(ASSIGNMENT.modules[0].title).toBe('Measure the samples');
	});

	it('ignores an edit key that names no surface, rather than writing it', () => {
		const res = prepareSpecTextSave(
			ASSIGNMENT,
			'assignment',
			new Map([['modules[0].points', '999']])
		);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.changed).toEqual([]);
	});

	it('refuses when the incoming document is missing', () => {
		expect(guardSpecTextEdit(null, ASSIGNMENT, 'assignment').ok).toBe(false);
		expect(guardSpecTextEdit(ASSIGNMENT, null, 'assignment').ok).toBe(false);
	});
});
