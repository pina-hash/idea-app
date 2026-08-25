import { error, redirect } from '@sveltejs/kit';
import {
	assignmentStandings,
	normalizeSectionRow,
	splitRoster,
	type SubmissionSummary
} from '$lib/classroom/classroom';
import { SECTION_SELECT, itemsForSection, loadSectionRoster } from '$lib/classroom/transports';
import type { PageServerLoad } from './$types';

/**
 * Every assignment in one class with where its grading stands -- the Grades tab.
 *
 * A STUDENT GETS A 404, NOT A REDIRECT (the /admin rule, and the same reasoning
 * as the People tab: an enrolled student can read this section, so a bounce
 * would confirm the tab exists while 404 says nothing).
 *
 * EVERY COUNT IS A READ THE CALLER COULD ALREADY RUN. `classroom_submissions` is
 * own-row-or-reviewer, and classroom_can_review_submission answers for a manager
 * of this class about the students enrolled in it -- so this select is the same
 * one the grading console itself makes, asked once for the whole class instead
 * of once per assignment. It is a tally of policy-scoped rows, not a privileged
 * view.
 */
export const load: PageServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: sectionRow }, { data: manages }] = await Promise.all([
		supabase.from('classroom_sections').select(SECTION_SELECT).eq('id', params.sectionId).maybeSingle(),
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId })
	]);

	if (!sectionRow) error(404, 'Not found');
	if (manages !== true) error(404, 'Not found');

	// A plain read and a length rather than a head-count: a class roster is tens
	// of rows, and this keeps the read to the one shape every other classroom
	// load already uses. It goes through the ONE roster reader (0136) so the
	// denominator counts the same people the grading roster lists -- an
	// instructor enrolled in their own class was one more head here and no row
	// there, which is a fraction that could never reach its own bottom.
	const [content, roster] = await Promise.all([
		itemsForSection(supabase, params.sectionId),
		loadSectionRoster(supabase, params.sectionId)
	]);
	const { students } = splitRoster(roster.ok ? roster.data.rows.filter((e) => e.active) : []);

	const assignmentIds = content.items.filter((i) => i.kind === 'assignment').map((i) => i.id);
	let submissions: SubmissionSummary[] = [];
	if (assignmentIds.length) {
		const { data } = await supabase
			.from('classroom_submissions')
			.select('item_id, state, score')
			.in('item_id', assignmentIds);
		submissions = (data ?? []) as SubmissionSummary[];
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: true,
		standings: assignmentStandings(content.items, submissions, students.length)
	};
};
