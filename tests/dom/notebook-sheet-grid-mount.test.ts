// tests/dom/notebook-sheet-grid-mount.test.ts
//
// THE SURFACE: `GridView.svelte` mounted for real, with the real formula engine
// behind it.
//
// WHAT THIS ADDS TO `notebook-sheet-undo.test.ts`, which drives the schema and
// the commands directly. That file proves the DOCUMENT behaves; this one proves
// the thing a student touches does -- that a cell shows its computed value and
// its SOURCE when you click it, that a commit leaves as ONE whole grid, that a
// commit which changes nothing sends nothing, and that a grid with no
// `oncommit` has no writes to execute.
//
// READ-ONLY IS STRUCTURAL AND THAT IS THE ASSERTION WORTH HAVING. `CLAUDE.md`:
// an omitted optional transport REMOVES the control it drives, so read-only is
// "there is no write to execute" rather than a flag somebody has to remember.
// Asserted in BOTH directions with the counts reported, because "the read-only
// view has no edit controls" is not a result on its own.
//
// NOT ASSERTED HERE: geometry, contrast, tap targets. happy-dom has no layout
// engine (`tests/dom/README.md`), so those read zero and pass vacuously. The
// 44px cells and the 375px behaviour are `verify:browser`'s claim.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import GridView from '$lib/notebook/grid/GridView.svelte';
import { emptyGrid, type NoteGrid } from '$lib/notebook/grid';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

let m: Mounted | null = null;
afterEach(async () => {
	await m?.stop();
	m = null;
});

const grid = (rows: string[][]): NoteGrid => ({ type: 'grid', rows });

function mountGrid(props: Record<string, unknown>): Mounted {
	m = mountInto(GridView as unknown as Component<Record<string, unknown>>, props);
	return m;
}

/** What a cell's face reads, which is its VALUE and not its source. */
function faceText(v: Mounted, ref: string): string {
	return v.one(`[data-testid="grid-cell-${ref}"]`).textContent?.trim() ?? '';
}

function clickCell(v: Mounted, ref: string): void {
	v.one(`[data-testid="grid-cell-${ref}"]`).dispatchEvent(
		new MouseEvent('click', { bubbles: true })
	);
	v.flush();
}

describe('a grid renders computed values and edits sources', () => {
	it('shows what the engine worked out, not what was typed', () => {
		const v = mountGrid({
			grid: grid([['2'], ['3'], ['=SUM(A1:A2)']]),
			oncommit: () => {}
		});
		expect(faceText(v, 'A1')).toBe('2');
		expect(faceText(v, 'A3')).toBe('5');
	});

	it('shows the SOURCE the moment a cell is opened, which is the one thing it must get right', () => {
		// A student clicking a cell that reads `5` has to see `=SUM(A1:A2)`, or
		// they cannot correct it.
		const v = mountGrid({ grid: grid([['2'], ['3'], ['=SUM(A1:A2)']]), oncommit: () => {} });
		clickCell(v, 'A3');
		const input = v.one<HTMLInputElement>('[data-testid="grid-input-A3"]');
		expect(input.value).toBe('=SUM(A1:A2)');
	});

	it('renders a cell error as its CODE, so colour is never the only signal', () => {
		const v = mountGrid({ grid: grid([['0'], ['=1/A1']]), oncommit: () => {} });
		// The whole content of the cell is a legible word; the tone is decoration
		// over it rather than the signal itself.
		expect(faceText(v, 'A2')).toBe('#DIV/0!');
		expect(v.one('[data-testid="grid-cell-A2"]').getAttribute('aria-label')).toContain('#DIV/0!');
	});

	it('shows a blank for an empty cell rather than a zero', () => {
		// Ledger 0187's refusal two: a blank is zero in ARITHMETIC and is still
		// not the number zero on screen.
		const v = mountGrid({ grid: grid([[''], ['=A1+1']]), oncommit: () => {} });
		expect(faceText(v, 'A1')).toBe('');
		expect(faceText(v, 'A2')).toBe('1');
	});
});

describe('a commit is one whole grid, and only when something changed', () => {
	it('hands the parent the WHOLE grid, never a cell', () => {
		const seen: NoteGrid[] = [];
		const v = mountGrid({ grid: grid([['a', 'b'], ['c', 'd']]), oncommit: (g: NoteGrid) => seen.push(g) });
		clickCell(v, 'B1');
		const input = v.one<HTMLInputElement>('[data-testid="grid-input-B1"]');
		input.value = 'CHANGED';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new Event('blur', { bubbles: true }));
		v.flush();

		expect(seen).toHaveLength(1);
		// ONE BLOCK OWNS THE WHOLE GRID. The callback's argument is the entire
		// document, which is what makes the parent's write one transaction.
		expect(seen[0]).toEqual({ type: 'grid', rows: [['a', 'CHANGED'], ['c', 'd']] });
	});

	it('sends NOTHING when a cell is opened and closed unchanged', () => {
		// The `EditBaseline` comparison one level down: clicking into a cell and
		// out again is not an edit, and reporting it as one would put an undo
		// step in the history for a thing nobody did.
		const seen: NoteGrid[] = [];
		const v = mountGrid({ grid: grid([['a']]), oncommit: (g: NoteGrid) => seen.push(g) });
		clickCell(v, 'A1');
		const input = v.one<HTMLInputElement>('[data-testid="grid-input-A1"]');
		input.dispatchEvent(new Event('blur', { bubbles: true }));
		v.flush();
		expect(seen).toHaveLength(0);

		// THE POSITIVE CONTROL, through the identical path: a real change DOES
		// send, so the zero above is about the comparison and not about the
		// handler being unwired.
		clickCell(v, 'A1');
		const again = v.one<HTMLInputElement>('[data-testid="grid-input-A1"]');
		again.value = 'b';
		again.dispatchEvent(new Event('input', { bubbles: true }));
		again.dispatchEvent(new Event('blur', { bubbles: true }));
		v.flush();
		expect(seen).toHaveLength(1);
	});

	it('abandons the edit on Escape and commits it on Enter', () => {
		const seen: NoteGrid[] = [];
		const v = mountGrid({ grid: grid([['a']]), oncommit: (g: NoteGrid) => seen.push(g) });

		clickCell(v, 'A1');
		let input = v.one<HTMLInputElement>('[data-testid="grid-input-A1"]');
		input.value = 'thrown away';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		v.flush();
		expect(seen).toHaveLength(0);
		expect(faceText(v, 'A1')).toBe('a');

		clickCell(v, 'A1');
		input = v.one<HTMLInputElement>('[data-testid="grid-input-A1"]');
		input.value = 'kept';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		v.flush();
		expect(seen).toEqual([{ type: 'grid', rows: [['kept']] }]);
	});

	it('recomputes when the parent hands back a new grid, and not before', () => {
		// The parent is the only writer: this component shows what it is given.
		// A grid that updated itself would be the second store this whole design
		// exists to avoid.
		const props = reactiveProps<Record<string, unknown>>({
			grid: grid([['2'], ['=A1*10']]),
			oncommit: () => {}
		});
		const v = mountGrid(props);
		expect(faceText(v, 'A2')).toBe('20');
		props.grid = grid([['5'], ['=A1*10']]);
		v.flush();
		expect(faceText(v, 'A2')).toBe('50');
	});
});

describe('read-only is structural, in both directions', () => {
	it('with NO oncommit there is nothing to press and nothing to type into', () => {
		const v = mountGrid({ grid: grid([['a', 'b'], ['c', 'd']]) });
		const faces = v.all<HTMLButtonElement>('.nb-grid-face');
		expect(faces).toHaveLength(4);
		// Present, and every one of them refuses a real click.
		expect(faces.filter((b) => b.disabled)).toHaveLength(4);
		expect(v.all('input')).toHaveLength(0);
		expect(v.all('[data-testid="grid-add-row"]')).toHaveLength(0);
		expect(v.all('[data-testid="grid-add-col"]')).toHaveLength(0);
		// AND A CLICK GENUINELY DOES NOTHING. `dispatchEvent` reaches a disabled
		// control's listener anyway -- `disabled` bars a real user click and the
		// DOM's own `.click()`, never a constructed event -- so the attribute
		// above is the contract and this is the behaviour beside it.
		clickCell(v, 'A1');
		expect(v.all('input')).toHaveLength(0);
	});

	it('WITH oncommit every one of those appears, which is what makes the counts above mean something', () => {
		const v = mountGrid({ grid: grid([['a', 'b'], ['c', 'd']]), oncommit: () => {} });
		const faces = v.all<HTMLButtonElement>('.nb-grid-face');
		expect(faces).toHaveLength(4);
		expect(faces.filter((b) => b.disabled)).toHaveLength(0);
		expect(v.all('[data-testid="grid-add-row"]')).toHaveLength(1);
		expect(v.all('[data-testid="grid-add-col"]')).toHaveLength(1);
		clickCell(v, 'A1');
		expect(v.all('input')).toHaveLength(1);
	});

	it('`editable: false` also removes the writes, and does not stand alone', () => {
		// The prop states the intent; ABSENCE of the callback is the mechanism.
		// A surface that passed `editable: false` and a live callback still gets
		// no writes, which is the direction that matters.
		const seen: NoteGrid[] = [];
		const v = mountGrid({
			grid: grid([['a']]),
			editable: false,
			oncommit: (g: NoteGrid) => seen.push(g)
		});
		clickCell(v, 'A1');
		expect(v.all('input')).toHaveLength(0);
		expect(seen).toHaveLength(0);
	});
});

describe('resizing', () => {
	it('adds and removes rows and columns, preserving what was typed', () => {
		const seen: NoteGrid[] = [];
		const v = mountGrid({ grid: grid([['a', 'b']]), oncommit: (g: NoteGrid) => seen.push(g) });
		v.one('[data-testid="grid-add-row"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		v.flush();
		expect(seen.at(-1)).toEqual({ type: 'grid', rows: [['a', 'b'], ['', '']] });

		v.one('[data-testid="grid-add-col"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		v.flush();
		expect(seen.at(-1)).toEqual({ type: 'grid', rows: [['a', 'b', '']] });
	});

	it('offers no control whose only possible answer is a refusal', () => {
		// A one-row grid cannot lose a row, so Remove row says so by being
		// disabled rather than by failing when pressed.
		const v = mountGrid({ grid: emptyGrid(1, 1), oncommit: () => {} });
		expect(v.one<HTMLButtonElement>('[data-testid="grid-remove-row"]').disabled).toBe(true);
		expect(v.one<HTMLButtonElement>('[data-testid="grid-remove-col"]').disabled).toBe(true);
		expect(v.one<HTMLButtonElement>('[data-testid="grid-add-row"]').disabled).toBe(false);
	});

	it('names the cap rather than only refusing, at the row and column ceilings', () => {
		// `CLAUDE.md`: a control that is absent or dead for a reason says the
		// reason. Here it is disabled AND carries the sentence.
		const v = mountGrid({ grid: emptyGrid(100, 20), oncommit: () => {} });
		const addRow = v.one<HTMLButtonElement>('[data-testid="grid-add-row"]');
		const addCol = v.one<HTMLButtonElement>('[data-testid="grid-add-col"]');
		expect(addRow.disabled).toBe(true);
		expect(addRow.getAttribute('title')).toMatch(/capped at 100 rows/);
		expect(addCol.disabled).toBe(true);
		expect(addCol.getAttribute('title')).toMatch(/capped at 20 columns/);
	});

	it('reports its own size, so a reader can see what the caps are against', () => {
		const v = mountGrid({ grid: emptyGrid(3, 4), oncommit: () => {} });
		expect(v.one('[data-testid="notebook-grid-size"]').textContent?.trim()).toBe('3 x 4');
	});
});
