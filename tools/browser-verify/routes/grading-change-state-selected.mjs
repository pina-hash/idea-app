export default {
	path: '/dev/grading-change?state=selected',
	label: 'Grading console: the post-grade sentence with its timestamps, and the extra-credit control in use',
	aliasOf: '/dev/grading-change',
	/*
		THE STATE THIS ROUTE EXISTS FOR: a flagged student open, so the sentence
		that NAMES WHEN is on screen, and the extra-credit control filled in so the
		total shows its itemisation.

		THE TIMESTAMPS ARE THE WHOLE CLAIM. A bare "changed after grading" sends an
		instructor hunting through a submission for what moved; the two instants
		are the difference between "look at this" and "look for this". They are
		asserted as a RELATIONSHIP -- the change is after the grade -- read out of
		the oracle's own ISO strings, rather than as pinned wall-clock text, which
		would be a fixture that expires.
	*/
	prepare: [
		{ waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 5' },
		{
			/* Ben: the EDIT case. The quiet half, and the one an instructor would
			   otherwise never learn about. */
			click: '.roster-list li:nth-child(2) .roster-row',
			until: '() => !!document.querySelector("[data-testid=\'changed-after-grading\']")'
		}
	],
	presence: [
		{ selector: '[data-testid="changed-after-grading"]', label: 'the sentence naming the act and the instants', expectPresent: 1, expectVisible: 1 },
		{ selector: '#grade-extra-credit', label: 'the extra-credit input', expectPresent: 1, expectVisible: 1 },
		/* The payload reported the column, so the withheld-branch sentence must
		   NOT be here. It is the positive control for `?state=pre-0171`. */
		{ selector: '[data-testid="extra-credit-unavailable"]', label: 'the pre-0171 refusal (column is present here)', expectPresent: 0 },
		{ selector: '[data-testid="extra-credit-invalid"]', label: 'the malformed-award refusal (nothing typed yet)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="changed-after-grading"]', label: 'the post-grade sentence', min: 4.5 },
		{ selector: '.ec-label', label: 'the extra-credit label', min: 4.5 },
		{ selector: '.ec-note', label: 'what the extra-credit field does', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#grade-extra-credit', label: 'the extra-credit input', min: 44 }
	],
	textContains: [
		{
			selector: '[data-testid="changed-after-grading"]',
			label: 'it names the act, both instants, and how to clear it',
			must: ['Edited after grading', 'Graded ', 'work last touched', 'Grading again clears this'],
			/* Never the flattened word: an edit and a resubmission are answered
			   differently and the label is where that distinction survives. */
			mustNot: ['Changed after grading']
		}
	],
	orderResult: [
		{
			/* THE RELATIONSHIP, NOT THE WALL CLOCK. Read out of the oracle's own
			   ISO strings so the fixture cannot expire: the change is strictly
			   after the grade, and the row is the one that is open. */
			evaluate: `() => {
				const tr = [...document.querySelectorAll('.oracle tbody tr')]
					.find((r) => r.querySelectorAll('td')[0].textContent.trim() === 'Ben Okafor');
				const td = tr.querySelectorAll('td');
				const graded = Date.parse(td[2].textContent.trim());
				const at = Date.parse(td[7].textContent.trim());
				const open = document.querySelector('.work-name')?.textContent.trim();
				return [open, at > graded, td[6].textContent.trim()];
			}`,
			expected: ['Ben Okafor', true, 'Edited after grading'],
			label: 'the open row is the flagged one, and its change is strictly after its grade'
		},
		{
			/* EXTRA CREDIT IS ITEMISED, NEVER FOLDED INTO A TOTAL. Typing an award
			   moves the total AND prints what it is made of, so a grader can see
			   the rubric sum and the award separately in the one place the number
			   is decided. */
			evaluate: `() => {
				const input = document.querySelector('#grade-extra-credit');
				input.value = '4';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				return new Promise((res) => setTimeout(() => {
					const total = document.querySelector('.score-total')?.textContent.replace(/\\s+/g, ' ').trim();
					res([total]);
				}, 50));
			}`,
			expected: ['Total: 19 / 20 pts (15 rubric + 4 extra credit)'],
			label: 'an award moves the total and is shown as its own part of it'
		},
		{
			/* A REFUSAL RENDERS WHERE THE GRADER IS WORKING. A negative award is
			   refused by the column's CHECK and by the RPC; this says so before a
			   round trip, in the same problem list as every other problem. */
			evaluate: `() => {
				const input = document.querySelector('#grade-extra-credit');
				input.value = '-3';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				return new Promise((res) => setTimeout(() => {
					const flag = document.querySelector('[data-testid="extra-credit-invalid"]');
					res([!!flag, (flag?.textContent ?? '').includes('0 or more')]);
				}, 50));
			}`,
			expected: [true, true],
			label: 'a negative award is refused on screen, not after a round trip'
		}
	]
};
