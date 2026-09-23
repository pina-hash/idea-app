import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * THE TO-DO DOOR ON THE SITE HOME, as a student (ledger 0297).
 *
 * Apps come first for a student (report 21), which puts the class cards below
 * the first screen. So one line with the to-do's own counts sits between the
 * banner and the apps: at 1366x768 (measured by hand, 604 to 648) and on a
 * 375 phone it is on screen on arrival. The run's viewport is 900 tall at
 * every width, so the probe below asks the stricter question directly: does
 * the door's bottom edge clear 768, the shortest desktop screen this school
 * has?
 *
 * The counts are the to-do's: two classes, each with a deadline yesterday
 * (missing), one tonight and one tomorrow (due this week) and one in five
 * days, counted only if it falls before Saturday. The "See all in To-do" link
 * above the class cards is the second door, and the teacher's page
 * (`home-order-role-teacher-classes-2-rows-4-due-1-0-1-5`) carries neither.
 */
export default {
	path: '/dev/home-order?role=student&classes=2&rows=4&due=-1,0,1,5',
	label: 'Home (student): the To-do door above the apps',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-testid="todo-strip"]', label: 'the To-do door', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="todo-strip-missing"]', label: 'its missing count', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="feed-todo-all"]', label: 'See all in To-do above the class cards', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	domOrder: [{ before: '[data-testid="todo-strip"]', after: '.app-card', label: 'the door comes before the apps' }],
	textContains: [
		{ selector: '[data-testid="todo-strip-missing"]', label: 'two missing, one per class', must: ['2 missing'] },
		{ selector: '[data-testid="todo-strip"]', label: 'the door names itself and where it goes', must: ['Your to-do', 'See all'] }
	],
	orderResult: [
		{
			label: "the door's bottom edge clears a 768px-tall screen",
			evaluate: `() => [...document.querySelectorAll('[data-testid="todo-strip"]')].map((e) => e.getBoundingClientRect().bottom + scrollY <= 768)`,
			expected: [true]
		},
		{
			label: 'both doors lead to the to-do',
			evaluate: `() => [...document.querySelectorAll('[data-testid="todo-strip"], [data-testid="feed-todo-all"]')].map((a) => a.getAttribute('href'))`,
			expected: ['/classroom/todo', '/classroom/todo']
		}
	],
	contrast: [
		{ selector: '[data-testid="todo-strip"] .td-word', label: 'door word', min: 4.5 },
		{ selector: '[data-testid="todo-strip"] .td-owed', label: 'door counts', min: 4.5 },
		{ selector: '[data-testid="todo-strip"] .td-all', label: 'See all', min: 4.5 },
		{ selector: '[data-testid="feed-todo-all"]', label: 'See all in To-do', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="todo-strip"]', label: 'To-do door' },
		{ selector: '[data-testid="feed-todo-all"]', label: 'See all in To-do' }
	]
};
