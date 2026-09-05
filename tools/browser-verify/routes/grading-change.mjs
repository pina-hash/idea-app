export default {
	path: '/dev/grading-change',
	label: 'Grading console: the post-grade change signal, its two kinds, and the extra-credit control',
	/*
		THE RESTING STATE. Five students, four of whom changed their work after it
		was graded and one of whom did not, with the console showing the marks and
		the harness's own oracle printing what `postGradeChange` answers beside it.

		WHY THIS NEEDS A BROWSER AT ALL. Both halves are invisible to
		`svelte-check`: a chip that stopped rendering, a sentence that lost its
		timestamp and a control withheld on the wrong branch all type-check
		perfectly. The unit tests prove the derivation; only this proves the
		derivation reaches a screen.

		THREE CHIPS AND TWO CONTROLS, AND THE CONTROLS ARE THE POINT. Three chips
		means something only because one student -- graded, untouched since --
		carries none, and because another -- the newest writing on the page, never
		graded -- carries none either. A signal that fired on everybody would
		satisfy a count and be worthless.

		THE COUNT WAS WRONG THE FIRST TIME THIS SPEC WAS WRITTEN. It said four,
		against a fixture that flags three; the run reported 3 from the chips AND
		3 from the pure function, which is what a correct measurement of a wrong
		expectation looks like. Left recorded here because the pair-of-numbers
		check below is exactly what caught it.

		The extra-credit control's OTHER branch (a deployment sitting before 0171,
		where it must be withheld with a sentence rather than blanked) is
		`?state=pre-0171`, the same route driven forward.
	*/
	prepare: [
		{
			/* The roster lands asynchronously (`loadGrading` is deferred out of the
			   effect body), so every measurement below waits for it rather than
			   for a timer. */
			waitFor: '() => document.querySelectorAll(".roster-list .roster-row").length === 5'
		}
	],
	presence: [
		{ selector: '.roster-list .roster-row', label: 'the roster', expectPresent: 5, expectVisible: 5 },
		/* THREE OF FIVE, and `maxPresent` matters as much as the minimum: a
		   derivation that fired on every graded row would satisfy a bare ">= 3".
		   Alice is graded and untouched; Eli has the newest writing on the page
		   and no grade for it to be after. Both must be unmarked. */
		{ selector: '[data-testid="roster-changed"]', label: 'the changed-after-grading chip', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* Nothing is selected yet, so the detail sentence has nowhere to be. It is
		   the positive control for `?state=selected`. */
		{ selector: '[data-testid="changed-after-grading"]', label: 'the detail sentence (nothing selected yet)', expectPresent: 0 }
	],
	contrast: [
		{ selector: '[data-testid="roster-changed"]', label: 'the changed chip', min: 4.5 }
	],
	textContains: [
		{
			selector: '.roster-list',
			label: 'the chip names the ACT, in all three combinations, and never just "changed"',
			must: [
				'Edited after grading',
				'Resubmitted after grading',
				'Resubmitted and edited after grading'
			]
		},
		{
			selector: '.oracle',
			label: 'the pure function agrees that three of five are flagged',
			must: ['3 of 5 flagged']
		}
	],
	orderResult: [
		{
			/* THE CONSOLE AGAINST THE PURE FUNCTION, not against itself. The left
			   list is scraped off the rendered chips; the right is the oracle
			   table, which calls `postGradeChange` directly on the same fixture.
			   Break the derivation and BOTH go quiet, which is the tell that a
			   mutation landed rather than the console merely hiding something. */
			evaluate: `() => {
				const chips = [...document.querySelectorAll('.roster-list li')].map((li) => {
					const c = li.querySelector('[data-testid="roster-changed"]');
					return (li.querySelector('.roster-name')?.textContent ?? '').trim() + ':' + (c ? c.textContent.trim() : 'none');
				});
				const oracle = [...document.querySelectorAll('.oracle tbody tr')].map((tr) => {
					const td = tr.querySelectorAll('td');
					return td[0].textContent.trim() + ':' + td[6].textContent.trim();
				});
				return [chips.join(' | '), oracle.join(' | ')];
			}`,
			expected: [
				'Alice Alvarez:none | Ben Okafor:Edited after grading | Carla Cardenas:Resubmitted after grading | Dara Nwosu:Resubmitted and edited after grading | Eli Ramos:none',
				'Alice Alvarez:none | Ben Okafor:Edited after grading | Carla Cardenas:Resubmitted after grading | Dara Nwosu:Resubmitted and edited after grading | Eli Ramos:none'
			],
			label: 'every chip on screen is the answer the pure function gives for that row'
		},
		{
			/* NOTHING A STUDENT SEES MOVED. The signal is derived in the console
			   from rows the console already had; it writes nothing, and there is
			   no student-facing surface in this harness to change. What IS
			   assertable here is that the mark lives only inside the grading
			   console's own roster and detail pane -- never on the item body, the
			   score, or anything the student payload carries. */
			evaluate: `() => {
				const marks = [...document.querySelectorAll('[data-testid="roster-changed"], [data-testid="changed-after-grading"]')];
				return [marks.every((m) => !!m.closest('.grading-page')), marks.length > 0];
			}`,
			expected: [true, true],
			label: 'every post-grade mark is inside the grading console and nowhere else'
		}
	],
	tapTargets: [
		{ selector: '.roster-list .roster-row', label: 'a roster row', min: 44 }
	]
};
