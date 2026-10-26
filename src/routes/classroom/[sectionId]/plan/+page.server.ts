import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * A TEAM'S PLAN AND TRACKER (ledger 0436, 0303). A student reads their own
 * team's plan in the class's current posted draw; a manager picks any team of
 * the class (`?team=<id>`). The page reads the plan itself through
 * `classroom_team_plan`, which re-checks the caller, so this load only asks
 * whether the class exists for the caller: a class they cannot read is a 404,
 * exactly as the class page answers.
 */
export const load: PageServerLoad = async ({ params, url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const [{ data: section }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select('id, label').eq('id', params.sectionId).maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);
	if (!section) error(404, 'Not found');
	const team = url.searchParams.get('team');
	return {
		sectionId: params.sectionId,
		sectionLabel: String((section as { label?: string }).label ?? ''),
		manages: manages === true,
		teamParam: team && /^[0-9a-f-]{36}$/i.test(team) ? team : null
	};
};
