export default {
	path: '/dev/grading-queue?view=grades',
	label: 'Grades tab: the fill empty grades only switch and the grades it kept (ledger 0457)',
	prepare: [{ waitFor: '() => !!document.querySelector(\'[data-testid="grades-protection"]\')' }],
	presence: [
		{ selector: '[data-testid="grades-protection"]', label: 'the switch card', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-protection-toggle"]', label: 'the switch', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-protection-kept"]', label: 'the grades it kept', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-queue-link"]', label: 'the way to the every-class queue', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="grades-target-row"]', label: 'a row per syllabus category', expectPresent: 5, maxPresent: 5, expectVisible: 5 },
		{ selector: '[data-testid="grades-target-unfiled"]', label: 'the posts in no category', expectPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.protect-says', label: 'what the switch does, in words', min: 4.5 },
		{ selector: '.kept summary', label: 'the kept count', min: 4.5 },
		{ selector: '.targets-table td.short', label: 'a short gap', min: 4.5 }
	],
	textContains: [
		{ selector: '[data-testid="grades-protection"]', label: 'it says on, and what that means', must: ['Fill empty grades only', 'On.', '2 grades kept'] },
		{ selector: '[data-testid="grades-targets"]', label: 'Unit Assignments is 125 short of its 400', must: ['Unit Assignments', '275', '125 short', 'Not in a syllabus category'] }
	]
};
