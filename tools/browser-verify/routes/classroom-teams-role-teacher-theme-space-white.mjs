/**
 * THE TEACHER'S "TEAMS POSTED UNTIL" STRIP UNDER SPACE WHITE (ledger 0298,
 * R23). The strip reads the room's own tokens (`--surface-1`, `--boundary`,
 * `--text-1`) and the classroom's `.btn.tiny`, so the light theme repaints it;
 * this measures it on the white page.
 */
import { IGNORE, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?role=teacher&theme=space-white',
	label: 'Class page as the teacher under Space White: the posted-until strip',
	prepare: [
		{ waitFor: READY, timeoutMs: 20000 },
		{ waitFor: `() => document.documentElement.getAttribute('data-theme') === 'space-white'`, timeoutMs: 10000 }
	],
	presence: [
		{ selector: 'html[data-theme="space-white"]', label: 'Space White is on', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="class-teams-posted"]', label: 'the posted-until strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [{ selector: '[data-testid="class-teams-posted"]', label: 'posted and until when', must: ['Teams posted until', 'Manage in People'] }],
	contrast: [
		{ selector: '[data-testid="class-teams-posted"] .ct-posted-text', label: 'strip text', min: 4.5 },
		{ selector: '[data-testid="class-teams-manage"]', label: 'strip link', min: 4.5 },
		{ selector: '[data-testid="class-teams-board"]', label: 'board trigger', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="class-teams-manage"]', label: 'the People link' }],
	ignoreConsole: IGNORE
};
