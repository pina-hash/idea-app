import { error, redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import { SECTION_SELECT, loadSectionRoster } from '$lib/classroom/transports';
import type { PageServerLoad } from './$types';

/**
 * One class's roster and settings -- the People tab.
 *
 * A STUDENT GETS A 404, NOT A REDIRECT, and that is the /admin rule: an enrolled
 * student can legitimately read this section, so bouncing them somewhere would
 * confirm the tab exists and is merely off-limits, while 404 says nothing at
 * all. It is also what the test asserts, because "students never see these tabs"
 * has to be true of a typed URL and not only of a rendered link.
 *
 * The gate is `classroom_manages_section` -- the SAME SECURITY DEFINER check
 * every policy and every RPC in this module uses, so this page can never offer a
 * roster the database would refuse. It is still convenience: every write behind
 * it re-checks teacher-of-record itself.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	// A section the caller cannot read and a section that does not exist answer
	// identically, exactly as the class page does.
	if (!sectionRow) error(404, 'Not found');
	if (manages !== true) error(404, 'Not found');

	// The one roster reader (0138). This tab shows EVERY row -- a manager's own
	// enrollment is exactly the row somebody has come here to remove -- so it
	// takes `rows` whole and reads the `manages` flag as a LABEL rather than as
	// a filter. `managesReady` false means the project has no 0138: the flag is
	// unknown, so the tab says nothing about it and offers no Remove.
	const roster = await loadSectionRoster(supabase, params.sectionId);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: true,
		roster: roster.ok ? roster.data.rows : [],
		removalReady: roster.ok ? roster.data.managesReady : false
	};
};
