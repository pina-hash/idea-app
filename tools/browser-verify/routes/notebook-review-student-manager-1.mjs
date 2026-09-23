/**
 * ONE STUDENT'S NOTEBOOK, OPENED FROM A CLASS'S OWN NOTEBOOK TAB (ledger 0297,
 * package F4a). `?manager=1` is a teacher who manages the class the grid was
 * opened from: the load hands the way back as that class's crumbs, and the
 * back link names the class notebook rather than the all-sections console.
 * The sibling `/dev/notebook-review-student` is the reviewer who does not
 * manage the class, whose way back is the console on that section -- the two
 * answers the load can give, one route each.
 */
export default {
	path: '/dev/notebook-review-student?manager=1',
	label: "One student's notebook, opened from the class's own Notebook tab (manager)",
	prepare: [
		{
			evaluate: `() => {
				const href = document.querySelector('[data-testid="back-to-review"]').getAttribute('href');
				if (href !== '/classroom/11111111-2222-4333-8444-555555555555/notebook') {
					throw new Error('back link is not the class notebook: ' + href);
				}
				return href;
			}`
		}
	],
	presence: [
		{ selector: '[data-testid="back-to-review"]', label: 'the way back', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="crumbs"] a[href="/classroom/11111111-2222-4333-8444-555555555555/notebook"]', label: "the class's Notebook crumb", expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="crumbs"] a[href^="/classroom/notebook/review"]', label: 'the all-sections console crumb (must be absent for a manager of the class)', expectPresent: 0 },
		{ selector: '.nb-root', label: 'NotebookView mounted (read-only)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.compose-card, input[type="file"]', label: 'any write control (read-only is structural)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.back-strip .who', label: 'back-strip student line', min: 4.5 },
		{ selector: '[data-testid="back-to-review"]', label: 'the way back', min: 4.5 }
	],
	tapReach: [{ selector: '[data-testid="back-to-review"]', label: 'the way back (a reach inside its line)', min: 44 }],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
