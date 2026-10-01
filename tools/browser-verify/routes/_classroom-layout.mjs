/**
 * Shared pieces of the /dev/classroom-layout specs (ledger 0360, R23). `_`-
 * prefixed, so `routes.mjs` does not load it as a route.
 */

/** The harness has painted its page through PanelStack. */
export const READY = `() => !!document.querySelector('[data-testid="layout-harness"]') && document.querySelectorAll('[data-testid="layout-harness"] [data-panel]').length >= 5`;

/** The panels in DOM order, read off the page itself (never the harness's own data attribute). */
export const DOM_ORDER = `() => [...document.querySelectorAll('[data-testid="layout-harness"] .lh-main [data-panel]')].filter((e) => !e.parentElement.closest('[data-panel]')).map((e) => e.dataset.panel)`;

/** The settings panel is open, with this page's editor showing. */
export const editorOpen = (page) =>
	`() => !!document.querySelector('dialog[data-testid="classroom-settings"][open]') && document.querySelector('[data-testid="settings-arrange-${page}"]')?.getAttribute('aria-expanded') === 'true'`;

export const IGNORE = ['Failed to load resource: net::ERR_FAILED'];
