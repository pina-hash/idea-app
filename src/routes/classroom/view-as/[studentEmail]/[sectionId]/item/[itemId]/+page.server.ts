import { error } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One item as that student: classroom_view_as_item (0085), admin-gated in the
 * database. Null when it is a draft, in a section the student is not enrolled
 * in, or framed under a class it was never posted to -- the same 404 the
 * student's own load would give, with no way to tell those cases apart.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error: rpcError } = await supabase.rpc('classroom_view_as_item', {
		p_email: studentEmail,
		p_section_id: params.sectionId,
		p_item_id: params.itemId
	});
	if (rpcError) error(500, 'View as student is unavailable (is migration 0085 applied?)');
	if (!data) error(404, 'Not found');

	const payload = data as {
		section: Record<string, unknown>;
		item: Record<string, unknown>;
	};

	return {
		section: normalizeSectionRow(payload.section),
		item: normalizeItemRow(payload.item)
	};
};
