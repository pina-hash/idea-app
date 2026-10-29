import { error, redirect } from '@sveltejs/kit';
import { loadHtmlAssignment } from '$lib/classroom/html-assignment/load';
import type { PageServerLoad } from './$types';

/**
 * GRADING A TEAM ASSIGNMENT BY TEAM (ledger 0436, 0305). One screen per team;
 * `?team=<id>` picks it. The gate here is the grading console's: a
 * non-manager is sent back to the item they can read. The real boundary is
 * inside `classroom_team_grading` and `classroom_grade_team`, which answer
 * "That team does not exist." to anyone who does not manage the team's class.
 * An assignment that is not a team assignment goes to the ordinary console.
 */
export const load: PageServerLoad = async ({ params, url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const [{ data: section }, { data: item }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select('id, label').eq('id', params.sectionId).maybeSingle(),
		supabase
			.from('classroom_items')
			.select('id, title, kind, posted_in:classroom_postings!inner(section_id)')
			.eq('id', params.itemId)
			.eq('posted_in.section_id', params.sectionId)
			.maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);
	if (!section || !item) error(404, 'Not found');
	if (manages !== true) redirect(303, `/classroom/${params.sectionId}/item/${params.itemId}`);
	const { data: teams } = await supabase.rpc('classroom_item_teams', { p_item_id: params.itemId });
	if ((teams as { team_assignment?: boolean } | null)?.team_assignment !== true) {
		redirect(303, `/classroom/${params.sectionId}/item/${params.itemId}/grade`);
	}
	const team = url.searchParams.get('team');
	// The document the grader reads beside the rubric (ledger 0456): the one
	// ladder every surface uses, so the frame shows what students see.
	const { htmlAssignment } = await loadHtmlAssignment(supabase, item as { id: string; kind: string }, 'assignment');
	return {
		htmlAssignment,
		sectionId: params.sectionId,
		itemId: params.itemId,
		itemTitle: String((item as { title?: string }).title ?? ''),
		teams: teams as unknown,
		teamParam: team && /^[0-9a-f-]{36}$/i.test(team) ? team : null
	};
};
