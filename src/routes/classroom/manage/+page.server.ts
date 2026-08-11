import { redirect } from '@sveltejs/kit';
import { normalizeSectionRow, type ClassroomCourse } from '$lib/classroom/classroom';
import { SECTION_SELECT } from '$lib/classroom/transports';
import { isAdmin } from '$lib/server/admin';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * The teacher console. Gated on the domain-derived staff role
 * (profiles.role === 'teacher' -- the STAFF marker, deliberately NOT the
 * 0067 admin tier: classroom authority is per-section by teacher of record,
 * enforced inside every 0082/0083 RPC and policy, so this page guard is
 * convenience only, exactly like /dashboard's). A signed-in non-teacher is
 * sent to the student home rather than 404 because /classroom itself is
 * already theirs.
 *
 * `isAdmin` unlocks the course-editing card and the view-as entry point; both
 * are re-checked in the database (classroom_upsert_course refuses a non-admin
 * edit, and every view_as RPC opens with is_admin()), so this only decides
 * whether a control is worth showing.
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
		// Unconfigured Drive hides the file controls entirely rather than
		// offering an upload that would answer 503 (the notebook convention).
		attachmentsEnabled: driveConfigured(),
		sections: ((sections ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
		courses: (courses ?? []) as ClassroomCourse[]
	};
};
