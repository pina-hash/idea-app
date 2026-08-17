import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow } from '$lib/classroom/classroom';
import {
	selectItemsWithDoc,
	loadItemDeck,
	loadStudentEngineData,
	mergeInstructorMaterials
} from '$lib/classroom/transports';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import { validateReferenceSpec, type ReferenceSpec } from '$lib/classroom/reference-spec';
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
 *
 * WHAT THIS DELIBERATELY NO LONGER RETURNS: `section`, `canManage`, `sections`
 * and `attachmentsEnabled`. They come from +layout.server.ts, which computes
 * them identically for the same section, and page data merges over layout data
 * -- so returning them here would only SHADOW the layout's copies with a second
 * set of the same values. Two queries go with them: the section row (the layout
 * already 404s an unreadable section, and the item's own posting join is what
 * ties the item to it) and the full section list. The manages RPC stays,
 * because this load BRANCHES on the answer -- reading it back off the layout
 * would mean awaiting parent() and serializing behind the whole class load for
 * one boolean.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: itemRow }, { data: manages }] = await Promise.all([
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

	if (!itemRow) error(404, 'Not found');

	let item = normalizeItemRow(itemRow as unknown as Record<string, unknown>);
	const canManage = manages === true;
	if (canManage) {
		// Instructor-only materials (0090), manager reads only -- see
		// mergeInstructorMaterials for why this is never fetched for a student.
		[item] = await mergeInstructorMaterials(supabase, [item]);
	}

	/**
	 * The reference document on a material (0092), and -- for a manager only --
	 * the public flag the toggle reads.
	 *
	 * BOTH ARE THEIR OWN QUERIES RATHER THAN COLUMNS ON ITEM_SELECT, and that is
	 * a deploy-ordering rule, not tidiness: migrations here are applied by hand,
	 * so a deployment sitting between 0091 and 0092 is a real state, and
	 * PostgREST refuses an ENTIRE select for one unknown column. Naming
	 * `is_public` in the shared select would blank every classroom read until
	 * 0092 landed. Failing soft here costs a manager the toggle and nothing else.
	 */
	let referenceSpec: ReferenceSpec | null = null;
	if (item.kind === 'material') {
		const { data: refRow } = await supabase
			.from('classroom_reference_specs')
			.select('spec')
			.eq('item_id', item.id)
			.maybeSingle();
		const validated = validateReferenceSpec(refRow?.spec ?? null);
		referenceSpec = validated.spec;
		if (canManage) {
			const { data: flagRow } = await supabase
				.from('classroom_items')
				.select('is_public')
				.eq('id', item.id)
				.maybeSingle();
			item = { ...item, is_public: (flagRow as { is_public?: boolean } | null)?.is_public === true };
		}
	}

	/**
	 * The item's presentation deck (0101), if it has one. RLS-scoped, so this
	 * asks the same question the serving proxy will ask for every one of the
	 * deck's ~30 files -- a student who cannot read the item gets null here and
	 * 404s there. Its own query for the deploy-ordering reason loadItemDeck
	 * documents.
	 */
	const deck = await loadItemDeck(supabase, item.id);

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
		item,
		deck,
		engine,
		spec,
		rubric,
		referenceSpec
	};
};
