import { redirect } from '@sveltejs/kit';
import { normalizeSectionRow, type ClassroomCourse } from '$lib/classroom/classroom';
import { SECTION_SELECT } from '$lib/classroom/transports';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * The one GLOBAL classroom area: courses, creating a class, and the site tools
 * that span every class rather than living in one.
 *
 * THIS REPLACES /classroom/manage, which also held every class's roster,
 * settings and content -- a second way to do what a class's own People and Class
 * tabs now do, reached by leaving the class you were standing in. Those moved
 * into the section; /classroom/manage redirects here rather than lingering as a
 * second door.
 *
 * Gated on the domain-derived staff role (profiles.role === 'teacher' -- the
 * STAFF marker, deliberately NOT the 0067 admin tier: classroom authority is
 * per-section by teacher of record, enforced inside every 0082/0083 RPC and
 * policy, so this page guard is convenience only, exactly like /dashboard's). A
 * signed-in non-teacher is sent to the student home rather than 404 because
 * /classroom itself is already theirs.
 *
 * `isAdmin` unlocks the course-editing card and the site tools; both are
 * re-checked in the database (classroom_upsert_course refuses a non-admin edit,
 * and every view_as RPC opens with is_admin()), so this only decides whether a
 * control is worth showing.
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
	const [{ data: sections, error: sectionsError }, { data: courses }, admin] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT),
		supabase.from('classroom_courses').select('id, code, title, active').order('code'),
		isAdmin(supabase, claims.sub)
	]);

	return {
		ready: !sectionsError,
		email: (profile?.email ?? claims.email ?? '').toLowerCase(),
		isAdmin: admin,
		sections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
		courses: (courses ?? []) as ClassroomCourse[]
	};
};
