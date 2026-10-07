/**
 * A PORTED WORKSHEET NOBODY CAN SEE YET, IN THE GRADING CONSOLE (ledger 0278's
 * answers without the document, measured in a browser for the first time in
 * ledger 0298).
 *
 * `/hx/<docId>` refuses a document whose item is not live, so the work column
 * cannot mount the frame; it prints the not-live notice and then the student's
 * answers read straight from their rows. That branch was never rendered while
 * this harness carried its own copy of the work snippet; it mounts the grade
 * routes' shared `HtmlGradingWork` now.
 *
 * WHAT IS MEASURED, both directions: the notice and the answers are present,
 * the frame is absent (it would be an empty box), and Alice's own typed words
 * and her photograph's name are what the grader reads.
 */
export default {
	path: '/dev/html-assignment-grading?state=unpublished',
	label: 'Grading console on an unpublished worksheet: the notice, then the answers',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length > 0`, attempts: 40, gapMs: 250 },
		{
			click: '.roster-row',
			until: `() => !!document.querySelector('[data-testid="answers-without-document"]')`,
			attempts: 25,
			gapMs: 300
		}
	],
	orderResult: [
		{
			label: 'every answer, by field, as the grader reads it',
			/* The answer's own words, with the picture's Enlarge and Download keys
			   (ledger 0368) taken out of the reading: they are controls, not what
			   the student wrote, and they are counted on their own below. */
			evaluate: `() => [...document.querySelectorAll('[data-testid="answers-without-document"] .answers-field')].map((dt) => { const dd = dt.nextElementSibling.cloneNode(true); dd.querySelectorAll('.answers-image-actions').forEach((n) => n.remove()); return dt.textContent.trim() + ': ' + dd.textContent.replace(/\\s+/g, ' ').trim(); })`,
			expected: [
				'teamName: Team Meridian',
				'reflection: I modelled the blade root and the hub today. The fillet at the root took three tries before it would rebuild.',
				'checkedOff: Ticked',
				'photo: No answer saved Photo: blade-root-fillet.png, The fillet after the third rebuild'
			]
		}
	],
	presence: [
		{ selector: '[data-testid="html-work-not-live"]', label: 'the not-live notice', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="answers-without-document"]', label: 'the answers read from the rows', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hx-frame-wrap', label: 'no frame (it would be an empty box)', expectPresent: 0 },
		{ selector: '[data-testid="answers-image"]', label: 'the photograph named', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* LEDGER 0368: the answers carry the file, not only its name. */
		{ selector: '[data-testid="answers-image-open"]', label: 'the photograph opens larger', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="answers-image-download"]', label: 'the photograph downloads', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The per-class console carries the link across; `html-assignment-grading-console-across`
		   asserts its absence there, and this is that absence's positive control. */
		{ selector: '[data-testid="cross-class-link"]', label: 'the link across (per-class console)', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	textContains: [
		{ selector: '[data-testid="answers-without-document"]', label: 'whose answers these are', must: ['What Alice Alvarez has written'] }
	],
	tapTargets: [
		{ selector: '[data-testid="answers-image-download"]', label: 'the Download beside the photograph', min: 44 },
		{ selector: '[data-testid="answers-image-open"]', label: 'the thumbnail that opens it larger', min: 44 }
	],
	contrast: [
		{ selector: '.answers-value', label: 'an answer', min: 4.5 },
		{ selector: '[data-testid="answers-image-download"]', label: 'the Download word', min: 4.5 },
		{ selector: '.answers-field', label: 'a field name', min: 4.5 },
		{ selector: '.note', label: 'the not-live notice', min: 4.5 }
	]
};
