import type { PageServerLoad } from './$types';

/**
 * Pick a student. The list comes from classroom_view_as_students (0083), which
 * re-checks is_admin() itself -- the +layout.server.ts guard above only decides
 * whether this page renders at all.
 */
export const load: PageServerLoad = async ({ locals: { supabase } }) => {
	const { data, error } = await supabase.rpc('classroom_view_as_students');
	return {
		ready: !error,
		students: (data ?? []) as {
			student_email: string;
			display_name: string;
			section_count: number;
		}[]
	};
};
