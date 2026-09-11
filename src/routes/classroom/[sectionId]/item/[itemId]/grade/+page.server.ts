import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { SECTION_SELECT, selectItemsWithDoc } from '$lib/classroom/transports';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import { loadHtmlAssignment } from '$lib/classroom/html-assignment/load';
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
		selectItemsWithDoc((select) =>
			supabase
				.from('classroom_items')
				.select(`${select}, posted_in:classroom_postings!inner(section_id)`)
				.eq('id', params.itemId)
				.eq('posted_in.section_id', params.sectionId)
				.maybeSingle()
		),
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

	/**
	 * WHETHER THIS IS A PORTED DOCUMENT, AND WHICH ONE -- THE SAME LADDER THE
	 * STUDENT'S ITEM PAGE RUNS, through the same function.
	 *
	 * WITHOUT IT THIS CONSOLE COULD NOT GRADE A SCHEMA-3 ASSIGNMENT AT ALL.
	 * `classroom_assignment_specs` has no row for a ported item, so `spec` came
	 * back null, and with no spec and no document the work column fell through
	 * every branch it has: the roster read "In progress", the rubric rendered,
	 * and the pane where the student's answers belong was EMPTY. Measured in
	 * production at `89b8154` on 2026-09-10.
	 *
	 * IT IS NOT A SECOND COPY OF THE LADDER, deliberately -- see
	 * `loadHtmlAssignment`'s own header. The probe's failure mode is a `ready`
	 * flag that has to start false, and two spellings of that are two answers.
	 *
	 * THE CONSOLE STILL GETS `spec` UNCONDITIONALLY. A schema-3 item may carry a
	 * leftover spec row from before its conversion, and `GradingConsole` already
	 * branches spec-first for the WORK COLUMN; what decides which engine renders
	 * is the same thing every other surface reads, and this load's job is only
	 * to make the document available for it to read.
	 */
	const { htmlAssignment, htmlAssignmentReady } = await loadHtmlAssignment(
		supabase,
		item,
		item.kind
	);

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		item,
		spec: (specRes.data?.spec as AssignmentSpec | undefined) ?? null,
		rubric: (rubricRes.data?.criteria as RubricCriterion[] | undefined) ?? null,
		htmlAssignment,
		htmlAssignmentReady
	};
};
