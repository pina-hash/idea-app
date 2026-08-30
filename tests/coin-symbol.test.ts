// tests/coin-symbol.test.ts
//
// The currency symbol has ONE spelling, and it stays that way.
//
// WHY THIS IS A TEST RATHER THAN A CONVENTION. A constant alone does not stop
// the next `i¢` being typed straight into a template -- it only makes the right
// thing available. What actually prevents a fourth spelling is a scan that
// fails, so this walks the real coin sources and rejects both the alternative
// spellings and any loose literal outside a comment.
//
// It fails SILENTLY otherwise: a page rendering `i&#162;` in one place and the
// raw character in another looks completely fine on the screen someone happens
// to be looking at.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_SYMBOL, coins, signedCoins, coinMediumLabel } from '../src/lib/coin-format';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/**
 * Every source file that renders an IDEA Coin figure. Listed EXPLICITLY rather
 * than globbed: a glob would quietly stop covering a file that moved, and the
 * point of this test is that nothing slips out of its scope unnoticed.
 */
const COIN_SOURCES = [
	'src/lib/coin-format.ts',
	'src/lib/coin-desk.ts',
	'src/lib/coin-balance.ts',
	'src/lib/coin-balance/CoinBalanceView.svelte',
	'src/lib/coin-balance/CoinTransactionRows.svelte',
	'src/lib/coin-desk/BalanceAdminPanel.svelte',
	'src/lib/coin-desk/CategoriesManager.svelte',
	'src/lib/coin-desk/ContractsManager.svelte',
	'src/lib/coin-desk/DebtPaymentPanel.svelte',
	'src/lib/coin-desk/LogView.svelte',
	'src/lib/coin-desk/PayoutManager.svelte',
	'src/lib/coin-desk/RolesManager.svelte',
	'src/lib/coin-desk/StudentPreview.svelte',
	'src/lib/coin-desk/category-admin.ts',
	'src/lib/coin-desk/contracts.ts',
	'src/lib/coin-desk/payout.ts',
	'src/lib/contracts/ContractsView.svelte',
	'src/lib/marks/CoinMark.svelte',
	'src/lib/marks/CoinDeskMark.svelte',
	'src/lib/AppLauncher.svelte',
	'src/lib/tournaments/DeleteTournament.svelte',
	'src/routes/dev/coin-desk/+page.svelte',
	'src/routes/dev/coin-desk/fake-ledger.ts',
	'src/routes/dev/coin-preview/+page.svelte',
	'src/routes/dev/coins/fixture.ts',
	'src/routes/dev/tournaments/+page.svelte'
];

/**
 * DELIBERATELY OUT OF SCOPE, and each for its own reason -- a blanket sweep
 * would corrupt all three:
 *
 *   * GREENLINE's `IC` is Ignition Credits, a SEPARATE currency;
 *   * VANGUARD carries its own currency string inside a legacy game file that
 *     is edited surgically and never swept;
 *   * the archived Sheets-era code under docs/ is a historical record.
 */
const OUT_OF_SCOPE = [
	'src/lib/greenline/',
	'src/lib/legacy/',
	'docs/coin-economy/archive/'
];

/** Comments hold prose about the symbol; only rendered text is the concern. */
function stripComments(src: string): string {
	return src
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
}

describe('the symbol has one spelling', () => {
	it('is the raw character, by codepoint', () => {
		// Asserted by codepoint, not by comparing to another literal: two
		// literals that both got mangled the same way would still match.
		expect([...COIN_SYMBOL].map((c) => c.codePointAt(0))).toEqual([0x69, 0xa2]);
		expect(COIN_SYMBOL).toHaveLength(2);
	});

	it('formats a figure with the symbol trailing the number, like a dollar sign leads one', () => {
		expect(coins(155)).toBe('155i¢');
		expect(coins(0)).toBe('0i¢');
		expect(coins(-74)).toBe('-74i¢');
	});

	it('keeps the ledger sign on a signed figure', () => {
		// A correction is the case this exists for: +40 must not lose its plus.
		expect(signedCoins(40)).toBe('+40i¢');
		expect(signedCoins(-15)).toBe('-15i¢');
		expect(signedCoins(0)).toBe('0i¢');
	});

	it('never renders the word "coins" where a value goes', () => {
		expect(coins(3)).not.toMatch(/coin/i);
		expect(signedCoins(3)).not.toMatch(/coin/i);
	});
});

describe('no other spelling survives anywhere in the coin sources', () => {
	// The three that were actually in the tree, plus the two escapes that would
	// render identically and so would never be spotted by eye.
	const FORBIDDEN: [string, string][] = [
		['i&cent;', 'HTML named entity'],
		['i&#162;', 'HTML numeric entity'],
		['i&#xa2;', 'HTML hex entity'],
		['i\\u00a2', 'JS unicode escape'],
		['i\\u00A2', 'JS unicode escape (upper)']
	];

	for (const rel of COIN_SOURCES) {
		it(`${rel} carries no alternative spelling`, () => {
			// Comments stripped first: a file may NAME the forbidden spellings in
			// prose (this module documents them), and prose does not render.
			const src = stripComments(read(rel));
			for (const [needle, why] of FORBIDDEN) {
				expect(src.includes(needle), `${rel} contains ${needle} (${why})`).toBe(false);
			}
		});
	}

	/**
	 * The loose-literal rule. A file may TALK about the symbol in a comment;
	 * what it may not do is render one it typed itself instead of the shared
	 * constant. coin-format.ts is the one exception -- it is where the constant
	 * is defined -- and the test files here are excluded for the same reason
	 * they assert the literal in the first place.
	 */
	for (const rel of COIN_SOURCES.filter((f) => f !== 'src/lib/coin-format.ts')) {
		it(`${rel} renders the symbol through the shared constant, not a literal`, () => {
			const code = stripComments(read(rel));
			expect(code.includes(COIN_SYMBOL), `${rel} has a loose "${COIN_SYMBOL}" literal`).toBe(
				false
			);
		});
	}

	it('lists no file that is deliberately out of scope', () => {
		for (const rel of COIN_SOURCES) {
			for (const skip of OUT_OF_SCOPE) {
				expect(rel.startsWith(skip), `${rel} is under ${skip}`).toBe(false);
			}
		}
	});
});

describe('the Ledger keeps its own single copy in step', () => {
	// src/lib/legacy/coins/index.html is a standalone file and cannot import $lib, so
	// it declares the constant itself. That is fine as long as it is ONE
	// declaration and it says the same thing.
	const LEDGER = 'src/lib/legacy/coins/index.html';

	it('declares the symbol exactly once, and it matches', () => {
		const src = read(LEDGER);
		const matches = [...src.matchAll(/const COIN_SYMBOL = '([^']*)'/g)];
		expect(matches).toHaveLength(1);
		expect(matches[0][1]).toBe(COIN_SYMBOL);
	});

	it('renders no figure from a literal', () => {
		// The Ledger's remaining literals are tab labels and comments; a
		// rendered FIGURE always concatenates the constant. Anything of the
		// shape `+ ' i¢'` is the pattern this replaced.
		const src = read(LEDGER);
		expect(src).not.toMatch(/\+\s*'[^']*i¢/);
		expect(src).not.toMatch(/i¢\s*'\s*\+/);
	});

	it('carries no alternative spelling', () => {
		const src = read(LEDGER);
		for (const needle of ['i&cent;', 'i&#162;', 'i&#xa2;']) {
			expect(src.includes(needle), `${LEDGER} contains ${needle}`).toBe(false);
		}
	});
});

describe('medium labels', () => {
	it('names the two mediums and nothing else', () => {
		expect(coinMediumLabel('physical')).toBe('Physical');
		expect(coinMediumLabel('digital')).toBe('Digital');
		expect(coinMediumLabel('DIGITAL')).toBe('Digital');
	});

	it('is empty for an unknown or absent medium rather than inventing one', () => {
		// A row with no medium must not be labelled as either -- guessing is
		// exactly the conflation the whole model forbids.
		expect(coinMediumLabel(null)).toBe('');
		expect(coinMediumLabel(undefined)).toBe('');
		expect(coinMediumLabel('')).toBe('');
		expect(coinMediumLabel('bank')).toBe('');
	});
});
