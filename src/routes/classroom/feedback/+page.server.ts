import { error } from '@sveltejs/kit';
import type { FeedbackRow } from '$lib/feedback/feedback';
import { rowSection, type ClassroomSectionInfo } from '$lib/feedback/console';
import { isAdmin } from '$lib/server/admin';
import type { PageServerLoad } from './$types';

/**
 * The feedback console. ADMIN ONLY, and a non-admin gets a 404 rather than a
 * redirect (the /admin rule): probing the URL should tell a curious student
 * nothing at all. Anonymous visitors never reach it -- /classroom is in
 * hooks.server.ts authedPrefixes -- but the guard stands on its own regardless.
 *
 * This page guard is convenience: app_feedback_admin_list and
 * app_feedback_set_status both open with is_admin() inside the function body,
 * so a hand-rolled PostgREST call is refused by the database, not by a load.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');

	// EVERY APP, NOT JUST THE CLASSROOM. `p_app` was 'classroom' when the
	// classroom was the only surface with a Feedback button; the affordance is
	// mounted in the root layout now, so narrowing to one app here would hide
	// most of what arrives. `app_feedback_admin_list` already defaults `p_app` to
	// null (all apps), so this is an omission rather than a new parameter -- no
	// deploy-ordering problem, and it works against the schema already applied.
	const { data, error: rpcError } = await supabase.rpc('app_feedback_admin_list');
	const rows = (data ?? []) as unknown as FeedbackRow[];

	// `meta.section` on a row captured from /classroom/[sectionId] is a
	// classroom_sections uuid (the route param), a DIFFERENT namespace from the
	// curriculum.ts slug resolveSectionId falls back to. Resolved HERE, at
	// export time, off the live table -- never at capture -- so a section
	// renamed after a report was filed exports under today's name. See
	// resolveSectionId in $lib/feedback/console.
	const sectionIds = [...new Set(rows.map(rowSection).filter((v): v is string => !!v))];
	let classroomSections: ClassroomSectionInfo[] = [];
	if (sectionIds.length) {
		const { data: sectionRows } = await supabase
			.from('classroom_sections')
			.select('id, label, block, classroom_courses(code)')
			.in('id', sectionIds);
		classroomSections = (sectionRows ?? []).map((r) => {
			const course = Array.isArray(r.classroom_courses)
				? r.classroom_courses[0]
				: r.classroom_courses;
			return {
				id: r.id as string,
				course: (course?.code as string | undefined) ?? 'unknown course',
				label: r.label as string,
				block: (r.block as string | null) ?? null
			};
		});
	}

	return {
		// Fails soft: 0085 unapplied reads as a clearly-flagged card, not a crash.
		ready: !rpcError,
		rows,
		classroomSections
	};
};
