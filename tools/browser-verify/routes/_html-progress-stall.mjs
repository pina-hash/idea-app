/**
 * Shared steps for the `/dev/html-progress` stalled-database specs (ledger
 * 0360). `_`-prefixed, so the route loader skips it.
 *
 * THE CARD IS SCROLLED TO THE MIDDLE FIRST. A click here is a mouse click at
 * the control's centre, and a control left at the bottom edge of a 375px
 * viewport sits under the root layout's floating report control, which takes
 * the click: measured, a stall toggle that never toggled through twelve
 * attempts at 375 while the same step passed at 1440.
 *
 * THE FILL IS ONE CLICK, AND THE FAILURE IS WAITED FOR SEPARATELY. A `click`
 * step re-clicks until its predicate holds, and every re-click is another fill
 * that re-arms the saves: an `until` naming the END state (four failed
 * attempts) produced 84 attempts per block, the harness's doing, not the app's.
 */
export const CARD = '[data-sc="stalled"]';
export const RAIL = `${CARD} [data-hx-progress]`;

export const STALL_PREPARE = [
	{ waitFor: `() => !!document.querySelector('${RAIL}')` },
	{
		evaluate: `() => { document.querySelector('${CARD}').scrollIntoView({ block: 'center', behavior: 'instant' }); return 'centred'; }`
	},
	{
		click: `${CARD} [data-drive="stall-timeout"]`,
		until: `() => window.__hxp?.stalled?.mode === 'timeout'`
	},
	{
		click: `${CARD} [data-drive="stall-fill"]`,
		until: `() => (window.__hxp?.stalled?.calls ?? 0) > 0`
	},
	{
		waitFor: `() => window.__hxp?.stalled?.phase === 'failed' && Object.keys(window.__hxp.stalled.attempts).length === 2 && Object.values(window.__hxp.stalled.attempts).every((n) => n >= 4)`,
		timeoutMs: 15000
	}
];
