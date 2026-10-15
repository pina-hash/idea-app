/**
 * THE ROLE PORTAL (IDEA Coin V2 2.5, 0247): `/coin-balance/role` through its
 * harness. The instructions, the rules in words with the server-time sentence,
 * the pay rules, today's one photo, a camera behind a press (the harness's
 * fake stream), and fourteen days newest first, each with a status in words
 * and a glyph. Only the two FAILED days that are over offer "Ask for this day
 * to be checked": today is still failing on one photo and must not.
 */
export default {
	path: '/dev/coin-balance-role',
	label: 'Role portal (V2): instructions, rules, today, camera, two weeks of days',
	prepare: [{ waitFor: '() => !!document.querySelector("[data-coin-role-hydrated]")' }],
	presence: [
		{ selector: '[data-testid="role-card"]', label: 'one role', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-instructions"]', label: 'the instructions', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-camera-open"]', label: 'the camera opens on a press', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="role-video"]', label: 'no live camera before the press', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="role-file"]', label: 'no file input while a camera exists', expectPresent: 0, maxPresent: 0 },
		{ selector: '[data-testid="role-day"]', label: 'fourteen days', expectPresent: 14, maxPresent: 14, expectVisible: 14 },
		{ selector: '[data-testid="role-ask"]', label: 'a check offered on the two failed days that are over', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: '[data-testid="role-today-photos"] li', label: "today's one photo", expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="role-pay"]', label: 'how it pays', must: ['per week, paid every two weeks', 'A missed day only takes that day off', 'taken by the server'] },
		{ selector: '[data-testid="role-rules"]', label: 'the rules in words', must: ['start photo and an end photo', '45 minutes', '7:00 AM', '4:00 PM', 'same day'] },
		{ selector: '[data-testid="role-days"]', label: 'every status in words', must: ['Passed', 'Accepted by your teacher', 'Rejected by your teacher', 'No photos', 'Not a class day', 'too close together'] },
		{ selector: '[data-testid="role-portal"]', label: 'no weekday is named', mustNot: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
	],
	tapTargets: [
		{ selector: '[data-testid="role-portal"] button', label: 'every button', min: 44 },
		{ selector: '.header-right .btn', label: 'the back key', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="role-portal"] .cpx-lead', label: 'leads', min: 4.5 },
		{ selector: '[data-testid="role-portal"] .cpx-text', label: 'text', min: 4.5 },
		{ selector: '[data-testid="role-portal"] .cpx-limits li', label: 'the pay rules', min: 4.5 },
		{ selector: '[data-testid="role-day-status"]', label: 'day statuses', min: 4.5 },
		{ selector: '[data-testid="role-portal"] .cpx-meta', label: 'metadata', min: 4.5 },
		{ selector: '[data-testid="role-portal"] .cpx-name', label: 'day labels', min: 4.5 }
	]
};
