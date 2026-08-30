export default {
	path: '/dev/frc?state=review-console',
	label: 'FRC gate-review console (/frc/review), two pending submissions',
	aliasOf: '/dev/frc',
	/*
		THE REVIEWER'S WORKING SURFACE (0167): the harness's "Review console"
		view mounts the REAL FrcReviewConsole -- the identical component
		/frc/review mounts -- over the in-memory submission store, then seeds
		two pending submissions so the queue renders rows rather than its
		empty state.

		Both `until` predicates are satisfiable only by their click: at rest
		the console is not mounted at all, and after mounting the queue is
		empty until the seed lands two rows.
	*/
	prepare: [
		{
			click: '.harness-bar button:has-text("Review console")',
			until: '() => !!document.querySelector(".frr-queue, .frr-note")'
		},
		{
			click: '.sim-panel button:has-text("Seed 2 pending")',
			until: '() => document.querySelectorAll(".frr-queue .frq-item").length === 2'
		}
	],
	presence: [
		{ selector: '.frr-queue .frq-item', label: 'pending submission rows', expectPresent: 2, maxPresent: 2 },
		{ selector: '.frr-queue .frq-btn.approve', label: 'Approve & complete controls', expectPresent: 2, maxPresent: 2 },
		{ selector: '.frr-queue .frq-student', label: 'submitter name on each row', expectPresent: 2, maxPresent: 2 },
		/* The apply-migration note renders ONLY when the queue backend is
		   missing; with the store ready it must be absent. */
		{ selector: '.frr-note', label: '0167-unapplied note (ready state)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.head .lead', label: 'console lead copy on the FRC plate', min: 4.5 },
		{ selector: '.frr-queue .frq-student', label: 'submitter name on the dark queue panel', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.frr-queue .frq-btn', label: 'approve / revision controls', min: 24 }
	],
	/*
		A WRITE CLAIM no static presence read can settle: pressing Approve on
		the first row must (a) drop it from the pending queue and (b) mark its
		unit complete -- the harness mirrors frc_mark_complete into the same
		completed set the DomainLanding below the console reads.
	*/
	orderResult: [
		{
			evaluate: `async () => {
				const before = document.querySelectorAll('.frr-queue .frq-item').length;
				const btn = document.querySelector('.frr-queue .frq-btn.approve');
				if (!btn) return ['no-approve-control'];
				btn.click();
				await new Promise((r) => setTimeout(r, 250));
				const after = document.querySelectorAll('.frr-queue .frq-item').length;
				return [before, after];
			}`,
			expected: [2, 1],
			label: 'approving the first pending row removes exactly it from the queue'
		}
	]
};
