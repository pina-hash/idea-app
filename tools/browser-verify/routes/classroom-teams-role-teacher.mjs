/**
 * POSTED TEAMS, AS THE CLASS'S TEACHER READS THE CLASS PAGE (ledger 0298,
 * R23). A teacher is on no team, so before this the only trace of a posted
 * draw on their own class page was a closed board. Now one line says it is
 * posted and until when, with the People tab one press away; the board stays
 * closed below it, the same board the class reads. The student spec beside
 * this one is the positive control for the strip's absence there.
 */
import { CLASS_LIST, IGNORE, PARTS, READY } from './_classroom-teams.mjs';

export default {
	path: '/dev/classroom-teams?role=teacher',
	label: 'Class page as the teacher, teams posted today: the posted-until strip, the board closed',
	prepare: [{ waitFor: READY, timeoutMs: 20000 }],
	orderResult: [
		{ label: 'the strip first, then the board, and no own team', evaluate: PARTS, expected: ['class-teams-posted', 'class-teams-board'] },
		{
			label: 'the People link goes to the class People tab',
			evaluate: `() => { const a = document.querySelector('[data-testid="class-teams-manage"]'); return [new URL(a.href).pathname, a.textContent.replace(/\\s+/g, ' ').trim()]; }`,
			expected: ['/classroom/s-teams/people', 'Manage in People']
		},
		{
			label: 'the link sits inside the strip, and beside the words from 1024px up',
			evaluate: `() => { const s = document.querySelector('[data-testid="class-teams-posted"]'); const t = s.querySelector('.ct-posted-text').getBoundingClientRect(); const a = s.querySelector('[data-testid="class-teams-manage"]').getBoundingClientRect(); const box = s.getBoundingClientRect(); return [a.right <= box.right + 0.5, a.left >= box.left - 0.5, innerWidth >= 1024 ? Math.abs(t.top + t.height / 2 - (a.top + a.height / 2)) < 2 : true]; }`,
			expected: [true, true, true]
		}
	],
	presence: [
		{ selector: '[data-testid="class-teams-posted"]', label: 'the posted-until strip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-manage"]', label: 'its People link', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-teams-board"][aria-expanded="false"]', label: 'the board, closed by default', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="class-team-mine"]', label: 'no own team for a teacher', expectPresent: 0 },
		CLASS_LIST
	],
	textContains: [
		{ selector: '[data-testid="class-teams-posted"]', label: 'the strip says posted and until when', must: ['Teams posted until', '11:59 PM', 'Manage in People'], mustNot: ['@'] },
		{ selector: '[data-testid="class-teams"]', label: 'names, never addresses', must: ['All teams', 'Lab pairs'], mustNot: ['@', 'boscotech'] }
	],
	contrast: [
		{ selector: '[data-testid="class-teams-posted"] .ct-posted-text', label: 'strip text', min: 4.5 },
		{ selector: '[data-testid="class-teams-manage"]', label: 'strip link', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="class-teams-manage"]', label: 'the People link' },
		{ selector: '[data-testid="class-teams-board"]', label: 'the board trigger' }
	],
	ignoreConsole: IGNORE
};
