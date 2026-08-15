import { error, redirect } from '@sveltejs/kit';
import type { NotebookEntry, NotebookSession } from '$lib/notebook';
import type { NotebookFolder } from '$lib/notebook-folders';
import type { PageServerLoad } from './$types';

/**
 * ONE STUDENT'S WHOLE NOTEBOOK, read-only, for the instructor who teaches them.
 *
 * WHY IT IS NOT UNDER /classroom/view-as. That tree renders the same screen and
 * it was tempting to hang this off it, but its gate is `is_admin()` -- stated
 * once in its own +layout.server.ts and again inside every view_as RPC -- and
 * this tier is deliberately wider: the teacher of record of a section this
 * student is actively enrolled in, or the chair. Sharing the tree would mean
 * either loosening that layout's guard for every page under it (handing an
 * admin-only preview of the whole classroom to every teacher) or branching it
 * per-child, which is the same guard written twice. So the RENDERING is shared
 * -- both pages mount NotebookView with no write transports -- and the DOOR is
 * not. 0106 makes the same split server-side: one payload helper,
 * `notebook_view_as_notebook` and `notebook_review_student_notebook` in front
 * of it with their own guards.
 *
 * THE GUARD IS THE RPC, not this load. `notebook_review_student_notebook`
 * refuses anyone who is neither an admin nor a teacher of record of one of this
 * student's active sections, so a non-reviewer calling it straight through
 * PostgREST is turned away by the database. This load only decides whether a
 * screen renders at all -- and it 404s rather than reporting the refusal, so
 * probing an address here reveals nothing about who is enrolled where (the
 * /admin rule, and the same reason /notebook/review itself 404s).
 *
 * A REFUSAL AND AN EMPTY NOTEBOOK MUST NOT LOOK ALIKE, which is why the RPC
 * raises instead of answering null: a student who is on a roster but has never
 * signed in genuinely has an empty notebook (0094's rule), and that is a real
 * answer the page explains, not a permission problem.
 *
 * READ-ONLY IS STRUCTURAL. NotebookView is handed no write transports of any
 * kind, and 0106 ships no write counterpart to this RPC -- the same property
 * the view-as notebook rests on, not a discipline this page has to keep.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error: rpcError } = await supabase.rpc('notebook_review_student_notebook', {
		p_email: studentEmail
	});
	// Refusal, unknown function and malformed address all answer the same way.
	// There is nothing this page can usefully say about any of them that would
	// not also tell a prober something.
	if (rpcError || !data) error(404, 'Not found');

	const payload = data as {
		student: { email: string; display_name: string | null; user_id: string | null };
		section_label: string | null;
		entries: NotebookEntry[];
		folders: NotebookFolder[];
		sessions: NotebookSession[];
		activity: { id: string; last_activity_at: string }[];
	};

	return {
		student: payload.student,
		sectionLabel: payload.section_label,
		entries: payload.entries ?? [],
		folders: payload.folders ?? [],
		sessions: payload.sessions ?? [],
		activity: payload.activity ?? []
	};
};
