import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * ONE SURFACE LEFT UNDER A STUDENT, SO THIS IS THE WAY TO IT.
 *
 * This page used to list that student's classes (classroom_view_as_sections)
 * so an admin could open one as them. Both of those previews -- the class page
 * and the item page -- are gone: the two roles differ by PAYLOAD rather than by
 * render, so an assignment previewed as a student showed a placeholder exactly
 * where the engine belongs, and no amount of work on this tree could close that
 * without minting a student session (IDEA_INTERFACE_STANDARDS 3, "a preview
 * whose fidelity cannot be proven is removed, not tolerated"). The real
 * instructor and student views already run through ONE component gated by
 * `canManage`, which is what parity means and what a preview was standing in
 * for.
 *
 * What survives is the NOTEBOOK preview, which is not the same case: there is
 * no notebook payload split by role, so `notebook_view_as_notebook` returns
 * what the student's own page returns.
 *
 * A REDIRECT RATHER THAN A DELETE. The picker now links straight to the
 * notebook, so nothing in the app produces this URL any more -- but it is in
 * the history of every admin who has used the feature, and answering it costs
 * six lines. 307, not 308: this is a routing decision that may change again,
 * and a permanent redirect is cached past the point where changing it helps.
 */
export const load: PageServerLoad = async ({ params }) => {
	redirect(307, `/classroom/view-as/${encodeURIComponent(params.studentEmail)}/notebook`);
};
