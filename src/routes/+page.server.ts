import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSectionRoster } from '$lib/classroom/transports';
import type { FeedSubmission } from '$lib/classroom/feed';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import { loadClassroomWork, type ClassroomClock } from '$lib/classroom/student-work';
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
			feedCheckIns: [] as ClassCheckIn[],
			feedManagerEmails: {} as Record<string, string[]>,
			feedClock: null as ClassroomClock | null,
			foundryReviewPending: null as number | null
		};
	}

	const layout = parent();
	// Kicked off beside the feed reads rather than after them; every return
	// below awaits it, so an early return cannot leave it dangling.
	const pending = layout.then(({ isAdmin }) => foundryReviewPending(supabase, isAdmin));

	/**
	 * THE CLASSES, THEIR ITEMS AND THE SUBMISSIONS BEHIND THEM are the shared
	 * owed-work read in $lib/classroom/student-work (ledger 0297), the SAME one
	 * the to-do page and My Classes call -- so a concluded class leaves all three
	 * surfaces together, and the three can never disagree about which items a
	 * student owes. It carries the caller's own check-ins too (for the classes
	 * they do not teach), which is what lets the feed's To-do door count a
	 * notebook check-in not filed yet the same way the to-do page lists it.
	 */
	const work = await loadClassroomWork(supabase, {
		userId: claims.sub,
		email: (claims.email as string | undefined) ?? '',
		isAdmin: layout.then(({ isAdmin }) => isAdmin),
		checkIns: true
	});

	if (!work.ready || !work.sections.length) {
		return {
			classroomReady: work.ready,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[],
			feedCheckIns: [] as ClassCheckIn[],
			feedManagerEmails: {} as Record<string, string[]>,
			feedClock: work.clock as ClassroomClock | null,
			foundryReviewPending: await pending
		};
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
		feedSections: work.sections,
		feedItems: work.items,
		feedSubmissions: work.submissions,
		feedCheckIns: work.checkIns,
		feedManagerEmails,
		/**
		 * THE LOADER'S ONE CLOCK READ, handed to the page so the feed's ranking,
		 * its "Due tomorrow" words and the To-do door's counts are all measured
		 * against the instant this load ran -- on the server's render and after
		 * hydration alike -- rather than each reading a clock of its own.
		 */
		feedClock: work.clock as ClassroomClock | null,
		foundryReviewPending: await pending
	};
};
