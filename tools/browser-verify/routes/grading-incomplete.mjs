export default {
	path: '/dev/grading-incomplete',
	label: 'Grading console: the incomplete-hand-in signal and the graded-work export controls',
	/*
		THE RESTING STATE. Nothing is selected, nothing has been exported, and the
		three export controls plus the identity switch are on screen with their
		default reading.

		THE DEFAULT IS THE HALF WORTH MEASURING HERE. The switch defaults to
		INCLUDED, which is what was asked for, so the sentence under it has to say
		so from the first frame -- a file format that quietly carries names is
		exactly what the switch exists to stop being. `textContains` pins the
		wording rather than the checkbox's `checked` property, because the sentence
		is what a person reads before pressing anything.

		The pressed states, the produced files and the switch flipped the other way
		are `?state=exports`, which is the same route driven forward.
	*/
	presence: [
		{ selector: '[data-testid="work-export"]', label: 'the graded-work export group', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="export-json-student"]', label: 'JSON: this student', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="export-json-class"]', label: 'JSON: whole class', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="export-workbook"]', label: 'Spreadsheet: whole class', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="export-identity"]', label: 'the identity switch', expectPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="export-identity-note"]', label: 'what the switch is currently doing, in words', expectPresent: 1, expectVisible: 1 },
		/* The FACTS CSV is beside these, not replaced by them: two different
		   exports, and losing one to the other would be silent. */
		{ selector: '.roster-head .btn', label: 'the existing Export CSV control', expectPresent: 1, expectVisible: 1 },
		/* Nothing has been pressed, so there is no confirmation yet and no
		   captured file. Both are the positive controls for `?state=exports`. */
		{ selector: '[data-testid="export-note"]', label: 'the post-export confirmation (nothing exported yet)', expectPresent: 0 },
		{ selector: '[data-testid="capture-row"]', label: 'a produced file (nothing exported yet)', expectPresent: 0 },
		{ selector: '[data-testid="capture-empty"]', label: 'the harness saying nothing has been exported', expectPresent: 1, expectVisible: 1 }
	],
	tapTargets: [
		{ selector: '[data-testid="export-json-student"]', label: 'JSON: this student', min: 44 },
		{ selector: '[data-testid="export-json-class"]', label: 'JSON: whole class', min: 44 },
		{ selector: '[data-testid="export-workbook"]', label: 'Spreadsheet: whole class', min: 44 },
		/* MEASURED AT THE LABEL, which is what a finger hits: the checkbox
		   inside it is 18px and no sizing on the box would change that. */
		{ selector: '[data-testid="export-identity"]', label: 'the identity switch, measured at its label', min: 44 },
		{ selector: '.roster-head .btn', label: 'Export CSV', min: 44 }
	],
	contrast: [
		{ selector: '[data-testid="export-identity-note"]', label: 'the identity sentence', min: 4.5 },
		{ selector: '.work-export-label', label: 'the export group heading', min: 4.5 },
		{ selector: '[data-testid="export-identity"] span', label: 'the switch label', min: 4.5 }
	],
	textContains: [
		{
			selector: '[data-testid="export-identity-note"]',
			label: 'the default state is stated, not implied',
			must: ['ARE included in this file'],
			mustNot: ['NOT in this file']
		},
		{
			selector: '[data-testid="work-export"]',
			label: 'each control says what it produces and for whom',
			must: ['JSON: this student', 'JSON: whole class', 'Spreadsheet: whole class']
		}
	]
};
