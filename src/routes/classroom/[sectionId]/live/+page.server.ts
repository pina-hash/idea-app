import { error, redirect } from '@sveltejs/kit';
import { loadSectionRoster } from '$lib/classroom/transports';
import type { PageServerLoad } from './$types';

/**
 * THE LIVE CLASS: the teacher's private control view for the front of the room
 * (ledger 0297, package LIVE).
 *
 * A MANAGER-ONLY SURFACE THAT ANSWERS 404 TO EVERYONE ELSE, exactly as People
 * and Grades do: an enrolled student can read this section, so a redirect would
 * confirm the tab exists and is merely off-limits, while 404 says nothing. The
 * gate is the section layout's own `canManage` -- the answer
 * `classroom_manages_section` already gave for this request, so the page and
 * the database cannot disagree about who manages the class.
 *
 * WHAT IT LOADS OF ITS OWN IS THE ROSTER, through the one roster reader (0138),
 * so the grid and the picker have names before the first hand-in read lands and
 * for an item that has no hand-ins at all. Everything else it shows is either
 * the section layout's payload (the items, the check-ins, the hall pass, the
 * clock) or a transport the page builds in the browser (presence, the grading
 * read, the live notices), which re-check the caller themselves.
 */
export const load: PageServerLoad = async ({ params, parent, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const { canManage } = await parent();
	if (!canManage) error(404, 'Not found');

	const roster = await loadSectionRoster(supabase, params.sectionId);
	return { roster: roster.ok ? roster.data.rows : [] };
};
