import { redirect } from '@sveltejs/kit';
import { normalizeSectionRow, type ClassroomCourse } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * The teacher console. Gated on the domain-derived staff role
 * (profiles.role === 'teacher' -- the STAFF marker, deliberately NOT the
 * 0067 admin tier: classroom authority is per-section by teacher of record,
 * enforced inside every 0082 RPC and policy, so this page guard is
 * convenience only, exactly like /dashboard's). A signed-in non-teacher is
 * sent to the student home rather than 404 because /classroom itself is
 * already theirs.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role, email')
		.eq('id', claims.sub)
		.maybeSingle();
	if (profile?.role !== 'teacher') redirect(303, '/classroom');

	// RLS scopes the sections to the caller's own (all of them for an admin);
	// courses are the shared catalog, readable in full for the pickers.
	const [{ data: sections, error: sectionsError }, { data: courses }] = await Promise.all([
		supabase
			.from('classroom_sections')
			.select('id, course_id, label, block, teacher_email, classroom_courses(id, code, title, active)'),
		supabase.from('classroom_courses').select('id, code, title, active').order('code')
	]);

	return {
		ready: !sectionsError,
		email: (profile?.email ?? claims.email ?? '').toLowerCase(),
		sections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
		courses: (courses ?? []) as ClassroomCourse[]
	};
};
