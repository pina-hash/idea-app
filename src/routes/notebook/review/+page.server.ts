import { error, redirect } from '@sveltejs/kit';
import { notebookAccess } from '$lib/server/notebook-access';
import type { PageServerLoad } from './$types';

/**
 * Section review: PLACEHOLDER. The real per-section compliance grid is a
 * later session; 0069's `notebook_get_section_grid` RPC already exists and
 * is what that session will call.
 *
 * What ships now is the permission check and the URL, so neither has to move
 * once the grid lands. Gated on the same two tiers the notebook's own data
 * layer recognizes (section instructor, or the 0067 admin/chair tier) via
 * the one shared helper.
 *
 * A non-reviewer gets a 404, not a redirect -- the /admin rule: probing the
 * URL then reveals nothing about whether the page exists for anyone else.
 * Anonymous visitors never reach it (hooks.server.ts turns them away at the
 * '/notebook' prefix first).
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const access = await notebookAccess(supabase, claims.sub);
	if (!access.canReview) error(404, 'Not found');

	return { isInstructor: access.isInstructor, isChair: access.isChair };
};
