import { redirect } from '@sveltejs/kit';
import { loadClassTimeline } from '$lib/server/notebook-timeline';
import { classNotebookHref } from '$lib/classroom/nav';
import type { PageServerLoad } from './$types';

/**
 * ONE CLASS'S PROJECT TIMELINE, A STUDENT'S OWN (ledger 0297, package F4b).
 * The section layout above is the gate (it 404s a class the caller cannot
 * read) and hands down the class's items, check-ins and its one clock. A
 * manager has no notebook of their own in a class they teach, so they are
 * sent to the class's Notebook tab, which is a surface that exists for
 * everyone who can read the class.
 */
export const load: PageServerLoad = async ({ params, parent, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const { canManage, items, checkIns, classClock } = await parent();
	if (canManage) redirect(307, classNotebookHref(params.sectionId));
	const timeline = await loadClassTimeline(
		supabase,
		{ id: claims.sub, email: String(claims.email ?? '') },
		params.sectionId,
		(items ?? []).map((i) => i.id)
	);
	return {
		timeline,
		timelineItems: (items ?? []).map((i) => ({ id: i.id, title: i.title ?? null, kind: i.kind })),
		classDays: (checkIns ?? []).map((c) => ({ session_id: c.session_id, session_date: c.session_date })),
		today: classClock?.today ?? ''
	};
};
