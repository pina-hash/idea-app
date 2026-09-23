import type { SupabaseClient } from '@supabase/supabase-js';
import { notebookAccess, type NotebookAccess } from '$lib/server/notebook-access';
import type { ReviewSection } from '$lib/notebook-review';

/**
 * WHAT THE REVIEW CONSOLE NEEDS, ONE IMPLEMENTATION FOR EVERY ROUTE THAT
 * MOUNTS IT (ledger 0297, package F4a): the all-sections console at
 * `/classroom/notebook/review`, a class's own Notebook tab for a manager
 * (`/classroom/<id>/notebook`, locked to that class), and the redirect that
 * `/notebook/review` became, which asks the same question to decide where to
 * send a reviewer. It moved here, unchanged, from
 * `src/routes/notebook/review/+page.server.ts`.
 *
 * The GATE is the same two tiers the notebook's own data layer recognizes
 * (teacher of record of a classroom section, or the 0067 admin/chair tier),
 * plus the 0169 section reviewer, via the one shared helper. It answers NULL
 * for anybody else and the CALLER turns that into a 404 -- never a redirect,
 * the /admin rule, so probing the URL reveals nothing.
 *
 * WHICH SECTIONS. Since 0094 these are IDEA CLASSROOM sections, scoped to what
 * the viewer may actually touch:
 *
 *   * CHAIR (0067 admin) -- every section, `manages: true` on all of them.
 *   * INSTRUCTOR -- sections where they are the TEACHER OF RECORD
 *     (`manages: true`), which is exactly what `classroom_manages_section()`
 *     checks inside every notebook RPC and policy.
 *   * SECTION REVIEWER (0169) -- sections granted on the reviewer allowlist,
 *     `manages: false`: the console renders the grid and the review actions
 *     for these and withholds the manage-only panels on that flag. The rows
 *     come from `notebook_reviewed_sections()` via notebookAccess, because a
 *     reviewer cannot read `classroom_sections` at all and would otherwise hold
 *     a grant they could not name. The two lists MERGE, and a section on both
 *     keeps `manages: true`.
 *
 * The teacher_email filter is doing real work: 0082 lets an ENROLLED STUDENT
 * read their own sections too, so an unfiltered select would offer a section
 * to someone the grid would then refuse. That scoping is still CONVENIENCE,
 * not the boundary: `notebook_get_section_grid` refuses a section the caller
 * neither teaches, reviews nor administers whatever the client asks for.
 */
export interface ReviewConsoleData {
	access: NotebookAccess;
	sections: ReviewSection[];
	/** The section list read; false renders the fail-soft card. */
	configured: boolean;
	/** 0097's link table answered a head count: the Documentation Check mode exists. */
	docCheckReady: boolean;
}

export async function loadReviewConsole(
	supabase: SupabaseClient,
	claims: { sub: string; email?: unknown }
): Promise<ReviewConsoleData | null> {
	const access = await notebookAccess(supabase, claims.sub, claims.email as string | undefined);
	if (!access.canReview) return null;

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
	const managed: ReviewSection[] = ((data ?? []) as Row[]).map((row) => {
		const course = Array.isArray(row.classroom_courses)
			? row.classroom_courses[0]
			: row.classroom_courses;
		return {
			id: row.id,
			label: row.label,
			block: row.block,
			teacher_email: row.teacher_email,
			course_code: course?.code ?? '',
			course_title: course?.title ?? '',
			manages: true
		};
	});

	// The 0169 reviewer grants, merged AFTER the managed list so a section the
	// viewer holds both ways keeps `manages: true`. Sorted once at the end:
	// the two sources are each ordered but their union is not.
	const managedIds = new Set(managed.map((s) => s.id));
	const sections: ReviewSection[] = [
		...managed,
		...access.reviewsSections.filter((s) => !managedIds.has(s.id))
	].sort((a, b) => a.label.localeCompare(b.label));

	return {
		access,
		sections,
		configured: !sectionError,
		docCheckReady: !unitLinkProbe.error
	};
}

/**
 * `?section=` -- how a link lands on one section's grid. VALIDATED against the
 * viewer's own list rather than passed through, so a made-up or foreign id
 * falls back to the default section instead of preselecting one whose grid
 * would answer with a refusal. Courtesy, not a boundary.
 */
export function validSectionId(sections: ReviewSection[], asked: string | null): string | null {
	return asked && sections.some((s) => s.id === asked) ? asked : null;
}
