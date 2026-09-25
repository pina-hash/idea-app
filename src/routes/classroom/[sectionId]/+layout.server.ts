import { error, redirect } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	collapsedGroups,
	normalizeSectionRow,
	readClassViewPrefs,
	studentWorkMap,
	type SubmissionSummary
} from '$lib/classroom/classroom';
import {
	SECTION_SELECT,
	itemsForSection,
	loadCourseUnits,
	mergeInstructorMaterials
} from '$lib/classroom/transports';
import { checkInIsScheduled, laCalendarDay, type ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { HallPassState } from '$lib/classroom/hall-pass';
import type { SongQueueState } from '$lib/classroom/song-queue';
import {
	readCheckInPostings,
	readOwnCheckIns,
	readWorksheetCompletions,
	withWorksheetCompletions,
	type CheckInPostings
} from '$lib/classroom/student-work';
import { loadPostedTeams } from '$lib/classroom/class-teams';
import { gridSummary, type SectionGrid } from '$lib/notebook-review';
import type { LayoutServerLoad } from './$types';

/**
 * The check-ins scheduled for THIS class (0098), without anybody's status.
 *
 * THE READ IS `readCheckInPostings` in $lib/classroom/student-work (ledger
 * 0297), called with this one class: the to-do page reads every class's
 * check-ins at once through the same function, so the posting ladder -- its
 * rungs, its capabilities and its row shape -- is written once. `linksReady`
 * and `guidanceReady` mean exactly what they always did.
 */
async function sectionCheckIns(
	supabase: SupabaseClient,
	sectionId: string
): Promise<CheckInPostings | null> {
	/**
	 * A CHECK-IN DATED IN THE FUTURE IS READ, AND THEN NAMED -- WHICH IS NOT
	 * WHERE THIS STARTED.
	 *
	 * This read had NO DATE BOUND, and nothing downstream supplied one:
	 * `checkInStatus` had no clock in it, so a check-in a teacher scheduled
	 * for next month came back with no entry against it, resolved to
	 * `missing`, and `isOutstanding` counted it. A student opening their
	 * class page in August was told he owed work due in October -- and
	 * because the stream is newest-first by date, the thing he did not owe
	 * was the first row on the page, in the attention tone. THAT FAILURE IS
	 * REAL AND IS WHY THE BOUND EXISTED; nothing below weakens it.
	 *
	 * THE BOUND WAS `.lte('notebook_sessions.session_date', <LA today>)` AND
	 * IT IS GONE, because hiding was the best answer available and no longer
	 * is. It was defensible while there was no vocabulary for "not asked for
	 * yet": a row that cannot be told apart from work is better absent than
	 * mislabelled. `0140` gave the teacher's grid that vocabulary -- a cell
	 * dated ahead of today reads `scheduled`, stays on the grid, and stops
	 * counting -- and the two halves of one feature reading off two
	 * different ideas is what this removes. A student now sees the same
	 * check-in their teacher scheduled, said in the same word.
	 *
	 * WHAT MAKES A RENDERED ROW SAFE WHERE AN UNMARKED ONE WAS NOT, in three
	 * parts, each of which is independently load-bearing:
	 *
	 *   1. IT IS NOT COUNTED. `checkInStatus` resolves it to `scheduled`,
	 *      and `isOutstanding` is a WHITELIST that does not name it -- so
	 *      the badge ClassView draws from this same array cannot include it.
	 *      That is the original defect, closed at the arithmetic rather than
	 *      at the read.
	 *   2. IT IS NOT TONED AS WORK. `scheduled` takes the `excused` tone and
	 *      a label that says "Not due yet" in words.
	 *   3. IT IS NOT AT THE TOP. `mergeCheckIns` appends a scheduled check-in
	 *      after everything else instead of inserting it by date, so the
	 *      first row a student reads is still the newest thing that is
	 *      actually theirs to do.
	 *
	 * THE MANAGER GETS THE SAME ROW, and this is the direction the bound was
	 * worst in: it took a teacher's own scheduled check-in off their own
	 * class page, which is the mistake `0140` refused to repeat on the grid
	 * ("a grid that hid what they had just scheduled would be hiding their
	 * own work from them"). A manager's check-in carries a null status for
	 * every other state, because a teacher files nothing; `scheduled` is the
	 * one status that is a fact about the DAY rather than about a person, so
	 * it is the one they carry.
	 */
	return readCheckInPostings(supabase, [sectionId]);
}

/**
 * THE HALL PASS FOR THIS CLASS (0143), OR NULL IF THIS DEPLOYMENT HAS NO IDEA
 * WHAT ONE IS.
 *
 * DEGRADES ON `PGRST202` ALONE, which is the codebase's RPC rule and matters
 * more here than usual: migrations are pasted into the SQL editor by hand and
 * separately from the deploy, so a build carrying this route against a database
 * without 0143 is a REAL state and not a hypothetical. Null removes the control
 * entirely -- the layout hands no transports down, so there is no write to
 * execute and nothing on screen claiming a pass exists.
 *
 * ANY OTHER ERROR ALSO YIELDS NULL, and deliberately so rather than being
 * re-raised: the pass is one card on a page whose real content is the class,
 * and a hall-pass outage must not take the class list down with it. What it
 * must never do is degrade to a WRONG answer -- there is no fallback that
 * guesses "free", because the whole feature is one shared slot and a guess
 * would put two students in the hall.
 *
 * THE PROJECTION IS THE DATABASE'S, NOT THIS LOAD'S. Whatever comes back is
 * handed to the page as-is: a student's payload is built by a branch of the RPC
 * that has no expression capable of naming anybody, so there is nothing here to
 * filter and adding a filter would only make it look as though there were.
 */
async function sectionHallPass(
	supabase: SupabaseClient,
	sectionId: string
): Promise<HallPassState | null> {
	const { data, error: rpcError } = await supabase.rpc('classroom_hall_pass_state', {
		p_section_id: sectionId
	});
	if (rpcError) return null;
	return (data as HallPassState | null) ?? null;
}

/**
 * THE SONG QUEUE (0145), FAIL-SOFT FOR THE SAME REASON THE HALL PASS IS.
 *
 * Migrations are applied by hand, separately from the deploy, so a build
 * carrying this route against a database without 0145 is a REAL state and not a
 * hypothetical. Null removes the whole card -- the layout hands no transports
 * down and mounts nothing, so there is no write to execute and nothing on
 * screen claiming a queue exists.
 *
 * ANY OTHER ERROR ALSO YIELDS NULL, deliberately rather than re-raised: this is
 * one card on a page whose real content is the class, and a song-queue outage
 * must not take the class list down with it. There is no fallback that guesses
 * an empty queue -- an empty approved list and an unavailable one look identical
 * on screen and mean very different things, so the card is absent rather than
 * wrong.
 *
 * THE PROJECTION IS THE DATABASE'S, NOT THIS LOAD'S. Whatever comes back is
 * handed to the page as-is: a student's payload is built by a branch of the RPC
 * that cannot return a classmate's pending or rejected request, so there is
 * nothing here to filter and adding a filter would only make it look as though
 * there were.
 */
async function sectionSongQueue(
	supabase: SupabaseClient,
	sectionId: string
): Promise<SongQueueState | null> {
	const { data, error: rpcError } = await supabase.rpc('classroom_song_queue', {
		p_section_id: sectionId
	});
	if (rpcError) return null;
	return (data as SongQueueState | null) ?? null;
}

/**
 * CAN THIS DATABASE HOLD WHERE AN ITEM'S FILES AND LINKS SIT (0193)?
 *
 * THE NARROWEST POSSIBLE PROBE, per the select-ladder rule: one scalar column,
 * no embed, `limit(1)`. PostgREST refuses an ENTIRE select over one unknown
 * column, so the question "does `files_placement` exist" is answered by
 * whether this select errors -- and by nothing about its rows. RLS may hand a
 * student zero rows and that is still a yes; the column is what is being
 * asked about, not the data. False removes the placement, order and rename
 * controls everywhere in this class, which is the honest state of a
 * deployment where the migration has not been pasted yet.
 */
async function sectionLayoutReady(supabase: SupabaseClient): Promise<boolean> {
	const { error: probeError } = await supabase
		.from('classroom_items')
		.select('files_placement')
		.limit(1);
	return !probeError;
}

/**
 * THE CLASS ITSELF, loaded ONCE for every route under /classroom/<section>.
 *
 * IT IS A LAYOUT LOAD BECAUSE THE CLASS CONTENT IS NAVIGATION, not a page. The
 * section route is a two-pane master-detail shell above 1024px: the list of
 * everything in the class stays on screen on the left while an item opens on
 * the right. A page load would re-run on every item you opened and take the
 * list -- and the reader's place in it -- with it.
 *
 * WHAT THAT COSTS AND WHY IT IS TAKEN. This now also runs on /people, /grades
 * and the deck viewer, which do not use the list. It is paid ONCE per section
 * visit, not per navigation: SvelteKit re-runs a layout load only when its own
 * dependencies change, and `sectionId` does not change as you move around
 * inside a class -- so browsing the class and then opening the roster is
 * cheaper than it was, and only a cold direct hit on /people or /grades pays
 * more. THIS LOAD MUST NEVER READ `url`: a dependency on the pathname would
 * re-run it on every navigation and undo the whole point.
 *
 * One class: Stream + Classwork. Every read runs as the CALLER'S OWN session
 * with no role branch -- RLS decides what comes back (a student load simply
 * never receives drafts or a foreign section, and the attachment, link and
 * view embeds are scoped by the same policies). A section the caller may not
 * read is indistinguishable from one that does not exist, so both are 404.
 *
 * `canManage` comes from the classroom_manages_section RPC (teacher of
 * record, or admin) -- the same SECURITY DEFINER check every policy uses, so
 * the page chrome can never disagree with what the database will actually
 * allow. It gates the on-card controls; the RPCs behind them re-check it
 * regardless.
 *
 * `sections` is loaded only for a manager: it is what the composer's LINKAGE
 * controls offer ("also post to...") and what the "also posted to" line names,
 * and a student has no use for either.
 *
 * NOTEBOOK CHECK-INS (0098) ride along as a SECOND SOURCE, read separately and
 * merged by the page. Since 0120 a posting can name the `classroom_items` row
 * its check-in hangs off, and the page renders those ON that item instead of as
 * their own stream row -- one row for the day's material and the notebook
 * requirement that goes with it. The read stays separate anyway: it is the
 * POSTING that carries the pointer, and the item query has no reason to grow a
 * reverse embed for a block only the item page renders.
 *
 * WHAT HAS NOT CHANGED is that a check-in is not, and must not become, a
 * gradeable Classroom item: that would be a second scoring path for work
 * already graded once through `notebook_unit_items` -- see
 * $lib/classroom/class-check-ins.
 */
export const load: LayoutServerLoad = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: sectionRow } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT)
		.eq('id', params.sectionId)
		.maybeSingle();
	if (!sectionRow) error(404, 'Not found');

	/**
	 * THE ONE CLOCK READ ON THIS SURFACE.
	 *
	 * Read here, converted once, and handed down as a STRING -- so every
	 * check-in in one payload is adjudicated against the same day, and the pure
	 * module below it never reaches for a clock of its own. `laCalendarDay` owns
	 * the America/Los_Angeles rule (the calendar `session_date` is written in);
	 * `checkInIsScheduled` owns the comparison. Neither reads `new Date()`, and
	 * nothing else here may either.
	 */
	const clockRead = new Date();
	const today = laCalendarDay(clockRead);

	/**
	 * THE TEAMS THIS CLASS CAN SEE (0223, mounted by ledger 0297), started
	 * beside the reads below so it costs no round trip of its own, and read
	 * through the same audience-gated board the People tab posts from. It fails
	 * soft to an empty list; see `$lib/classroom/class-teams`.
	 */
	const teamsRead = loadPostedTeams(supabase, params.sectionId);

	const [{ data: manages }, content, checkInRows, hallPass, songQueue, layoutReady] = await Promise.all([
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		itemsForSection(supabase, params.sectionId),
		sectionCheckIns(supabase, params.sectionId),
		// Rides along with the other three: it is one small RPC and the pass is
		// the one thing on this page somebody may need before they have finished
		// reading it.
		sectionHallPass(supabase, params.sectionId),
		// 0145, alongside it for the same reason and at the same cost: one small
		// RPC, and both cards sit at the top of the class pane.
		sectionSongQueue(supabase, params.sectionId),
		// 0193's capability probe, beside the others so it costs no extra round
		// trip of its own.
		sectionLayoutReady(supabase)
	]);

	const section = normalizeSectionRow(sectionRow as Record<string, unknown>);
	const canManage = manages === true;
	let sections: ReturnType<typeof normalizeSectionRow>[] = [];
	let items = content.items;
	if (canManage) {
		const { data } = await supabase.from('classroom_sections').select(SECTION_SELECT);
		sections = ((data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow);
		// Instructor-only materials (0090) are fetched ONLY for a manager -- a
		// student's read never even asks the question, let alone gets an answer.
		items = await mergeInstructorMaterials(supabase, items);
	}

	/**
	 * WHERE THE VIEWER STANDS ON EACH CHECK-IN.
	 *
	 * A STUDENT gets their own status, from two reads that are pinned to them
	 * TWO independent ways:
	 *
	 *   1. RLS. `notebook_entries` is own-rows-or-section-staff and
	 *      `notebook_session_excusals` is own-row-or-section-staff, so a student
	 *      asking these questions can only be answered about themselves. That is
	 *      the boundary, and it is the database's.
	 *   2. `.eq('student_id', ...)`. NOT a substitute for the policy and not the
	 *      usual /coin-balance shape -- it is here because these two policies
	 *      legitimately return OTHER people's rows to a different caller (a
	 *      teacher of this section), and a page that computed "my status" from
	 *      whatever came back would be right only for as long as the branch below
	 *      stayed correct. Attribution and authorization are different jobs; this
	 *      filter does the first one.
	 *
	 * A MANAGER takes neither read. Their own policy would hand them the whole
	 * class, and there is no personal status for a teacher on their own class's
	 * check-in anyway -- `status: null` is what says so, and it is what stops a
	 * card claiming a state assembled from somebody else's work.
	 *
	 * A STUDENT'S OWN OUTSTANDING COUNT IS NOT RETURNED HERE. It is derived from
	 * this same `checkIns` array by the page (outstandingCheckIns), so the badge
	 * and the cards it summarizes read one list and cannot disagree.
	 * `sectionOutstanding` is the manager's number and only ever theirs.
	 */
	let checkIns: ClassCheckIn[] = [];
	let sectionOutstanding: number | null = null;

	if (checkInRows?.rows.length && !canManage) {
		/*
		 * THE STATUS READ AND THE RANKING OF A STUDENT'S ENTRIES INTO ONE STATUS
		 * are `readOwnCheckIns` in $lib/classroom/student-work (ledger 0297): the
		 * to-do page asks the same question of every class at once, and a second
		 * copy of "which entry decides" is the copy that stops agreeing. It keeps
		 * every rule this block used to spell out -- deleted entries excluded (0116)
		 * through a three-rung ladder that degrades rather than blanking, a draft
		 * ranked below a turned-in entry (0118), an excusal beating a draft,
		 * `scheduled` handed in from `checkInIsScheduled` against this load's own
		 * `today`, and no flag reason on a draft -- and it is pinned to the caller
		 * both ways described above.
		 */
		checkIns = await readOwnCheckIns(supabase, claims.sub, checkInRows.rows, today);
	} else if (checkInRows?.rows.length) {
		/**
		 * A MANAGER CARRIES EXACTLY ONE STATUS, AND IT IS THE ONE THAT IS NOT
		 * ABOUT THEM.
		 *
		 * `status: null` is what stops a card claiming a state assembled from
		 * somebody else's rows, and that argument is untouched: a teacher files
		 * no check-ins, so `filed`, `draft`, `flagged`, `awaiting_review` and
		 * `missing` are all questions they cannot have an answer to.
		 * `scheduled` is not one of those. It is a comparison between a column
		 * and today, identical for every person who loads this page, and a
		 * teacher who has just laid out next week needs to see that the class
		 * page agrees with the grid they laid it out on. Withholding it would be
		 * the bound this bundle removed, wearing a different hat.
		 */
		checkIns = checkInRows.rows.map((c) => ({
			...c,
			status: checkInIsScheduled(c.session_date, today) ? ('scheduled' as const) : null,
			flag_reason: null
		}));

		/**
		 * The manager's own number: how much notebook work this CLASS is behind
		 * on, which is the question a teacher looking at their class page has --
		 * "my status" is not one they can have.
		 *
		 * It is `notebook_get_section_grid` + `gridSummary`, the SAME call and the
		 * same summarizer the manage console's compliance element already uses
		 * (0099), so the two surfaces cannot report different totals for the same
		 * class. The RPC asks `classroom_manages_section` itself, which is the
		 * same question `canManage` is, so this can never offer a grid the
		 * database would refuse.
		 *
		 * The cost is honest: it returns the whole roster x check-ins grid to
		 * count part of it. It runs only for a manager, only on their own class's
		 * page, and fails soft to no badge at all -- and a lighter count would
		 * mean re-deriving the roster and the cell rules outside the one function
		 * that owns them.
		 */
		const { data: grid, error: gridError } = await supabase.rpc('notebook_get_section_grid', {
			p_section_id: params.sectionId,
			p_unit_number: null
		});
		if (!gridError && grid) sectionOutstanding = gridSummary(grid as SectionGrid).outstanding;
	}

	/**
	 * A CHECK-IN WHOSE ITEM THIS VIEWER CANNOT SEE KEEPS ITS OWN ROW.
	 *
	 * The failure this prevents is silent and total: attach a check-in to a
	 * DRAFT or scheduled item and a student's `items` (RLS-filtered) does not
	 * contain it, so the check-in would render on nothing at all -- gone from
	 * the stream because it is linked, gone from the item because the item is
	 * not there -- while their notebook and their teacher's grid both still
	 * expect the work. Fail OPEN: the link is a presentation choice, and the
	 * presentation it chooses is unavailable here, so it falls back to the one
	 * that always works.
	 *
	 * It reads `items`, which is this load's own payload and therefore exactly
	 * what the page will render -- not a second query with its own opinion about
	 * visibility.
	 */
	const visibleItemIds = new Set(items.map((i) => i.id));
	checkIns = checkIns.map((c) =>
		c.item_id && !visibleItemIds.has(c.item_id) ? { ...c, item_id: null } : c
	);

	/**
	 * THE UNITS THIS CLASS'S CONTENT IS GROUPED BY (0111).
	 *
	 * A fact about the COURSE, so it is read by course id and every section of it
	 * gets the same answer -- which is the whole reason an item posted to three
	 * sections on identical pacing is filed once. Fails soft to an empty list,
	 * which renders exactly as a course with no units does: one chronological
	 * list, the view this page had before units existed.
	 */
	const units = await loadCourseUnits(supabase, section.course_id);

	/**
	 * WHERE THE STUDENT THEMSELVES STANDS ON EACH ASSIGNMENT.
	 *
	 * One RLS-scoped select with NO student filter (the /coin-balance doctrine --
	 * `classroom_submissions` is own-row-or-reviewer, so the policy IS the
	 * filter). It is deliberately NOT run for a manager: their own policy would
	 * legitimately hand them the whole class's rows, and a teacher has no personal
	 * standing on their own assignment. `work` is empty for them, which is what
	 * makes the row render no status chip at all rather than somebody else's.
	 */
	let work: Record<string, ReturnType<typeof studentWorkMap>[string]> = {};
	if (!canManage) {
		const assignmentIds = items.filter((i) => i.kind === 'assignment').map((i) => i.id);
		if (assignmentIds.length) {
			/*
			 * `student_email` rides along for ATTRIBUTION (ledger 0298), the
			 * check-in reads' own rule above: a student who manages ANOTHER class an
			 * item is co-posted to can legitimately read every student's row on it,
			 * and "my standing" must be computed from mine alone.
			 */
			const me = ((claims.email as string | undefined) ?? '').trim().toLowerCase();
			const { data: rows } = await supabase
				.from('classroom_submissions')
				.select('item_id, student_email, state, score')
				.in('item_id', assignmentIds);
			const mine = ((rows ?? []) as (SubmissionSummary & { student_email?: string | null })[]).filter(
				(r) => !r.student_email || r.student_email.toLowerCase() === me
			);
			/*
			 * A FINISHED PORTED WORKSHEET IS DONE HERE TOO (decision 37), from the
			 * same `readWorksheetCompletions` the home page, My Classes and the
			 * to-do read, pinned to this student. Only an open worksheet is worth
			 * the read; a turned-in, closed or returned one already says where it
			 * stands. A read that cannot answer leaves `work` as it always was.
			 */
			const settled = new Set(mine.filter((r) => r.state !== 'draft').map((r) => r.item_id));
			const completions = me
				? await readWorksheetCompletions(
						supabase,
						assignmentIds.filter((id) => !settled.has(id)),
						{ onlyEmail: me }
					)
				: null;
			work = studentWorkMap(
				withWorksheetCompletions(mine, completions, (item_id, student_email) => ({
					item_id,
					student_email,
					state: 'draft',
					score: null
				}))
			);
		}
	}

	// Which unit groups this user keeps folded (profiles.preferences, the home
	// feed's pattern). Absent reads as nothing folded.
	const { data: profile } = await supabase
		.from('profiles')
		.select('preferences')
		.eq('id', claims.sub)
		.maybeSingle();

	return {
		section,
		canManage,
		sections,
		/**
		 * STUDENT-FACING FILES DO NOT DEPEND ON DRIVE ANY MORE (0133).
		 *
		 * This was `driveConfigured()`, and leaving it that way would have been a
		 * silent, total outage of the thing this bundle exists to build: a
		 * deployment without the Google OAuth credentials would offer no file
		 * picker on any item and no hand-in on any assignment, with the private
		 * Supabase bucket sitting right there unused. Nothing in the picker, the
		 * signed upload URL, the row or the download touches Drive.
		 */
		attachmentsEnabled: true,
		/**
		 * AND NEITHER DOES INSTRUCTOR-ONLY MATERIAL, SINCE 0135.
		 *
		 * This was `driveConfigured()` too, for a reason that was true when it was
		 * written and is not now: 0133 gave answer keys no bucket, because their
		 * read rule is manager-only and they cannot share the
		 * `classroom-attachments` prefix, whose objects the whole class may read.
		 * 0135 gave them a bucket of their own with three manager-only policies,
		 * so they take the same signed-URL path as everything else and the 4 MiB
		 * Drive ceiling is gone with it.
		 *
		 * LEAVING THE FLAG WOULD HAVE BEEN THE SAME SILENT OUTAGE the bullet above
		 * describes, one surface over: a deployment with no Google credentials
		 * would show no answer-key picker at all, with the bucket sitting there
		 * working. Nothing in the picker, the signed upload URL, the row or the
		 * download touches Drive on this path any more.
		 */
		instructorAttachmentsEnabled: true,
		items,
		units,
		work,
		collapsed: collapsedGroups(readClassViewPrefs(profile?.preferences), params.sectionId),
		preferences: (profile?.preferences ?? {}) as Record<string, unknown>,
		checkIns,
		/**
		 * WHETHER THIS PROJECT CAN ATTACH A CHECK-IN TO AN ITEM (0120).
		 *
		 * False on a schema without the column, where every check-in reads as
		 * unlinked -- which is the correct rendering, not a degraded one. What it
		 * gates is the WRITE side: a manager is offered no "attach a check-in"
		 * control on a project whose database would refuse it, and the item page
		 * says so rather than failing when they press it.
		 */
		checkInLinksReady: checkInRows?.linksReady ?? false,
		// 0123. The item page hands the guidance transport in ONLY when this is
		// true, so an instructor is never offered a field whose save would fail.
		checkInGuidanceReady: checkInRows?.guidanceReady ?? false,
		/**
		 * 0143. NULL ON A DATABASE WITHOUT THE MIGRATION, which removes the whole
		 * control rather than rendering a broken one -- see sectionHallPass. It is
		 * also null for a caller the RPC will not answer about, which cannot
		 * happen here (the section load already 404s them) but is the honest
		 * shape of the value.
		 */
		hallPass,
		/**
		 * 0145. NULL ON A DATABASE WITHOUT THE MIGRATION, which removes the whole
		 * card rather than rendering a broken one -- see sectionSongQueue. It is
		 * also null for a caller the RPC will not answer about, which cannot
		 * happen here (the section load already 404s them) but is the honest shape
		 * of the value.
		 */
		songQueue,
		sectionOutstanding,
		/** The posted teams, projected to names: what the class page draws for everyone. */
		teams: await teamsRead,
		/**
		 * THE SAME ONE CLOCK READ, handed down (ledger 0297) so the class page's
		 * status filter asks "is this past due" against the instant this load
		 * ran and "is this check-in's day behind us" against the same day the
		 * check-ins above were adjudicated in, and never reads a clock of its own.
		 */
		classClock: { now: clockRead.toISOString(), today },
		/**
		 * 0193. Whether `classroom_items` carries the placement columns, from
		 * the probe above. The layout hands the 0193 transports down only when
		 * this is true, so a control is never offered whose save would be
		 * refused; the item page asks its own read (`itemLayoutKnown`) instead,
		 * because that read already answers the question for free.
		 */
		layoutReady
	};
};
