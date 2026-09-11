/**
 * A STUDENT WITH NO ANSWERS GETS THE EMPTY DOCUMENT, NOT A BLANK PANE.
 *
 * The state this whole bundle exists to end is an empty work pane, so "the
 * student has typed nothing" has to be visibly DIFFERENT from "this console
 * cannot show you the work" -- and the honest difference is the untouched
 * worksheet, which is exactly what the student is looking at too.
 *
 * `hxValuesFromResponses` over zero rows is `{}`, which is what an untouched
 * worksheet holds, so "has not started" and "started and cleared it" read the
 * same because they ARE the same. Nothing here branches on a submitted state:
 * there is no turn-in on a ported assignment, finishing the work IS the hand-in
 * (Mr. Pina, 2026-09-10).
 *
 * ITS OWN SPEC RATHER THAN A SECOND STATE INSIDE `html-assignment-grading.mjs`,
 * because a route spec measures ONE URL and "here is the work" and "there is no
 * work yet" are two different claims about two different fixtures.
 */
import { OPEN_FIRST_STUDENT } from './html-assignment-grading.mjs';

export default {
	path: '/dev/html-assignment-grading?state=empty',
	/*
		NO `aliasOf`. It makes `urlFor` visit the BASE path, which is right for a
		state reached by pressing something and exactly wrong for one carried in
		the query string -- the harness would measure the default fixture while
		the filename claimed otherwise.
	*/
	label: 'Grading console: a ported assignment nobody has answered yet',

	prepare: OPEN_FIRST_STUDENT,

	orderResult: [
		{
			label: 'the frame is mounted and ready, and there is no photo strip',
			/*
				THE SEEDED VALUE IS NOT READ HERE, and cannot be: the sandbox puts
				the document in an opaque origin, so `contentDocument` is NULL from
				page script (measured). What IS visible from out here is that the
				frame mounted at all -- which is the claim that separates "this
				student has done nothing" from the empty pane this bundle removed.
			*/
			evaluate: `() => {
				const wrap = document.querySelector('.hx-frame-wrap');
				return [
					'frames=' + document.querySelectorAll('iframe[data-hx-frame]').length,
					'ready=' + (wrap?.getAttribute('data-hx-ready') ?? 'absent'),
					/* No photograph, so no strip at all -- not an empty one. */
					'strip=' + document.querySelectorAll('.hx-images').length,
					'thumbs=' + document.querySelectorAll('.hx-image-thumb').length
				];
			}`,
			expected: ['frames=1', 'ready=yes', 'strip=0', 'thumbs=0']
		}
	],

	presence: [
		{
			selector: 'iframe[data-hx-frame]',
			label: 'the frame, still mounted for a student who has done nothing',
			expectPresent: 1,
			maxPresent: 1
		},
		/*
			THE POSITIVE CONTROL FOR THE WHOLE SPEC. Every row above would also
			hold on a console that had stopped rendering the grading half; the
			rubric being there is what says this is the working pane and not a
			fixture that failed to load.
		*/
		{ selector: '[data-grade-level]', label: 'the rubric level buttons', expectPresent: 3 }
	]
};
