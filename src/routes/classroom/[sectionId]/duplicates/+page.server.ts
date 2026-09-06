import { error, redirect } from '@sveltejs/kit';
import { normalizeSectionRow } from '$lib/classroom/classroom';
import { SECTION_SELECT } from '$lib/classroom/transports';
import { readAnswer, EMPTY_ANSWER } from '$lib/classroom/DuplicateDrafts.svelte';
import type { PageServerLoad } from './$types';

/**
 * One class's duplicate drafts -- the count nobody has (0074).
 *
 * A STUDENT GETS A 404, NOT A REDIRECT, exactly as the People and Grades tabs
 * do: an enrolled student can legitimately read this section, so a bounce would
 * confirm the page exists and is merely off-limits. It is deliberately NOT in
 * `authedPrefixes` for the same reason -- well, `/classroom` is, so an
 * anonymous caller is redirected off the whole area before this load runs; the
 * `claims` guard here is the belt to that.
 *
 * THE GATE IS ASKED TWICE AND THEY ARE DIFFERENT QUESTIONS.
 * `classroom_manages_section` decides whether this PAGE exists for the caller.
 * `_classroom_manages_item`, inside 0187, decides which ITEMS it may name --
 * every section the item is posted to, which is the delete gate. A manager of
 * one section of a co-posted draft gets the page and not that draft.
 *
 * THE RPC LADDER. 0187 is applied by hand and separately, so a deployment
 * sitting between two migrations is a real state. `dupesReady` starts FALSE and
 * is turned on only by a call that actually answered; a `PGRST202` -- the
 * function not existing -- degrades to the empty answer and the page SAYS the
 * count cannot be taken here. Degrading on that code ALONE is the rule: a
 * runtime error inside the function must fail closed rather than read as "no
 * duplicates", which is the one wrong answer this page can give.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: manages }] = await Promise.all([
		supabase
			.from('classroom_sections')
			.select(SECTION_SELECT)
			.eq('id', params.sectionId)
			.maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	if (!sectionRow) error(404, 'Not found');
	if (manages !== true) error(404, 'Not found');

	const { data, error: rpcError } = await supabase.rpc('classroom_duplicate_drafts', {
		p_section_id: params.sectionId
	});

	if (rpcError) {
		if (rpcError.code === 'PGRST202') {
			return {
				section: normalizeSectionRow(sectionRow as Record<string, unknown>),
				answer: EMPTY_ANSWER,
				dupesReady: false
			};
		}
		// Anything else is a real failure and is reported as one. Rendering an
		// empty list here would tell a teacher their class is clean when nobody
		// asked the question successfully.
		error(500, 'The duplicate check could not be run for this class.');
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		answer: readAnswer(data),
		dupesReady: true
	};
};
