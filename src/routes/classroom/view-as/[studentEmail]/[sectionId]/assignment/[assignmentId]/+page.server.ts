import { error } from '@sveltejs/kit';
import { normalizeAssignmentRow, normalizeSectionRow } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One assignment as that student: classroom_view_as_assignment (0083),
 * admin-gated in the database. Null when it is a draft, in a section the
 * student is not enrolled in, or framed under the wrong section path -- the
 * same 404 the student's own load would give, with no way to tell those cases
 * apart.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error: rpcError } = await supabase.rpc('classroom_view_as_assignment', {
		p_email: studentEmail,
		p_section_id: params.sectionId,
		p_assignment_id: params.assignmentId
	});
	if (rpcError) error(500, 'View as student is unavailable (is migration 0083 applied?)');
	if (!data) error(404, 'Not found');

	const payload = data as {
		section: Record<string, unknown>;
		assignment: Record<string, unknown>;
	};

	return {
		section: normalizeSectionRow(payload.section),
		assignment: normalizeAssignmentRow(payload.assignment)
	};
};
