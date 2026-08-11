import { error, redirect } from '@sveltejs/kit';
import {
	normalizeAssignmentRow,
	normalizeSectionRow,
	type ClassroomPost
} from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * One class: Stream + Classwork. Every read runs as the CALLER'S OWN session
 * with no role branch -- RLS decides what comes back (a student load simply
 * never receives drafts or a foreign section). A section the caller may not
 * read is indistinguishable from one that does not exist, so both are 404.
 *
 * `canManage` comes from the classroom_manages_section RPC (teacher of
 * record, or admin) -- the same SECURITY DEFINER check every 0082 policy
 * uses, so the page chrome can never disagree with what the database will
 * actually allow. It only adds chrome (draft badges, the manage link).
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: sectionRow } = await supabase
		.from('classroom_sections')
		.select('id, course_id, label, block, teacher_email, classroom_courses(id, code, title, active)')
		.eq('id', params.sectionId)
		.maybeSingle();
	if (!sectionRow) error(404, 'Not found');

	const [{ data: manages }, postsRes, asgRes] = await Promise.all([
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		supabase
			.from('classroom_posts')
			.select('id, section_id, group_id, title, body, author_email, author_name, published, created_at, updated_at')
			.eq('section_id', params.sectionId)
			.order('created_at', { ascending: false }),
		supabase
			.from('classroom_assignments')
			.select(
				'id, section_id, group_id, title, description, points, due_at, category, author_email, author_name, published, created_at, updated_at, classroom_assignment_resources(id, label, url, sort_order)'
			)
			.eq('section_id', params.sectionId)
			.order('created_at', { ascending: false })
	]);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: manages === true,
		posts: (postsRes.data ?? []) as ClassroomPost[],
		assignments: ((asgRes.data ?? []) as Record<string, unknown>[]).map(normalizeAssignmentRow)
	};
};
