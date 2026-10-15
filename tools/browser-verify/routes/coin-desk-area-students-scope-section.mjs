/**
 * The coin desk's Students area as SECTION coin staff see it (decision 68):
 * the telemetry, the history with no amount edit, and the export for one
 * student or one class, and nothing else.
 *
 * `/dev/coin-desk?area=students&scope=section` mounts the harness as section
 * staff: the lookup answers `can_edit: false` and the view is handed
 * `scope="section"`. The removed controls are ABSENT, not disabled, so every
 * one is an exact zero here, and `coin-desk-area-students` (the full admin's
 * view of the same student) is where each is present: the two specs are each
 * other's positive control, and this one carries its own (the telemetry, the
 * history and the one-student export are present).
 */
export default {
	path: '/dev/coin-desk?area=students&scope=section',
	label: 'Coin desk Students area, section coin staff (no tools, no edit)',
	prepare: [
		{
			click: '.cd-root [data-testid="cd-students-roster"] .roster-row',
			until: '() => !!document.querySelector(".cd-root [data-testid=\\"cd-student-stats\\"]") && !!document.querySelector(".cd-root [data-testid=\\"cd-history-row\\"]")',
			attempts: 12,
			waitMs: 300
		}
	],
	presence: [
		{ selector: '.cd-root [data-testid="cd-student-stats"]', label: 'the telemetry block (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-history-row"]', label: 'history rows (positive control)', expectPresent: 3 },
		{ selector: '.cd-root [data-testid="cd-export-student-csv"]', label: 'the one-student export (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-export-class-csv"]', label: 'the one-class export (positive control)', expectPresent: 1, maxPresent: 1 },
		{ selector: '.cd-root [data-testid="cd-edit-amount"]', label: 'no amount edit', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root [data-testid="cd-full-tools"]', label: 'no full coin admin tools', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root [data-testid="cd-export-economy-csv"]', label: 'no whole-economy export', expectPresent: 0, expectVisible: 0, maxVisible: 0 },
		{ selector: '.cd-root [data-testid="cd-students-email"]', label: 'no look-up-anyone box', expectPresent: 0, expectVisible: 0, maxVisible: 0 }
	],
	tapTargets: [
		{ selector: '.cd-root [data-testid="cd-students-roster"] .roster-row', label: 'roster rows', min: 44 }
	]
};
