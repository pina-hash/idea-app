import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { hxFieldMap } from '../../hx/_documents';
import type { PageServerLoad } from './$types';

/**
 * Dev-only harness for PROGRESSIVE FEEDBACK (0238, decision 60). Mounts the
 * REAL worksheet frame (pointed at the REAL `/hx/feedback` fixture, which
 * reports its answer boxes), the REAL `FeedbackPanel`, `FeedbackThreadView`,
 * `FeedbackDrawing` and `FeedbackInbox`, over the in-memory twin of 0238's
 * functions. No auth, no Supabase, no network. 404s in production.
 *
 * `?view=student` (the default) is the student's item page half: the notes
 * above the worksheet, pins beside the answers, the drawing over the picture,
 * Reply and Fixed it. `?view=teacher` is the instructor's per-student panel
 * and the drawing tool on its own (`?draw=1` opens it on the picture).
 * `?view=inbox` is the single place to manage every note. The grading
 * console's own wiring is measured on `/dev/html-assignment-grading?feedback=1`.
 */
export const prerender = false;

export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return { fieldToBlockId: hxFieldMap('feedback', true) };
};
