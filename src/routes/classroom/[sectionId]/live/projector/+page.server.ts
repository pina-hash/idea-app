import { error, redirect } from '@sveltejs/kit';
import { projectorClassLabel, PROJECTOR_SECTION_SELECT } from '$lib/classroom/live-class/projector-load';
import type { PageServerLoad } from './$types';

/**
 * THE CLASS PROJECTOR VIEW'S LOAD, AND IT READS NOTHING PRIVATE (ledger 0297).
 *
 * The page is RESET TO THE ROOT LAYOUT (`+page@.svelte`), so neither the
 * classroom layout nor the section layout runs for it: no item list with its
 * drafts, no manager hall-pass payload naming who is out, no song queue with
 * its requesters, no roster. What this load reads is one row of the class's
 * own name and one yes-or-no about whether the caller manages it -- and
 * `tests/classroom-live-projector.test.ts` drives this exact function against
 * a recording client and fails if it selects anything more.
 *
 * EVERYTHING THE WALL SHOWS ARRIVES FROM THE TEACHER'S CONTROL VIEW over a
 * same-browser channel, as a frame that was already reduced to what the class
 * may see (`$lib/classroom/live-class/projector`).
 *
 * 404 TO ANYONE WHO DOES NOT MANAGE THE CLASS, the People and Grades rule: a
 * student opening this address learns nothing, not even that it exists.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const [{ data: row }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(PROJECTOR_SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);
	if (!row || manages !== true) error(404, 'Not found');
	return {
		sectionId: params.sectionId,
		classLabel: projectorClassLabel(row as Record<string, unknown>)
	};
};
