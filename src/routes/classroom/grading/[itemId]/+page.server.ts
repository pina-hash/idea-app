import { error, redirect } from '@sveltejs/kit';
import { normalizeItemRow } from '$lib/classroom/classroom';
import { POSTING_SELECT, normalizePostings, selectItemsWithDoc } from '$lib/classroom/transports';
import { managedPostedSections } from '$lib/classroom/grading-bulk';
import type { AssignmentSpec, RubricCriterion } from '$lib/classroom/assignment-spec';
import type { PageServerLoad } from './$types';

/**
 * GRADING ONE ASSIGNMENT ACROSS EVERY CLASS THE CALLER TEACHES IT IN.
 *
 * WHY THE URL NAMES NO SECTION. `/classroom/<section>/item/<item>/grade` is
 * section-scoped by construction, and an instructor with the same assignment in
 * three blocks grades it three times from three addresses -- which is the second
 * of the two complaints this bundle exists for. An assignment is ONE
 * `classroom_items` row posted through `classroom_postings`, and
 * `classroom_submissions` is keyed `(item_id, student_email)` with no section
 * column at all, so the work was never section-scoped in the first place. The
 * item alone addresses it.
 *
 * THE PAGE GATE IS CONVENIENCE, exactly as the per-section console's is. The
 * real boundary is `classroom_can_review_submission`, asked inside
 * `classroom_grade_submission` on every row of every batch, plus the RLS on the
 * rows the console loads. This load only decides whether to render a page.
 *
 * AND IT 404s RATHER THAN REDIRECTING. A caller who manages none of the classes
 * this assignment is in is told nothing about whether the assignment exists: a
 * redirect to the item would confirm it, and a 403 would confirm it louder.
 * "Not found" and "not yours" answer identically here.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: itemRow }, postingsRes, rosterRes] = await Promise.all([
		selectItemsWithDoc((select) =>
			supabase.from('classroom_items').select(select).eq('id', params.itemId).maybeSingle()
		),
		supabase
			.from('classroom_postings')
			.select(POSTING_SELECT)
			.eq('item_id', params.itemId),
		// THE MANAGED SET COMES FROM THE ROSTER RPC, which gates on
		// `classroom_manages_section` inside its own definer body. The postings
		// policy alone would not do: 0109 widened it to admit a section the
		// caller is merely ENROLLED in, so postings on their own would name a
		// class somebody else teaches.
		supabase.rpc('classroom_section_roster', { p_section_id: null })
	]);

	if (!itemRow) error(404, 'Not found');
	const item = normalizeItemRow(itemRow as unknown as Record<string, unknown>);
	if (item.kind !== 'assignment') error(404, 'Not found');

	// THE ONE IMPLEMENTATION of the intersection, shared with the transport and
	// the dev harness (`managedPostedSections`).
	const ordered = managedPostedSections(
		normalizePostings(postingsRes.data),
		((rosterRes.data ?? []) as { section_id: string }[]).map((r) => r.section_id)
	);
	// Manages none of this assignment's classes: indistinguishable from the
	// assignment not existing.
	if (!ordered.length) error(404, 'Not found');

	const [specRes, rubricRes] = await Promise.all([
		supabase.from('classroom_assignment_specs').select('spec').eq('item_id', item.id).maybeSingle(),
		supabase.from('classroom_rubrics').select('criteria').eq('item_id', item.id).maybeSingle()
	]);

	return {
		// The console's `section` prop is its title line and its export default.
		// The first managed section in the app's own section order is the stable
		// answer; the client re-reads the whole set through the bulk transport
		// and never trusts this one for anything but a starting point.
		section: ordered[0],
		item,
		spec: (specRes.data?.spec as AssignmentSpec | undefined) ?? null,
		rubric: (rubricRes.data?.criteria as RubricCriterion[] | undefined) ?? null
	};
};
