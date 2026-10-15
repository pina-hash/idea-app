/**
 * The coin desk's Students area as a FULL coin admin sees it (IDEA Coin V2
 * session two): one student, end to end.
 *
 * `/dev/coin-desk?area=students` opens the area directly (the harness reads
 * `?area`), and the prepare step picks the first student on the first class's
 * roster (coin_fine_roster), which is what loads the telemetry
 * (coin_student_stats) and the history (coin_admin_lookup).
 *
 * WHAT IS MEASURED:
 *  - THE TELEMETRY IS NOT A PICTURE ALONE. Both charts render, each with its
 *    sentence; the sentence's contrast is measured because it IS the chart for
 *    a reader who cannot see the SVG.
 *  - A FULL ADMIN GETS EVERY TOOL AND THE EDIT. The tools block, the amount
 *    edit on at least one history row, and the whole-economy export are
 *    present here; `coin-desk-area-students-scope-section` is the same page
 *    for section staff, where each of those is an exact zero. Each spec is
 *    the other's positive control.
 *  - EVERY PRESSED CONTROL CLEARS 44px.
 */
export default {
	path: '/dev/coin-desk?area=students',
	label: 'Coin desk Students area, full coin admin (one student)',
	prepare: [
		{
			click: '.cd-root [data-testid="cd-students-roster"] .roster-row',
			until: '() => !!document.querySelector(".cd-root [data-testid=\\"cd-student-stats\\"]") && !!document.querySelector(".cd-root [data-testid=\\"cd-history-row\\"]")',
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-students-roster"] .roster-row', label: 'roster rows (positive control)', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-student-stats"]', label: 'the telemetry block', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-balance-chart"] svg', label: 'the balance chart', expectPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-weeks-chart"] svg', label: 'the weekly bars', expectPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-history-row"]', label: 'history rows', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-edit-amount"]', label: 'an amount edit on the history (full only)', expectPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-full-tools"]', label: 'the full coin admin tools', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-export-economy-csv"]', label: 'the whole-economy export (full only)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-export-student-csv"]', label: 'the one-student export', expectPresent: 1, maxPresent: 1 }
	],
	contrast: [
		{ selector: '.cd-root [data-testid="cd-balance-chart"] .chart-sentence', label: "the balance chart's sentence", min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-history-row"] .reason', label: 'a history row', min: 4.5 },
		{ selector: '.cd-root [data-testid="cd-students-roster"] .roster-row .name', label: 'a roster name', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-students-roster"] .roster-row', label: 'roster rows', min: 44 },
		{ selector: '.cd-root [data-testid="cd-edit-amount"]', label: 'Edit amount', min: 44 },
		{ selector: '.cd-root [data-testid="cd-export"] .btn', label: 'export buttons', min: 44 }
	]
};
