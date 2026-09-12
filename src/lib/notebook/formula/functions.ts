/**
 * The FUNCTION TABLE.
 *
 * THE POINT OF THIS FILE IS THAT ADDING A FUNCTION IS REGISTRATION, NOT
 * SURGERY. Ledger 0187 puts lookup functions out of scope deliberately and Mr.
 * Pina accepted that `VLOOKUP` will not exist on day one, so the obligation
 * this file carries instead is that the day it does exist, it is an entry in
 * `FORMULA_FUNCTIONS` and nothing else moves.
 *
 * TWO DESIGN DECISIONS BUY THAT, AND THEY ARE THE ONLY REASON IT IS TRUE:
 *
 * 1. AN ARGUMENT CARRIES THE RANGE'S SHAPE, not just its values. `rows` and
 *    `cols` are on `FormulaArg` because a lookup is the one family of functions
 *    that needs to know a range is a TABLE rather than a bag: `VLOOKUP` reads
 *    down column 0 and answers from column n. Flattening a range to a plain
 *    list would have been enough for every function below, and would have made
 *    the first lookup a change to the evaluator rather than a change here.
 * 2. ERROR PROPAGATION IS THE TABLE'S RULE, NOT EACH FUNCTION'S. Every entry is
 *    called only after `firstError` has swept its arguments, so no function can
 *    forget, and no NaN can reach a total through one that did. That is ledger
 *    0187's third refusal enforced structurally rather than by discipline.
 *
 *    `IF` IS THE ONE OPT-OUT AND IT HAS TO BE. `IF(A1=0, 0, 10/A1)` is the
 *    ordinary way to guard a division, and under the sweep the untaken branch's
 *    `#DIV/0!` would come back as the answer, which is the exact failure the
 *    formula was written to avoid. So an entry may set
 *    `propagatesArgumentErrors: false` and take responsibility for its own
 *    arguments; `IF` does, and it still returns an error from the TEST or from
 *    the branch it actually takes, which its own tests pin in both directions.
 *
 * WHAT A NEW FUNCTION STILL OWES: a name, an arity, a one-line summary, and a
 * body. What a LOOKUP would owe on top of that is a `#N/A` member in
 * `ERROR_CODES` and its own tests, and nothing else.
 */

import {
	firstError,
	isError,
	makeError,
	numericString,
	toBoolean,
	toNumber,
	finite,
	type FormulaError,
	type FormulaValue
} from './values';

/**
 * One argument as the evaluator resolved it. A scalar is a 1x1 range, which is
 * what lets every function below read `values` without branching.
 */
export interface FormulaArg {
	/** Row-major. `rows * cols === values.length`, always. */
	readonly values: readonly FormulaValue[];
	readonly rows: number;
	readonly cols: number;
	/** False for a scalar. It changes how a non-number is treated, not the shape. */
	readonly isRange: boolean;
}

export interface FormulaFunction {
	readonly name: string;
	readonly minArgs: number;
	/** `Infinity` for a variadic function. */
	readonly maxArgs: number;
	/** One line, student-facing, used by a refusal and by whatever help surface
	 * the grid eventually grows. */
	readonly summary: string;
	/**
	 * Default true: the table refuses the call outright if any argument holds
	 * an error. Set false ONLY where discarding an argument is the function's
	 * whole job (`IF`), and then the entry answers for its own arguments.
	 */
	readonly propagatesArgumentErrors?: boolean;
	readonly call: (args: readonly FormulaArg[]) => FormulaValue;
}

export function scalarArg(arg: FormulaArg, fn: string, which: string): FormulaValue | FormulaError {
	if (arg.isRange && arg.values.length !== 1) {
		return makeError('#VALUE!', `${fn} needs a single cell or value for ${which}, not a range.`);
	}
	return arg.values.length === 0 ? null : arg.values[0];
}

/**
 * Every number the arguments contribute, with the ONE rule a spreadsheet has
 * and which is worth stating because it looks inconsistent until you see why:
 * inside a RANGE, text and TRUE/FALSE are IGNORED (a column of measurements
 * with a heading in it still sums), while a text argument written DIRECTLY is
 * `#VALUE!` (somebody wrote `SUM("apple")` and meant something). Blanks are
 * skipped in both, which is what keeps `COUNT` and `AVERAGE` honest.
 */
function collectNumbers(args: readonly FormulaArg[], fn: string): number[] | FormulaError {
	const out: number[] = [];
	for (const arg of args) {
		for (const value of arg.values) {
			if (isError(value)) return value;
			if (value === null) continue;
			if (typeof value === 'number') {
				out.push(value);
				continue;
			}
			if (arg.isRange) {
				// Text and booleans inside a range are not measurements.
				continue;
			}
			if (typeof value === 'boolean') {
				out.push(value ? 1 : 0);
				continue;
			}
			const parsed = numericString(value);
			if (parsed === null) {
				return makeError('#VALUE!', `${fn} cannot use "${value}", which is not a number.`);
			}
			out.push(parsed);
		}
	}
	return out;
}

/**
 * Half away from zero, which is what a spreadsheet does and what Postgres
 * `round()` does (`CLAUDE.md`, SQL traps). `Math.round` is half toward positive
 * infinity, so it disagrees on every negative tie: `Math.round(-2.5)` is `-2`
 * and `ROUND(-2.5, 0)` is `-3`.
 *
 * The shift is done through the decimal STRING rather than by multiplying by a
 * power of ten, because `2.675 * 100` is `267.49999999999997` and rounds to
 * `2.67`. A value already in exponential form has no string to shift, so that
 * case falls back to the multiplication it cannot avoid.
 */
export function roundHalfAwayFromZero(value: number, digits: number): number {
	if (!Number.isFinite(value)) return value;
	const places = Math.trunc(digits);
	const sign = value < 0 ? -1 : 1;
	const abs = Math.abs(value);
	const text = abs.toString();
	if (text.includes('e') || text.includes('E')) {
		const scale = 10 ** places;
		return (sign * Math.round(abs * scale)) / scale;
	}
	const shifted = Number(`${text}e${places}`);
	if (!Number.isFinite(shifted)) return value;
	const rounded = Math.round(shifted);
	const back = Number(`${rounded}e${-places}`);
	return Number.isFinite(back) ? sign * back : value;
}

const TABLE: readonly FormulaFunction[] = [
	{
		name: 'SUM',
		minArgs: 1,
		maxArgs: Infinity,
		summary: 'Adds up numbers, cells and ranges.',
		call: (args) => {
			const numbers = collectNumbers(args, 'SUM');
			if (isError(numbers)) return numbers;
			let total = 0;
			for (const n of numbers) total += n;
			return finite(total, 'SUM');
		}
	},
	{
		name: 'AVERAGE',
		minArgs: 1,
		maxArgs: Infinity,
		summary: 'The mean of the numbers, ignoring empty cells.',
		call: (args) => {
			const numbers = collectNumbers(args, 'AVERAGE');
			if (isError(numbers)) return numbers;
			if (numbers.length === 0) {
				return makeError('#DIV/0!', 'AVERAGE has no numbers to average.');
			}
			let total = 0;
			for (const n of numbers) total += n;
			return finite(total / numbers.length, 'AVERAGE');
		}
	},
	{
		name: 'MIN',
		minArgs: 1,
		maxArgs: Infinity,
		summary: 'The smallest number. Empty when there are none, which reads as 0.',
		call: (args) => {
			const numbers = collectNumbers(args, 'MIN');
			if (isError(numbers)) return numbers;
			// 0 rather than an error for an empty set, which is what a
			// spreadsheet answers and what a half-filled column needs.
			return numbers.length === 0 ? 0 : Math.min(...numbers);
		}
	},
	{
		name: 'MAX',
		minArgs: 1,
		maxArgs: Infinity,
		summary: 'The largest number. Empty when there are none, which reads as 0.',
		call: (args) => {
			const numbers = collectNumbers(args, 'MAX');
			if (isError(numbers)) return numbers;
			return numbers.length === 0 ? 0 : Math.max(...numbers);
		}
	},
	{
		name: 'COUNT',
		minArgs: 1,
		maxArgs: Infinity,
		summary: 'How many numbers there are. Empty cells and text are not counted.',
		call: (args) => {
			const numbers = collectNumbers(args, 'COUNT');
			if (isError(numbers)) return numbers;
			return numbers.length;
		}
	},
	{
		name: 'ROUND',
		minArgs: 1,
		maxArgs: 2,
		summary: 'Rounds a number to a number of decimal places. Halves round away from zero.',
		call: (args) => {
			const value = scalarArg(args[0], 'ROUND', 'the number');
			if (isError(value)) return value;
			const number = toNumber(value);
			if (isError(number)) return number;
			let places = 0;
			if (args.length > 1) {
				const raw = scalarArg(args[1], 'ROUND', 'the number of places');
				if (isError(raw)) return raw;
				const asNumber = toNumber(raw);
				if (isError(asNumber)) return asNumber;
				places = asNumber;
			}
			return roundHalfAwayFromZero(number, places);
		}
	},
	{
		name: 'ABS',
		minArgs: 1,
		maxArgs: 1,
		summary: 'The size of a number, ignoring its sign.',
		call: (args) => {
			const value = scalarArg(args[0], 'ABS', 'the number');
			if (isError(value)) return value;
			const number = toNumber(value);
			if (isError(number)) return number;
			return Math.abs(number);
		}
	},
	{
		name: 'IF',
		minArgs: 2,
		maxArgs: 3,
		summary: 'Answers one thing when a test is true and another when it is false.',
		propagatesArgumentErrors: false,
		call: (args) => {
			const test = scalarArg(args[0], 'IF', 'the test');
			if (isError(test)) return test;
			const asBoolean = toBoolean(test);
			if (isError(asBoolean)) return asBoolean;
			// Both branches were already evaluated, which costs nothing here
			// because an error is a VALUE: the branch that was not taken is
			// discarded whatever it holds, so `IF(A1=0, 0, 10/A1)` answers 0
			// when A1 is 0 rather than passing the division on. That discard is
			// only reachable because this entry opts out of the table's sweep.
			if (asBoolean) return scalarArg(args[1], 'IF', 'the answer when true');
			// A missing third argument is FALSE, which is what a spreadsheet does.
			if (args.length < 3) return false;
			return scalarArg(args[2], 'IF', 'the answer when false');
		}
	}
];

export const FORMULA_FUNCTIONS: ReadonlyMap<string, FormulaFunction> = new Map(
	TABLE.map((fn) => [fn.name, fn])
);

/** The supported names, sorted, for a refusal message or a help surface. */
export const FORMULA_FUNCTION_NAMES: readonly string[] = TABLE.map((fn) => fn.name).sort();

/**
 * Calls a function by name. Arity, the unknown name and error propagation are
 * all decided HERE rather than inside any entry, which is what makes a new
 * entry a body and a line of metadata.
 */
export function callFunction(
	name: string,
	args: readonly FormulaArg[],
	position: number
): FormulaValue {
	const fn = FORMULA_FUNCTIONS.get(name);
	if (fn === undefined) {
		return makeError(
			'#NAME?',
			`This sheet does not have a function called ${name}, at position ${position}. It knows ${FORMULA_FUNCTION_NAMES.join(', ')}.`,
			{ position }
		);
	}
	if (args.length < fn.minArgs || args.length > fn.maxArgs) {
		const wanted =
			fn.maxArgs === Infinity
				? `at least ${fn.minArgs}`
				: fn.minArgs === fn.maxArgs
					? `${fn.minArgs}`
					: `${fn.minArgs} to ${fn.maxArgs}`;
		return makeError(
			'#VALUE!',
			`${name} needs ${wanted} values and was given ${args.length}, at position ${position}.`,
			{ position }
		);
	}
	if (fn.propagatesArgumentErrors !== false) {
		for (const arg of args) {
			const failed = firstError(arg.values);
			if (failed !== null) return failed;
		}
	}
	return fn.call(args);
}
