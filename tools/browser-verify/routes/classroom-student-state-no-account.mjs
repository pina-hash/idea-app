/**
 * ONE STUDENT'S PAGE FOR A STUDENT WHO HAS NEVER SIGNED IN (the 2026-10-07
 * round): on the roster, no account. The page says so in words, there is no
 * working time and no models or apps section (nothing could exist), and the
 * assignments still read their own words.
 */
import { CLASSMATE_TEXT, STUDENT, STUDENT_READY } from './_classroom-student.mjs';

export default {
	path: `${STUDENT}?state=no-account`,
	label: "One student's page: a student who has never signed in",
	prepare: [STUDENT_READY],
	presence: [
		{ selector: '[data-testid="so-no-account"]', label: 'the never-signed-in chip', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="so-models"]', label: 'no models and apps section', expectPresent: 0 },
		{ selector: '[data-testid="so-assignment-row"]', label: 'assignment rows (positive control)', expectPresent: 7, maxPresent: 7 },
		{ selector: '[data-testid="so-hall-pass"]', label: 'hall pass rows still there', expectPresent: 6, maxPresent: 6 }
	],
	textContains: [{ selector: '[data-testid="so-glance"]', label: 'working time says none recorded', must: ['None recorded'] }],
	orderResult: [{ label: 'no classmate is named anywhere on the page', evaluate: CLASSMATE_TEXT, expected: [] }],
	contrast: [{ selector: '[data-testid="so-no-account"]', label: 'never-signed-in chip', min: 4.5 }]
};
