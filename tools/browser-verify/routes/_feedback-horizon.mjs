/**
 * SHARED BY `feedback-view-console-horizon-both.mjs` AND ITS SPACE WHITE TWIN.
 * `_`-prefixed, so the loader does not read it as a route spec.
 *
 * THE FEEDBACK CONSOLE'S TWO LISTS (0230): Fix soon and Long-term ideas, shown
 * side by side under "Both".
 *
 * `/dev/feedback?view=console` mounts the REAL FeedbackConsole under the site
 * plate, as /admin/feedback does, over a sink of nine reports: seven on "fix
 * soon" (one of them already corrected by an admin, 0233) and two long-term ideas, one carried in the column and one only in
 * `meta.horizon` (a report written against a backend before 0230), which is
 * also the oldest row in the sink. The console opens on Fix soon; the prepare
 * step presses "Both", and the predicate is the long-term list existing.
 *
 * WHAT IS MEASURED: both lists render with their own headings and the right
 * counts (9 reports, 2 long-term chips, a move control on all 9); the chip
 * word, the headings and the horizon tabs at 4.5:1 on their real grounds; the
 * tabs and the move controls at 44px.
 */
export const HORIZON_PREPARE = [
	{
		click: '[data-testid="fbc-horizon-both"]',
		until: '() => !!document.querySelector(\'[data-testid="fbc-group-long_term"] article.fb-row\')',
		attempts: 8,
		waitMs: 300
	}
];

export const HORIZON_CHECKS = {
	presence: [
		{
			selector: '[data-testid="fbc-group-now"]',
			label: 'the Fix soon list',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="fbc-group-long_term"]',
			label: 'the Long-term ideas list',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="fbc-group-long_term"] article.fb-row',
			label: 'the two long-term ideas, the meta-only one included, in their own list',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid="fbc-group-now"] article.fb-row',
			label: 'the seven reports to fix soon, in theirs',
			expectPresent: 7,
			maxPresent: 7,
			expectVisible: 7
		},
		{
			selector: '[data-testid="fbc-long-term-chip"]',
			label: 'a Long-term tag on each long-term idea, and on no other report',
			expectPresent: 2,
			maxPresent: 2,
			expectVisible: 2
		},
		{
			selector: '[data-testid^="fbc-horizon-move-"]',
			label: 'a move control on every report',
			expectPresent: 9,
			maxPresent: 9,
			expectVisible: 9
		}
	],
	textContains: [
		{
			selector: '#fbc-group-long_term',
			label: 'the long-term heading names its list and its count',
			must: ['Long-term ideas', '(2)']
		},
		{
			selector: '[data-testid="fbc-group-long_term"] [data-testid^="fbc-horizon-move-"]',
			label: 'a long-term report moves back to fix soon, in words',
			must: ['Move to fix soon']
		},
		{
			selector: '[data-testid="fbc-group-now"] [data-testid^="fbc-horizon-move-"]',
			label: 'a report to fix soon moves to long-term, in words',
			must: ['Move to long-term']
		}
	],
	contrast: [
		{ selector: '[data-testid="fbc-long-term-chip"]', label: 'the Long-term tag word', min: 4.5 },
		{ selector: '.fbc-group-title', label: 'the list headings', min: 4.5 },
		{ selector: '.fbc-horizons .filter', label: 'the horizon tabs', min: 4.5 },
		{ selector: '[data-testid^="fbc-horizon-move-"]', label: 'the move control word', min: 4.5 },
		{ selector: '.fb-message', label: 'a report message', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.fbc-horizons .filter', label: 'the horizon tabs', min: 44 },
		{ selector: '[data-testid^="fbc-horizon-move-"]', label: 'the move controls', min: 44 }
	]
};
