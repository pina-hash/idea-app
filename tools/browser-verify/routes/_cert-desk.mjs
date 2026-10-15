/**
 * Shared steps for the certifier desk specs (the loader skips `_` files).
 *
 * HYDRATED, TWICE (CLAUDE.md, "A SPEC THAT CLICKS A REAL LINK WAITS FOR A
 * HYDRATION MARKER"): a cold Vite reloads the page once while it optimizes
 * the route's dependencies, so wait for the marker, let that reload happen,
 * wait again. Each harness sets its own marker attribute on its root.
 */
export const certHydrated = (name) => [
	{ waitFor: `() => !!document.querySelector('[data-cert-${name}-hydrated="yes"]')`, timeoutMs: 20000, waitMs: 2000 },
	{ waitFor: `() => !!document.querySelector('[data-cert-${name}-hydrated="yes"]')`, timeoutMs: 20000 }
];

export const SPACE_WHITE_ON = { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 };

/** The page never scrolls sideways: the document is no wider than the window. */
export const NO_SIDEWAYS = {
	label: 'no horizontal scroll',
	evaluate: `() => document.documentElement.scrollWidth <= document.documentElement.clientWidth ? 'fits' : 'overflows by ' + (document.documentElement.scrollWidth - document.documentElement.clientWidth) + 'px'`,
	expected: 'fits'
};
