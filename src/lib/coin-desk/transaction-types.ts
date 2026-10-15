/**
 * HOW A TRANSACTION TYPE LOOKS.
 *
 * Plain data + pure helpers, no Svelte and no Supabase (the coin-desk.ts /
 * pathways.ts convention), so every rule here is assertable without a browser
 * and the picker, the history rows and the dev harness read one copy of it.
 *
 * THE TYPE VOCABULARY IS `coin-format.ts`'s AND IS NOT RESTATED HERE.
 * `COIN_TXN_TYPES` already exists, `coinTxnType()` already derives a row's type
 * exactly the way `coin_public_transactions` derives it in SQL (0103), and the
 * history rows already render `adjustment` in violet and `payout` in cyan. This
 * module adds the two things that were missing -- a tone for the other three
 * and a glyph for all five -- keyed on that same union, so a sixth type added
 * to `coin-format.ts` fails the exhaustiveness test here rather than quietly
 * rendering as nothing.
 *
 * THE PICKER'S ORDER IS NOT HERE ANY MORE. It used to be a static "most used"
 * table counted from the retired Sheets ledger's archive; IDEA Coin V2 session
 * two retired it, and the Log picker now offers categories in
 * `coin_categories.sort_order`, the price list's own order, which an admin
 * edits on the Economy page.
 */

import { COIN_TXN_TYPES, coinTxnType, type CoinTxnType } from '$lib/coin-format';
import type { CoinCategory } from '$lib/coin-desk';

// ---------------------------------------------------------------------------
// 1. TONE -- which existing token paints each type
//
// EVERY VALUE IS AN EXISTING TOKEN IN ITS DOCUMENTED ROLE. `--green` is
// success and completion, so an award takes it; `--amber` is warning, so a
// fine takes it; `--violet` is "special, sparingly", which an admin correction
// is; `--cyan` is already the payout chip's colour and stays there. That
// leaves `--gold`, the secondary brass accent, for a purchase -- the loosest
// of the five and the one worth saying out loud, because gold and amber are
// the closest pair in the set (brass #c8a848 against copper #d08030). THAT IS
// EXACTLY WHY COLOUR IS NEVER THE ONLY SIGNAL HERE: every place these are
// rendered also carries the type's own glyph AND its word.
//
// THE LEDGER PAINTS FINE RED AND THIS DELIBERATELY DOES NOT.
// `src/lib/legacy/coins/index.html` styles `.type-fine` with its own `--red`; the portal reserves
// `--crimson` for LIVE / REC / error and says "never used for identity", and a
// transaction kind is an identity. `src/app.css`'s own home-feed flags already
// made this call the same way ("--crimson is deliberately absent ... this
// surface carries no live state") and reached for `--amber`. Reassigning a
// fixed semantic role to match a legacy page's palette is the one thing
// "match the ledger" does not license.
//
// A TONE IS A CLASS NAME, NEVER A COLOUR STRING. The value below is the token
// a stylesheet reads; nothing here writes an inline custom property, because
// an inline custom property beats every class rule and would make the
// stylesheet's own defaults unreachable (the AppLauncher lesson, CLAUDE.md).
// ---------------------------------------------------------------------------

export interface CoinTypeTone {
	/** The token that paints the WORD and the glyph. */
	ink: string;
	/** The token the edge and the fill are mixed from. */
	accent: string;
}

export const COIN_TYPE_TONES: Record<CoinTxnType, CoinTypeTone> = {
	award: { ink: 'var(--green)', accent: 'var(--green)' },
	fine: { ink: 'var(--amber)', accent: 'var(--amber)' },
	purchase: { ink: 'var(--gold)', accent: 'var(--gold)' },
	// The WORD takes the ink, the EDGE keeps the accent: raw --violet measures
	// 2.45:1 as text on --bg1. This pair is already shipped in
	// CoinTransactionRows and is restated here only so the record is total.
	adjustment: { ink: 'var(--violet-ink)', accent: 'var(--violet)' },
	payout: { ink: 'var(--cyan)', accent: 'var(--cyan)' }
};

// ---------------------------------------------------------------------------
// 2. GLYPHS -- one per TYPE, and the count is the point
//
// PER TYPE, NEVER PER CATEGORY. There are five types and forty-odd
// categories; five glyphs a reader can learn beats forty they cannot, and
// forty would mean inventing lookalikes, which is worse than no glyph at all.
// So the glyph answers "what kind of thing is this", the colour answers it a
// second way, and the LABEL beside both answers "which one" -- three signals,
// none of them load-bearing alone.
//
// SILHOUETTES, NOT DECORATION. The five were chosen to differ in outline at
// 14px rather than in detail: a flag has a mast, a star has points, a tag has
// a corner and a hole, the correction arrows are a symmetrical pair, and the
// payout arrow leaves an open bracket. `tests/coin-transaction-types.test.ts`
// asserts they are all distinct, which is what stops a sixth being added as a
// near-copy of one already here.
//
// Stroke paths on a 24x24 box, `stroke="currentColor"` with no fill, so the
// tone above is the only thing that colours them and a glyph inherits the
// contrast of the word beside it.
// ---------------------------------------------------------------------------

export interface CoinTypeGlyph {
	/** Every `d` attribute, in paint order. */
	paths: string[];
	/** What the glyph is a picture of, for the record and for a test. */
	name: string;
}

export const COIN_TYPE_GLYPHS: Record<CoinTxnType, CoinTypeGlyph> = {
	fine: {
		name: 'flag',
		paths: ['M6 21V4', 'M6 4.5h12l-2.6 4 2.6 4H6z']
	},
	award: {
		name: 'star',
		paths: ['M12 3.2l2.7 5.6 6 .9-4.4 4.2 1.1 6-5.4-2.9L6.6 19.9l1.1-6L3.3 9.7l6-.9z']
	},
	purchase: {
		name: 'tag',
		paths: [
			'M20.6 13.1l-7.5 7.5a1.6 1.6 0 01-2.3 0l-7.3-7.3a1.6 1.6 0 01-.5-1.1V4.9c0-.9.7-1.6 1.6-1.6h7.3c.4 0 .8.2 1.1.5l7.6 7.6a1.6 1.6 0 010 1.7z',
			'M7.9 7.9h.01'
		]
	},
	adjustment: {
		name: 'up-down arrows',
		paths: ['M8 20V4', 'M4.5 7.5L8 4l3.5 3.5', 'M16 4v16', 'M12.5 16.5L16 20l3.5-3.5']
	},
	payout: {
		name: 'arrow out of a bracket',
		paths: ['M14 3.5h4.5a2 2 0 012 2v13a2 2 0 01-2 2H14', 'M3.5 12h11', 'M10.5 8l4 4-4 4']
	}
};

/** Every glyph name, for a test that has to know the set is total and unique. */
export const COIN_TYPE_GLYPH_NAMES = COIN_TXN_TYPES.map((t) => COIN_TYPE_GLYPHS[t].name);

/**
 * A category's type for display, which is `coinTxnType`'s answer and not the
 * raw `kind`: `coin_payout` is kind `purchase` in the price list and reads as
 * a PAYOUT everywhere a transaction is rendered, so the picker offering it a
 * purchase tag while its own history row shows a payout arrow would be two
 * answers to one question. Written as a shim over the shared function rather
 * than as a second rule.
 */
export function categoryTxnType(cat: Pick<CoinCategory, 'id' | 'kind'>): CoinTxnType {
	// A category row carries no transfer id -- that belongs to a transaction --
	// so the id/kind pair is the whole input the shared function needs.
	return coinTxnType({ category_id: cat.id }, cat.kind);
}
