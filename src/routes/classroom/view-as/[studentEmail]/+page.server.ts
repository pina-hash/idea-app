import { normalizeSectionRow, type ClassroomSection } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * "My Classes" as that student. The list is classroom_view_as_sections (0083),
 * which is admin-gated in the database and returns exactly the sections the
 * student has an ACTIVE enrollment in -- not the admin's own sections, and not
 * classes the student was removed from.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data, error } = await supabase.rpc('classroom_view_as_sections', {
		p_email: studentEmail
	});

	return {
		ready: !error,
		sections: ((data ?? []) as Record<string, unknown>[]).map(
			normalizeSectionRow
		) as ClassroomSection[]
	};
};
