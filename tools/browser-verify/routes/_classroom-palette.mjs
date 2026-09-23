/**
 * Shared steps and probes for the /dev/classroom-palette specs (ledger 0297,
 * F3+F5): the command palette, the classroom settings panel and the search
 * inside a class, on the REAL ClassroomShell and the REAL ClassView.
 *
 * `_`-prefixed, so the route loader skips it (routes.mjs).
 *
 * EVERY STEP WAITS ON ITS OWN EFFECT, never on a timer: the harness is
 * client-rendered, so paint and interactivity arrive together, but a keydown
 * dispatched before the palette's window listener is attached does nothing
 * and a spec that slept instead of asking would measure a closed dialog.
 */

/** Where the harness is, as a student and as a teacher. */
export const STUDENT = '/dev/classroom-palette/s-1?manage=0';
export const MANAGER = '/dev/classroom-palette/s-1?manage=1';

/** The harness is ready once the class search has hydrated (it is client-rendered). */
export const READY = { waitFor: '() => !!document.querySelector(\'[data-testid="stream-search"]\')', timeoutMs: 20000 };

/**
 * A REAL KEY PRESS the palette's own window listener receives: a keydown
 * dispatched on the body bubbles to `window`, exactly as a person's does. It
 * is re-sent until the dialog is on screen, which is what makes it safe
 * against a listener attached a moment after paint.
 */
export const pressKey = (init, until) => ({
	evaluate: `() => { document.body.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(init)}))); return 'pressed ' + ${JSON.stringify(JSON.stringify(init))}; }`,
	until
});

export const PALETTE_OPEN = '() => !!document.querySelector(\'[data-testid="command-palette"][data-mode="search"]\')';
export const LEGEND_OPEN = '() => !!document.querySelector(\'[data-testid="command-palette"][data-mode="keys"]\')';

/**
 * TYPING, AS AN `evaluate` STEP: set the value and dispatch `input`, which is
 * what `bind:value` and an `oninput` listen for and what a keystroke does.
 * Returns what was typed so the report prints it.
 */
export const typeInto = (testId, text, until) => ({
	evaluate: `() => { const el = document.querySelector('[data-testid="${testId}"]'); if (!el) return 'NO FIELD ${testId}'; el.focus(); el.value = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed: ' + el.value; }`,
	until
});

/** The palette's rows, by key, in the order on screen. */
export const PALETTE_ROWS = `() => [...document.querySelectorAll('[data-testid="palette-row"]')].map((r) => r.getAttribute('data-key'))`;

/**
 * THE CLASS PAGE'S ROWS, read off the DOM in document order as
 * `<group>:<row>` -- an item by its id, a check-in by its name -- so a claim
 * about "what is left on screen, in which unit, in what order" is one array.
 */
export const STREAM_ROWS = `() => [...document.querySelectorAll('[data-testid="unit-group"]')].flatMap((g) => {
	const group = g.getAttribute('data-group-id');
	return [...g.querySelectorAll('[data-item-id], .check-in-row')].map((row) =>
		group + ':' + (row.getAttribute('data-item-id') ? 'item:' + row.getAttribute('data-item-id') : 'checkin:' + row.querySelector('.row-name').textContent.trim())
	);
})`;
