import type { LayoutServerLoad } from './$types';

/**
 * Resolves the impersonated student once for the whole subtree, so the banner
 * is rendered by one layout rather than re-derived on every page.
 *
 * The admin gate is the parent layout's (and, really, each view_as RPC's). The
 * name lookup here is a plain RLS-scoped read that only an admin's own policy
 * would return anyway.
 */
export const load: LayoutServerLoad = async ({ params, locals: { supabase } }) => {
	const studentEmail = decodeURIComponent(params.studentEmail).trim().toLowerCase();

	const { data } = await supabase
		.from('classroom_enrollments')
		.select('display_name')
		.eq('student_email', studentEmail)
		.limit(1)
		.maybeSingle();

	return {
		studentEmail,
		displayName: (data?.display_name as string | null) ?? null
	};
};
