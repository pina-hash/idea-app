/**
 * Managing a check-in that students have already answered, measured in a real
 * browser at 375 and 1440.
 *
 * WHY THIS NEEDS A BROWSER AT ALL. Every sentence this bundle adds is
 * CONDITIONAL on interaction state that does not exist until somebody opens a
 * form or arms a confirm: the rename warning renders only while an edit is open
 * AND the name has actually moved, and the delete confirm renders only once
 * Delete has been pressed. A server render reaches none of it, and the node
 * project cannot run the effects that get there -- so the closed row is all a
 * cheaper instrument can see, and the closed row is the one state nothing was
 * wrong with.
 *
 * THE NEGATIVE CONTROL IS THE HALF THAT MATTERS. Four of the seven verdicts
 * assert a sentence is ABSENT or DIFFERENT -- a reschedule that must not warn,
 * an unanswered check-in that must not warn, an uncovered one that must say
 * "cannot tell" rather than "0 students". A spec that only checked the warning
 * appears would pass just as happily on a component that always shows it, which
 * is the version a teacher learns to click through.
 *
 * PAINT IS NOT INTERACTIVITY. `waitForApp` settles on DOM stability, which the
 * SSR markup satisfies before hydration attaches a handler, so this waits on
 * `data-check-in-manage-ready` -- set from an EFFECT, so it cannot appear in
 * the server-rendered output -- and then drives with clicks that retry against
 * their own effect. `__ciAttempts` is printed rather than asserted: a step that
 * took twelve tries and a step that took one both pass, and the difference is
 * what the next reader needs to see.
 *
 * NO VERDICT STRING IS RETYPED FROM THE COMPONENT. The page builds the labels
 * and the expected list is those labels, so a probe that stops running changes
 * the array length and reddens rather than quietly checking less.
 */
export default {
	path: '/dev/check-in-manage',
	label: 'Check-in management: warnings before an edit or a delete',
	prepare: [
		{ waitFor: '() => document.documentElement.hasAttribute("data-check-in-manage-ready")' },
		{ evaluate: '() => window.__ciDrive()' },
		{ evaluate: '() => window.__ciAttempts()' }
	],
	orderResult: [
		{
			label: 'every warning renders exactly where it should and nowhere else',
			evaluate: '() => window.__ciVerdicts()',
			expected: [
				'row names what is filed ok',
				'renaming with answers warns and names them ok',
				'the button names the rename ok',
				'rescheduling the same check-in warns about no answers ok',
				'the button names the reschedule ok',
				'renaming an unanswered check-in warns about nothing ok',
				'an uncovered check-in says cannot tell rather than zero ok',
				'the delete confirm names the students before the button ok',
				'the delete confirm says entries are kept ok',
				'the delete confirm names the excusal it destroys ok'
			]
		}
	],
	presence: [
		{ selector: '.nb-root', label: 'notebook room mounted', expectPresent: 1 },
		/* The four fixture states, each as its own row. A harness that reached
		   only one of them could not tell a conditional warning from a constant
		   one. */
		{ selector: '[data-session-id]', label: 'check-in rows', expectPresent: 4, expectVisible: 4 },
		/* THE ANSWERS-EXIST STATE, present before anything is clicked. This is the
		   state the whole bundle is about and the one a fixture most easily fails
		   to reach. */
		{
			selector: '[data-testid="session-load"]',
			label: 'rows that name what is filed against them',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-session-id] [data-testid="session-edit"]',
			label: 'an Edit control per check-in',
			expectPresent: 4,
			expectVisible: 4
		},
		{
			selector: '[data-session-id] [data-testid="session-delete"]',
			label: 'a Delete control per check-in',
			expectPresent: 4,
			expectVisible: 4
		}
	],
	contrast: [
		{ selector: '.harness > h1', label: 'h1 on the notebook plate', min: 4.5 },
		/* The load line is metadata in the room's meta register, and it is the
		   number a teacher reads before touching either control. */
		{ selector: '[data-testid="session-load"]', label: 'the filed count on a row', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-session-id] [data-testid="session-edit"]', label: 'Edit a check-in' },
		{ selector: '[data-session-id] [data-testid="session-delete"]', label: 'Delete a check-in' }
	]
};
