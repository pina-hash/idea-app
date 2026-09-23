import { SETTLE_ENTRANCE } from './_shared.mjs';

/**
 * THE SITE HOME AS A TEACHER: no To-do door (ledger 0297). A teacher's home is
 * unchanged by the to-do, so neither door renders; the class cards are the
 * positive control, and the student's page
 * (`home-order-role-student-classes-2-rows-4-due-1-0-1-5`) carries both.
 */
export default {
	path: '/dev/home-order?role=teacher&classes=2&rows=4&due=-1,0,1,5',
	label: 'Home (teacher): no To-do door',
	prepare: [{ evaluate: SETTLE_ENTRANCE, waitMs: 150 }],
	presence: [
		{ selector: '[data-tour="classes"] .course-card.section-card.feed-card', label: 'the two class cards (positive control)', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="todo-strip"]', label: 'no To-do door', expectPresent: 0 },
		{ selector: '[data-testid="feed-todo-all"]', label: 'no See all in To-do', expectPresent: 0 }
	]
};
