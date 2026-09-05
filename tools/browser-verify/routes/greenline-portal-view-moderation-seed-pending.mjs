/**
 * THE TEACHER'S QUEUE WITH SOMETHING IN IT -- the positive control for every
 * absence row in `greenline-portal-view-moderation.mjs`, and the measurement of
 * the controls a teacher actually presses.
 *
 * `?seed=pending` publishes one track through the harness's REAL client-side
 * validator and uploads one decal through the REAL `validateDecalFile`, so both
 * queues hold exactly one row in the state a student's submission lands in. A
 * URL rather than a click chain, deliberately: a chained prepare measures the
 * chain as well as the state, and one broken step leaves every number after it
 * describing a screen the run never reached.
 */
export default {
	path: '/dev/greenline-portal?view=moderation&seed=pending',
	label: 'GREENLINE moderation -- one track and one decal awaiting review',
	/* The seed is async (a canvas `toBlob` and a real image decode), so the
	   rows arrive after `waitForApp` rather than being pressed into existence.
	   `waitFor` is the right step for that and REPORTS the milliseconds; a
	   fixed settle long enough today measures an empty page the day the decode
	   gets slower, silently, because every selector honestly matches nothing. */
	prepare: [
		{
			waitFor: '() => !!document.querySelector(\'[data-testid^="mod-row-"]\') && !!document.querySelector(".gdq-item")',
			timeoutMs: 8000
		}
	],
	presence: [
		{ selector: '[data-testid^="mod-row-"]', label: 'the submitted track, in the queue', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '[data-testid^="mod-status-"]', label: 'its visibility state, which reads first', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid^="mod-approve-"]', label: 'APPROVE offered', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid^="mod-reject-"]', label: 'REQUEST CHANGES offered', expectPresent: 1, expectVisible: 1 },
		{ selector: '.gdq-item', label: 'the submitted decal, in the queue', expectPresent: 1, expectVisible: 1, maxPresent: 1 },
		{ selector: '.gdq-image', label: 'the decal image itself -- the submission IS the picture', expectPresent: 1, expectVisible: 1 },
		/* The two empty sentences must NOT be on screen once there is something
		   waiting. This is the other direction of the empty spec's rows, so
		   neither file can pass over a queue that renders both states at once. */
		{ selector: '[data-testid="mod-tracks-empty"]', label: 'empty-queue copy gone once a row exists', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="decal-queue-empty"]', label: 'empty decal copy gone once a row exists', expectPresent: 0, maxPresent: 0 }
	],
	textContains: [
		{
			selector: '[data-testid="mod-pending-count"]',
			label: 'the count names what is waiting',
			must: ['1 track', 'awaiting review'],
			/* The zero sentence must not be printed beside a non-zero count.
			   Both clauses are rendered from one `{#if}`, so a refactor that
			   split them would show both and nothing else would notice. */
			mustNot: ['nothing awaiting review']
		},
		{
			selector: '[data-testid^="mod-status-"]',
			label: 'the row states WHO can currently see it',
			must: ['AWAITING REVIEW', 'AUTHOR + STAFF ONLY']
		}
	],
	contrast: [
		{ selector: '[data-testid^="mod-status-"]', min: 4.5, label: 'the visibility chip' },
		{ selector: '[data-testid="mod-pending-count"]', min: 4.5, label: 'the count line' },
		{ selector: '.gdq-student', min: 4.5, label: 'the decal submitter’s name' }
	],
	tapTargets: [
		/* Every control a teacher presses to make a decision. All of them were
		   between 19px and 26px before this bundle. */
		{ selector: '.tm-btn', label: 'track decision controls (APPROVE / REQUEST CHANGES / FEATURE / REMOVE)', min: 44 },
		{ selector: '.tm-sort', label: 'queue sort controls', min: 44 },
		{ selector: '.gdq-btn', label: 'decal decision controls (Approve / Request revision)', min: 44 }
	]
};
