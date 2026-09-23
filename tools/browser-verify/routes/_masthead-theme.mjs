/**
 * THE CLASSROOM MASTHEAD UNDER THE TWO DARK THEMES (ledger 0297, package F1b),
 * one spec per theme from this factory. `theme-switch.mjs` measures it under
 * Space White, reached through the switch; these measure the SAME rows with the
 * theme set through `?state=<id>`, the harness's shipping setter, so the three
 * tables sit side by side in one run and a sweep that touched a dark theme on
 * the way past shows up as a number rather than a feeling.
 *
 * On a monitor the rows are gated at the text floor: IDEA and Matrix are the
 * looks this bundle must leave as they were. Under the projector-washout model
 * they are recorded at a floor of 0, the way the `themes*` specs record the
 * dark palettes -- only Space White is built for the wall.
 */
export const mastheadThemeSpec = (theme) => ({
	path: `/dev/theme-switch?state=${theme}`,
	label: `Classroom masthead under the ${theme} theme: switcher, trail, switch word and a card of the register`,
	prepare: [
		{
			waitFor:
				theme === 'idea'
					? `() => document.documentElement.getAttribute('data-theme') === null && document.querySelector('[data-testid="theme-switch"]')?.getAttribute('aria-pressed') === 'false'`
					: `() => document.documentElement.getAttribute('data-theme') === '${theme}'`,
			label: theme === 'idea' ? 'IDEA: no attribute, the switch unpressed' : `the ${theme} attribute is on <html>`
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'the classroom room (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cr-header [data-testid="theme-switch"]', label: 'the switch, in the classroom header', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		theme === 'idea'
			? { selector: 'html[data-theme]', label: 'no theme attribute on <html>', expectPresent: 0, maxPresent: 0 }
			: { selector: `html[data-theme="${theme}"]`, label: `the ${theme} attribute is on <html>`, expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="theme-switch"] .ts-word', label: 'the switch word', min: 4.5 },
		{ selector: '.sw-trigger .sw-name', label: 'class switcher name', min: 4.5 },
		{ selector: '.sw-trigger .sw-code', label: 'class switcher course code', min: 4.5 },
		{ selector: '[data-testid="crumbs"] a, [data-testid="crumbs"] [aria-current]', label: 'trail', min: 4.5 },
		{ selector: '.ts-copy', label: 'card body copy', min: 4.5 },
		{ selector: '.ts-eyebrow, .ts-meta', label: 'card micro-label and meta', min: 4.5 },
		{ selector: '.ts-chip', label: 'status chips on their fills', min: 4.5 },
		{ selector: '.ts-copy, .sw-trigger .sw-name', label: 'body copy on the wall [recorded, not gated]', min: 0, projector: true },
		{ selector: '.ts-eyebrow, .ts-meta, .ts-chip, [data-testid="theme-switch"] .ts-word', label: 'muted copy and status on the wall [recorded, not gated]', min: 0, projector: true }
	],
	tapTargets: [{ selector: '[data-testid="theme-switch"]', label: 'the switch', min: 44 }]
});
