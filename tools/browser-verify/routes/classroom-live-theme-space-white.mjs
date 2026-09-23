/**
 * THE LIVE CLASS UNDER SPACE WHITE (ledger 0297). The harness holds no session,
 * so the attribute is forced (F1a's note: most /dev harnesses cannot reach the
 * theme through the real path); `/dev/classroom` is in the Space White scope.
 * The same rows as the IDEA spec, re-measured on the white console.
 */
import { LIVE_GROUPS, LIVE_READY } from './_classroom-live.mjs';

export default {
	path: '/dev/classroom-live?theme=space-white',
	label: 'Live class control view under Space White',
	prepare: [LIVE_READY, { waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }],
	orderResult: [
		{
			label: 'the same groups under the white theme',
			evaluate: LIVE_GROUPS,
			expected: ['idle 2', 'away 2', 'not-opened 1', 'working 4', 'needs-grading 1', 'submitted 2']
		}
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="live-cell"]', label: 'rows', expectPresent: 12, maxPresent: 12 }
	],
	contrast: [
		{ selector: '.lc-root .lc-panel-title', label: 'panel title', min: 4.5 },
		{ selector: '.lc-root .lg-name', label: 'student name', min: 4.5 },
		{ selector: '.lc-root .lg-detail', label: 'row detail', min: 4.5 },
		{ selector: '.lc-root .lg-chip', label: 'tally chip', min: 4.5 },
		{ selector: '.lc-root .lc-line-text', label: 'agenda line', min: 4.5 },
		{ selector: '.lc-root .lc-wall-state', label: 'projector state', min: 4.5 }
	],
	tapTargets: [{ selector: '.lc-root button', label: 'buttons' }],
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED']
};
