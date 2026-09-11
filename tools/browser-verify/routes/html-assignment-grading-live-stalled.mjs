/**
 * A STALLED CHANNEL ON THE GRADING CONSOLE EARNS ONE QUIET SENTENCE.
 *
 * The console re-reads on a live notice now, and polls underneath it. Neither
 * is visible when it works, which is correct -- but a channel that has stopped
 * is worth saying, because the difference between "you are seeing work as it
 * lands" and "you are seeing it within a minute" is the difference between
 * waiting at the screen and coming back later.
 *
 * THE SENTENCE NAMES THE POLL, in seconds, because "paused" with no number in
 * it reads as "broken" -- the entire point of the line is that the console is
 * still going to be right, just later. It is the same
 * `classroomLivePausedLine` the hall pass and the song queue use, so the three
 * cannot drift apart.
 *
 * THE AT-REST SPEC IS THE NEGATIVE CONTROL: `html-assignment-grading.mjs` runs
 * the same fixture on a `live` bus and the selector counts 0 there. Without
 * that pair, "the sentence is present" could pass on a console that shows it
 * always.
 */
import { OPEN_FIRST_STUDENT } from './html-assignment-grading.mjs';

const NOTE = '[data-testid="grading-live-note"]';

export default {
	path: '/dev/html-assignment-grading?live=stalled',
	label: 'Grading console: a stalled channel says so once, and names the poll',

	prepare: OPEN_FIRST_STUDENT,

	orderResult: [
		{
			label: 'one sentence, naming the poll in seconds',
			evaluate: `() => {
				const note = document.querySelector('${NOTE}');
				const text = note ? note.textContent.replace(/\\s+/g, ' ').trim() : 'absent';
				return [
					'notes=' + document.querySelectorAll('${NOTE}').length,
					'text=' + text,
					/* A NUMBER IS IN IT. "Live updates paused" on its own reads as a
					   fault; the interval is what says the console still works. */
					'hasNumber=' + /\\d/.test(text)
				];
			}`,
			expected: [
				'notes=1',
				'text=Live updates paused, still checking every 60 seconds.',
				'hasNumber=true'
			]
		}
	],

	presence: [
		{ selector: NOTE, label: 'the paused sentence', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* The console is otherwise completely unaffected: a stalled channel is a
		   slower console, not a broken one. */
		{ selector: '[data-grade-level]', label: 'the rubric level buttons', expectPresent: 3 },
		{ selector: 'iframe[data-hx-frame]', label: 'the document', expectPresent: 1, maxPresent: 1 }
	],

	contrast: [{ selector: NOTE, label: 'the paused sentence on the card', min: 4.5 }]
};
