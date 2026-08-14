import { error, redirect } from '@sveltejs/kit';
import { notebookAccess } from '$lib/server/notebook-access';
import type { ReviewSection } from '$lib/notebook-review';
import type { PageServerLoad } from './$types';

/**
 * Section review: the per-section compliance grid, plus the check-in
 * management it depends on.
 *
 * The GATE is unchanged: the same two tiers the notebook's own data layer
 * recognizes (teacher of record of a classroom section, or the 0067
 * admin/chair tier) via the one shared helper, and a non-reviewer gets a 404
 * rather than a redirect -- the /admin rule, so probing the URL reveals
 * nothing. Anonymous visitors never reach it (hooks.server.ts turns them away
 * at the '/notebook' prefix first).
 *
 * WHICH SECTIONS. Since 0094 these are IDEA CLASSROOM sections -- the
 * notebook has no section table of its own any more -- scoped to what the
 * viewer may actually touch:
 *
 *   * CHAIR (0067 admin) -- every section.
 *   * INSTRUCTOR -- only sections where they are the TEACHER OF RECORD, which
 *     is exactly what `classroom_manages_section()` checks inside every
 *     notebook RPC and policy.
 *
 * The teacher_email filter is doing real work, not just tidying: 0082 lets an
 * ENROLLED STUDENT read their own sections too, so an unfiltered select here
 * would offer a section to someone the grid would then refuse.
 *
 * That scoping is still CONVENIENCE, not the boundary.
 * `notebook_get_section_grid` refuses a section the caller neither teaches nor
 * administers regardless of what the client asks for, so the worst a tampered
 * request achieves is an error instead of data.
 *
 * Everything after this load runs as the CALLER'S OWN session from the
 * browser (the /coin-desk convention): the grid, the entry read and all four
 * writes are RPCs or RLS-scoped selects that re-check the caller themselves.
 *
 * Fails soft in one direction only: with the notebook migrations unapplied the
 * page renders a clearly-flagged "not available yet" card instead of crashing.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const access = await notebookAccess(supabase, claims.sub, claims.email as string | undefined);
	if (!access.canReview) error(404, 'Not found');

	let query = supabase
		.from('classroom_sections')
		.select('id, label, block, teacher_email, classroom_courses ( code, title )')
		.order('label');
	if (!access.isChair) query = query.eq('teacher_email', access.email);

	// Is 0097 applied? Migrations here are pasted in by hand, so a deploy
	// sitting between two of them is a real state -- and the Documentation
	// Check panel is the ONLY thing that depends on this one. A head-count
	// probe rather than a version table (the notebook's own fail-soft
	// convention): unapplied, the panel simply does not render and the grid,
	// the check-in manager and every review action are untouched.
	const [{ data, error: sectionError }, unitLinkProbe] = await Promise.all([
		query,
		supabase.from('notebook_unit_items').select('section_id', { count: 'exact', head: true })
	]);

	interface Row {
		id: string;
		label: string;
		block: string | null;
		teacher_email: string;
		classroom_courses: { code: string; title: string } | { code: string; title: string }[] | null;
	}

	// PostgREST types an embedded to-one as an object, but the generated client
	// types it as a possible array; normalize rather than trust either.
	const sections: ReviewSection[] = ((data ?? []) as Row[]).map((row) => {
		const course = Array.isArray(row.classroom_courses)
			? row.classroom_courses[0]
			: row.classroom_courses;
		return {
			id: row.id,
			label: row.label,
			block: row.block,
			teacher_email: row.teacher_email,
			course_code: course?.code ?? '',
			course_title: course?.title ?? ''
		};
	});

	return {
		isInstructor: access.isInstructor,
		isChair: access.isChair,
		configured: !sectionError,
		docCheckReady: !unitLinkProbe.error,
		sections
	};
};
