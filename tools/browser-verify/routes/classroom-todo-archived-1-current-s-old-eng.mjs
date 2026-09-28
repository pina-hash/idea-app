/**
 * STANDING ON AN ARCHIVED CLASS (report R12). The strip draws active classes
 * only, so the one guarantee that could fail silently is this: the class on
 * screen keeps its OWN key when it is archived, dashed and current, so nobody
 * is stranded on a page whose key vanished -- and the Archived list still
 * lists it, marked "You are here".
 *
 * `?current=s-old-eng` stands the harness's shell on last year's ENG1H.
 */
import { ARCHIVED, ARCHIVED_READY } from './_classroom-todo.mjs';

const LIST_OPEN = `() => { const l = document.querySelector('[data-testid="class-strip-archived-list"]'); return !!l && !l.hidden && l.getBoundingClientRect().height > 0; }`;

export default {
	path: `${ARCHIVED}&current=s-old-eng`,
	label: 'On an archived class: its own key stays in the strip, and the Archived list marks it',
	prepare: [ARCHIVED_READY, { click: '[data-testid="class-strip-archived"]', until: LIST_OPEN }],
	presence: [
		{ selector: '[data-testid="class-strip"] [data-testid="class-icon"]', label: 'four active keys and the current archived one', expectPresent: 5, maxPresent: 5 },
		{ selector: '[data-testid="class-icon"][data-section-id="s-old-eng"].current.archived[aria-current="page"]', label: 'the current archived class keeps its key, current and dashed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-icon"].archived:not(.current)', label: 'no other archived class has a key', expectPresent: 0 },
		{ selector: '[data-testid="class-strip-archived-item"]', label: 'the Archived list still holds all three', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="class-strip-archived-item"][aria-current="page"]', label: 'exactly one, the class on screen, is marked current', expectPresent: 1, maxPresent: 1 }
	],
	textContains: [
		{ selector: '[data-testid="class-strip-archived-item"][aria-current="page"]', label: 'it says so in words', must: ['ENG1H', 'You are here'] }
	],
	tapTargets: [{ selector: '[data-testid="class-icon"][data-section-id="s-old-eng"]', label: 'the current archived key', min: 44 }],
	contrast: [
		{ selector: '[data-testid="class-strip-archived-item"][aria-current="page"] .sw-item-flag', label: 'You are here', min: 4.5 }
	]
};
