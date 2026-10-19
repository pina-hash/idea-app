/**
 * Shared steps for the ledger 0402 harnesses (the loader skips `_` files).
 * A listing card, a tile and a tab are real buttons and links, so a click that
 * lands before hydration does nothing or leaves the harness, and a cold Vite
 * reloads once while it optimizes the route: wait for the marker, let that
 * reload happen, wait again.
 */
export const hydrated = (attr = 'data-harness-hydrated') => [
	{ waitFor: `() => !!document.querySelector('[${attr}="yes"]')`, timeoutMs: 20000, waitMs: 2000 },
	{ waitFor: `() => !!document.querySelector('[${attr}="yes"]')`, timeoutMs: 20000 }
];

export const SPACE_WHITE_ON = { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 };

/** Every key on the market page is a phone target. */
export const MARKET_TAPS = [
	{ selector: '[data-testid="mk-page"] button', label: 'every button on the market', min: 44 },
	{ selector: '[data-testid="mk-official-tile"]', label: 'every official tile', min: 44 }
];

export const MARKET_CONTRAST = [
	{ selector: '[data-testid="mk-official-tile"] .mk-tile-title', label: 'official tile titles', min: 4.5 },
	{ selector: '[data-testid="mk-official-tile"] .mk-tile-line', label: 'official tile lines', min: 4.5 },
	{ selector: '[data-testid="mk-listing"] .mk-tile-title', label: 'listing titles', min: 4.5 },
	{ selector: '[data-testid="mk-listing-price"]', label: 'listing prices', min: 4.5 },
	{ selector: '[data-testid="mk-trade-status"]', label: 'trade status chips', min: 4.5 },
	{ selector: '[data-testid="mk-trade-next"]', label: 'what happens next, in words', min: 4.5 },
	{ selector: '[data-testid="mk-feed-row"]', label: 'transfer feed rows', min: 4.5 },
	{ selector: '[data-testid="mk-balance"]', label: 'the balance', min: 4.5 }
];
