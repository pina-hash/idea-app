import { error, redirect } from '@sveltejs/kit';
import {
	normalizeAssignmentRow,
	normalizePostRow,
	normalizeSectionRow
} from '$lib/classroom/classroom';
import { ASSIGNMENT_SELECT, POST_SELECT, SECTION_SELECT } from '$lib/classroom/transports';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One class: Stream + Classwork. Every read runs as the CALLER'S OWN session
 * with no role branch -- RLS decides what comes back (a student load simply
 * never receives drafts or a foreign section, and the attachment embed is
 * scoped by the same policies). A section the caller may not read is
 * indistinguishable from one that does not exist, so both are 404.
 *
 * `canManage` comes from the classroom_manages_section RPC (teacher of
 * record, or admin) -- the same SECURITY DEFINER check every 0082/0083 policy
 * uses, so the page chrome can never disagree with what the database will
 * actually allow. It gates the on-card edit/delete controls; the RPCs behind
 * them re-check it regardless.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: sectionRow } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT)
		.eq('id', params.sectionId)
		.maybeSingle();
	if (!sectionRow) error(404, 'Not found');

	const [{ data: manages }, postsRes, asgRes] = await Promise.all([
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		supabase
			.from('classroom_posts')
			.select(POST_SELECT)
			.eq('section_id', params.sectionId)
			.order('created_at', { ascending: false }),
		supabase
			.from('classroom_assignments')
			.select(ASSIGNMENT_SELECT)
			.eq('section_id', params.sectionId)
			.order('created_at', { ascending: false })
	]);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: manages === true,
		attachmentsEnabled: driveConfigured(),
		posts: ((postsRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizePostRow),
		assignments: ((asgRes.data ?? []) as unknown as Record<string, unknown>[]).map(normalizeAssignmentRow)
	};
};
