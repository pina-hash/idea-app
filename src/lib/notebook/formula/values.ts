/**
 * The VALUE MODEL every other module in this directory speaks.
 *
 * Plain data + pure functions only (the `rich-text-doc.ts` / `track-runtime.ts`
 * convention): no Svelte, no Supabase, no `$lib/server`, no DOM. The whole
 * point of this engine is that it is assertable in a node test.
 *
 * AN ERROR IS A VALUE, NEVER A THROW. That is the single decision the rest of
 * the engine is built on, and it is what ledger 0187's third refusal asks for:
 * division by zero must be a CELL error and must never let NaN leak into a
 * total. A thrown exception would have to be caught at every aggregation
 * boundary and one missed catch takes the whole note down; a value propagates
 * by the ordinary rules and `SUM` refuses it in one place (`firstError`).
 *
 * NaN IS NEVER A VALUE HERE. Every arithmetic path either produces a finite
 * number or a `FormulaError`, because a NaN is an error that renders as a
 * plausible-looking blank and adds itself into totals silently. `#NUM!` is the
 * code for a result that is not a finite number, and it is reachable (`9^999`),
 * which is why it is in the union rather than reserved.
 */

/**
 * Every error this engine can produce. It is a CLOSED list on purpose: a code
 * is here because something emits it, so a reader can find the producer. The
 * one a lookup function would add is `#N/A`, and adding it is a member here
 * plus a return in that function's own entry (see `functions.ts`).
 */
export const ERROR_CODES = [
	'#DIV/0!',
	'#VALUE!',
	'#NAME?',
	'#REF!',
	'#NUM!',
	'#CYCLE!',
	'#PARSE!'
] as const;

export type FormulaErrorCode = (typeof ERROR_CODES)[number];

/**
 * A cell error. `message` is student-facing and CARRIES ITS OWN LOCATION where
 * it has one, which is the same rule `$lib/foundry/preflight.ts` follows: a
 * surface that prints a position chip beside a sentence that already contains
 * the position prints it twice. `position` is kept as a field as well so a
 * caret can be drawn without re-parsing the sentence.
 */
export interface FormulaError {
	readonly kind: 'error';
	readonly code: FormulaErrorCode;
	readonly message: string;
	/** 0-based index into the cell's own source text, `=` included. */
	readonly position?: number;
	/** For `#CYCLE!`: the cells on the cycle, in order, closing on itself. */
	readonly cycle?: readonly string[];
}

/**
 * What a cell holds. `null` is EMPTY, and it is a distinct value rather than
 * the number zero: ledger 0187's second refusal says an empty cell is zero in
 * ARITHMETIC, which is a coercion rule (`toNumber`), not a storage claim.
 * `COUNT` and `AVERAGE` have to be able to tell a blank from a zero.
 */
export type FormulaValue = number | string | boolean | null | FormulaError;

/**
 * GENERIC ON PURPOSE, because half the engine returns `T | FormulaError` rather
 * than a `FormulaValue`: a tokenizer returns `Token[] | FormulaError`, a parser
 * `FormulaNode | FormulaError`, a range expansion `ExpandedRange | FormulaError`.
 * One guard over all of them is what lets every caller write the same two lines
 * and get the success type narrowed in the else branch; a second predicate per
 * union is four spellings of "did this refuse".
 */
export function isError<T>(value: T | FormulaError): value is FormulaError {
	return typeof value === 'object' && value !== null && (value as FormulaError).kind === 'error';
}

export function makeError(
	code: FormulaErrorCode,
	message: string,
	extra?: { position?: number; cycle?: readonly string[] }
): FormulaError {
	return {
		kind: 'error',
		code,
		message,
		...(extra?.position === undefined ? {} : { position: extra.position }),
		...(extra?.cycle === undefined ? {} : { cycle: extra.cycle })
	};
}

/** The first error among some values, or null. One implementation, so no
 * aggregation path can forget to propagate. */
export function firstError(values: readonly FormulaValue[]): FormulaError | null {
	for (const value of values) if (isError(value)) return value;
	return null;
}

/** True when a string is a number the way a spreadsheet reads one. Rejects the
 * empty string, whitespace and `NaN`/`Infinity` spellings, all of which
 * `Number()` accepts or turns into something surprising. */
export function numericString(text: string): number | null {
	const trimmed = text.trim();
	if (trimmed === '') return null;
	if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(trimmed)) return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/**
 * Numeric coercion, and the home of refusal two: an EMPTY CELL IS ZERO. A
 * boolean is 1/0 and a numeric string is its number, both as a spreadsheet
 * does; anything else is `#VALUE!`.
 */
export function toNumber(value: FormulaValue): number | FormulaError {
	if (isError(value)) return value;
	if (value === null) return 0;
	if (typeof value === 'number') return value;
	if (typeof value === 'boolean') return value ? 1 : 0;
	const parsed = numericString(value);
	if (parsed === null) {
		return makeError('#VALUE!', `"${value}" is not a number, so it cannot be used in a calculation.`);
	}
	return parsed;
}

export function toBoolean(value: FormulaValue): boolean | FormulaError {
	if (isError(value)) return value;
	if (value === null) return false;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	const upper = value.trim().toUpperCase();
	if (upper === 'TRUE') return true;
	if (upper === 'FALSE') return false;
	return makeError('#VALUE!', `"${value}" is not TRUE or FALSE.`);
}

/** Guards every arithmetic result. A non-finite number never becomes a value. */
export function finite(value: number, what: string): number | FormulaError {
	if (!Number.isFinite(value)) {
		return makeError('#NUM!', `${what} produced a number too large to work with.`);
	}
	return value;
}

/**
 * Significant digits a displayed number is cut back to. Fifteen is a
 * spreadsheet's own figure and it is the point of this: `33.19 + 2.90` is
 * `36.089999999999996` in IEEE-754, and a cost column that shows that is a
 * spreadsheet a student stops trusting.
 */
export const DISPLAY_PRECISION = 15;

/**
 * What a cell shows. An empty cell shows nothing, an error shows its CODE (the
 * message belongs in a tooltip or a problem list, not in a grid cell), and a
 * number is cut to `DISPLAY_PRECISION`.
 *
 * THE CUT IS ON THE DISPLAY AND NEVER ON THE VALUE, which is the whole
 * decision. Rounding the stored value would make every chained calculation
 * lossy in a way nothing reports; rounding what is drawn leaves the arithmetic
 * exact and fixes the one place the representation leaks.
 */
export function toDisplay(value: FormulaValue): string {
	if (isError(value)) return value.code;
	if (value === null) return '';
	if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
	if (typeof value === 'number' && Number.isFinite(value) && !Number.isInteger(value)) {
		return String(Number(value.toPrecision(DISPLAY_PRECISION)));
	}
	return String(value);
}
