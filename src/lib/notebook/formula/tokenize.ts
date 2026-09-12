/**
 * The TOKENIZER.
 *
 * THE OFFSET IS A PARAMETER, NOT A SECOND TOKENIZER, and that is the same rule
 * `scanJs` follows for an inline `<script>` block in `$lib/foundry/preflight.ts`:
 * a caller that corrected only the reported field and not the sentence would
 * leave a student reading one number and looking at another. A cell's source is
 * `=A1+2`, and the parser is handed the text AFTER the `=` with `offset` 1, so
 * every position this file reports indexes the source the student actually sees.
 */

import { makeError, numericString, type FormulaError } from './values';

export type TokenType =
	| 'number'
	| 'string'
	| 'name'
	| 'ref'
	| 'op'
	| 'lparen'
	| 'rparen'
	| 'comma'
	| 'colon'
	| 'eof';

export interface Token {
	readonly type: TokenType;
	/** The token as written, uppercased for `name` and `ref`. */
	readonly text: string;
	/** 0-based index into the CELL SOURCE, not into the slice scanned. */
	readonly position: number;
}

/** Longest first, so `<=` is never read as `<` then `=`. */
const OPERATORS = ['<=', '>=', '<>', '+', '-', '*', '/', '^', '=', '<', '>'] as const;

export function tokenize(source: string, offset = 0): Token[] | FormulaError {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source[i];
		const at = i + offset;
		if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
			i += 1;
			continue;
		}
		if (ch === '$') {
			return makeError(
				'#PARSE!',
				`Absolute references like $A$1 are not supported at position ${at}. Write A1 instead.`,
				{ position: at }
			);
		}
		if (ch === '"') {
			// A doubled quote inside a string is one quote, which is the
			// spreadsheet spelling rather than a backslash escape.
			let text = '';
			let j = i + 1;
			let closed = false;
			while (j < source.length) {
				if (source[j] === '"') {
					if (source[j + 1] === '"') {
						text += '"';
						j += 2;
						continue;
					}
					closed = true;
					j += 1;
					break;
				}
				text += source[j];
				j += 1;
			}
			if (!closed) {
				return makeError('#PARSE!', `A quoted piece of text is never closed, starting at position ${at}.`, {
					position: at
				});
			}
			tokens.push({ type: 'string', text, position: at });
			i = j;
			continue;
		}
		if (/[0-9.]/.test(ch)) {
			// Every consecutive digit and dot is taken as ONE number and then
			// validated, rather than matching the longest legal prefix: `1.2.3`
			// read the second way is two valid numbers and a parse error about
			// the wrong thing, where read this way it is "1.2.3 is not a
			// number" at the position the student typed.
			const match = /^[0-9.]+([eE][+-]?[0-9]+)?/.exec(source.slice(i));
			const raw = match === null ? '' : match[0];
			if (numericString(raw) === null) {
				return makeError('#PARSE!', `"${raw || ch}" is not a number, at position ${at}.`, { position: at });
			}
			tokens.push({ type: 'number', text: raw, position: at });
			i += raw.length;
			continue;
		}
		if (/[A-Za-z_]/.test(ch)) {
			const raw = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(source.slice(i))![0];
			// Letters followed by digits and nothing else is a cell reference;
			// everything else is a name (a function, TRUE or FALSE). This is
			// exactly the ambiguity a spreadsheet has, resolved the same way.
			const type: TokenType = /^[A-Za-z]{1,3}\d{1,7}$/.test(raw) ? 'ref' : 'name';
			tokens.push({ type, text: raw.toUpperCase(), position: at });
			i += raw.length;
			continue;
		}
		if (ch === '(') {
			tokens.push({ type: 'lparen', text: ch, position: at });
			i += 1;
			continue;
		}
		if (ch === ')') {
			tokens.push({ type: 'rparen', text: ch, position: at });
			i += 1;
			continue;
		}
		if (ch === ',') {
			tokens.push({ type: 'comma', text: ch, position: at });
			i += 1;
			continue;
		}
		if (ch === ':') {
			tokens.push({ type: 'colon', text: ch, position: at });
			i += 1;
			continue;
		}
		const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
		if (op !== undefined) {
			tokens.push({ type: 'op', text: op, position: at });
			i += op.length;
			continue;
		}
		return makeError('#PARSE!', `"${ch}" cannot be used in a formula, at position ${at}.`, { position: at });
	}
	tokens.push({ type: 'eof', text: '', position: source.length + offset });
	return tokens;
}
