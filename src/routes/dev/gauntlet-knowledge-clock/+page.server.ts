import { dev } from '$app/environment';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * Dev HARNESS for 0148's knowledge-mode clock, mounting the REAL
 * `KnowledgePlay` once per state of `startKnowledgeClock`. Dev-only 404, no
 * auth, no Supabase.
 *
 * WHY A SERVER FILE AT ALL, when most harnesses are a page. `KnowledgePlay`
 * submits through a form action (`?/submit`) rather than through a transport
 * prop, so the post-answer half of the surface -- the review note, the results
 * screen, Try again -- is unreachable without one. The action below is the
 * in-memory stand-in for `gauntlet_submit`, shaped like the real payload.
 *
 * IT CLOSES ITS OWN CLOCK, the way the database does: the FIRST submit this
 * process sees is the timed one and every later submit is a review, so both
 * payload shapes (`timed_attempt` true and false) are reachable by pressing the
 * button twice rather than by a query parameter the component would have to
 * learn to send. Restart the dev server to get a fresh timed attempt.
 */
export const load: PageServerLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};

let submitsSeen = 0;

export const actions: Actions = {
	submit: async ({ request }) => {
		const form = await request.formData();
		const answer = form.get('answer');
		if (typeof answer !== 'string' || answer.length === 0) {
			return fail(400, { error: 'Pick an answer first.' });
		}
		const timed = submitsSeen === 0;
		submitsSeen += 1;
		return {
			result: {
				is_correct: answer === 'c',
				correct: 'c',
				explanation: 'Section A-A is the hatched view: the cut plane is the one lettered twice.',
				// A review attempt is measured from the ORIGINAL start, so its number
				// is a wall-clock figure. That is the whole reason the review note
				// exists, and a harness that showed a plausible 40 seconds there would
				// not show the thing worth looking at.
				score_metric: timed ? 41.6 : 88_412,
				timed_attempt: timed
			},
			answered: answer
		};
	}
};
