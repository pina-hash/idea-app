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
 * `_`-prefixed: a helper module, not a route spec.
 */
export const fitSweep = (url, label, { prepare = [], root = 'body', extra = {} } = {}) => ({
	path: `${url}${url.includes('?') ? '&' : '?'}sweep=fit`,
	aliasOf: url,
	label: `Fit sweep: ${label}`,
	prepare,
	controlFit: [{ root, label: `${label}: every control` }],
	...extra
});
