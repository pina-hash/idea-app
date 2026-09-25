import { IGNORE_FIXTURE_PHOTO } from './_quick-note.mjs';

/**
 * "HIDE QUICK NOTE" IS A PREFERENCE, AND IT COMES BACK FROM THE INBOX (ledger
 * 0298). The viewer arrives with `profiles.preferences.quickNote.hidden` set,
 * so the header has no Note control and no Menu entry; ticking "Show the Note
 * button" in the Inbox brings the control back at once, through the same
 * shared state the header reads. Both directions, on one page: absent before
 * the press (the prepare step's own return value says so), present after it.
 */
export default {
	path: '/dev/quick-note?hidden=1&view=inbox',
	label: 'Quick note: hidden by the preference, and shown again from the Inbox switch',
	ignoreConsole: IGNORE_FIXTURE_PHOTO,
	prepare: [
		{ waitFor: '() => !!document.querySelector("[data-testid=\\"nb-inbox-quicknote-toggle\\"] input")', timeoutMs: 20000 },
		{
			evaluate: `() => 'before the switch: ' + document.querySelectorAll('[data-testid="quick-note"]').length + ' quick note(s), switch ' + (document.querySelector('[data-testid="nb-inbox-quicknote-toggle"] input').checked ? 'on' : 'off')`,
			until: '() => document.querySelectorAll("[data-testid=\\"quick-note\\"]").length === 0 && !document.querySelector("[data-testid=\\"nb-inbox-quicknote-toggle\\"] input").checked'
		},
		{
			click: '[data-testid="nb-inbox-quicknote-toggle"] input',
			until: '() => !!document.querySelector("[data-testid=\\"quick-note\\"]")',
			attempts: 12,
			waitMs: 250
		}
	],
	presence: [
		{ selector: '[data-testid="quick-note"]', label: 'the quick note is back after the switch (drawn in the row from 560px, in the Menu below)', expectPresent: 1, maxPresent: 1, expectVisible: 0 },
		{ selector: '.cr-header [data-testid="qn-trigger"], [data-testid="quicknote-menu-item"]', label: 'and its two controls with it, one for each width', expectPresent: 2, maxPresent: 2, expectVisible: 0 },
		{ selector: '[data-testid="nb-inbox-quicknote-toggle"]', label: 'the switch, in the Inbox', expectPresent: 1, expectVisible: 1 }
	],
	tapTargets: [{ selector: '[data-testid="nb-inbox-quicknote-toggle"]', label: 'the Show the Note button switch', min: 44 }]
};
