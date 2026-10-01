/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * THE WHOLE-FOUNDRY SWITCH (ledger 0360, report c26026b0: "I also want to be
 * able to shut down The Foundry entirely for all users").
 *
 * What a student reads while it is off, what an administrator reads, and the
 * switch itself armed: turning it off is two presses and the confirm restates
 * what it reaches and what it cannot stop, before the press that costs
 * something.
 */
export default {
	path: '/dev/foundry-site',
	label: 'Foundry switched off: the student panel, the admin banner and the switch (report c26026b0)',
	prepare: [
		{
			click: '[data-view="switch-on"] [data-testid="foundry-site-arm"]',
			until: '() => !!document.querySelector(\'[data-view="switch-on"] [data-testid="foundry-site-confirm"]\')'
		}
	],
	presence: [
		{ selector: '[data-view="panel"] [data-testid="foundry-site-off"] h2', label: 'the off panel heading', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="panel"] .fdy-off-note-text', label: 'the administrator note, as text', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="banner"] a.fdy-off-banner-link', label: 'the banner door to the switch', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="switch-on"] [data-testid="foundry-site-off-confirm"]', label: 'the confirm, once armed', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="switch-off"] [data-testid="foundry-site-on"]', label: 'one press turns it back on', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-view="switch-off"] [data-testid="foundry-site-arm"]', label: 'no arm step while it is already off', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{ selector: '[data-view="panel"]', label: 'the student panel says it is off for everyone', must: ['The Foundry is turned off right now.', 'It is off for the whole school'] },
		{ selector: '[data-view="switch-on"] [data-testid="foundry-site-confirm"]', label: 'the confirm names what it cannot stop', must: ['Two things it cannot stop', 'share links'] },
		{ selector: '[data-view="switch-on"] [data-testid="foundry-site-state"]', label: 'the state is a word', must: ['On'] },
		{ selector: '[data-view="switch-off"] [data-testid="foundry-site-state"]', label: 'the state is a word, off', must: ['Off'] }
	],
	tapTargets: [
		{ selector: '[data-view="switch-on"] .fdy-switch-do .btn', label: 'Turn it off and Keep it on', min: 44 },
		{ selector: '[data-view="switch-off"] [data-testid="foundry-site-on"]', label: 'Turn the Foundry back on', min: 44 },
		{ selector: '[data-view="banner"] a.fdy-off-banner-link', label: 'Go to the switch', min: 44 },
		{ selector: '[data-view="switch-on"] [data-testid="foundry-site-note"]', label: 'the note box', min: 44 }
	],
	contrast: [
		{ selector: '[data-view="panel"] [data-testid="foundry-site-off"] h2', label: 'the off heading', min: 4.5 },
		{ selector: '[data-view="panel"] .fdy-off-scope', label: 'the scope sentence', min: 4.5 },
		{ selector: '[data-view="panel"] .fdy-off-note-text', label: 'the note', min: 4.5 },
		{ selector: '[data-view="banner"] .fdy-off-banner-text', label: 'the banner sentence', min: 4.5 },
		{ selector: '[data-view="switch-on"] .fdy-switch-effect', label: 'what turning it off covers', min: 4.5 },
		{ selector: '[data-testid="foundry-site-state"]', label: 'the state word', min: 4.5 }
	]
};
