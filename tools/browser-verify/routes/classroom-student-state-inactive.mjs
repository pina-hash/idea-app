/**
 * ONE STUDENT'S PAGE FOR A STUDENT WHO LEFT THE CLASS (the 2026-10-07 round):
 * their work is still theirs and still here, the identity block says they are
 * not on the live roster, and the full-notebook link is replaced by the
 * sentence saying why (the notebook's own gate asks for an active enrollment,
 * so for a teacher the link would answer 404).
 */
import { STUDENT, STUDENT_READY } from './_classroom-student.mjs';

export default {
	path: `${STUDENT}?state=inactive`,
	label: "One student's page: a student no longer on the live roster",
	prepare: [STUDENT_READY],
	presence: [
		{ selector: '[data-testid="so-notebook-link"]', label: 'no full-notebook link', expectPresent: 0 },
		{ selector: '[data-testid="so-notebook-closed"]', label: 'the sentence saying why', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-assignment-row"]', label: 'their work, still here', expectPresent: 7, maxPresent: 7 }
	],
	textContains: [{ selector: '[data-testid="so-roster-chip"]', label: 'roster chip', must: ['Not on the live roster'] }],
	contrast: [{ selector: '[data-testid="so-roster-chip"]', label: 'roster chip', min: 4.5 }]
};
