/**
 * MY CLASSES WITH WHAT EACH CLASS OWES (ledger 0297), as a student.
 *
 * Each class card carries its own missing and due-this-week counts, in words
 * and the missing one with its mark, read off the SAME rows the to-do page
 * lists (`todoSummaries` over `buildTodo`), so the card, the door above the
 * cards and the to-do behind it cannot name different numbers:
 *   ENG1H 2 missing, 2 due this week; FRC 1 and 1; IDEA209H 3 and 2; and the
 *   class this student TEACHES says nothing at all.
 * The door above the cards totals them: 6 missing, 5 due this week.
 *
 * `classroom-todo-staff-1` is the other direction: a teacher's My Classes
 * carries no counts and no door.
 */
import { MY_CLASSES } from './_classroom-todo.mjs';

export default {
	path: MY_CLASSES,
	label: 'My Classes (student): what each class owes, and the door to the to-do',
	prepare: [{ waitFor: '() => !!document.querySelector(\'[data-testid="my-classes-todo"]\')', timeoutMs: 20000 }],
	orderResult: [
		{
			label: "each class's counts, in card order",
			evaluate: `() => [...document.querySelectorAll('[data-testid="class-owed"]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['2 missing 2 due this week', '1 missing 1 due this week', '3 missing 2 due this week']
		},
		{
			label: 'the door totals them',
			evaluate: `() => [...document.querySelectorAll('[data-testid="my-classes-todo"]')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`,
			expected: ['To-do 6 missing 5 due this week']
		}
	],
	presence: [
		{ selector: '[data-testid="class-owed"]', label: 'counts on the three classes that owe something', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="my-classes-todo"]', label: 'the door above the cards', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="todo-door"]', label: "the shell's To-do door", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.class-owed .owed-missing svg', label: 'a mark beside every missing count', expectPresent: 3, maxPresent: 3, expectVisible: 3 }
	],
	contrast: [
		{ selector: '.class-owed .owed', label: 'class counts', min: 4.5 },
		{ selector: '[data-testid="my-classes-todo"] .owed', label: 'door counts', min: 4.5 },
		{ selector: '[data-testid="my-classes-todo"] .todo-link-word', label: 'door word', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="my-classes-todo"]', label: 'the To-do door' },
		{ selector: '[data-testid="todo-door"]', label: "the shell's To-do door" }
	]
};
