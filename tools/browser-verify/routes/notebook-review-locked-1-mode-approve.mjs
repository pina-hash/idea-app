/**
 * REVIEW IN ONE PASS (ledger 0297, package F4b): a class's Notebook tab on
 * its Approve view. `/dev/notebook-review?locked=1&mode=approve` mounts the
 * REAL ReviewConsole inside the REAL ClassroomShell with the reviewer's
 * preferences in memory, the way the class's tab does, and the queue opens on
 * the latest check-in day.
 *
 * WHAT IS ASSERTED: the queue lists every entry of that day nobody has
 * reviewed, and NOT the flagged one (the harness's day holds one; a flag is
 * read in the grid, never swept into "approve all"); the next-step chips are
 * the four seeds plus None; opening the view stamped "last looked" for the
 * class; the chosen chip, the Approve button and every row clear 44px.
 */
export default {
	path: '/dev/notebook-review?locked=1&mode=approve',
	label: "A class's Notebook tab, Approve view (one class day, new since last looked, next-step chips)",
	prepare: [{ waitFor: '() => document.querySelectorAll(\'[data-testid="rq-row"]\').length >= 1', timeoutMs: 20_000 }],
	presence: [
		{ selector: '[data-testid="mode-approve"][aria-pressed="true"]', label: 'Approve view, current', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="review-queue"]', label: 'the approve queue', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="rq-row"]', label: 'the unreviewed entries of the day', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="rq-comment-chip"]', label: 'the next-step chips (the four seeds)', expectPresent: 4, maxPresent: 4 },
		{ selector: '[data-testid="rq-filter-new"]', label: 'a "new since" filter (must be absent: this reviewer never looked before)', expectPresent: 0 }
	],
	orderResult: [
		{
			label: 'opening the view stamped this class as looked at, and no flagged entry is in the queue',
			evaluate: `() => {
				const prefs = window.__reviewPrefs ? window.__reviewPrefs() : null;
				const rows = [...document.querySelectorAll('[data-testid="rq-row"]')].map((r) => r.textContent);
				return [
					'looked at sec-a: ' + !!(prefs && prefs.lastLooked && prefs.lastLooked['sec-a']),
					'rows naming a flag: ' + rows.filter((t) => /flag/i.test(t)).length
				];
			}`,
			expected: ['looked at sec-a: true', 'rows naming a flag: 0']
		}
	],
	contrast: [
		{ selector: '.rq-name', label: 'student names', min: 4.5 },
		{ selector: '.rq-meta', label: 'upload stamps', min: 4.5 },
		{ selector: '.rq-chip', label: 'filter and next-step chips', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="rq-row"]', label: 'queue rows', min: 44 },
		{ selector: '.rq-chip', label: 'chips', min: 44 },
		{ selector: '[data-testid="rq-approve"]', label: 'Approve', min: 44 }
	],
	ignoreConsole: ['\\[401 http://127\\.0\\.0\\.1:\\d+/api/notebook/photo/']
};
