import { describe, expect, it } from 'vitest';
import { COIN_TXN_TYPES, coinRowLabel, coinTxnType, type CoinTxnType } from '../src/lib/coin-format';
import {
	categoryTxnType,
	COIN_TYPE_GLYPHS,
	COIN_TYPE_GLYPH_NAMES,
	COIN_TYPE_TONES
} from '../src/lib/coin-desk/transaction-types';

/**
 * THE COIN DESK'S TRANSACTION-TYPE PRESENTATION, and why any of it is worth a
 * test at all when almost nothing visual in this repo gets one.
 *
 * Two of these regress SILENTLY, which is the bar CLAUDE.md sets:
 *
 *  - A SIXTH TYPE added to `coin-format.ts` with no tone and no glyph renders
 *    an EMPTY <svg> and inherits --dim. Nothing throws, nothing type-errors
 *    (a Record lookup on a widened union is checked, but only if every map
 *    here is written as an exhaustive Record -- which is exactly what the
 *    first two cases below assert stays true at runtime as well).
 *  - A TONE reaching for --crimson passes every visual review: it looks
 *    right, and it is the obvious colour for a fine. The rule it breaks
 *    (reserved for LIVE/REC/error, never identity) lives in a stylesheet
 *    comment nobody reads while picking a colour.
 *
 * The static "most used" order this file used to re-derive from the retired
 * Sheets archive is gone (IDEA Coin V2 session two): the Log picker offers
 * categories in `coin_categories.sort_order`, so there is no count to check.
 */

describe('coin transaction type presentation', () => {
	it('covers every type in the shared vocabulary, with nothing left over', () => {
		// EXHAUSTIVE IN BOTH DIRECTIONS. A missing entry renders nothing; an
		// extra one is a type this app no longer has, styled forever.
		expect(Object.keys(COIN_TYPE_TONES).sort()).toEqual([...COIN_TXN_TYPES].sort());
		expect(Object.keys(COIN_TYPE_GLYPHS).sort()).toEqual([...COIN_TXN_TYPES].sort());
		expect(COIN_TXN_TYPES.length).toBe(6);
	});

	it('gives every type a glyph that is distinct in name and in geometry', () => {
		// THE COUNT OF DISTINCT ICONS EQUALS THE COUNT OF TYPES. Both halves
		// matter: two glyphs could share a name by copy-paste, or carry the same
		// paths under two names, and only one of those is visible on screen.
		const names = new Set(COIN_TYPE_GLYPH_NAMES);
		expect(names.size).toBe(COIN_TXN_TYPES.length);

		const geometries = new Set(COIN_TXN_TYPES.map((t) => COIN_TYPE_GLYPHS[t].paths.join('|')));
		expect(geometries.size).toBe(COIN_TXN_TYPES.length);

		// A glyph with no paths is an empty <svg>: present, visible to a
		// selector, and a picture of nothing.
		for (const t of COIN_TXN_TYPES) {
			expect(COIN_TYPE_GLYPHS[t].paths.length).toBeGreaterThan(0);
			for (const d of COIN_TYPE_GLYPHS[t].paths) expect(d.trim()).not.toBe('');
		}
	});

	it('paints every type from a token, and never from the reserved status red', () => {
		for (const t of COIN_TXN_TYPES) {
			const tone = COIN_TYPE_TONES[t];
			// A tone is a token reference, never a literal colour: a hex here
			// would be a colour invented outside the design system.
			expect(tone.ink).toMatch(/^var\(--[a-z-]+\)$/);
			expect(tone.accent).toMatch(/^var\(--[a-z-]+\)$/);
			expect(tone.ink).not.toContain('crimson');
			expect(tone.accent).not.toContain('crimson');
		}
		// The ink and the accent differ for exactly one type, and it is the one
		// whose raw accent cannot carry text (--violet at 2.45:1).
		const split = COIN_TXN_TYPES.filter((t) => COIN_TYPE_TONES[t].ink !== COIN_TYPE_TONES[t].accent);
		expect(split).toEqual(['adjustment']);
	});

	it('reads a payout category as a payout, not as the purchase its kind says', () => {
		// ONE DERIVATION. `coin_payout` is kind `purchase` in the price list and
		// every rendered transaction calls it a payout; the picker asking the
		// shared function rather than reading `kind` is what keeps those two
		// answers the same.
		expect(categoryTxnType({ id: 'coin_payout', kind: 'purchase' })).toBe('payout');
		expect(categoryTxnType({ id: 'coin_payout', kind: 'purchase' })).toBe(
			coinTxnType({ category_id: 'coin_payout' }, 'purchase')
		);
		expect(categoryTxnType({ id: 'eating_pass', kind: 'purchase' })).toBe('purchase');
		expect(categoryTxnType({ id: 'weekly_wage', kind: 'award' })).toBe('award');
		expect(categoryTxnType({ id: 'eating_violation', kind: 'fine' })).toBe('fine');
		expect(categoryTxnType({ id: 'balance_correction', kind: 'adjustment' })).toBe('adjustment');
		// Ledger 0455: the deposit category is kind award and reads as a deposit,
		// the same shape as the payout.
		expect(categoryTxnType({ id: 'coin_deposit', kind: 'award' })).toBe('deposit');

		// Every answer it can give has a glyph and a tone: the two maps above
		// are exhaustive over the union, and this is the union in practice.
		const seen = new Set<CoinTxnType>();
		for (const [id, kind] of [
			['coin_payout', 'purchase'],
			['eating_pass', 'purchase'],
			['weekly_wage', 'award'],
			['eating_violation', 'fine'],
			['balance_correction', 'adjustment'],
			['coin_deposit', 'award']
		] as const) {
			seen.add(categoryTxnType({ id, kind }));
		}
		expect([...seen].sort()).toEqual([...COIN_TXN_TYPES].sort());
	});
});

describe('what a row is called in a list (ledger 0455, report 65c46fcf)', () => {
	it('a Custom record is called by its note; every other row by its category, notes and all', () => {
		expect(coinRowLabel({ category_id: 'custom_award', category_name: 'Custom Award', note: ' IDEA-Blade finals: 1st place ' })).toEqual({ label: 'IDEA-Blade finals: 1st place', fromNote: true });
		expect(coinRowLabel({ category_id: 'custom_fine', category_name: 'Custom Fine', note: 'pointing a laser' }).label).toBe('pointing a laser');
		expect(coinRowLabel({ category_id: 'custom_purchase', category_name: 'Custom Purchase', note: '' })).toEqual({ label: 'Custom Purchase', fromNote: false });
		// Control: a listed category keeps its name, even with a note.
		expect(coinRowLabel({ category_id: 'off_task_device_use', category_name: 'Off-Task', note: 'phone out' })).toEqual({ label: 'Off-Task', fromNote: false });
		expect(coinRowLabel({ category_id: 'custom_award', category_name: 'Custom Award', note: 'x'.repeat(300) }).label).toHaveLength(120);
	});
});
