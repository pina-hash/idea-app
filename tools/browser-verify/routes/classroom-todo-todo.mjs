/**
 * A STUDENT'S TO-DO, ASSIGNED, AT REST (ledger 0297), inside the REAL
 * ClassroomShell.
 *
 * WHAT IS MEASURED:
 *   - the rows are grouped Feedback to read, This week, Next week, Later and
 *     No due date, in that order, with every owed row across the three
 *     classes and nothing from the class this student TEACHES or any material;
 *   - the week is the school's week by the one clock: at 8pm Pacific on
 *     Thursday the 27th, 9am Pacific on the 28th is this week and reads
 *     "Due tomorrow", and the 31st (a Monday) is next week;
 *   - every row names its state in words, and a check-in owed today reads
 *     "Not filed yet" and is NOT missing (it is on this list, not the Missing
 *     one: `classroom-todo-todo-state-missing` is the other half);
 *   - the view counts are the owed counts: 9 to do (the returned row is a
 *     notice here, counted under Done), 6 missing, 4 done;
 *   - the shell's To-do door is on screen and marked as the current page;
 *   - every control and every row clears 44px (a student surface).
 */
import { TODO, TODO_COUNTS, TODO_PRESSED, TODO_READY, TODO_ROWS, TODO_STATES } from './_classroom-todo.mjs';

export default {
	path: TODO,
	label: "A student's to-do across classes: Assigned",
	prepare: [TODO_READY],
	orderResult: [
		{
			label: 'every owed row, grouped by the school week, in reading order',
			evaluate: TODO_ROWS,
			expected: [
				'feedback: item:i-materials',
				'this-week: check-in:ns-9:s-eng',
				'this-week: check-in:ns-13:s-idea',
				'this-week: item:i-loadlog',
				'this-week: item:i-cad',
				'this-week: item:i-scout',
				'next-week: item:i-beam',
				'next-week: item:i-portfolio',
				'later: item:i-drivetrain',
				'no-date: item:i-reflection'
			]
		},
		{
			label: 'each row says its state in words',
			evaluate: TODO_STATES,
			expected: [
				'Returned · 18/20',
				'Needs another look',
				'Not filed yet',
				'Not started',
				'Not started',
				'Not started',
				'Not started',
				'Not started',
				'Not started',
				'Not started'
			]
		},
		{
			label: 'deadlines in the school calendar: tonight is today, 9am tomorrow is tomorrow',
			evaluate: `() => [...document.querySelectorAll('[data-testid="todo-row"]')]
				.filter((r) => ['item:i-loadlog', 'item:i-cad', 'item:i-reflection'].includes(r.getAttribute('data-key')))
				.map((r) => r.querySelector('[data-testid="todo-when"]').textContent.replace(/[\\s\\u00b7]+/g, ' ').trim())`,
			expected: ['Due today, 11:58 PM', 'Due tomorrow, 9:00 AM', 'No due date']
		},
		{ label: 'the view counts: owed, missing, done', evaluate: TODO_COUNTS, expected: ['9', '6', '4'] },
		{ label: 'Assigned is the pressed view', evaluate: TODO_PRESSED, expected: ['assigned'] },
		{
			label: "the shell's To-do door marks this page as current",
			evaluate: `() => [...document.querySelectorAll('[data-testid="todo-door"]')].map((a) => a.getAttribute('aria-current'))`,
			expected: ['page']
		}
	],
	presence: [
		{ selector: '[data-testid="todo-door"]', label: "the shell's To-do door", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="todo-view-assigned"], [data-testid="todo-view-missing"], [data-testid="todo-view-done"]', label: 'the three views', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="todo-class"]', label: 'the class filter (three classes to choose from)', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="todo-row"]', label: 'rows listed', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		/* The two things that must NOT be listed, beside the ten that must: a
		   class the student teaches, and a material. */
		{ selector: '[data-testid="todo-row"][data-key*="s-aide"], [data-testid="todo-row"][data-key="item:i-aide"]', label: "no row from the class this student teaches", expectPresent: 0 },
		{ selector: '[data-testid="todo-row"][data-key="item:i-syllabus"]', label: 'no material', expectPresent: 0 },
		{ selector: '[data-testid="todo-empty"]', label: 'no empty message over a full list', expectPresent: 0 }
	],
	textContains: [
		{ selector: '[data-testid="todo-door"]', label: 'the door says To-do in a word', must: ['To-do'] },
		{ selector: '[data-testid="todo-group"][data-group="feedback"] h2', label: 'the feedback group is named', must: ['Feedback to read'] },
		{ selector: '[data-testid="todo-group"][data-group="no-date"] h2', label: 'the undated group is named', must: ['No due date'] }
	],
	contrast: [
		{ selector: '.todo-title', label: 'row title', min: 4.5 },
		{ selector: '.todo-meta-bit', label: 'row meta', min: 4.5 },
		{ selector: '[data-testid="todo-state"]', label: 'row state', min: 4.5 },
		{ selector: '.todo-group-label', label: 'group heading', min: 4.5 },
		{ selector: '.todo-view-word', label: 'view word', min: 4.5 },
		{ selector: '[data-testid="todo-door"] .shell-tool-word', label: 'To-do door word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="todo-door"]', label: 'To-do door' },
		{ selector: '.todo-view', label: 'view controls' },
		{ selector: '[data-testid="todo-class"]', label: 'class filter' },
		{ selector: '[data-testid="todo-row"]', label: 'rows' }
	]
};
