import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow } from '$lib/classroom/classroom';
import { withItemLayout } from '$lib/classroom/attachments';
import {
	selectItemsWithDoc,
	loadItemDeck,
	loadStudentEngineData,
	loadInstructorCopy,
	mergeInstructorMaterials
} from '$lib/classroom/transports';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import {
	isHtmlAssignment,
	withHtmlAssignmentVersion,
	type HtmlAssignmentData
} from '$lib/classroom/html-assignment/mount';
import { loadHtmlAssignment } from '$lib/classroom/html-assignment/load';
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

	/**
	 * WHICH ENGINE THIS ASSIGNMENT IS, AND ITS DOCUMENT IF IT IS A PORTED ONE
	 * (0195). A TWO-RUNG LADDER, WIDEST FIRST, REPORTING WHETHER IT COULD TELL.
	 *
	 * ITS OWN QUERIES RATHER THAN COLUMNS ON THE SHARED ITEM SELECT, which is
	 * the same deploy-ordering rule the reference spec and the public flag above
	 * are written to: PostgREST refuses an ENTIRE select for one unknown column,
	 * so naming `assignment_schema_version` in `ITEM_SELECT` would blank every
	 * classroom read on every surface until 0195 landed. Failing soft here costs
	 * this one page its knowledge of the engine and nothing else.
	 *
	 * RUNG 1 IS THE NARROWEST POSSIBLE PROBE -- one scalar column, no embed --
	 * so "this deployment has 0195" is the only thing its answer can mean. RUNG
	 * 2 is the document row, and it is a SEPARATE capability rather than a
	 * widening of the first: an item that is not schema 3 must never pay for a
	 * table read, and the version alone is what every other surface branches on.
	 *
	 * `htmlAssignmentReady` STARTS FALSE AND IS TURNED ON ONLY BY A RUNG THAT
	 * ACTUALLY ANSWERED, because "cannot tell" must never render as "this is a
	 * ported assignment". It is true when the probe said this is NOT one, and
	 * when it said it is AND the document came back; it stays false when either
	 * read could not answer, which `htmlAssignmentMount` renders as its own
	 * stated absence rather than as either engine.
	 *
	 * THE DOCUMENT COLUMN IS NOT SELECTED, and that is a rule rather than a
	 * saving. `/hx/<document_id>` serves the bytes under the sandbox CSP, on the
	 * sandbox origin; putting them in this payload would carry an uploaded
	 * document into the portal origin's own HTML, which is the one thing the
	 * split exists to prevent, and double the transfer on the way.
	 */
	// `loadHtmlAssignment` IS THE ONE LADDER and the grading console's load calls
	// the same function. The comment above says why the probe and the document
	// read are two rungs; the module says why they are not written out twice.
	const hx = await loadHtmlAssignment(supabase, item, item.kind);
	const { htmlAssignment, htmlAssignmentReady } = hx;
	item = hx.item;

	let ideacad: unknown = null;
	let ideacadReady = false;
	if (item.kind === 'assignment' && (item as { assignment_schema_version?: number }).assignment_schema_version === 4) {
		if (canManage) {
			const result = await supabase.from('ideacad_editors').select('config').eq('item_id', item.id).maybeSingle();
			if (!result.error) { ideacadReady = true; ideacad = result.data ? { config: result.data.config, concepts: [], document: null } : null; }
		} else {
			const result = await supabase.rpc('ideacad_open_document', { p_item_id: item.id });
			if (!result.error) { ideacadReady = true; ideacad = result.data; }
		}
	} else if ((item as { assignment_schema_version?: number }).assignment_schema_version !== 4) ideacadReady = true;

	let engine: Awaited<ReturnType<typeof loadStudentEngineData>> = null;
	let instructorCopy: Awaited<ReturnType<typeof loadInstructorCopy>> = null;
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
			/**
			 * THE MANAGER'S OWN WORKING COPY (0128), and only when there is
			 * something to fill in. Its own query, failing soft to null, for the
			 * deploy-ordering reason every other read here documents: a deployment
			 * sitting between 0127 and 0128 is a real state, and the manager's item
			 * page must not break over it.
			 *
			 * NEVER LOADED FOR A NON-MANAGER, and it would answer nothing if it
			 * were -- the RLS policy admits no student at all. The branch is here
			 * so a student's payload provably cannot carry the key.
			 *
			 * A PORTED DOCUMENT COUNTS AS SOMETHING TO FILL IN NOW (0199), AND IT
			 * USED NOT TO. The condition was `if (spec)` alone, on the reasoning
			 * that an assignment with no interactive spec has no blocks to answer
			 * and the save RPC refuses one -- both true of a v1 item and both
			 * FALSE of a schema-3 one, which carries its blocks in a manifest and
			 * whose saves `classroom_save_instructor_response` accepts since 0199.
			 * Left as it was, the payload would have been null for exactly the
			 * assignments this lane exists for and the surface would never have
			 * mounted.
			 *
			 * THE TWO ARMS SHARE ONE READ because they share one table: 0128's
			 * rows are keyed on `(item, instructor, block)` whatever produced the
			 * block id, so there is no ported variant of `loadInstructorCopy` and
			 * there must not be one.
			 */
			if (spec || htmlAssignment) {
				instructorCopy = await loadInstructorCopy(supabase, item.id, claims.email ?? '');
			}
		} else {
			engine = await loadStudentEngineData(supabase, item.id);
		}
	}

	return {
		/**
		 * WITH ITS LAYOUT ATTACHED (0193), from the same row the item was
		 * normalized from. Attached at the END, after every reassignment above,
		 * because `normalizeItemRow` names its fields and would have dropped the
		 * two columns, and the `{ ...item }` spreads between here and there are
		 * the kind of line that quietly loses a field a later edit adds. Absent
		 * when the read could not tell (a pre-0193 project), and the page reads
		 * absence as "offer no layout controls" rather than as the default.
		 */
		item: withItemLayout(item, itemRow as unknown as Record<string, unknown>),
		deck,
		engine,
		instructorCopy,
		spec,
		rubric,
		referenceSpec,
		htmlAssignment,
		ideacad,
		ideacadReady,
		/**
		 * WHETHER THIS READ COULD TELL WHICH ENGINE THIS ASSIGNMENT IS. Not read
		 * by the item page, which acts on `htmlAssignmentMount`'s three-way
		 * answer instead -- that is the same fact in the form a renderer can
		 * mount something from. It is returned because the ladder rule asks a
		 * capability to report itself, and because a surface that needs to
		 * OFFER something (an import control, a conversion) has to know the
		 * difference between "this is a v1 assignment" and "this deployment
		 * could not say".
		 */
		htmlAssignmentReady
	};
};
