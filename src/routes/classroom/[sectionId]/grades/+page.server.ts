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
interface PostGradeRow {
	item_id: string;
	graded_at: string | null;
	submitted_at: string | null;
}

/**
 * PER ASSIGNMENT, HOW MANY STUDENTS HANDED IN AGAIN AFTER BEING GRADED.
 *
 * WHAT IT COUNTS IS WHAT ITS NAME SAYS, AND THAT IS THE WHOLE DESIGN. The
 * grading console reports TWO post-grade acts -- a resubmission and a silent
 * edit of a response block -- and only the first is answerable from this page's
 * one read: an edit lives in `classroom_responses`, which would mean a row per
 * block per student per assignment for the whole class, on a tab that is a
 * summary. So this counts resubmissions and the chip SAYS "resubmitted",
 * because a number labelled "changed" that could only ever see half the changes
 * reads as complete and is worse than no number at all. The console beside it
 * carries both.
 *
 * IT IS THE SAME COMPARISON `postGradeChange` MAKES -- `submitted_at` strictly
 * after `graded_at` -- rather than a second idea of what "after grading" means.
 * An unparseable or absent timestamp does not count: an integrity mark that
 * fires on missing data is one an instructor learns to ignore.
 */
function countResubmittedAfterGrading(rows: PostGradeRow[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		const graded = row.graded_at ? Date.parse(row.graded_at) : NaN;
		const submitted = row.submitted_at ? Date.parse(row.submitted_at) : NaN;
		if (Number.isNaN(graded) || Number.isNaN(submitted) || submitted <= graded) continue;
		counts[row.item_id] = (counts[row.item_id] ?? 0) + 1;
	}
	return counts;
}

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
	// load already uses. It goes through the ONE roster reader (0138) so the
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
	let rows: PostGradeRow[] = [];
	if (assignmentIds.length) {
		// TWO COLUMNS WIDER THAN IT WAS, AND NO NEW READ. `graded_at` and
		// `submitted_at` are 0086 columns -- the oldest schema this app supports --
		// so this needs no rung and cannot degrade anything.
		const { data } = await supabase
			.from('classroom_submissions')
			.select('item_id, state, score, graded_at, submitted_at')
			.in('item_id', assignmentIds);
		submissions = (data ?? []) as SubmissionSummary[];
		rows = (data ?? []) as PostGradeRow[];
	}

	return {
		section: normalizeSectionRow(sectionRow as Record<string, unknown>),
		canManage: true,
		standings: assignmentStandings(content.items, submissions, students.length),
		resubmittedAfterGrading: countResubmittedAfterGrading(rows)
	};
};
