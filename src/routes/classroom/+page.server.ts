import { redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * Classroom home ("My Classes"). Signed-in tier, any role: /classroom is in
 * hooks.server.ts authedPrefixes, so anonymous visitors get the standard 303
 * to `/` (this redirect is belt-and-braces for a direct load).
 *
 * ONE RLS-scoped select serves both audiences with no role branch in the
 * query (the /coin-balance doctrine -- the filtering IS the policy, never
 * application code): classroom_sections' policy returns exactly the sections
 * the caller may see, which is their enrolled classes for a student, their
 * own sections for a teacher of record, and everything for an admin.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', claims.sub)
		.maybeSingle();

	const { data: sections, error } = await supabase
		.from('classroom_sections')
		.select('id, course_id, label, block, teacher_email, classroom_courses(id, code, title, active)')
		.order('label');

	return {
		// Fails soft: 0082 not applied reads as a clearly-flagged "not available
		// yet" card rather than a crashed page (the /coin-balance convention).
		ready: !error,
		isStaff: profile?.role === 'teacher',
		sections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow)
	};
};
