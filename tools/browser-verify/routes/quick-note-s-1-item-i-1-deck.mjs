import { IGNORE_FIXTURE_PHOTO } from './_quick-note.mjs';

/**
 * THE QUICK NOTE IS ABSENT ON THE LESSON DECK (ledger 0298). A deck is on the
 * wall in front of the class, and a private notebook control on it is a
 * student's notebook on the projector. The deck is in `PROJECTOR_ROUTES`, and
 * the shell renders neither the row control nor the Menu entry there.
 *
 * THE POSITIVE CONTROL IS THE SAME PAGE'S HEADER: the profile menu is drawn, so
 * a zero below is the deck's answer rather than a header that never rendered.
 * The included direction is every other quick-note spec.
 */
export default {
	path: '/dev/quick-note/s-1/item/i-1/deck',
	label: 'Quick note: absent on the lesson deck, with the header itself present',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [{ waitFor: '() => !!document.querySelector(".cr-header .pm-trigger")', timeoutMs: 20000 }],
	presence: [
		{ selector: '.cr-header .pm-trigger', label: 'positive control: the header rendered, profile menu and all', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="quick-note"]', label: 'no quick note on the deck', expectPresent: 0 },
		{ selector: '[data-testid="quicknote-menu-item"]', label: 'no Menu entry for it either', expectPresent: 0 }
	]
};
