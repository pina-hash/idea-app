export default {
	path: '/dev/feedback?state=admin-link',
	aliasOf: '/dev/feedback',
	label: 'Report box opened as an admin: the Feedback page link in its header (report R15), and the horizon keys',
	/*
		THE ADMIN ARRANGEMENT OF THE REAL BOX (report R15). `/dev/feedback`
		mounts the real SiteFeedback in an "As an admin sees it" section with
		`consoleHref` handed in, which is the value the root layout derives from
		`page.data.isAdmin` for an admin (a /dev route holds no session, so it
		cannot be derived here). The STUDENT arrangement is the same page's
		first relocated mount, which `feedback.mjs` opens and where this link is
		asserted ABSENT -- the two counts are one fixture, both directions.

		WHAT IS MEASURED: the link is present once, in the header, visible, at
		44px, with its word at 4.5:1 on the box's plate; and the two horizon keys
		(0230), which the same box now carries under the kind keys, at 44px and
		4.5:1. The click's predicate is the link having a BOX, which only a real
		open produces.
	*/
	prepare: [
		{
			click: '[data-testid="hx-admin-report"] .sfb-trigger',
			until: '() => { const a = document.querySelector(\'[data-testid="fb-console-link"]\'); return !!a && a.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		}
	],
	presence: [
		{
			selector: '[data-testid="fb-console-link"]',
			label: 'the Feedback page link, once',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-head [data-testid="fb-console-link"]',
			label: 'in the box header, beside the close control',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[role="radiogroup"][aria-label="When to act on this"] [role="radio"]',
			label: 'the two horizon keys: Fix soon and Long-term idea',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '#fb-horizon-hint',
			label: 'the sentence saying what the chosen horizon means',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	textContains: [
		{
			selector: '[data-testid="fb-console-link"]',
			label: 'the link says where it goes, and that it opens a new tab',
			must: ['Feedback page', 'opens in a new tab']
		},
		{
			selector: '[aria-label="When to act on this"]',
			label: 'the horizon keys carry their words',
			must: ['Fix soon', 'Long-term idea']
		}
	],
	contrast: [
		{ selector: '[data-testid="fb-console-link"]', label: 'the Feedback page link word', min: 4.5 },
		{ selector: '.fb-horizon.on', label: 'the chosen horizon key', min: 4.5 },
		{ selector: '.fb-horizon:not(.on)', label: 'the other horizon key', min: 4.5 },
		{ selector: '#fb-horizon-hint', label: 'the horizon hint', min: 4.5 },
		{ selector: '.fb-title', label: 'the box title beside the link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="fb-console-link"]', label: 'the Feedback page link', min: 44 },
		{ selector: '.fb-horizon', label: 'the two horizon keys', min: 44 },
		{ selector: '.fb-x', label: 'the close control beside the link', min: 44 }
	]
};
