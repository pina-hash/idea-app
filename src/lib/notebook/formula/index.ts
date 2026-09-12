/**
 * The notebook's scoped formula evaluator.
 *
 * A tokenizer, a recursive-descent parser, a dependency graph with topological
 * recalculation, and a named function table. Pure TypeScript, no DOM, no
 * Svelte, NO DEPENDENCY: decision 08 (2026-09-12) chose a scoped engine over
 * HyperFormula, whose licence is GPL-3.0-only against a genuinely public
 * repository, and over three MIT packages that are either a function library
 * with no parser or unmaintained since 2020 and 2017.
 *
 * THE ENGINE ONLY. Nothing here stores anything, renders anything or knows what
 * a note is: `_notebook_note_content_ok` refuses a `sheet` block outright
 * (measured by ledger 0180 against PostgreSQL 17.10), so the surface is blocked
 * behind a migration that widens the gate in its own bundle. This ships ahead
 * of it because the engine does not depend on the gate.
 */

export {
	ERROR_CODES,
	DISPLAY_PRECISION,
	isError,
	makeError,
	toDisplay,
	toNumber,
	toBoolean,
	type FormulaError,
	type FormulaErrorCode,
	type FormulaValue
} from './values';
export {
	MAX_COLUMN,
	MAX_ROW,
	MAX_RANGE_CELLS,
	columnLabel,
	columnIndex,
	parseCellRef,
	formatCellRef,
	normalizeRef,
	expandRange,
	type CellAddress
} from './references';
export { tokenize, type Token, type TokenType } from './tokenize';
export {
	MAX_DEPTH,
	isFormulaSource,
	parseFormula,
	formulaReferences,
	type BinaryOp,
	type FormulaNode
} from './parse';
export {
	FORMULA_FUNCTIONS,
	FORMULA_FUNCTION_NAMES,
	callFunction,
	roundHalfAwayFromZero,
	type FormulaArg,
	type FormulaFunction
} from './functions';
export { evaluateNode, evaluateArg, type EvalContext } from './evaluate';
export { FormulaSheet } from './sheet';
