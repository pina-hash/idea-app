/**
 * THE CLASSROOM MASTHEAD FOLDS ITS TOOLS BEHIND A MENU ON A NARROW WINDOW
 * (ledger 0297, package F2). Below the fold breakpoint To-do, Search,
 * Settings, the Light switch, Voice and Report are one press away inside the
 * Menu instead of wrapping the masthead onto a second row, so a spec that
 * measures one of them opens the Menu first. Above the breakpoint the Menu
 * button is not rendered (no box), the tools sit in the row, and this step
 * does nothing -- so one spec file measures both arrangements.
 *
 * `_`-prefixed: a helper module, not a route spec.
 */
export const OPEN_SHELL_MENU = {
	/* It RETRIES AGAINST ITS OWN EFFECT rather than clicking once: paint is
	   not interactivity (CLAUDE.md), so a click that lands before hydration
	   attaches the handler does nothing, and a single click here would leave
	   the Menu shut and every later step measuring hidden controls. */
	evaluate: `async () => { const m = document.querySelector('[data-testid="shell-menu"]'); if (!m || m.offsetParent === null) return true; for (let i = 0; i < 40; i++) { if (m.getAttribute('aria-expanded') === 'true') return true; m.click(); await new Promise((r) => setTimeout(r, 150)); } return m.getAttribute('aria-expanded') === 'true'; }`,
	label: 'narrow window: open the Menu the header tools fold into (a no-op where they sit in the row)'
};
