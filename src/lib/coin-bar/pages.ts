/**
 * THE IDEA COIN PAGES, ONE LIST (ledger 0422, feedback 7e4a2a15 and d299d864:
 * "one header bar across every coin page ... so any page reaches any page").
 *
 * Plain data, no Svelte and no Supabase, so the bar the Svelte pages mount,
 * the bar the Ledger has rendered into its served HTML, and the coin home's
 * previews all read the SAME list. Order here IS the order drawn.
 *
 * `match` decides which page an address belongs to. The longest matching
 * prefix wins, so `/market/stocks/abc` is Stocks and not Market, and
 * `/coin-balance/role` is My coins.
 *
 * THE COIN DESK IS OFFERED ONLY TO COIN STAFF. Everybody else gets 404 there
 * (probing must reveal nothing), so a tab to it would be a tab to a page that
 * "does not exist" for them. `staffOnly` pages are left out unless `desk`.
 */
import type { MarketGlyphName } from '$lib/coin-market/glyphs';
import { COIN_DESK_AREAS } from '$lib/coin-desk/nav';

export type CoinPageId = 'home' | 'mine' | 'ledger' | 'market' | 'stocks' | 'desk';

export interface CoinPage {
	id: CoinPageId;
	label: string;
	href: string;
	glyph: MarketGlyphName;
	/** Address prefixes that belong to this page. */
	match: string[];
	staffOnly?: boolean;
}

export const COIN_HOME_PATH = '/coin';

export const COIN_PAGES: CoinPage[] = [
	{ id: 'home', label: 'Coin home', href: COIN_HOME_PATH, glyph: 'coin', match: [COIN_HOME_PATH] },
	{ id: 'mine', label: 'My coins', href: '/coin-balance', glyph: 'wallet', match: ['/coin-balance'] },
	{ id: 'ledger', label: 'Ledger', href: '/coins/index.html', glyph: 'ledger', match: ['/coins'] },
	{ id: 'market', label: 'Market', href: '/market', glyph: 'shop', match: ['/market'] },
	{ id: 'stocks', label: 'Stocks', href: '/market/stocks', glyph: 'stocks', match: ['/market/stocks'] },
	// Ledger 0432: the Coin Desk folded into the coin home; its areas are
	// /coin/<area>, and this tab is staff's way to them.
	{ id: 'desk', label: 'Staff tools', href: '/coin/log', glyph: 'desk', match: COIN_DESK_AREAS.map((a) => a.href), staffOnly: true }
];

/** True when `path` is `prefix` itself or sits under it (never `/coins` for `/coinsx`). */
function under(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`);
}

/** Which coin page an address is, or null for an address that is none of them. */
export function coinPageFor(pathname: string): CoinPageId | null {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
	let best: { id: CoinPageId; len: number } | null = null;
	for (const p of COIN_PAGES) {
		for (const m of p.match) {
			if (under(path, m) && (!best || m.length > best.len)) best = { id: p.id, len: m.length };
		}
	}
	return best?.id ?? null;
}

/** The pages one viewer is offered: the Coin Desk only for coin staff. */
export function coinPagesFor(opts: { desk: boolean }): CoinPage[] {
	return COIN_PAGES.filter((p) => !p.staffOnly || opts.desk);
}
