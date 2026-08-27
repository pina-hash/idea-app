import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeItemRow, normalizeSectionRow, sortSections } from '$lib/classroom/classroom';
import { SECTION_SELECT, loadSectionRoster, selectItemsWithDoc } from '$lib/classroom/transports';
import type { FeedSubmission } from '$lib/classroom/feed';
import { queueOrder } from '$lib/foundry/review';
import type { FoundryAppSummary } from '$lib/foundry/transports';
import type { PageServerLoad } from './$types';

/**
 * THE FOUNDRY REVIEW COUNT ON THE LAUNCHER CARD, admins only. A queue nobody
 * is reminded of goes stale, and typing /foundry/review by hand was the only
 * way in; the card carries the same number the Foundry shell's Review tab
 * does, from the same `queueOrder` arithmetic over the same admin-widened
 * read, so the two cannot disagree.
 *
 * NULL FOR EVERYONE ELSE, not zero: "not asked" and "nothing waiting" are
 * different answers, and a student's payload does not carry the queue's state
 * at all -- the launcher's isAdmin gate on the badge is the second layer, not
 * the boundary. `isAdmin` comes from `parent()` (the root layout already
 * resolved it) rather than being resolved a second time here.
 */
async function foundryReviewPending(
	supabase: SupabaseClient,
	admin: boolean
): Promise<number | null> {
	if (!admin) return null;
	try {
		const { data } = await supabase.rpc('foundry_list_apps', { p_include_unpublished: true });
		if (!data) return null;
		return queueOrder(data as FoundryAppSummary[]).length;
	} catch {
		// The count is a reminder on a card; a failed read degrades to no badge
		// rather than taking the home page down with it.
		return null;
	}
}

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
export const load: PageServerLoad = async ({ locals: { supabase, claims }, parent }) => {
	if (!claims) {
		return {
			classroomReady: true,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[],
			feedManagerEmails: {} as Record<string, string[]>,
			foundryReviewPending: null as number | null
		};
	}

	// Kicked off beside the feed reads rather than after them; every return
	// below awaits it, so an early return cannot leave it dangling.
	const pending = parent().then(({ isAdmin }) => foundryReviewPending(supabase, isAdmin));

	const { data: sectionRows, error: sectionError } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT);

	if (sectionError) {
		return {
			classroomReady: false,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[],
			feedManagerEmails: {} as Record<string, string[]>,
			foundryReviewPending: await pending
		};
	}

	/**
	 * A CONCLUDED CLASS LEAVES THE HOME PAGE ENTIRELY.
	 *
	 * `classroom_sections.active` is 0083's archive flag -- soft state, set by
	 * `classroom_set_section_active`, keeping the roster, the stream and every
	 * graded record exactly as they were. `SECTION_SELECT` has always carried the
	 * column and `normalizeSectionRow` has always preserved it, but NOTHING read
	 * it on this path: RLS does not filter on it either (`classroom_can_read_section`
	 * asks about management and enrollment, never about the archive), so last
	 * term's class kept its card, kept its overdue rows, and kept adding to the
	 * "N to do" chip for as long as the student stayed enrolled -- which is
	 * forever, because archiving is exactly the thing that does not unenroll
	 * anybody.
	 *
	 * FILTERED HERE AND NOT INSIDE `buildFeed`, so there is one statement of it:
	 * `sections` is what feeds the header's class chip, the item read's
	 * `sectionIds` and the feed alike, and a filter applied further down would
	 * leave the first two naming a class the third had dropped. It also stops the
	 * items of an archived class being fetched at all.
	 *
	 * ABSENT READS AS ACTIVE, via `normalizeSectionRow`'s own default, which is
	 * what keeps this fail-open: a row that cannot say it is archived is not
	 * treated as one.
	 */
	const sections = sortSections(
		((sectionRows ?? []) as Record<string, unknown>[])
			.map(normalizeSectionRow)
			.filter((s) => s.active)
	);
	const sectionIds = sections.map((s) => s.id);
	if (!sectionIds.length) {
		return {
			classroomReady: true,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[],
			feedManagerEmails: {} as Record<string, string[]>,
			foundryReviewPending: await pending
		};
	}

	// The section filter rides an aliased INNER embed, never the unaliased
	// `classroom_postings` one, which must keep listing every class an item is
	// posted to (the itemsForSection reasoning, applied across many sections).
	const { data: itemRows } = await selectItemsWithDoc((select) =>
		supabase
			.from('classroom_items')
			.select(`${select}, posted_in:classroom_postings!inner(section_id)`)
			.in('posted_in.section_id', sectionIds)
			.order('created_at', { ascending: false })
	);

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

	// Who, on the rosters this caller MANAGES, can manage the class they are
	// enrolled in (0138). One round trip for every one of them -- the null
	// section is what that spelling means -- and a student receives nothing at
	// all, because this is a management read. It keeps an instructor's own
	// hand-in out of their own to-grade count; without 0138 it answers empty
	// and the tally is the one it has always been.
	const managed = await loadSectionRoster(supabase, null);
	const feedManagerEmails: Record<string, string[]> = {};
	if (managed.ok) {
		for (const row of managed.data.rows) {
			if (row.manages !== true) continue;
			(feedManagerEmails[row.section_id] ??= []).push(row.student_email);
		}
	}

	return {
		classroomReady: true,
		feedSections: sections,
		feedItems: items,
		feedSubmissions: submissions,
		feedManagerEmails,
		foundryReviewPending: await pending
	};
};
