import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { COIN_TXN_TYPES, coinTxnType, type CoinTxnType } from '../src/lib/coin-format';
import {
	categoryTxnType,
	categoryUseCount,
	COIN_CATEGORY_USE_COUNTS,
	COIN_TYPE_GLYPHS,
	COIN_TYPE_GLYPH_NAMES,
	COIN_TYPE_TONES,
	COIN_USE_LEGACY_REASONS,
	COIN_USE_SOURCE,
	sortByUse
} from '../src/lib/coin-desk/transaction-types';

/**
 * THE COIN DESK'S TRANSACTION-TYPE PRESENTATION, and why any of it is worth a
 * test at all when almost nothing visual in this repo gets one.
 *
 * Three of these regress SILENTLY, which is the bar CLAUDE.md sets:
 *
 *  - A SIXTH TYPE added to `coin-format.ts` with no tone and no glyph renders
 *    an EMPTY <svg> and inherits --dim. Nothing throws, nothing type-errors
 *    (a Record lookup on a widened union is checked, but only if every map
 *    here is written as an exhaustive Record -- which is exactly what the
 *    first two cases below assert stays true at runtime as well).
 *  - THE USE COUNTS drifting from the archive they claim to come from is
 *    invisible by construction: a wrong order is still an order, and nobody
 *    can tell by looking that `weekly_wage: 43` stopped being what the CSV
 *    says. So the counts are RE-DERIVED here from the committed file through
 *    the module's own exported map -- the expected value comes from the data,
 *    never from the table under test.
 *  - A TONE reaching for --crimson passes every visual review: it looks
 *    right, and it is the obvious colour for a fine. The rule it breaks
 *    (reserved for LIVE/REC/error, never identity) lives in a stylesheet
 *    comment nobody reads while picking a colour.
 *
 * The fourth case, `sortByUse` being stable, is not silent -- a jumping
 * dropdown is visible immediately -- but it costs one assertion and it is the
 * property the whole ordering rests on.
 */

describe('coin transaction type presentation', () => {
	it('covers every type in the shared vocabulary, with nothing left over', () => {
		// EXHAUSTIVE IN BOTH DIRECTIONS. A missing entry renders nothing; an
		// extra one is a type this app no longer has, styled forever.
		expect(Object.keys(COIN_TYPE_TONES).sort()).toEqual([...COIN_TXN_TYPES].sort());
		expect(Object.keys(COIN_TYPE_GLYPHS).sort()).toEqual([...COIN_TXN_TYPES].sort());
		expect(COIN_TXN_TYPES.length).toBe(5);
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

	it('re-derives the use counts from the archive the module cites', () => {
		// THE EXPECTED VALUE COMES FROM THE COMMITTED CSV, not from the table
		// being checked. Reading the archived legacy ledger as a fixture is
		// explicitly fine (CLAUDE.md); it is never reintroduced as code.
		const csv = readFileSync(COIN_USE_SOURCE.file, 'utf8');
		const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
		const header = lines.shift() ?? '';
		expect(header.startsWith('Date / Time,Name,Amount,Type,Reason')).toBe(true);

		// The Reason is the 5th field and the Name field is quoted, so a naive
		// split on commas would shift every row. Parse the quoting properly.
		const reasonOf = (line: string): string => {
			const fields: string[] = [];
			let cur = '';
			let quoted = false;
			for (const ch of line) {
				if (ch === '"') quoted = !quoted;
				else if (ch === ',' && !quoted) {
					fields.push(cur);
					cur = '';
				} else cur += ch;
			}
			fields.push(cur);
			return (fields[4] ?? '').trim();
		};

		const counts: Record<string, number> = {};
		let mapped = 0;
		for (const line of lines) {
			const id = COIN_USE_LEGACY_REASONS[reasonOf(line)];
			if (!id) continue;
			counts[id] = (counts[id] ?? 0) + 1;
			mapped += 1;
		}

		expect(lines.length).toBe(COIN_USE_SOURCE.rows);
		expect(mapped).toBe(COIN_USE_SOURCE.mapped);
		expect(counts).toEqual(COIN_CATEGORY_USE_COUNTS);

		// A POSITIVE CONTROL for the parser itself: an equality against an
		// empty object would pass if `reasonOf` returned nothing for every row.
		expect(Object.keys(counts).length).toBeGreaterThan(10);
		expect(counts.weekly_wage).toBeGreaterThan(0);
	});

	it('sorts most-logged first and leaves everything else exactly as it came', () => {
		const input = [
			{ id: 'shop_safety_violation' }, // unused
			{ id: 'weekly_wage' }, // 43
			{ id: 'coin_theft' }, // unused
			{ id: 'extra_credit' }, // 11
			{ id: 'above_and_beyond' } // 16
		];
		const out = sortByUse(input).map((c) => c.id);
		expect(out).toEqual([
			'weekly_wage',
			'above_and_beyond',
			'extra_credit',
			// STABLE: the two unused ones keep their incoming order, which is the
			// price list's own sort_order. A dropdown that reshuffles its tail
			// between two renders of the same list is the failure this prevents.
			'shop_safety_violation',
			'coin_theft'
		]);
		// Not mutated in place: the caller's array is the load's payload.
		expect(input[0].id).toBe('shop_safety_violation');

		// Ties inside the table resolve the same way.
		const ties = [{ id: 'printer_not_reset' }, { id: 'eating_pass' }];
		expect(categoryUseCount('printer_not_reset')).toBe(categoryUseCount('eating_pass'));
		expect(sortByUse(ties).map((c) => c.id)).toEqual(['printer_not_reset', 'eating_pass']);

		expect(categoryUseCount('a_category_that_does_not_exist')).toBe(0);
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

		// Every answer it can give has a glyph and a tone: the two maps above
		// are exhaustive over the union, and this is the union in practice.
		const seen = new Set<CoinTxnType>();
		for (const [id, kind] of [
			['coin_payout', 'purchase'],
			['eating_pass', 'purchase'],
			['weekly_wage', 'award'],
			['eating_violation', 'fine'],
			['balance_correction', 'adjustment']
		] as const) {
			seen.add(categoryTxnType({ id, kind }));
		}
		expect([...seen].sort()).toEqual([...COIN_TXN_TYPES].sort());
	});
});
