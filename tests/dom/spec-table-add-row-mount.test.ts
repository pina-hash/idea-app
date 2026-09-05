// tests/dom/spec-table-add-row-mount.test.ts
//
// PRESSING "Add row" ADDS ONE ROW. That is the whole claim, and it needed a
// DOM because it is about what a PRESS produces, not about what a frame
// renders: `tests/classroom-spec-table-rows.test.ts` is the other half and
// keeps every claim a server render can carry (the empty state's words, the
// gates that read `minRows`).
//
// THE DEFECT THIS PINS. `ensureRows` used to materialise
// `Math.max(block.minRows ?? 0, 1)` blank rows on first touch, and `addRow`
// calls `ensureRows` BEFORE appending -- so the first press on an untouched
// table produced the minimum AND one more. A student pressing a button
// labelled "Add row" on a `minRows: 3` table got four rows; on a table with no
// `minRows` at all they got two. Reported by an instructor as a nuisance; it
// is really a student filling in a blank row that should not exist and then
// wondering whether it counts.
//
// FOUR FIXTURES, NOT ONE, because the old arithmetic was wrong in two
// different ways: `Math.max(0, 1)` made the absent and the zero case identical
// to `minRows: 1`, and a fix verified only against `minRows: 3` is a fix for
// one table. Absent, 0, 1 and 3 are each pressed from empty here.
//
// THE ASSERTION IS THE CONTRACT, NOT THE CURRENT NUMBER: after N presses from
// empty there are N rows, whatever `minRows` says, because `minRows` is a
// completion requirement counted over FILLED rows and never a materialisation
// instruction.
//
// MUTATION-CHECKED: restoring the old `ensureRows` body reddens the first
// three tests here. See this bundle's history entry for the measured counts.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import { mountInto } from './mount';
import type { AssignmentSpec, ResponseValue, TableBlock } from '$lib/classroom/assignment-spec';

const Spec = SpecRenderer as unknown as Component<Record<string, unknown>>;

/** One table block, one module, with whatever `minRows` the case is about.
 *  `minRows: undefined` is written by OMITTING the key, because an explicit
 *  `undefined` and an absent key are not the same thing to `??`. */
function specWith(minRows: number | undefined): AssignmentSpec {
	const block: TableBlock = {
		type: 'table',
		id: 't1',
		columns: [
			{ key: 'sample', label: 'Sample' },
			{ key: 'mass', label: 'Mass (g)' }
		],
		...(minRows === undefined ? {} : { minRows })
	} as TableBlock;
	return {
		schemaVersion: 1,
		meta: { assignmentId: 'add-row-1', title: 'Add row arithmetic', totalPoints: 10 },
		modules: [{ id: 'm1', title: 'Sample log', points: 10, blocks: [block] }]
	};
}

function open(minRows: number | undefined, values: Record<string, ResponseValue> = {}) {
	return mountInto(Spec, {
		spec: specWith(minRows),
		initialValues: values,
		readonly: false,
		uploadEnabled: false
	});
}

/** One `td.row-ops` per RENDERED row, and none on the empty-state cell, so
 *  this counts rows without counting the row that says there are none. */
const rowCount = (m: { all<T extends Element>(s: string): T[] }) => m.all('td.row-ops').length;

const addRow = (m: { all<T extends Element>(s: string): T[]; flush(): void }) => {
	const btn = m
		.all<HTMLButtonElement>('button')
		.find((b) => /add row/i.test(b.textContent ?? ''));
	if (!btn) throw new Error('no Add row control');
	btn.click();
	m.flush();
};

const deleteRow = (m: { all<T extends Element>(s: string): T[]; flush(): void }, index: number) => {
	const btns = m.all<HTMLButtonElement>('td.row-ops button[title="Delete row"]');
	if (!btns[index]) throw new Error(`no delete control at row ${index}`);
	btns[index].click();
	m.flush();
};

describe('Add row adds exactly one row, from every starting minRows', () => {
	/** The four cases, run identically. `minRows: 3` is the reported one; the
	 *  other three are where a fix aimed only at it would have been wrong. */
	for (const minRows of [undefined, 0, 1, 3] as const) {
		const name = minRows === undefined ? 'no minRows' : `minRows: ${minRows}`;

		it(`${name}: an untouched table renders no rows, and the first press makes one`, async () => {
			const m = open(minRows);
			try {
				// THE POSITIVE CONTROL FOR THE COUNT ITSELF: the table is present
				// and genuinely empty, so a later count of 1 cannot be a selector
				// that matches nothing.
				expect(m.all('table.entry-table')).toHaveLength(1);
				expect(rowCount(m)).toBe(0);
				expect(m.all('td.empty-cell')).toHaveLength(1);

				addRow(m);
				expect(rowCount(m)).toBe(1);
				// And the empty state is gone, which is the other half of "one".
				expect(m.all('td.empty-cell')).toHaveLength(0);
			} finally {
				await m.stop();
			}
		});

		it(`${name}: N presses from empty give N rows`, async () => {
			const m = open(minRows);
			try {
				for (let i = 1; i <= 5; i += 1) {
					addRow(m);
					expect(rowCount(m)).toBe(i);
				}
			} finally {
				await m.stop();
			}
		});

		it(`${name}: delete removes one row and the floor is zero`, async () => {
			const m = open(minRows);
			try {
				addRow(m);
				addRow(m);
				addRow(m);
				expect(rowCount(m)).toBe(3);

				// ONE at a time, all the way down. A floor at `minRows` would stop
				// this at 3 for the reported table and strand three blank rows that
				// satisfy no gate.
				deleteRow(m, 0);
				expect(rowCount(m)).toBe(2);
				deleteRow(m, 0);
				expect(rowCount(m)).toBe(1);
				deleteRow(m, 0);
				expect(rowCount(m)).toBe(0);

				// Back to the state the empty cell has words for, and Add still
				// gives one -- the two rules are the same rule read both ways.
				expect(m.all('td.empty-cell')).toHaveLength(1);
				addRow(m);
				expect(rowCount(m)).toBe(1);
			} finally {
				await m.stop();
			}
		});
	}
});

describe('a table that already has rows is untouched by the guard', () => {
	it('seeded rows survive and Add appends exactly one to them', async () => {
		const m = open(3, { t1: { rows: [{ sample: 'B-1', mass: '18.24' }] } });
		try {
			// The seeded row is rendered and its value is intact -- `ensureRows`
			// short-circuits on an existing array rather than overwriting it.
			expect(rowCount(m)).toBe(1);
			expect(m.all<HTMLTextAreaElement>('textarea.cell')[0].value).toBe('B-1');

			addRow(m);
			expect(rowCount(m)).toBe(2);
			expect(m.all<HTMLTextAreaElement>('textarea.cell')[0].value).toBe('B-1');
		} finally {
			await m.stop();
		}
	});

	it('typing into a cell of a table opened empty does not materialise siblings', async () => {
		// `setCell` calls the same guard, and it must not be the thing that
		// decides a count either.
		const m = open(3);
		try {
			addRow(m);
			const cell = m.all<HTMLTextAreaElement>('textarea.cell')[0];
			cell.value = 'B-1';
			cell.dispatchEvent(new Event('input', { bubbles: true }));
			m.flush();

			expect(rowCount(m)).toBe(1);
			expect(m.all<HTMLTextAreaElement>('textarea.cell')[0].value).toBe('B-1');
		} finally {
			await m.stop();
		}
	});
});
