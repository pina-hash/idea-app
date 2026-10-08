/**
 * ONE STUDENT'S PAGE ON A DATABASE WITHOUT THE NEW READ (the 2026-10-07 round):
 * the overview answers PGRST202, so hall passes, coins, music and opened items
 * each say in words that they arrive with the next database update, never an
 * empty list that reads as "nothing happened". Everything else is unaffected.
 */
import { STUDENT, STUDENT_READY } from './_classroom-student.mjs';

export default {
	path: `${STUDENT}?state=unavailable`,
	label: "One student's page: the new read not applied yet",
	prepare: [STUDENT_READY],
	presence: [
		{ selector: '[data-testid="so-overview-note"]', label: 'the not-yet sentence in activity, passes and coins', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-testid="so-hall-pass"]', label: 'no hall pass rows', expectPresent: 0 },
		{ selector: '[data-testid="coin-row"]', label: 'no coin rows', expectPresent: 0 },
		{ selector: '[data-testid="so-assignment-row"]', label: 'assignment rows (positive control)', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-testid="so-check-in"]', label: 'check-ins (positive control)', expectPresent: 5, maxPresent: 5 }
	],
	textContains: [
		{ selector: '[data-testid="so-hall-passes"]', label: 'passes say why', must: ['after the next database update'] }
	],
	contrast: [{ selector: '[data-testid="so-overview-note"]', label: 'the not-yet sentence', min: 4.5 }]
};
