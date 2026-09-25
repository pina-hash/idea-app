/**
 * Shared pieces of the /dev/classroom-teams specs (ledger 0298, R23). `_`-
 * prefixed, so `routes.mjs` does not load it as a route.
 */

/** The page has painted the class list the teams sit above, with or without teams. */
export const READY = `() => document.querySelectorAll('[data-testid="item-row"]').length === 4 && !!document.querySelector('[data-testid="class-tools"]')`;

/** The teams region's parts, in document order, by their hooks. */
export const PARTS = `() => [...document.querySelectorAll('[data-testid="class-teams"] [data-testid="class-team-mine-wrap"], [data-testid="class-teams"] [data-testid="class-teams-posted"], [data-testid="class-teams"] [data-testid="class-teams-board"]')].map((e) => e.dataset.testid)`;

/** The class list rendered under the teams: the positive control for every absence row. */
export const CLASS_LIST = {
	selector: '[data-testid="item-row"]',
	label: 'the class list rendered (positive control)',
	expectPresent: 4,
	maxPresent: 4,
	expectVisible: 4
};

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];
