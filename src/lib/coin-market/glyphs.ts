/**
 * The market's line glyphs: one stroke path each, drawn in `currentColor`
 * on a 24 by 24 box. Always beside a word, never in place of one, so each is
 * `aria-hidden` where it is drawn.
 */
export const MARKET_GLYPHS = {
	offer: 'M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01',
	request: 'M12 3v10M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5',
	shop: 'M5 8h14l-1 12H6L5 8zM9 8V6a3 3 0 0 1 6 0v2',
	donation: 'M3 9l9-5 9 5v9l-9 5-9-5V9zM3 9l9 5 9-5M12 14v9',
	background: 'M3 5h18v11H3zM8 20h8M12 16v4',
	contract: 'M8 4h8v3H8zM6 5H5v16h14V5h-1M8 12h8M8 16h5',
	official: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
	transfer: 'M4 8h13l-3-3M20 16H7l3 3',
	stocks: 'M3 20h18M5 16l5-6 4 3 6-8',
	star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5z',
	// Ledger 0422: the IDEA Coin bar's pages.
	coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 8v8M14 9.5a3 3 0 1 0 0 5',
	wallet: 'M4 7h15a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1V7zM4 7l11-3v3M16 13h2',
	ledger: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5',
	desk: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4'
} as const;

export type MarketGlyphName = keyof typeof MARKET_GLYPHS;
