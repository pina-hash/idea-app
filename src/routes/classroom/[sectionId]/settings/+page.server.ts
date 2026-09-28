import { error, redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import { SECTION_SELECT } from '$lib/classroom/transports';
import type { PageServerLoad } from './$types';

/**
 * One class's own settings -- the Settings tab (report R06, 2026-09-28): the
 * class's details, Archive class and Delete class, which used to sit at the
 * bottom of the People tab where nobody looked for them.
 *
 * A STUDENT GETS A 404, NOT A REDIRECT, exactly as People, Grades and
 * Duplicates do: an enrolled student can legitimately read this section, so a
 * bounce would confirm the tab exists and is merely off-limits, while 404 says
 * nothing at all. `/classroom` is in `authedPrefixes`, so an anonymous caller
 * never reaches this load; the `claims` guard is the belt to that.
 *
 * The gate is `classroom_manages_section`, the SAME SECURITY DEFINER check
 * every policy and RPC in this module uses. It is still convenience: every
 * write behind this page (`classroom_upsert_section`,
 * `classroom_set_section_active`, `classroom_delete_section`) re-checks
 * teacher-of-record itself. `tests/classroom-settings-tab.test.ts` drives this
 * load in both directions.
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

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: true
	};
};
