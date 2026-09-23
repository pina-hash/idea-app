/**
 * MY CLASSES FOR A TEACHER: no counts, no door (ledger 0297).
 *
 * A teacher's classes are theirs to teach, not to hand work in to, so the
 * owed-work read is not made and every surface it drives is absent rather
 * than printing zeros nobody computed. The class cards themselves are the
 * positive control: four of them, as on the student's page.
 */
import { MY_CLASSES } from './_classroom-todo.mjs';

export default {
	path: `${MY_CLASSES}?staff=1`,
	label: 'My Classes (teacher): no to-do counts and no to-do door',
	prepare: [{ waitFor: '() => document.querySelectorAll(\'.class-cta\').length >= 4', timeoutMs: 20000 }],
	presence: [
		{ selector: '.class-cta', label: 'the four class cards (positive control)', expectPresent: 4, maxPresent: 4, expectVisible: 4 },
		{ selector: '[data-testid="class-owed"]', label: 'no per-class counts', expectPresent: 0 },
		{ selector: '[data-testid="my-classes-todo"]', label: 'no door above the cards', expectPresent: 0 },
		{ selector: '[data-testid="todo-door"]', label: "no To-do door in the shell", expectPresent: 0 },
		{ selector: '[data-testid="palette-trigger"]', label: "the shell's Search control (positive control for the header)", expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	]
};
