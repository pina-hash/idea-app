import { redirect } from '@sveltejs/kit';
import { loadStudentNotebook } from '$lib/server/notebook-student';
import { loadReviewConsole } from '$lib/server/notebook-review-console';
import type { ReviewSection } from '$lib/notebook-review';
import type { PageServerLoad } from './$types';

/**
 * A CLASS'S NOTEBOOK TAB (ledger 0297, package F4a): one URL, two surfaces,
 * and the SERVER's own `canManage` picks between them.
 *
 *   * A STUDENT gets their own notebook, FILTERED TO THIS CLASS: the entries
 *     they filed to it and this class's check-ins, with the composer. A free
 *     entry written here is filed to this class, which is what makes it count
 *     on the class's grid at all.
 *   * A MANAGER of the section gets this class's review -- the compliance grid,
 *     accept and flag, excusals, the check-in manager and the Documentation
 *     Check -- LOCKED to this section. It is the same `ReviewConsole` the
 *     all-sections console mounts, handed a section it may not leave.
 *
 * THE SECTION LAYOUT ABOVE IS ALREADY THE GATE for reaching the class at all:
 * it 404s a caller who cannot read the section, and `canManage` is its
 * `classroom_manages_section` answer. This load adds no gate of its own and
 * could not add a better one -- every read below is RLS-scoped or an RPC that
 * re-checks the caller, exactly as on the routes these surfaces came from.
 *
 * A MANAGER WHO IS NOT ON THE REVIEW CONSOLE'S LIST. `canManage` and the
 * console's own tiers are the same people by construction (teacher of record
 * or admin), but the two come from different reads; should they ever
 * disagree, the tab still opens on THIS class rather than on nothing, and
 * `notebook_get_section_grid` answers for the section exactly as it would
 * anywhere else. The console's list is courtesy; the RPC is the boundary.
 */
export const load: PageServerLoad = async ({ params, url, parent, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const { canManage, section } = await parent();

	if (canManage) {
		const review = await loadReviewConsole(supabase, claims);
		const listed = review?.sections ?? [];
		const here: ReviewSection = listed.find((s) => s.id === params.sectionId) ?? {
			id: section.id,
			label: section.label,
			block: section.block ?? null,
			teacher_email: section.teacher_email,
			course_code: section.course?.code ?? '',
			course_title: section.course?.title ?? '',
			manages: true
		};
		const reviewSections = listed.some((s) => s.id === here.id) ? listed : [here, ...listed];
		/**
		 * `?mode=checkins` opens straight on the check-in manager: the item page's
		 * duplicate-date refusal links here (see `checkInDuplicateRefusal`). Any
		 * other value is ignored rather than passed through.
		 */
		const asked = url.searchParams.get('mode');
		return {
			notebookRole: 'manager' as const,
			reviewSections,
			isChair: review?.access.isChair ?? false,
			reviewConfigured: review?.configured ?? true,
			docCheckReady: review?.docCheckReady ?? false,
			initialMode:
				asked === 'checkins'
					? ('checkins' as const)
					: asked === 'approve'
						? ('approve' as const)
						: ('review' as const),
			viewerId: claims.sub
		};
	}

	return {
		notebookRole: 'student' as const,
		...(await loadStudentNotebook({ url, supabase, claims, sectionId: params.sectionId }))
	};
};
