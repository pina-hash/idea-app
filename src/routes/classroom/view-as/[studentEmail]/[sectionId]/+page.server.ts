import { error } from '@sveltejs/kit';
import {
	normalizeItemRow,
	normalizeSectionRow,
	normalizeUnitRow,
	type ClassroomItem,
	type ClassroomUnit
} from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One class as that student: classroom_view_as_section (0085's item-based
 * rebuild). The RPC is admin-gated in the database and returns PUBLISHED items
 * only, for a section the student is ACTIVELY enrolled in -- the filtering is
 * the function's, never assembled here, so this page cannot accidentally show
 * more than the student would get. It also carries that student's own
 * last-viewed stamp, so the "Updated" badges read as THEY see them.
 *
 * Since 0113 it also carries the course's UNITS, in the same payload and behind
 * the same guard. That is deliberately not a second query here: a units read
 * issued from this page would be the admin's own read rendered under a
 * student's name, which is the rule that keeps check-ins and per-student work
 * off this page too. An older backend simply omits the key and the view falls
 * back to one chronological list, which is what a course with no units looks
 * like anyway -- degraded, never wrong.
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
		units?: Record<string, unknown>[];
	};

	return {
		section: normalizeSectionRow(payload.section),
		items: (payload.items ?? []).map(normalizeItemRow) as ClassroomItem[],
		units: (payload.units ?? []).map(normalizeUnitRow) as ClassroomUnit[]
	};
};
