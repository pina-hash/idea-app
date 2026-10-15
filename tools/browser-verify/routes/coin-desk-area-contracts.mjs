/**
 * The coin desk's Contracts area (IDEA Coin V2 session two, 0248): post a job
 * (flat, hourly or quality, optionally a restitution job for students in debt),
 * and see where each claimant is. Completion is not a button here any more;
 * a claimant marked done waits in the Queue.
 *
 * The harness seeds five contracts: an open flat one whose first claimant is
 * marked done, a full hourly one, a restitution job, and a completed and a
 * cancelled one behind "Completed and cancelled".
 *
 * WHAT IS MEASURED: the open contracts render with their claimant states in
 * words, the restitution job carries its chip, NO "Complete" control exists
 * anywhere (an exact zero, against Cancel present on every open contract as
 * the positive control), and every pressed control clears 44px.
 */
export default {
	path: '/dev/coin-desk?area=contracts',
	label: 'Coin desk Contracts area (post, claimant states)',
	prepare: [
		{
			waitFor: '() => document.querySelectorAll(".cd-root [data-testid=\\"cd-contract\\"]").length > 0',
			timeoutMs: 8000
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-contracts-post"]', label: 'the post form', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-contracts-list"] > .contracts > [data-testid="cd-contract"]', label: 'open contracts', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-contract-debt-only"]', label: 'the restitution job chip', expectPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-contract-claimants"] [data-state="marked_done"]', label: 'a claimant marked done', expectPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-contract-cancel"]', label: 'Cancel on each open contract (positive control)', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-contract-complete"]', label: 'no Complete control', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-contract"] .title', label: 'a contract title', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-contract"] .facts', label: 'the pay and claim line', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-contracts-post"] .btn', label: 'Post contract', min: 44 },
		{ selector: '.cd-root [data-testid="cd-contracts-post"] .radio', label: 'pay type choices', min: 44 },
		{ selector: '.cd-root [data-testid="cd-contract-cancel"]', label: 'Cancel contract', min: 44 }
	]
};
