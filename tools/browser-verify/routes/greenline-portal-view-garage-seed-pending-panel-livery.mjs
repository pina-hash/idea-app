/**
 * THE STUDENT'S OWN DECAL, WAITING -- the livery tab of the same seeded garage.
 *
 * Aliased onto `?view=garage&seed=pending` (the URL it actually visits) because
 * this is a different STATE of that page rather than a different page: one DOM
 * state per run, and the track picker and the livery panel are on two different
 * tabs. Its twin measures the track half.
 *
 * The decal's own copy was already right -- "only you see it until a teacher
 * approves" has been on this panel since 0051, which is why the track half was
 * the one that needed fixing. What was NOT right is the geometry: every control
 * in here was 24px, on the surface a student opens on a phone.
 */
export default {
	path: '/dev/greenline-portal?view=garage&seed=pending&panel=livery',
	aliasOf: '/dev/greenline-portal?view=garage&seed=pending',
	label: 'GREENLINE garage -- the author’s own decal, awaiting review',
	prepare: [
		/* THE GARAGE IS THE HEAVIEST SURFACE IN THE APP and `waitForApp` returns
		   on painted-and-settled markup, which the harness chrome satisfies
		   before the component has mounted. Measured: the tab strip is not in
		   the DOM until well after that. `clickUntil` does NOT retry a selector
		   that matches nothing (it reports `0 matched, 0 attempt(s)`), so the
		   wait has to come first or every row after it describes a screen the
		   run never reached -- which is exactly what the first version of this
		   spec measured. */
		{
			waitFor: '() => !!document.querySelector(\'[data-testid="gg-tab-livery"]\')',
			timeoutMs: 20000
		},
		{
			click: '[data-testid="gg-tab-livery"]',
			until: '() => !!document.querySelector(".gg-livery-decal")'
		},
		/* The seed uploads a real PNG through the real validator, so the decal
		   row arrives after the tab press rather than with it. */
		{
			waitFor: '() => !!document.querySelector(".gg-decal-row")',
			timeoutMs: 20000
		}
	],
	presence: [
		{ selector: '.gg-decal-row', label: 'the uploaded decal', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '.gg-decal-thumb', label: 'and the image the student uploaded', expectPresent: 1, expectVisible: 1 },
		{ selector: '.gg-decal-chips .gg-chip', label: 'the status chip on the decal row', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		/* No teacher feedback until there is some: the positive control for
		   this absence is the `needs_revision` branch, which renders
		   `.gg-decal-feedback`. */
		{ selector: '.gg-decal-feedback', label: 'no teacher note while nothing has been said', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '.gg-decal-meta',
			label: 'what a student is told about their own pending decal',
			must: ['PENDING REVIEW', 'only you see it until a teacher approves'],
			mustNot: ['published', 'live']
		}
	],
	contrast: [
		{ selector: '.gg-decal-chips .gg-chip', min: 4.5, label: 'the PENDING REVIEW chip' },
		{ selector: '.gg-decal-note', min: 4.5, label: 'the sentence beside it' }
	],
	tapTargets: [
		/* `.gg-pattern` is every control in the livery panel: the pattern
		   swatches, "Show on car", "Replace" and "Remove". All were 24px. */
		{ selector: '.gg-pattern', label: 'livery and decal controls', min: 44 }
	]
};
