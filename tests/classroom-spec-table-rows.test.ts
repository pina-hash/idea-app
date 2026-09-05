// tests/classroom-spec-table-rows.test.ts
//
// `minRows` IS A COMPLETION REQUIREMENT COUNTED OVER FILLED ROWS, NEVER A
// MATERIALISATION INSTRUCTION -- which is the claim the Add row fix rests on,
// and the reason a blank row materialised on the student's behalf is noise
// rather than progress.
//
// This is the FRAME half. `tests/dom/spec-table-add-row-mount.test.ts` is the
// behavioural half and owns every claim about what a PRESS produces; a server
// render cannot press anything. What lives here is what a browser RECEIVES for
// a set of values, plus the two gates that read `minRows` -- neither of which
// needs a DOM and both of which would have to change for the fix to be wrong.
//
// THE EXPECTED VALUES DO NOT COME FROM THE CODE UNDER TEST. They come from the
// requirement an instructor reported: a table nobody has touched shows no
// rows, says so in words, and counts as zero rows done -- not as `minRows`
// rows done, and not as one.
//
// THIS FILE IS NOT THE FIX'S CONTROL AND MUST NOT BE READ AS ONE. A server
// render presses nothing, so `ensureRows` never fires here: restoring the old
// `ensureRows` body leaves every one of these 12 green (measured). What bites
// here is a regression in the GATES -- crediting a blank row in
// `tableRowFilled` reddens 3 of them (measured, on the same mutation). The
// press itself is proved in `tests/dom/spec-table-add-row-mount.test.ts`,
// where the old body reddens 13 of 14.
//
// The three gates are asserted together on purpose. A fix that made the
// renderer stop materialising rows while `blockProgress` still credited a
// blank one would be a student told their table was finished when the database
// (`_classroom_spec_unmet`, 0086: `jsonb_each_text` value not blank) would
// refuse the submit.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import {
	blockProgress,
	specUnmet,
	tableRowFilled,
	type AssignmentSpec,
	type ResponseValue,
	type TableBlock
} from '$lib/classroom/assignment-spec';

/** `minRows: undefined` is written by OMITTING the key: an explicit
 *  `undefined` and an absent key are not the same thing to `??`, and the old
 *  arithmetic (`Math.max(block.minRows ?? 0, 1)`) collapsed absent, 0 and 1
 *  into one answer. */
function tableBlock(minRows: number | undefined): TableBlock {
	return {
		type: 'table',
		id: 't1',
		columns: [
			{ key: 'sample', label: 'Sample' },
			{ key: 'mass', label: 'Mass (g)' }
		],
		...(minRows === undefined ? {} : { minRows })
	} as TableBlock;
}

function specWith(minRows: number | undefined): AssignmentSpec {
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'rows-1', title: 'Row arithmetic', totalPoints: 10 },
		modules: [{ id: 'm1', title: 'Sample log', points: 10, blocks: [tableBlock(minRows)] }]
	};
}

const BLANK = { sample: '', mass: '' };
const WHITESPACE = { sample: '   ', mass: '\t\n' };
const FILLED = { sample: 'B-1', mass: '18.24' };

const html = (spec: AssignmentSpec, values: Record<string, ResponseValue> = {}) =>
	render(SpecRenderer, {
		props: { spec, initialValues: values, readonly: false, uploadEnabled: false }
	}).body;

/** Every `<td class="row-ops">` is one rendered row; the empty-state cell
 *  carries `empty-cell` and is not one. Counting the markup rather than the
 *  values is the point -- this is the frame a browser receives.
 *
 *  MATCHED ON THE `<td>`, NEVER ON THE CLASS ALONE: the header row carries
 *  `row-ops-head`, which every loose spelling of this pattern also matches,
 *  and a counter that is one too high everywhere reads exactly like a correct
 *  one until a fixture happens to have zero rows. */
const renderedRows = (markup: string) => (markup.match(/<td class="row-ops[\s"]/g) ?? []).length;

describe('an untouched table renders no rows at any minRows', () => {
	for (const minRows of [undefined, 0, 1, 3] as const) {
		const name = minRows === undefined ? 'no minRows' : `minRows: ${minRows}`;

		it(`${name}: no rows, and the empty state says what to do`, () => {
			const markup = html(specWith(minRows));

			// POSITIVE CONTROL for the row counter: the table is genuinely in the
			// frame, so a count of 0 is a table with no rows and not a selector
			// that matches nothing.
			expect(markup).toContain('entry-table');
			expect(renderedRows(markup)).toBe(0);
			expect(markup).toContain('No rows yet. Add one below.');
		});

		it(`${name}: one seeded row renders as one row`, () => {
			// The negative control for the same counter, on the same fixture.
			const markup = html(specWith(minRows), { t1: { rows: [FILLED] } });
			expect(renderedRows(markup)).toBe(1);
			expect(markup).not.toContain('No rows yet.');
		});
	}
});

describe('both client gates count FILLED rows, so a blank row is worth nothing', () => {
	const responses = (rows: Record<string, string>[]) =>
		new Map<string, ResponseValue>([['t1', { rows }]]);
	const files = new Map<string, number>();

	it('blockProgress credits filled rows only, blank and whitespace-only alike', () => {
		const block = tableBlock(3);

		// Nothing at all.
		expect(blockProgress(block, new Map(), files)).toEqual({ need: 3, have: 0 });

		// THREE MATERIALISED BLANK ROWS -- exactly what the old `ensureRows`
		// would have put on screen for this table -- still count as zero.
		expect(blockProgress(block, responses([BLANK, BLANK, BLANK]), files)).toEqual({
			need: 3,
			have: 0
		});

		// Whitespace is blank too: `tableRowFilled` trims, and so does the SQL
		// (`btrim(coalesce(kv.value, '')) <> ''`).
		expect(blockProgress(block, responses([WHITESPACE, WHITESPACE]), files)).toEqual({
			need: 3,
			have: 0
		});

		// The positive control on the same block: filled rows DO count, so the
		// three answers above are the predicate working rather than the map
		// never being read.
		expect(blockProgress(block, responses([FILLED, BLANK, FILLED]), files)).toEqual({
			need: 3,
			have: 2
		});
	});

	it('a table with no constraint has nothing to be short of', () => {
		// Absent and 0 are the same answer HERE -- null, no constraint -- which
		// is exactly why they must not have been the same answer in the
		// renderer, where the old arithmetic gave both of them a row.
		expect(blockProgress(tableBlock(undefined), new Map(), files)).toBeNull();
		expect(blockProgress(tableBlock(0), new Map(), files)).toBeNull();
	});

	it('specUnmet reports the table short by its whole minimum when only blanks are there', () => {
		const unmet = specUnmet(specWith(3), responses([BLANK, BLANK, BLANK, BLANK]), files, []);
		expect(unmet).toEqual([
			{ module_id: 'm1', block_id: 't1', kind: 'table', need: 3, have: 0 }
		]);

		// And clears once three rows are genuinely filled -- the control that
		// says the entry above is a real refusal and not a list this function
		// always returns.
		expect(specUnmet(specWith(3), responses([FILLED, FILLED, FILLED]), files, [])).toEqual([]);
	});

	it('tableRowFilled itself is the one predicate, both directions', () => {
		expect(tableRowFilled(BLANK)).toBe(false);
		expect(tableRowFilled(WHITESPACE)).toBe(false);
		expect(tableRowFilled(FILLED)).toBe(true);
		expect(tableRowFilled(null)).toBe(false);
		expect(tableRowFilled(undefined)).toBe(false);
	});
});
