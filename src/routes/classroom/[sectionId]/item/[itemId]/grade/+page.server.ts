import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { ITEM_SELECT, SECTION_SELECT } from '$lib/classroom/transports';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import type { PageServerLoad } from './$types';

/**
 * The grading console for one assignment in one section. The page gate is
 * CONVENIENCE (the manage-console pattern: a non-manager is sent back to the
 * item they can read); the real boundary is classroom_can_review_submission
 * inside every grading RPC plus the RLS on the rows the console loads.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: itemRow }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase
			.from('classroom_items')
			.select(`${ITEM_SELECT}, posted_in:classroom_postings!inner(section_id)`)
			.eq('id', params.itemId)
			.eq('posted_in.section_id', params.sectionId)
			.maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	if (!sectionRow || !itemRow) error(404, 'Not found');
	if (manages !== true) redirect(303, `/classroom/${params.sectionId}/item/${params.itemId}`);

	const item = normalizeItemRow(itemRow as unknown as Record<string, unknown>);
	if (item.kind !== 'assignment') {
		redirect(303, `/classroom/${params.sectionId}/item/${params.itemId}`);
	}

	const [specRes, rubricRes] = await Promise.all([
		supabase.from('classroom_assignment_specs').select('spec').eq('item_id', item.id).maybeSingle(),
		supabase.from('classroom_rubrics').select('criteria').eq('item_id', item.id).maybeSingle()
	]);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		item,
		spec: (specRes.data?.spec as AssignmentSpec | undefined) ?? null,
		rubric: (rubricRes.data?.criteria as RubricCriterion[] | undefined) ?? null
	};
};
