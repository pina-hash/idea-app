/**
 * THE SHEET: the dependency graph, the recalculation order, and the cycle.
 *
 * WHAT THE GRAPH BUYS, stated plainly because it is the whole reason this is
 * more than a calculator: a cell recomputes when something it depends on
 * changes, AND NOT OTHERWISE. `lastRecalculated` reports exactly which cells
 * were recomputed by the last write, so "and not otherwise" is a measurement
 * rather than a claim, and a test can read it.
 *
 * THE ORDER IS A DEPTH-FIRST POST-ORDER WITH AN EXPLICIT STACK, and both halves
 * of that are deliberate. Post-order puts a cell's precedents before the cell,
 * which is what makes one pass enough. An EXPLICIT stack rather than recursion
 * is refusal one: a chain a thousand cells long is an ordinary paste and would
 * blow a recursive walk's stack, and a stack overflow is not a cell error, it
 * is a dead note.
 *
 * A CYCLE IS FOUND BY THE SAME WALK AND REPORTED WITH ITS PATH. Colouring a
 * node grey while it is on the stack means meeting a grey node IS the cycle,
 * and the current path is the cycle written out, so the error can say `A1 -> B1
 * -> A1` instead of "circular reference somewhere". Kahn's algorithm would have
 * answered "these cells are in a cycle" and not which order they close in.
 */

import { evaluateNode, type EvalContext } from './evaluate';
import { expandRange } from './references';
import { formulaReferences, isFormulaSource, parseFormula, type FormulaNode } from './parse';
import { normalizeRef } from './references';
import { isError, makeError, numericString, toDisplay, type FormulaValue } from './values';

interface CellState {
	source: string;
	/** The parsed formula, or null for a literal. */
	node: FormulaNode | null;
	/** A literal's value, or a parse error standing in for the formula. */
	fixed: FormulaValue;
	precedents: Set<string>;
	value: FormulaValue;
}

/** What a cell holds when its source is not a formula. */
function literalValue(source: string): FormulaValue {
	if (source === '') return null;
	const asNumber = numericString(source);
	if (asNumber !== null) return asNumber;
	const upper = source.trim().toUpperCase();
	if (upper === 'TRUE') return true;
	if (upper === 'FALSE') return false;
	return source;
}

export class FormulaSheet {
	private readonly cells = new Map<string, CellState>();
	/** key -> the cells that READ key. The reverse of `CellState.precedents`. */
	private readonly dependents = new Map<string, Set<string>>();
	private recalculated: string[] = [];

	constructor(initial?: Readonly<Record<string, string>>) {
		if (initial) this.setCells(initial);
	}

	/**
	 * The cells recomputed by the last write, in the order they were computed.
	 * Precedents come before dependents.
	 */
	get lastRecalculated(): readonly string[] {
		return this.recalculated;
	}

	/** Every cell that has a source, canonically spelled. */
	refs(): string[] {
		return [...this.cells.keys()];
	}

	source(ref: string): string {
		return this.cells.get(this.key(ref))?.source ?? '';
	}

	value(ref: string): FormulaValue {
		return this.cells.get(this.key(ref))?.value ?? null;
	}

	display(ref: string): string {
		return toDisplay(this.value(ref));
	}

	/** Writes one cell and recomputes exactly what that write affects. */
	setCell(ref: string, source: string): void {
		const key = this.key(ref);
		this.write(key, source);
		this.recalculate([key]);
	}

	/** Writes several cells and recomputes ONCE. Loading a stored grid one
	 * `setCell` at a time would recompute the sheet once per cell and would
	 * report a cycle for every forward reference on the way through. */
	setCells(entries: Readonly<Record<string, string>>): void {
		const keys: string[] = [];
		for (const [ref, source] of Object.entries(entries)) {
			const key = this.key(ref);
			this.write(key, source);
			keys.push(key);
		}
		this.recalculate(keys);
	}

	clearCell(ref: string): void {
		this.setCell(ref, '');
	}

	/** Recomputes every cell. For a sheet just loaded, or after a change to the
	 * function table in a test. */
	recalculateAll(): void {
		this.recalculate([...this.cells.keys()]);
	}

	private key(ref: string): string {
		const normalized = normalizeRef(ref);
		if (normalized === null) {
			// A malformed KEY is a caller mistake, not a student's formula, and
			// the two must not be confused: a formula's bad reference is a cell
			// error, while this is an address the grid itself invented.
			throw new RangeError(`${ref} is not a cell reference.`);
		}
		return normalized;
	}

	/** Replaces a cell's source and re-points its edges. No evaluation. */
	private write(key: string, source: string): void {
		const existing = this.cells.get(key);
		if (existing) {
			for (const precedent of existing.precedents) {
				this.dependents.get(precedent)?.delete(key);
			}
		}
		const state: CellState = {
			source,
			node: null,
			fixed: null,
			precedents: new Set(),
			value: null
		};
		if (isFormulaSource(source)) {
			const parsed = parseFormula(source);
			if (isError(parsed)) {
				// Refusal four: the parse error IS the cell's value, and it
				// carries the position. It has no precedents, so nothing
				// downstream waits on a formula that cannot run.
				state.fixed = parsed;
			} else {
				state.node = parsed;
				const { cells, ranges } = formulaReferences(parsed);
				for (const cell of cells) state.precedents.add(cell);
				for (const [from, to] of ranges) {
					const expanded = expandRange(from, to);
					// A range too large to expand is refused at evaluation
					// time by the same call; it contributes no edges, which is
					// right, since it reads nothing it can be recomputed for.
					if (!isError(expanded)) {
						for (const cell of expanded.cells) state.precedents.add(cell);
					}
				}
			}
		} else {
			state.fixed = literalValue(source);
		}
		state.value = state.node === null ? state.fixed : null;
		for (const precedent of state.precedents) {
			let set = this.dependents.get(precedent);
			if (set === undefined) {
				set = new Set();
				this.dependents.set(precedent, set);
			}
			set.add(key);
		}
		this.cells.set(key, state);
	}

	/** Every cell that reads a seed, directly or through a chain. Cycle-safe. */
	private affected(seeds: readonly string[]): Set<string> {
		const dirty = new Set<string>(seeds);
		const queue = [...seeds];
		while (queue.length > 0) {
			const key = queue.pop()!;
			const readers = this.dependents.get(key);
			if (readers === undefined) continue;
			for (const reader of readers) {
				if (dirty.has(reader)) continue;
				dirty.add(reader);
				queue.push(reader);
			}
		}
		return dirty;
	}

	private recalculate(seeds: readonly string[]): void {
		const dirty = this.affected(seeds);
		const colour = new Map<string, number>();
		const cycles = new Map<string, readonly string[]>();
		const order: string[] = [];
		for (const start of dirty) {
			if (colour.get(start) === 2) continue;
			const stack: { key: string; deps: string[]; i: number }[] = [
				{ key: start, deps: this.precedentsOf(start), i: 0 }
			];
			const path: string[] = [start];
			colour.set(start, 1);
			while (stack.length > 0) {
				const top = stack[stack.length - 1];
				if (top.i < top.deps.length) {
					const dep = top.deps[top.i];
					top.i += 1;
					if (!dirty.has(dep)) continue;
					const seen = colour.get(dep);
					if (seen === 2) continue;
					if (seen === 1) {
						// A grey node is on the current path, so the path from
						// it to here, closed on itself, IS the cycle.
						const at = path.indexOf(dep);
						const cycle = [...path.slice(at), dep];
						for (const member of cycle.slice(0, -1)) {
							if (!cycles.has(member)) cycles.set(member, cycle);
						}
						continue;
					}
					colour.set(dep, 1);
					path.push(dep);
					stack.push({ key: dep, deps: this.precedentsOf(dep), i: 0 });
					continue;
				}
				colour.set(top.key, 2);
				order.push(top.key);
				path.pop();
				stack.pop();
			}
		}
		const context: EvalContext = { cell: (ref) => this.cells.get(ref)?.value ?? null };
		for (const key of order) {
			const state = this.cells.get(key);
			if (state === undefined) continue;
			const cycle = cycles.get(key);
			if (cycle !== undefined) {
				state.value = makeError('#CYCLE!', `Circular reference: ${cycle.join(' -> ')}.`, { cycle });
				continue;
			}
			state.value = state.node === null ? state.fixed : evaluateNode(state.node, context);
		}
		this.recalculated = order;
	}

	private precedentsOf(key: string): string[] {
		const state = this.cells.get(key);
		return state === undefined ? [] : [...state.precedents];
	}
}
