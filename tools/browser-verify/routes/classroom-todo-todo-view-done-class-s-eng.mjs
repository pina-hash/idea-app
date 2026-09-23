/**
 * THE TO-DO RESTORED FROM ITS ADDRESS: Done, one class (ledger 0297).
 *
 * `?view=done&class=s-eng` is what a press of Done and a choice of ENG1H
 * write, so opening it is the back button and a copied link. It must land on
 * Done, filtered to ENG1H, with the counts for that class alone:
 *   - the one ENG1H row that is done, handed back with a grade, and marked
 *     "Feedback to read" because the student has not opened it since;
 *   - nothing from FRC or IDEA209H (their done rows are the positive control
 *     on `classroom-todo-todo`'s Done count of 4).
 */
import { TODO, TODO_COUNTS, TODO_PRESSED, TODO_READY, TODO_ROWS, TODO_STATES } from './_classroom-todo.mjs';

export default {
	path: `${TODO}?view=done&class=s-eng`,
	label: "A student's to-do from its address: Done, one class",
	prepare: [TODO_READY],
	orderResult: [
		{ label: 'the one done row in ENG1H', evaluate: TODO_ROWS, expected: ['this-week: item:i-materials'] },
		{ label: 'its state and its grade in words', evaluate: TODO_STATES, expected: ['Returned · 18/20'] },
		{ label: "ENG1H's counts alone", evaluate: TODO_COUNTS, expected: ['5', '2', '1'] },
		{ label: 'Done is the pressed view', evaluate: TODO_PRESSED, expected: ['done'] },
		{ label: 'the class filter reads the address', evaluate: `() => [document.querySelector('[data-testid="todo-class"]').value]`, expected: ['s-eng'] }
	],
	presence: [
		{ selector: '[data-testid="todo-feedback-flag"]', label: 'unread feedback is flagged in words', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="todo-row"][data-key*="s-frc"], [data-testid="todo-row"][data-key*="s-idea"], [data-testid="todo-row"][data-key="item:i-bumpers"], [data-testid="todo-row"][data-key="item:i-photos"]', label: 'no row from another class', expectPresent: 0 }
	],
	textContains: [{ selector: '[data-testid="todo-feedback-flag"]', label: 'the flag', must: ['Feedback to read'] }],
	contrast: [
		{ selector: '[data-testid="todo-feedback-flag"]', label: 'feedback flag', min: 4.5 },
		{ selector: '[data-testid="todo-state"]', label: 'returned chip', min: 4.5 }
	],
	tapTargets: [{ selector: '[data-testid="todo-class"]', label: 'class filter' }]
};
