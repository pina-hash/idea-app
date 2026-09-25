import { IGNORE_FIXTURE_PHOTO } from './_quick-note.mjs';

/**
 * THE QUICK NOTE NEEDS A SIGNED-IN VIEWER (ledger 0298): a notebook is a
 * person's, and a signed-out visitor has none to write to. No session and no
 * harness viewer, so the dock renders nothing -- no row control, no Menu entry.
 * The positive control is the class row the same header draws.
 */
export default {
	path: '/dev/quick-note/s-1?signedout=1',
	label: 'Quick note: absent when signed out, with the header itself present',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [{ waitFor: '() => document.querySelectorAll("[data-testid=\\"class-icon\\"]").length > 0', timeoutMs: 20000 }],
	presence: [
		{ selector: '[data-testid="class-icon"]', label: 'positive control: the header drew its class row', expectPresent: 2 },
		{ selector: '[data-testid="quick-note"]', label: 'no quick note without a viewer', expectPresent: 0 },
		{ selector: '[data-testid="quicknote-menu-item"]', label: 'no Menu entry for it either', expectPresent: 0 }
	]
};
