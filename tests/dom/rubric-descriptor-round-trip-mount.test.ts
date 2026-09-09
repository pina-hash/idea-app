// tests/dom/rubric-descriptor-round-trip-mount.test.ts
//
// AN EDITED LEVEL DESCRIPTION HAS TO REACH THE GRADING CONSOLE, AND FOR MONTHS
// IT DID NOT.
//
// THE REPORT (2026-09-08, IDEA209H "Unit 1 Final: Report, Presentation, and
// Defense"): "the grading criteria updated fine when I edited them, but the
// point-value-level descriptions would not save the updates I made." Tried
// twice.
//
// THE SAVE WAS NEVER BROKEN. `materials/.../rubric.json` is the export the app
// writes on every item save, and commit `24855e7` -- the build the report was
// filed from -- carries the instructor's new criterion text AND his new
// descriptors, both stored. What did not move in that same commit is every
// level's `short`, because `RubricBuilder` had no input for it: it edited
// `descriptor` and carried `short` through the save untouched.
//
// AND `short` IS THE LINE THE GRADING CONSOLE SHOWS. `levelShort`'s first rung
// is the stored level's own `short`; the descriptor is rung three, and on the
// console it is a hover tip behind the button. So the visible line under each
// point value kept saying the old thing, on the one surface he was looking at,
// while the database held exactly what he wrote. The criterion text is rendered
// straight from the row, which is why THAT half updated: the asymmetry in the
// report is the asymmetry between a field rendered directly and a field
// rendered through a resolver whose first rung nothing could edit.
//
// WHAT THIS FILE ASSERTS, in the order the defect runs:
//
//   1. THE FIELD IS ON SCREEN. The editor offers an input for the line the
//      console reads, one per level, seeded with what is stored. Before the
//      fix there were three inputs per level and none of them was this one, so
//      this is the assertion that reddens first.
//   2. THE ROUND TRIP. Editing the description AND the short line puts both in
//      the payload `setRubric` receives -- driven through the REAL component,
//      by real events, not by calling a helper.
//   3. BACK INTO THE CONSOLE. That payload, put to the REAL `levelShort` with
//      the ORIGINAL spec still attached (which is Mr. Cosso's situation exactly
//      -- he edited the rubric, not the spec, so the spec still carries the old
//      one-liners), resolves to what he typed. The spec rung is the one that
//      would quietly revive a stale line, so it is present in the fixture
//      rather than nulled out.
//   4. THE NEGATIVE CONTROL, which is what makes (3) mean anything: with the
//      short line left ALONE, the console keeps showing it while the
//      description says something else -- the shipped behaviour, reproduced --
//      and the editor SAYS SO on that level rather than letting the pair
//      disagree in silence.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why. The layout of
// the widened level row is measured by
// `tools/browser-verify/routes/grading-rubric.mjs`.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import RubricBuilder from '$lib/classroom/RubricBuilder.svelte';
import { mountInto, typeAt, type Mounted } from './mount';
import {
	levelShort,
	type AssignmentSpec,
	type RubricCriterion
} from '$lib/classroom/assignment-spec';

const Builder = RubricBuilder as unknown as Component<Record<string, unknown>>;

/**
 * THE REPORTED SHAPE, trimmed to one criterion and kept faithful where it
 * matters: a spec-generated criterion id (`m1-c2`, `rubricFromSpec`'s own
 * `<module>-<authored>` form), levels carrying BOTH a `short` and a
 * `descriptor`, and a spec below that still holds the pair the rubric was
 * generated from. Both halves are needed: rung one of `levelShort` is the
 * stored short, rung two is the spec's, and a fixture with only one of them
 * proves half the resolver.
 */
const STORED: RubricCriterion[] = [
	{
		id: 'm1-c2',
		criterion: 'Engineering Report: Every value and property carries its source',
		points: 4,
		levels: [
			{
				points: 4,
				label: 'Complete',
				short: 'All sourced',
				descriptor:
					'Every published property named in the report carries its value and the vendor page it was read from.'
			},
			{
				points: 3,
				label: 'Proficient',
				short: 'One source missing',
				descriptor: 'One property is named with its value but no source.'
			},
			{
				points: 0,
				label: 'Absent',
				short: 'Four or more unsourced',
				descriptor: 'Four or more properties carry no source.'
			}
		]
	}
];

const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: {
		assignmentId: 'idea209h-unit1-final',
		title: 'Unit 1 Final: Report, Presentation, and Defense',
		totalPoints: 4,
		gradingCategory: 'Unit Labs'
	},
	modules: [
		{
			id: 'm1',
			title: 'Engineering Report',
			points: 4,
			blocks: [{ type: 'instructions', content: 'Write the report.' }],
			rubric: [
				{
					id: 'c2',
					criterion: 'Every value and property carries its source',
					levels: [
						{ points: 4, label: 'Complete', short: 'All sourced', descriptor: 'Every published property carries its source.' },
						{ points: 3, label: 'Proficient', short: 'One source missing', descriptor: 'One property has no source.' },
						{ points: 0, label: 'Absent', short: 'Four or more unsourced', descriptor: 'Four or more carry no source.' }
					]
				}
			]
		}
	]
} as unknown as AssignmentSpec;

/** What the instructor rewrote the top level into, per the real diff. */
const NEW_DESCRIPTOR = 'Every component given a solid logical selection basis';
const NEW_SHORT = 'Selection basis given';

interface Driven {
	sent: RubricCriterion[] | null | undefined;
	m: Mounted;
}

/** Mount the REAL builder on the stored rubric and open its editor. */
function openEditor(): Driven {
	const driven: Driven = { sent: undefined, m: null as unknown as Mounted };
	driven.m = mountInto(Builder, {
		itemId: 'i-unit1-final',
		criteria: STORED,
		spec: SPEC,
		transports: {
			setRubric: async (_itemId: string, criteria: RubricCriterion[] | null) => {
				driven.sent = criteria;
				return { ok: true, data: undefined } as never;
			}
		}
	});
	byText(driven.m, 'Edit rubric').click();
	driven.m.flush();
	return driven;
}

/** A control selected by its own visible words: none of these carry a testid. */
function byText(m: Mounted, text: string): HTMLButtonElement {
	const found = m
		.all<HTMLButtonElement>('button')
		.find((b) => (b.textContent ?? '').includes(text));
	if (!found) throw new Error(`no button reading "${text}"`);
	return found;
}

async function save(d: Driven): Promise<void> {
	byText(d.m, 'Save rubric').click();
	await d.m.settle();
}

describe('the field the grading console reads is editable where a rubric is edited', () => {
	it('offers a short-line input per level, seeded with what is stored', async () => {
		const d = openEditor();
		const shorts = d.m.all<HTMLInputElement>('input.level-short');
		const descs = d.m.all<HTMLInputElement>('input.level-desc');
		// One per level, and the same count as the descriptors beside them: a
		// single input somewhere on the panel would satisfy "present" and still
		// leave two levels uneditable.
		expect(descs).toHaveLength(3);
		expect(shorts).toHaveLength(3);
		expect(shorts.map((i) => i.value)).toEqual([
			'All sourced',
			'One source missing',
			'Four or more unsourced'
		]);
		// It says what it is where a person can read it, not only in a title.
		expect(shorts[0].getAttribute('aria-label')).toMatch(/grading console/i);
		await d.m.stop();
	});
});

describe('an edited description reaches the grading console', () => {
	it('carries both halves of the edit into the payload and out through levelShort', async () => {
		const d = openEditor();
		typeAt(d.m.all<HTMLInputElement>('input.level-desc')[0], NEW_DESCRIPTOR);
		typeAt(d.m.all<HTMLInputElement>('input.level-short')[0], NEW_SHORT);
		await save(d);

		const top = d.sent?.[0]?.levels?.[0];
		expect(top?.descriptor).toBe(NEW_DESCRIPTOR);
		expect(top?.short).toBe(NEW_SHORT);
		// The untouched levels are not collateral: a save that rebuilt the row
		// from the fields it knows about would blank the two shorts nobody
		// typed into.
		expect(d.sent?.[0]?.levels?.map((l) => l.short)).toEqual([
			NEW_SHORT,
			'One source missing',
			'Four or more unsourced'
		]);

		// THE CONSOLE'S OWN RESOLVER, with the spec STILL CARRYING THE OLD LINE.
		// This is the assertion the defect fails: pre-fix the payload's `short`
		// is unchanged, so this reads "All sourced" -- the sentence about
		// sourcing, over a description about selection reasoning.
		expect(levelShort(top, 'm1-c2', SPEC)).toBe(NEW_SHORT);
		expect(levelShort(top, 'm1-c2', SPEC)).not.toBe('All sourced');
		await d.m.stop();
	});

	it('SAYS SO when the description moves and the short line does not', async () => {
		const d = openEditor();
		// The shipped behaviour, reproduced deliberately: rewrite the
		// description and leave the grader's line alone.
		expect(d.m.all('[data-testid="level-short-stale"]')).toHaveLength(0);
		typeAt(d.m.all<HTMLInputElement>('input.level-desc')[0], NEW_DESCRIPTOR);
		d.m.flush();

		const flags = d.m.all('[data-testid="level-short-stale"]');
		expect(flags).toHaveLength(1);
		expect(flags[0].textContent).toMatch(/Level 1/);

		await save(d);
		const top = d.sent?.[0]?.levels?.[0];
		// The pair really does disagree, which is what the flag is about: the
		// stored short still resolves and still contradicts the description.
		expect(top?.descriptor).toBe(NEW_DESCRIPTOR);
		expect(levelShort(top, 'm1-c2', SPEC)).toBe('All sourced');
		await d.m.stop();
	});

	it('clearing the short line falls the console back to the description', async () => {
		const d = openEditor();
		typeAt(d.m.all<HTMLInputElement>('input.level-desc')[0], NEW_DESCRIPTOR);
		typeAt(d.m.all<HTMLInputElement>('input.level-short')[0], '');
		d.m.flush();
		// Cleared is not stale: an empty line claims nothing.
		expect(d.m.all('[data-testid="level-short-stale"]')).toHaveLength(0);
		await save(d);

		const top = d.sent?.[0]?.levels?.[0];
		expect(top?.short).toBeUndefined();
		// RESIDUAL, AND NOT THIS LANE'S TO CLOSE: with the stored short gone,
		// `levelShort` rung two hands back the SPEC's short, which is the same
		// stale sentence. Closing that means pinning rung two to the spec's own
		// descriptor, inside `levelShort` -- `src/lib/classroom/assignment-spec.ts`,
		// which prompt 0106 does not own. Asserted as it BEHAVES, so the day it
		// is fixed this line reddens and names itself.
		expect(levelShort(top, 'm1-c2', SPEC)).toBe('All sourced');
		expect(levelShort(top, 'm1-c2', null)).toBe(NEW_DESCRIPTOR);
		await d.m.stop();
	});
});
