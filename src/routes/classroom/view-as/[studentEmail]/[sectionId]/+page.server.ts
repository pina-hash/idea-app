import { error } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow, type ClassroomItem } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One class as that student: classroom_view_as_section (0085's item-based
 * rebuild). The RPC is admin-gated in the database and returns PUBLISHED items
 * only, for a section the student is ACTIVELY enrolled in -- the filtering is
 * the function's, never assembled here, so this page cannot accidentally show
 * more than the student would get. It also carries that student's own
 * last-viewed stamp, so the "Updated" badges read as THEY see them.
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
	if (rpcError) error(500, 'View as student is unavailable (is migration 0085 applied?)');
	if (!data) error(404, 'Not found');

	const payload = data as {
		section: Record<string, unknown>;
		items: Record<string, unknown>[];
	};

	return {
		section: normalizeSectionRow(payload.section),
		items: (payload.items ?? []).map(normalizeItemRow) as ClassroomItem[]
	};
};
