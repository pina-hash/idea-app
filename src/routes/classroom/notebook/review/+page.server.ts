import { error, redirect } from '@sveltejs/kit';
import { loadReviewConsole, validSectionId } from '$lib/server/notebook-review-console';
import type { PageServerLoad } from './$types';

/**
 * THE ALL-SECTIONS REVIEW CONSOLE, inside the classroom shell (ledger 0297,
 * package F4a). It was `/notebook/review`, which redirects here now.
 *
 * A MANAGER'S DAY-TO-DAY DOOR IS THE CLASS'S OWN NOTEBOOK TAB, locked to that
 * class. This page is for what a tab cannot hold: a 0169 section REVIEWER, who
 * reviews a class they cannot open as a class, and a chair moving between
 * sections with one picker.
 *
 * A NON-REVIEWER GETS A 404, never a redirect (the /admin rule), so probing
 * the URL reveals nothing. `notebook_get_section_grid` refuses a section the
 * caller neither teaches, reviews nor administers whatever this page renders.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const review = await loadReviewConsole(supabase, claims);
	if (!review) error(404, 'Not found');
	return {
		isInstructor: review.access.isInstructor,
		isChair: review.access.isChair,
		/**
		 * The caller's own uuid, so the admin log can render their own rows as
		 * "You". It is already in the validated claims -- this is a rename, not a
		 * read.
		 */
		viewerId: claims.sub,
		configured: review.configured,
		docCheckReady: review.docCheckReady,
		initialSectionId: validSectionId(review.sections, url.searchParams.get('section')),
		reviewSections: review.sections
	};
};
