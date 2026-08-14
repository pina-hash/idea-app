import { error } from '@sveltejs/kit';
import type { NotebookEntry, NotebookSession } from '$lib/notebook';
import type { NotebookFolder } from '$lib/notebook-folders';
import type { PageServerLoad } from './$types';

/**
 * ONE STUDENT'S DIGITAL NOTEBOOK, as that student sees it.
 *
 * IT LIVES INSIDE THE EXISTING VIEW-AS TREE ON PURPOSE, rather than as a
 * second one under /notebook. Everything the feature needs already exists
 * here: the admin gate in ../../+layout.server.ts (404, the /admin rule, so a
 * probe reveals nothing), the ImpersonationBanner mounted once in
 * ../+layout.svelte, and the student picker at /classroom/view-as. A parallel
 * tree would mean a second guard, a second banner mount and a second picker --
 * three more places for "who may do this" to drift.
 *
 * That guard is still CONVENIENCE. notebook_view_as_notebook (0099) opens with
 * 0083's own `_classroom_view_as_guard`, i.e. `is_admin()`, so a non-admin
 * calling it straight through PostgREST is refused by the database and this
 * page only decides whether a screen full of failing queries renders at all.
 *
 * READ-ONLY IS STRUCTURAL. NotebookView is handed NO write transports of any
 * kind -- not createEntry, not addPhoto, not the note pair, not
 * folderTransports, not setPinned -- and each omission removes the control it
 * drives, right down into every entry card. 0099 additionally ships no
 * notebook view_as WRITE RPC at all, so there is nothing on the server to
 * execute either. `readOnly` on the component is the stated intent, not the
 * mechanism.
 *
 * `canReview` is deliberately FALSE regardless of who the student is: the
 * "Section review" link would be a door out of a read-only preview and into a
 * console that grades and flags, which is exactly what this surface must not
 * offer.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error: rpcError } = await supabase.rpc('notebook_view_as_notebook', {
		p_email: studentEmail
	});
	if (rpcError) {
		error(500, 'Viewing a notebook as a student is unavailable (is migration 0099 applied?)');
	}
	if (!data) error(404, 'Not found');

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
