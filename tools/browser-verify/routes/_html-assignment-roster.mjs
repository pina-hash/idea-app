/**
 * Shared steps and probes for the grading console's reading of a FINISHED
 * ported worksheet (decision 37, ledger 0298) on /dev/html-assignment-grading.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 */

/** The roster arrives from a transport: wait on the rows, then open Alice's. */
export const OPEN_ALICE = [
	{ waitFor: `() => document.querySelectorAll('.roster-row').length > 0`, attempts: 40, gapMs: 250 },
	{
		click: '.roster-row',
		until: `() => !!document.querySelector('.hx-frame-wrap')`,
		attempts: 25,
		gapMs: 300
	}
];

/** Every roster row as "<name>: <state chip>", in roster order. */
export const ROSTER_STATES = `() => [...document.querySelectorAll('.roster-row')].map((r) =>
	r.querySelector('.roster-name')?.textContent.trim() + ': ' +
	([...r.querySelectorAll('.roster-chip')].filter((c) => !c.classList.contains('section') && !c.classList.contains('incomplete') && !c.classList.contains('changed')).map((c) => c.textContent.trim()).join(', '))
)`;

/** The blocks the work pane lists as changed after grading. */
export const CHANGED_BLOCKS = `() => [...document.querySelectorAll('[data-testid="changed-block"]')].map((li) =>
	li.textContent.replace(/\\s+/g, ' ').replace(/ at .*$/, '').trim()
)`;
