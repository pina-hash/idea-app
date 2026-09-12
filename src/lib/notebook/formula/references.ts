/**
 * A1 NOTATION, in one place.
 *
 * Two representations and one translation between them: the string a student
 * types (`B7`) and the `{ row, col }` pair the dependency graph and the range
 * expansion need. Both are 0-BASED internally and 1-based on the way out,
 * because every off-by-one in a spreadsheet is this conversion written twice.
 *
 * A REFERENCE IS CANONICALISED THE MOMENT IT IS PARSED. `b7`, `B7` and `B07`
 * are one cell, so they must be ONE KEY in the graph: two spellings of a key is
 * a cell that depends on itself under one name and not the other, which is a
 * recalculation that silently never fires. `normalizeRef` is that single
 * spelling and nothing downstream stores a raw token.
 *
 * `$A$1` IS REFUSED RATHER THAN ACCEPTED AND IGNORED. The dollar signs mean
 * something only once a grid can copy a formula from one cell to another, which
 * this engine does not do; accepting them silently would make `$A$1` and `A1`
 * behave identically today and differently the day fill lands, in stored notes
 * nobody would think to re-check. The tokenizer therefore names them in its
 * refusal (`tokenize.ts`).
 */

import { makeError, type FormulaError } from './values';

/** Excel's own ceilings, so a reference that is legal there is legal here. */
export const MAX_COLUMN = 16384;
export const MAX_ROW = 1048576;

/**
 * The cap on how many cells ONE range may cover. A note's grid is small; a
 * formula reading `A1:XFD1048576` is a mistake or a paste, and expanding it
 * would allocate seventeen billion keys before anything could refuse it. The
 * limit is on the RANGE rather than on the sheet so the refusal names the thing
 * the student wrote.
 */
export const MAX_RANGE_CELLS = 20000;

export interface CellAddress {
	/** 0-based. */
	readonly row: number;
	/** 0-based. */
	readonly col: number;
}

/** `0` -> `A`, `25` -> `Z`, `26` -> `AA`. Bijective base-26, which is why the
 * loop subtracts one before taking the remainder. */
export function columnLabel(col: number): string {
	let label = '';
	let n = col;
	while (n >= 0) {
		label = String.fromCharCode(65 + (n % 26)) + label;
		n = Math.floor(n / 26) - 1;
	}
	return label;
}

/** `A` -> `0`. Returns null for anything that is not letters. */
export function columnIndex(label: string): number | null {
	if (!/^[A-Za-z]+$/.test(label)) return null;
	let n = 0;
	for (const ch of label.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n - 1;
}

/** Parses `B7` into an address. Null for anything malformed or out of range. */
export function parseCellRef(text: string): CellAddress | null {
	const match = /^([A-Za-z]{1,3})(\d{1,7})$/.exec(text);
	if (!match) return null;
	const col = columnIndex(match[1]);
	const row = Number(match[2]) - 1;
	if (col === null || col >= MAX_COLUMN) return null;
	if (row < 0 || row >= MAX_ROW) return null;
	return { row, col };
}

export function formatCellRef(address: CellAddress): string {
	return `${columnLabel(address.col)}${address.row + 1}`;
}

/** The one canonical spelling of a reference. Null when it is not one. */
export function normalizeRef(text: string): string | null {
	const address = parseCellRef(text);
	return address === null ? null : formatCellRef(address);
}

export interface ExpandedRange {
	/** Row-major, which is the order a lookup function would need. */
	readonly cells: readonly string[];
	readonly rows: number;
	readonly cols: number;
}

/**
 * Every cell in `from:to`, row-major. The corners are normalised in both
 * directions, so `B7:A1` and `A1:B7` are the same range: a student dragging a
 * selection upwards writes the first one and a spreadsheet that refused it
 * would be refusing a correct formula.
 */
export function expandRange(from: string, to: string): ExpandedRange | FormulaError {
	const a = parseCellRef(from);
	const b = parseCellRef(to);
	if (a === null || b === null) {
		return makeError('#REF!', `${a === null ? from : to} is not a cell reference.`);
	}
	const top = Math.min(a.row, b.row);
	const bottom = Math.max(a.row, b.row);
	const left = Math.min(a.col, b.col);
	const right = Math.max(a.col, b.col);
	const rows = bottom - top + 1;
	const cols = right - left + 1;
	if (rows * cols > MAX_RANGE_CELLS) {
		return makeError(
			'#REF!',
			`${from}:${to} covers ${rows * cols} cells, and the limit for one range is ${MAX_RANGE_CELLS}.`
		);
	}
	const cells: string[] = [];
	for (let row = top; row <= bottom; row += 1) {
		for (let col = left; col <= right; col += 1) cells.push(formatCellRef({ row, col }));
	}
	return { cells, rows, cols };
}
