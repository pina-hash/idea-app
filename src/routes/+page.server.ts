import { normalizeItemRow, normalizeSectionRow, sortSections } from '$lib/classroom/classroom';
import { ITEM_SELECT, SECTION_SELECT } from '$lib/classroom/transports';
import type { FeedSubmission } from '$lib/classroom/feed';
import type { PageServerLoad } from './$types';

/**
 * Homepage data for a signed-in user.
 *
 * CLASSROOM FEED. Every read runs as the CALLER'S OWN session with no role
 * branch and no `student_email` filter (the /coin-balance doctrine -- the
 * filtering IS the policy, never application code):
 *
 *   - classroom_sections returns their enrolled classes, or their own sections
 *     as teacher of record, or everything for an admin.
 *   - classroom_items is scoped by classroom_can_read_item, so a student simply
 *     never receives a draft.
 *   - classroom_submissions is own-row-or-reviewer, so a student receives only
 *     their own work and a teacher only the students they actually review.
 *
 * The two `.in(...)` filters are therefore about PAYLOAD SIZE, not privacy:
 * they keep an admin's home page from pulling every item in the school. Dropping
 * them would leak nothing; the policies would still answer correctly.
 *
 * Everything fails soft to `classroomReady: false` before 0082/0085/0086 are
 * applied, so the home page renders a clearly-flagged card rather than crashing.
 *
 * There is no GAUNTLET read here any more: the "continue / next best" strip that
 * needed `gauntlet_progression` and the published challenge catalog is gone from
 * the home page, and /gauntlet still runs that RPC for itself.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) {
		return {
			classroomReady: true,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[]
		};
	}

	const { data: sectionRows, error: sectionError } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT);

	if (sectionError) {
		return {
			classroomReady: false,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[]
		};
	}

	const sections = sortSections(
		((sectionRows ?? []) as Record<string, unknown>[]).map(normalizeSectionRow)
	);
	const sectionIds = sections.map((s) => s.id);
	if (!sectionIds.length) {
		return {
			classroomReady: true,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[]
		};
	}

	// The section filter rides an aliased INNER embed, never the unaliased
	// `classroom_postings` one, which must keep listing every class an item is
	// posted to (the itemsForSection reasoning, applied across many sections).
	const { data: itemRows } = await supabase
		.from('classroom_items')
		.select(`${ITEM_SELECT}, posted_in:classroom_postings!inner(section_id)`)
		.in('posted_in.section_id', sectionIds)
		.order('created_at', { ascending: false });

	const items = ((itemRows ?? []) as unknown as Record<string, unknown>[]).map(normalizeItemRow);

	let submissions: FeedSubmission[] = [];
	if (items.length) {
		const { data: subRows } = await supabase
			.from('classroom_submissions')
			.select('item_id, student_email, state, submitted_at, returned_at, graded_at')
			.in(
				'item_id',
				items.map((i) => i.id)
			);
		submissions = (subRows ?? []) as FeedSubmission[];
	}

	return {
		classroomReady: true,
		feedSections: sections,
		feedItems: items,
		feedSubmissions: submissions
	};
};
