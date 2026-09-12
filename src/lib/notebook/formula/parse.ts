/**
 * The PARSER: tokens in, a tree out, and never a throw.
 *
 * Recursive descent, one function per precedence level, lowest first. The
 * precedence is a SPREADSHEET's and not a programming language's, and the one
 * place they differ is worth stating because it looks like a bug: unary minus
 * binds TIGHTER than `^`, so `-2^2` is `4` here and in Excel, where it is `-4`
 * in most languages. That is why `unary` sits below `power` in this file.
 *
 * A refusal is a `FormulaError` carrying the POSITION of the problem, which is
 * ledger 0187's fourth refusal. Depth is capped rather than trusted: a paste of
 * ten thousand open parentheses is a stack overflow in a recursive-descent
 * parser, and an overflow takes the note down where a refusal does not.
 */

import { tokenize, type Token } from './tokenize';
import { makeError, isError, type FormulaError } from './values';
import { normalizeRef } from './references';

/** Nesting cap. Deep enough that nothing a person writes reaches it, shallow
 * enough that the recursion cannot exhaust the stack. */
export const MAX_DEPTH = 64;

export type BinaryOp = '+' | '-' | '*' | '/' | '^' | '=' | '<>' | '<' | '<=' | '>' | '>=';

export type FormulaNode =
	| { readonly kind: 'number'; readonly value: number }
	| { readonly kind: 'string'; readonly value: string }
	| { readonly kind: 'boolean'; readonly value: boolean }
	| { readonly kind: 'ref'; readonly ref: string; readonly position: number }
	| { readonly kind: 'range'; readonly from: string; readonly to: string; readonly position: number }
	| { readonly kind: 'unary'; readonly op: '+' | '-'; readonly operand: FormulaNode; readonly position: number }
	| {
			readonly kind: 'binary';
			readonly op: BinaryOp;
			readonly left: FormulaNode;
			readonly right: FormulaNode;
			readonly position: number;
	  }
	| {
			readonly kind: 'call';
			readonly name: string;
			readonly args: readonly FormulaNode[];
			readonly position: number;
	  };

/** True when a cell's raw source is a formula rather than a literal. */
export function isFormulaSource(source: string): boolean {
	return source.trimStart().startsWith('=');
}

/**
 * Parses a whole cell source. `=` and everything before it is skipped and the
 * remainder is tokenized with that skip as the OFFSET, so every position in
 * every message indexes the source as written.
 */
export function parseFormula(source: string): FormulaNode | FormulaError {
	const start = source.indexOf('=');
	if (start < 0) return makeError('#PARSE!', 'A formula has to start with =.', { position: 0 });
	const body = source.slice(start + 1);
	const tokens = tokenize(body, start + 1);
	if (isError(tokens)) return tokens;
	if (tokens.length === 1) {
		return makeError('#PARSE!', `The formula is empty after the = at position ${start}.`, { position: start });
	}
	const parser = new Parser(tokens);
	const node = parser.expression(0);
	if (isError(node)) return node;
	const rest = parser.peek();
	if (rest.type !== 'eof') {
		return makeError('#PARSE!', `"${rest.text}" is unexpected here, at position ${rest.position}.`, {
			position: rest.position
		});
	}
	return node;
}

const COMPARISONS: readonly BinaryOp[] = ['=', '<>', '<', '<=', '>', '>='];

class Parser {
	private index = 0;

	constructor(private readonly tokens: readonly Token[]) {}

	peek(): Token {
		return this.tokens[this.index];
	}

	private take(): Token {
		const token = this.tokens[this.index];
		this.index += 1;
		return token;
	}

	private tooDeep(depth: number, at: number): FormulaError | null {
		if (depth <= MAX_DEPTH) return null;
		return makeError('#PARSE!', `The formula is nested too deeply, at position ${at}.`, { position: at });
	}

	expression(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		let left = this.additive(depth + 1);
		if (isError(left)) return left;
		for (;;) {
			const token = this.peek();
			if (token.type !== 'op' || !COMPARISONS.includes(token.text as BinaryOp)) return left;
			this.take();
			const right = this.additive(depth + 1);
			if (isError(right)) return right;
			left = { kind: 'binary', op: token.text as BinaryOp, left, right, position: token.position };
		}
	}

	private additive(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		let left = this.multiplicative(depth + 1);
		if (isError(left)) return left;
		for (;;) {
			const token = this.peek();
			if (token.type !== 'op' || (token.text !== '+' && token.text !== '-')) return left;
			this.take();
			const right = this.multiplicative(depth + 1);
			if (isError(right)) return right;
			left = { kind: 'binary', op: token.text, left, right, position: token.position };
		}
	}

	private multiplicative(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		let left = this.power(depth + 1);
		if (isError(left)) return left;
		for (;;) {
			const token = this.peek();
			if (token.type !== 'op' || (token.text !== '*' && token.text !== '/')) return left;
			this.take();
			const right = this.power(depth + 1);
			if (isError(right)) return right;
			left = { kind: 'binary', op: token.text, left, right, position: token.position };
		}
	}

	/** Right-associative, so `2^3^2` is `2^(3^2)`. */
	private power(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		const left = this.unary(depth + 1);
		if (isError(left)) return left;
		const token = this.peek();
		if (token.type !== 'op' || token.text !== '^') return left;
		this.take();
		const right = this.power(depth + 1);
		if (isError(right)) return right;
		return { kind: 'binary', op: '^', left, right, position: token.position };
	}

	private unary(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		const token = this.peek();
		if (token.type === 'op' && (token.text === '+' || token.text === '-')) {
			this.take();
			const operand = this.unary(depth + 1);
			if (isError(operand)) return operand;
			return { kind: 'unary', op: token.text, operand, position: token.position };
		}
		return this.primary(depth + 1);
	}

	private primary(depth: number): FormulaNode | FormulaError {
		const deep = this.tooDeep(depth, this.peek().position);
		if (deep) return deep;
		const token = this.take();
		if (token.type === 'number') return { kind: 'number', value: Number(token.text) };
		if (token.type === 'string') return { kind: 'string', value: token.text };
		if (token.type === 'lparen') {
			const inner = this.expression(depth + 1);
			if (isError(inner)) return inner;
			const close = this.take();
			if (close.type !== 'rparen') {
				return makeError('#PARSE!', `A ( is never closed, opened at position ${token.position}.`, {
					position: token.position
				});
			}
			return inner;
		}
		if (token.type === 'ref') {
			const from = normalizeRef(token.text);
			if (from === null) {
				return makeError('#REF!', `${token.text} is not a cell on this sheet, at position ${token.position}.`, {
					position: token.position
				});
			}
			if (this.peek().type !== 'colon') return { kind: 'ref', ref: from, position: token.position };
			this.take();
			const end = this.take();
			const to = end.type === 'ref' ? normalizeRef(end.text) : null;
			if (to === null) {
				return makeError('#REF!', `A range needs a cell after the :, at position ${end.position}.`, {
					position: end.position
				});
			}
			return { kind: 'range', from, to, position: token.position };
		}
		if (token.type === 'name') {
			if (this.peek().type !== 'lparen') {
				if (token.text === 'TRUE') return { kind: 'boolean', value: true };
				if (token.text === 'FALSE') return { kind: 'boolean', value: false };
				return makeError('#NAME?', `${token.text} is not something this sheet knows, at position ${token.position}.`, {
					position: token.position
				});
			}
			this.take();
			const args: FormulaNode[] = [];
			if (this.peek().type === 'rparen') {
				this.take();
				return { kind: 'call', name: token.text, args, position: token.position };
			}
			for (;;) {
				const arg = this.expression(depth + 1);
				if (isError(arg)) return arg;
				args.push(arg);
				const next = this.take();
				if (next.type === 'rparen') break;
				if (next.type !== 'comma') {
					return makeError(
						'#PARSE!',
						`${token.text} needs a , or a ) here, at position ${next.position}.`,
						{ position: next.position }
					);
				}
			}
			return { kind: 'call', name: token.text, args, position: token.position };
		}
		if (token.type === 'eof') {
			return makeError('#PARSE!', `The formula stops early, at position ${token.position}.`, {
				position: token.position
			});
		}
		return makeError('#PARSE!', `"${token.text}" is unexpected here, at position ${token.position}.`, {
			position: token.position
		});
	}
}

/**
 * Every cell a tree reads, as canonical keys. THIS IS WHAT THE DEPENDENCY GRAPH
 * IS BUILT FROM, so it walks the tree rather than re-scanning the text: a
 * regex over the source would find `A1` inside the string `"see A1"` and add an
 * edge to a cell the formula never reads.
 */
export function formulaReferences(node: FormulaNode): { cells: string[]; ranges: [string, string][] } {
	const cells: string[] = [];
	const ranges: [string, string][] = [];
	const stack: FormulaNode[] = [node];
	while (stack.length > 0) {
		const current = stack.pop()!;
		switch (current.kind) {
			case 'ref':
				cells.push(current.ref);
				break;
			case 'range':
				ranges.push([current.from, current.to]);
				break;
			case 'unary':
				stack.push(current.operand);
				break;
			case 'binary':
				stack.push(current.left, current.right);
				break;
			case 'call':
				for (const arg of current.args) stack.push(arg);
				break;
			default:
				break;
		}
	}
	return { cells, ranges };
}
