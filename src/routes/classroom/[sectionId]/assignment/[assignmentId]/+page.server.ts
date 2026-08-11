import { error, redirect } from '@sveltejs/kit';
import { normalizeAssignmentRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { ASSIGNMENT_SELECT, SECTION_SELECT } from '$lib/classroom/transports';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One assignment. RLS-scoped like the class page: an assignment the caller
 * may not read (foreign section, or a draft for a student) reads as 404,
 * never as a distinguishable "forbidden". The section_id in the URL is
 * cross-checked so a valid assignment id can't be framed under another
 * section's path.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: asgRow }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase
			.from('classroom_assignments')
			.select(ASSIGNMENT_SELECT)
			.eq('id', params.assignmentId)
			.eq('section_id', params.sectionId)
			.maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	if (!sectionRow || !asgRow) error(404, 'Not found');

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		assignment: normalizeAssignmentRow(asgRow as unknown as Record<string, unknown>),
		canManage: manages === true,
		attachmentsEnabled: driveConfigured()
	};
};
