import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the RETURNED GRADE AND THE RUBRIC ON EVERY ENGINE
 * (ledger 0297, package ITEM). Mounts the REAL ClassroomShell, ClassSplit,
 * ClassView and ItemDetail as a student, over an assignment of each engine --
 * v1 and v2 spec assignments, a v3 ported HTML document (the real `/hx/worksheet`
 * dev fixture, behind a real `HxAnswersStore`), and a v4 IdeaCAD assignment
 * whose work happens in the IdeaCAD app -- either returned with a score, a
 * rubric breakdown and a teacher comment, or not yet started. No auth, no
 * Supabase, no network beyond the local `/hx/` route. 404s in production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
