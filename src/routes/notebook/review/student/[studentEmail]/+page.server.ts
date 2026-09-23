import { error, redirect } from '@sveltejs/kit';
import { notebookAccess } from '$lib/server/notebook-access';
import { legacyStudentTarget } from '$lib/notebook/legacy-routes';
import type { PageServerLoad } from './$types';

/**
 * ONE STUDENT'S READ-ONLY NOTEBOOK, AT ITS OLD ADDRESS (ledger 0297, package
 * F4a). It lives at `/classroom/notebook/review/student/<email>` now.
 *
 * THE GATE RUNS BEFORE THE REDIRECT: somebody on no reviewer tier gets the
 * 404 this address always answered, so it confirms nothing about the review
 * surface to anybody outside it. A reviewer is sent on, and the target's own
 * RPC (`notebook_review_student_notebook`) decides whether THIS student's
 * notebook is theirs to read -- answering a 404 that is identical for "not
 * yours" and "not there", exactly as before.
 */
export const load: PageServerLoad = async ({ params, url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const access = await notebookAccess(supabase, claims.sub, claims.email as string | undefined);
	if (!access.canReview) error(404, 'Not found');
	redirect(307, legacyStudentTarget(params.studentEmail, url));
};
