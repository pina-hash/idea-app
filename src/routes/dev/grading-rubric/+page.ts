import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for prompt 0106: the rubric a teacher EDITS and the console
 * they GRADE on, side by side, against one in-memory store. 404s in production.
 *
 * WHY IT EXISTS. A level carries two written forms -- a `short` line and a
 * `descriptor` -- and the grading console shows the SHORT one (`levelShort`'s
 * first rung) while the assignment page shows the DESCRIPTOR. `RubricBuilder`
 * edited only the descriptor and carried the short through the save untouched,
 * with no input for it anywhere on screen, so an instructor who rewrote a
 * level's description saved it correctly and then read the old one-liner still
 * sitting on the console. Reported 2026-09-08 against IDEA209H Unit 1.
 *
 * NOTHING HERE COULD BE SEEN IN A BROWSER BEFORE. Every existing rubric route
 * mounts the builder OR a grading console, never both on ONE store: the two
 * `/dev/grading-*` harnesses pass an inert `RUBRIC` constant nothing can edit,
 * and `/dev/classroom-phase1` mounts the builder with no console beside it. So
 * "edit a description, then look at where it is graded" -- which is the entire
 * report -- had no drivable surface, which is a fair part of why this shipped.
 *
 * THE FIXTURE IS THE REPORTED ONE, not an invented one: the stored criterion is
 * `m1-c2` with `short` lines about SOURCING, and the attached spec still
 * carries those same lines. So `levelShort`'s first TWO rungs both hold a stale
 * sentence, which is what makes the residual visible rather than theoretical --
 * clear a short line here and the console falls back to the SPEC's copy of it,
 * not to the description.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
