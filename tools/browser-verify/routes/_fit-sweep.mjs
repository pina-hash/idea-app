/**
 * THE CLASSROOM FIT SWEEP (ledger 0297, package F2). One spec per classroom
 * surface that runs `controlFit` (../checks-visual.mjs) over the whole page:
 * no label within 4px of its own border, no control painted over another, and
 * the harness's usual horizontal-scroll, contrast-free baseline alongside it.
 * Run each at 375, 960, 1366 and 1440 (`--width`), since "nothing overlaps at
 * half-screen width" is the 960 claim.
 *
 * `path` is the spec's identity and `aliasOf` the URL, the convention every
 * state spec here follows: `sweep=fit` never reaches the harness.
 *
 * THE FEEDBACK BUTTON IS IN THE PAGE'S CORNER HERE TOO (ledger 0396), so every
 * sweep names it as the page's floating control: rows pass under it as the
 * page scrolls, as on the home page, and what is counted is a control still
 * under it at the end of every scroller, which is where each room makes room
 * for it (`controlFit`'s `floating`). It is looked up in the whole document, so
 * a sweep scoped to one room still judges that room's controls against it, and
 * a sweep whose page has no such button fails rather than passing on nothing.
 *
 * `_`-prefixed: a helper module, not a route spec.
 */
export const FEEDBACK_CORNER = '.sfb-shell .sfb-trigger';

export const fitSweep = (url, label, { prepare = [], root = 'body', extra = {}, floating = FEEDBACK_CORNER } = {}) => ({
	path: `${url}${url.includes('?') ? '&' : '?'}sweep=fit`,
	aliasOf: url,
	label: `Fit sweep: ${label}`,
	prepare,
	controlFit: [{ root, label: `${label}: every control`, floating }],
	...extra
});
