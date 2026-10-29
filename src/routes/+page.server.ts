import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSectionRoster } from '$lib/classroom/transports';
import { sectionManagedBy, type FeedSubmission } from '$lib/classroom/feed';
import { slimOwedWorkItem } from '$lib/classroom/owed-work-slim';
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
 * HOW MANY TEAM SIGN-OFFS WAIT FOR THIS PERSON (ledger 0456, gap 87b6bd95), for
 * the home feed's line above Your Classes. Staff only (an admin, or a staff
 * address); a student is never asked, so their home load pays nothing for it.
 * A failed or missing read is no line, never a broken page.
 */
async function signoffsWaiting(supabase: SupabaseClient, email: string, admin: boolean): Promise<number | null> {
	if (!admin && !email.endsWith('@boscotech.edu')) return null;
	try {
		const { data, error } = await supabase.rpc('classroom_signoff_waiting');
		if (error) return null;
		return Number((data as { count?: number } | null)?.count ?? 0);
	} catch {
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
			foundryReviewPending: null as number | null,
			signoffsWaiting: null as number | null
		};
	}

	const layout = parent();
	// Kicked off beside the feed reads rather than after them; every return
	// below awaits it, so an early return cannot leave it dangling.
	const pending = layout.then(({ isAdmin }) => foundryReviewPending(supabase, isAdmin));
	const waiting = layout.then(({ isAdmin }) =>
		signoffsWaiting(supabase, ((claims.email as string | undefined) ?? '').trim().toLowerCase(), isAdmin === true)
	);

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
		checkIns: true,
		// Each class's default thumbnail shape, for the cards' rows (0268).
		thumbShapes: true,
		// Each course's unit order, which tints a post's generated thumbnail as
		// the class page tints it (ledger 0396).
		units: true
	});

	if (!work.ready || !work.sections.length) {
		return {
			classroomReady: work.ready,
			feedSections: [],
			feedItems: [],
			feedSubmissions: [] as FeedSubmission[],
			feedCheckIns: [] as ClassCheckIn[],
			feedManagerEmails: {} as Record<string, string[]>,
			feedRosterEmails: {} as Record<string, string[]>,
			feedUnitOrder: {} as Record<string, string[]>,
			feedClock: work.clock as ClassroomClock | null,
			foundryReviewPending: await pending,
			signoffsWaiting: await waiting
		};
	}

	// Who, on the rosters this caller MANAGES, can manage the class they are
	// enrolled in (0138). One round trip for every one of them -- the null
	// section is what that spelling means -- and a student receives nothing at
	// all, because this is a management read. It keeps an instructor's own
	// hand-in out of their own to-grade count; without 0138 it answers empty
	// and the tally is the one it has always been.
	//
	// ASKED ONLY OF SOMEBODY WHO MANAGES ONE OF THESE CLASSES (ledger 0360,
	// report R08). `classroom_section_roster(null)` evaluates a definer manage
	// check against every enrollment row in the school, and for a student it
	// always answers nothing -- so every student's home load paid a full
	// enrollments scan for an empty map, during exactly the 8:00 rush that took
	// the database down. `sectionManagedBy` is 0138's
	// `_classroom_manages_section_email` (teacher of record, or an admin; no
	// later migration redefines it) without the round trip, `work.sections` is
	// the only set `buildFeed` reads `feedManagerEmails` for, so skipping the
	// call where it answers false produces the identical feed. If manage ever
	// widens (co-teachers), this check has to widen with it, and
	// tests/home-classroom-load-budget.test.ts's teacher control is what says so.
	const admin = await layout.then((d) => d.isAdmin === true);
	const me = ((claims.email as string | undefined) ?? '').trim().toLowerCase();
	const feedManagerEmails: Record<string, string[]> = {};
	// THE SAME READ'S ACTIVE ROSTER (reports c2446a58 and e4bc53e5, ledger
	// 0416), so each class card counts its own students' hand-ins and nobody
	// who has left the class: no second round trip. Only sections that answered
	// get an entry; a section absent here counts as it always did.
	const feedRosterEmails: Record<string, string[]> = {};
	if (work.sections.some((s) => sectionManagedBy(s, me, admin))) {
		const managed = await loadSectionRoster(supabase, null);
		if (managed.ok && managed.data.managesReady) {
			// A class he manages with nobody enrolled has nothing to grade.
			for (const s of work.sections) if (sectionManagedBy(s, me, admin)) feedRosterEmails[s.id] = [];
			for (const row of managed.data.rows) {
				feedRosterEmails[row.section_id] ??= [];
				if (row.active !== false) feedRosterEmails[row.section_id].push(row.student_email);
				if (row.manages !== true) continue;
				(feedManagerEmails[row.section_id] ??= []).push(row.student_email);
			}
		}
	}

	return {
		classroomReady: true,
		feedSections: work.sections,
		/**
		 * SLIM (ledger 0360, report R08): every item keeps its first image, which
		 * is all `feedCover` reads, and loses its body, which nothing on this page
		 * prints. See `$lib/classroom/owed-work-slim`.
		 */
		feedItems: work.items.map(slimOwedWorkItem),
		feedSubmissions: work.submissions,
		feedCheckIns: work.checkIns,
		feedManagerEmails,
		feedRosterEmails,
		/** Each course's unit ids in the class page's order, for the rows' generated thumbnails. */
		feedUnitOrder: work.unitOrder,
		/**
		 * THE LOADER'S ONE CLOCK READ, handed to the page so the feed's ranking,
		 * its "Due tomorrow" words and the To-do door's counts are all measured
		 * against the instant this load ran -- on the server's render and after
		 * hydration alike -- rather than each reading a clock of its own.
		 */
		feedClock: work.clock as ClassroomClock | null,
		foundryReviewPending: await pending,
		signoffsWaiting: await waiting
	};
};
