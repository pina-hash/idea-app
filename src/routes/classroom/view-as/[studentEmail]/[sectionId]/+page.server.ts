import { error } from '@sveltejs/kit';
import {
	normalizeAssignmentRow,
	normalizePostRow,
	normalizeSectionRow,
	type ClassroomAssignment,
	type ClassroomPost
} from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One class as that student: classroom_view_as_section (0083). The RPC is
 * admin-gated in the database and returns PUBLISHED posts and assignments only,
 * for a section the student is ACTIVELY enrolled in -- the filtering is the
 * function's, never assembled here, so this page cannot accidentally show more
 * than the student would get.
 *
 * A null result means "not enrolled, or no such section", which is exactly the
 * 404 the student's own load would produce.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error: rpcError } = await supabase.rpc('classroom_view_as_section', {
		p_email: studentEmail,
		p_section_id: params.sectionId
	});
	if (rpcError) error(500, 'View as student is unavailable (is migration 0083 applied?)');
	if (!data) error(404, 'Not found');

	const payload = data as {
		section: Record<string, unknown>;
		posts: Record<string, unknown>[];
		assignments: Record<string, unknown>[];
	};

	return {
		section: normalizeSectionRow(payload.section),
		posts: (payload.posts ?? []).map(normalizePostRow) as ClassroomPost[],
		assignments: (payload.assignments ?? []).map(normalizeAssignmentRow) as ClassroomAssignment[]
	};
};
