import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow, normalizeSectionRow } from '$lib/classroom/classroom';
import { ITEM_SELECT, SECTION_SELECT, loadStudentEngineData } from '$lib/classroom/transports';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import { driveConfigured } from '$lib/server/notebook-drive';
import type { PageServerLoad } from './$types';

/**
 * One classroom item -- assignment, material or announcement. RLS-scoped like
 * the class page: an item the caller may not read (a class they are not in, or
 * a draft for a student) reads as 404, never as a distinguishable "forbidden".
 *
 * The section in the URL is cross-checked against the item's POSTINGS, so a
 * real item id cannot be framed under a class it was never posted to.
 *
 * ASSIGNMENTS additionally load the engine's data. The spec and rubric are as
 * readable as the item (classroom_can_read_item); the STUDENT slice
 * (submission, responses, files, approvals) is loaded only for a non-manager,
 * because for a manager those same RLS policies legitimately return every
 * student's rows -- the grading console loads those deliberately, this page
 * never should. Everything fails soft pre-0086: the engine section simply does
 * not render.
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

	const item = normalizeItemRow(itemRow as unknown as Record<string, unknown>);
	const canManage = manages === true;
	let sections: ReturnType<typeof normalizeSectionRow>[] = [];
	if (canManage) {
		const { data } = await supabase.from('classroom_sections').select(SECTION_SELECT);
		sections = ((data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow);
	}

	let engine: Awaited<ReturnType<typeof loadStudentEngineData>> = null;
	let spec: AssignmentSpec | null = null;
	let rubric: RubricCriterion[] | null = null;
	if (item.kind === 'assignment') {
		if (canManage) {
			const [specRes, rubricRes] = await Promise.all([
				supabase.from('classroom_assignment_specs').select('spec').eq('item_id', item.id).maybeSingle(),
				supabase.from('classroom_rubrics').select('criteria').eq('item_id', item.id).maybeSingle()
			]);
			spec = (specRes.data?.spec as AssignmentSpec | undefined) ?? null;
			rubric = (rubricRes.data?.criteria as RubricCriterion[] | undefined) ?? null;
		} else {
			engine = await loadStudentEngineData(supabase, item.id);
		}
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		item,
		canManage,
		sections,
		attachmentsEnabled: driveConfigured(),
		engine,
		spec,
		rubric
	};
};
