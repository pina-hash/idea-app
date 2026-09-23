/**
 * THE TO-DO WITH NOTHING OWED (ledger 0297): a sentence, the three views and
 * the class filter still there, and no group headings with nothing under them.
 * `classroom-todo-todo` is the positive control, with ten rows in five groups.
 */
import { TODO, TODO_COUNTS, TODO_READY } from './_classroom-todo.mjs';

export default {
	path: `${TODO}?empty=1`,
	label: "A student's to-do with nothing in it",
	prepare: [TODO_READY],
	orderResult: [{ label: 'every count is zero', evaluate: TODO_COUNTS, expected: ['0', '0', '0'] }],
	presence: [
		{ selector: '[data-testid="todo-empty"]', label: 'one sentence saying so', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.todo-view', label: 'the three views stay', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="todo-group"]', label: 'no empty group headings', expectPresent: 0 },
		{ selector: '[data-testid="todo-row"]', label: 'no rows', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="todo-empty"]', label: 'the sentence', must: ['Nothing assigned right now.'] }],
	contrast: [{ selector: '[data-testid="todo-empty"]', label: 'empty sentence', min: 4.5 }],
	tapTargets: [{ selector: '.todo-view', label: 'view controls' }]
};
