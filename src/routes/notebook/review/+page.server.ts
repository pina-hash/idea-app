import { error, redirect } from '@sveltejs/kit';
import { notebookAccess } from '$lib/server/notebook-access';
import type { ReviewSection } from '$lib/notebook-review';
import type { PageServerLoad } from './$types';

/**
 * Section review: the per-section compliance grid, plus the check-in
 * management it depends on.
 *
 * The GATE is unchanged from the placeholder this replaced: the same two
 * tiers 0069's own data layer recognizes (section instructor, or the 0067
 * admin/chair tier) via the one shared helper, and a non-reviewer gets a
 * 404 rather than a redirect -- the /admin rule, so probing the URL reveals
 * nothing. Anonymous visitors never reach it (hooks.server.ts turns them
 * away at the '/notebook' prefix first).
 *
 * WHICH SECTIONS. Everything on this page is scoped to what the viewer may
 * actually touch, asked the same way `/notebook` already asks it:
 *
 *   * CHAIR (0067 admin) -- every section.
 *   * INSTRUCTOR -- only rows naming them as instructor_id, which is exactly
 *     what `notebook_is_section_instructor()` checks inside every RPC.
 *
 * That scoping is CONVENIENCE, not the boundary. `notebook_get_section_grid`
 * refuses a section the caller neither teaches nor administers regardless of
 * what the client asks for, so the worst a tampered request achieves is an
 * error instead of data. What the scoping buys is that an instructor is
 * never offered a section whose grid would only ever refuse them.
 *
 * Everything after this load runs as the CALLER'S OWN session from the
 * browser (the /coin-desk convention): the grid, the entry read and all four
 * writes are RPCs or RLS-scoped selects that re-check the caller themselves.
 *
 * Fails soft in one direction only: with 0069 unapplied the page renders a
 * clearly-flagged "not available yet" card instead of crashing.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const access = await notebookAccess(supabase, claims.sub);
	if (!access.canReview) error(404, 'Not found');

	let query = supabase
		.from('notebook_sections')
		.select('id, course_id, section_label, instructor_id')
		.order('section_label');
	if (!access.isChair) query = query.eq('instructor_id', claims.sub);

	const { data, error: sectionError } = await query;

	return {
		isInstructor: access.isInstructor,
		isChair: access.isChair,
		configured: !sectionError,
		sections: (data ?? []) as ReviewSection[]
	};
};
