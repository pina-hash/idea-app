/**
 * EVALUATION of one parsed formula against a source of cell values.
 *
 * It knows nothing about the dependency graph, the recalculation order or what
 * a cell's source text is: it asks `EvalContext.cell` for a value and gets one.
 * That is what lets the cycle detection live entirely in `sheet.ts` and what
 * makes every rule below assertable against a plain object.
 *
 * REFUSALS TWO AND THREE LIVE HERE. An empty cell is zero in arithmetic
 * (`toNumber(null)`), and division by zero is a `#DIV/0!` VALUE that flows
 * through `+` and into `SUM` by the ordinary rules, so no NaN can reach a
 * total. Both are checked against the real evaluator rather than argued for.
 */

import { expandRange } from './references';
import { callFunction, type FormulaArg } from './functions';
import type { FormulaNode } from './parse';
import {
	finite,
	isError,
	makeError,
	toNumber,
	type FormulaError,
	type FormulaValue
} from './values';

export interface EvalContext {
	/** The value of one cell. `null` when it is empty, an error when it holds
	 * one. Never throws: an unknown cell is empty. */
	cell(ref: string): FormulaValue;
}

/** number < text < TRUE/FALSE, which is a spreadsheet's ordering across types. */
function typeRank(value: Exclude<FormulaValue, FormulaError>): number {
	if (typeof value === 'number') return 0;
	if (typeof value === 'string') return 1;
	return 2;
}

/**
 * A blank compared against something takes that thing's idea of empty: 0
 * against a number, "" against text, FALSE against TRUE/FALSE. Two blanks are
 * equal. This is why `=A1=0` is TRUE for an empty A1, which is the answer a
 * student expects and the one that agrees with the arithmetic rule above it.
 */
function fillBlank(
	value: FormulaValue,
	other: FormulaValue
): Exclude<FormulaValue, FormulaError | null> {
	if (value !== null) return value as Exclude<FormulaValue, FormulaError | null>;
	if (typeof other === 'string') return '';
	if (typeof other === 'boolean') return false;
	return 0;
}

function compare(op: string, rawLeft: FormulaValue, rawRight: FormulaValue): FormulaValue {
	const left = fillBlank(rawLeft, rawRight);
	const right = fillBlank(rawRight, rawLeft);
	const leftRank = typeRank(left);
	const rightRank = typeRank(right);
	let ordering: number;
	if (leftRank !== rightRank) {
		ordering = leftRank < rightRank ? -1 : 1;
	} else if (typeof left === 'string' && typeof right === 'string') {
		// Case-insensitive, as a spreadsheet compares text.
		const a = left.toUpperCase();
		const b = right.toUpperCase();
		ordering = a === b ? 0 : a < b ? -1 : 1;
	} else {
		const a = typeof left === 'boolean' ? (left ? 1 : 0) : (left as number);
		const b = typeof right === 'boolean' ? (right ? 1 : 0) : (right as number);
		ordering = a === b ? 0 : a < b ? -1 : 1;
	}
	switch (op) {
		case '=':
			return ordering === 0;
		case '<>':
			return ordering !== 0;
		case '<':
			return ordering < 0;
		case '<=':
			return ordering <= 0;
		case '>':
			return ordering > 0;
		default:
			return ordering >= 0;
	}
}

function arithmetic(op: string, left: number, right: number, position: number): FormulaValue {
	switch (op) {
		case '+':
			return finite(left + right, 'That addition');
		case '-':
			return finite(left - right, 'That subtraction');
		case '*':
			return finite(left * right, 'That multiplication');
		case '/':
			// Refusal three. A value, never a throw, and never Infinity.
			if (right === 0) {
				return makeError('#DIV/0!', `Dividing by zero, at position ${position}.`, { position });
			}
			return finite(left / right, 'That division');
		default:
			return finite(left ** right, 'That power');
	}
}

/** One argument to a function call, with a range's SHAPE preserved. */
export function evaluateArg(node: FormulaNode, ctx: EvalContext): FormulaArg | FormulaError {
	if (node.kind === 'range') {
		const expanded = expandRange(node.from, node.to);
		if (isError(expanded)) return expanded;
		return {
			values: expanded.cells.map((ref) => ctx.cell(ref)),
			rows: expanded.rows,
			cols: expanded.cols,
			isRange: true
		};
	}
	const value = evaluateNode(node, ctx);
	return { values: [value], rows: 1, cols: 1, isRange: false };
}

export function evaluateNode(node: FormulaNode, ctx: EvalContext): FormulaValue {
	switch (node.kind) {
		case 'number':
			return node.value;
		case 'string':
			return node.value;
		case 'boolean':
			return node.value;
		case 'ref':
			return ctx.cell(node.ref);
		case 'range':
			// A range is only meaningful as an argument. Standing alone it is a
			// refusal rather than a silent pick of one corner, which is the
			// implicit-intersection behaviour that makes spreadsheets confusing.
			return makeError(
				'#VALUE!',
				`${node.from}:${node.to} is a range, so it has to go inside a function like SUM, at position ${node.position}.`,
				{ position: node.position }
			);
		case 'unary': {
			const operand = evaluateNode(node.operand, ctx);
			const number = toNumber(operand);
			if (isError(number)) return number;
			return node.op === '-' ? -number : number;
		}
		case 'binary': {
			const left = evaluateNode(node.left, ctx);
			if (isError(left)) return left;
			const right = evaluateNode(node.right, ctx);
			if (isError(right)) return right;
			if (node.op === '=' || node.op === '<>' || node.op === '<' || node.op === '<=' || node.op === '>' || node.op === '>=') {
				return compare(node.op, left, right);
			}
			const a = toNumber(left);
			if (isError(a)) return a;
			const b = toNumber(right);
			if (isError(b)) return b;
			return arithmetic(node.op, a, b, node.position);
		}
		default: {
			const args: FormulaArg[] = [];
			for (const arg of node.args) {
				const resolved = evaluateArg(arg, ctx);
				if (isError(resolved)) return resolved;
				args.push(resolved);
			}
			return callFunction(node.name, args, node.position);
		}
	}
}
