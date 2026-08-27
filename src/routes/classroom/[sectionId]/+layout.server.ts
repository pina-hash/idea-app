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
import { checkInStatus, type ClassCheckIn } from '$lib/classroom/class-check-ins';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import { NOTEBOOK_POSTING_SELECTS } from '$lib/notebook-selects';
import { gridSummary, type SectionGrid } from '$lib/notebook-review';
import type { LayoutServerLoad } from './$types';

/**
 * The check-ins scheduled for THIS class (0098), without anybody's status.
 *
 * `notebook_session_postings` and `notebook_sessions` are both readable by any
 * signed-in user (`using (true)`) and carry nothing private -- a check-in id
 * beside a class id, and a label with a date. The `.eq` is what scopes this to
 * one class, and it is a scoping filter rather than a privacy one; the STATUS
 * reads below are where privacy actually lives.
 *
 * Reuses NOTEBOOK_POSTING_SELECTS rather than writing a second select string:
 * that one names an embedded resource, PostgREST resolves embeds against real
 * foreign keys, and tests/notebook-page-load.test.ts already holds it against
 * the live catalog. A private copy here would be a second assertion about the
 * schema with nothing checking it -- which is exactly how the /notebook load
 * came to embed a key 0098 had removed.
 */
interface PostingRow {
	section_id: string;
	/** 0120's column. Absent on the narrow rung, which is what null covers. */
	item_id?: string | null;
	notebook_sessions: {
		id: string;
		unit_number: number;
		session_date: string;
		session_label: string;
		/** 0123's column. Absent on either narrower rung. */
		guidance_doc?: ItemDoc | null;
	} | null;
}

/**
 * TODAY, ON THE CALENDAR `session_date` IS WRITTEN IN.
 *
 * `notebook_sessions.session_date` is a bare DATE, and every rule that
 * adjudicates one compares it in America/Los_Angeles --
 * `notebook_get_section_grid`'s `on_time` is
 * `(upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date`
 * (0094/0098). A server reading UTC instead would run seven or eight hours
 * ahead of that, so every evening between 5pm Pacific and midnight UTC the next
 * day's check-in would already count as due. That is a smaller version of the
 * exact bug this bound exists to fix, so it is not worth taking.
 *
 * `en-CA` is the YYYY-MM-DD spelling, which is the same string the column
 * holds, so the comparison below is a plain lexical one with no parsing in it.
 */
function checkInsThrough(now: Date): string {
	return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * The check-ins, and whether this project can say which item each one hangs off.
 *
 * TWO RUNGS (NOTEBOOK_POSTING_SELECTS), widest first, for the reason every
 * ladder here exists: migrations are pasted in by hand, so a deploy sitting
 * between 0119 and 0120 is a real state and PostgREST rejects the whole select
 * when it names `item_id` on a schema without it. Degrading costs exactly one
 * capability -- every check-in keeps its own stream row, which is what they all
 * did before 0120 -- rather than costing the page its check-ins.
 *
 * `linksReady` is what the page reads to know WHICH of those two worlds it is
 * in. It starts false and is turned on only by the rung that actually carried
 * the column succeeding.
 */
async function sectionCheckIns(
	supabase: SupabaseClient,
	sectionId: string,
	/** The last day a check-in may be dated and still be read. See below. */
	through: string
): Promise<{
	rows: Omit<ClassCheckIn, 'status' | 'flag_reason'>[];
	linksReady: boolean;
	/** 0123: whether this project can carry a guidance prompt at all. */
	guidanceReady: boolean;
} | null> {
	for (const rung of NOTEBOOK_POSTING_SELECTS) {
		/**
		 * A CHECK-IN DATED IN THE FUTURE IS NOT READ AT ALL.
		 *
		 * This read had NO DATE BOUND, and nothing downstream supplied one:
		 * `checkInStatus` has no clock in it, so a check-in a teacher scheduled
		 * for next month came back with no entry against it, resolved to
		 * `missing`, and `isOutstanding` counted it. A student opening their
		 * class page in August was told he owed work due in October -- and
		 * because the stream is newest-first by date, the thing he did not owe
		 * was the first row on the page, in the attention tone.
		 *
		 * BOUNDING THE READ IS THE WHOLE FIX, because the badge is derived from
		 * this same array: ClassView computes `outstandingCheckIns(checkIns)`
		 * for a student, so a row that is not here cannot be counted, cannot be
		 * toned and cannot be rendered. `checkInStatus` needs no clock and does
		 * not get one -- a second idea of "is this due yet", one in the loader
		 * and one in the status function, is the pair that stops agreeing.
		 *
		 * A POSTGREST `.lte` ON THE EMBED, which the `!inner` join every rung
		 * already carries makes a real query bound rather than a row filter --
		 * `tests/db/postgrest-shim.ts` now implements `.lte()`, so this is
		 * driven through the real load and proven there rather than asserted
		 * as equivalent to the row filter it replaces.
		 *
		 * INCLUSIVE, so a check-in dated TODAY is still outstanding -- that is
		 * the day it is for, not the day after it.
		 *
		 * IT ALSO TAKES A FUTURE CHECK-IN OFF THE STREAM ENTIRELY, for a
		 * manager as well as a student. That is the honest reading of one
		 * scheduled read: a class page shows what the class is doing, and a
		 * manager schedules and edits check-ins on /notebook/review, which
		 * reads the canonical rows by id and carries no bound of its own.
		 */
		const { data, error: postingError } = await supabase
			.from('notebook_session_postings')
			.select(rung.select)
			.eq('section_id', sectionId)
			.lte('notebook_sessions.session_date', through);
		if (postingError) continue;
		const rows = ((data ?? []) as unknown as PostingRow[])
			.filter(
				(r): r is PostingRow & { notebook_sessions: NonNullable<PostingRow['notebook_sessions']> } =>
					Boolean(r.notebook_sessions)
			)
			.map((r) => ({
				session_id: r.notebook_sessions.id,
				section_id: r.section_id,
				unit_number: r.notebook_sessions.unit_number,
				session_date: r.notebook_sessions.session_date,
				session_label: r.notebook_sessions.session_label,
				// On the narrow rung the column was never asked for, so nothing is
				// linked -- which is exactly the behaviour of a project without
				// 0120, rather than a guess about one.
				item_id: r.item_id ?? null,
				// Same shape, one migration later: undefined on any rung that did
				// not ask, which every reader renders as no prompt.
				guidance_doc: r.notebook_sessions.guidance_doc
			}));
		// The guidance rung is the widest, so it also carries `item_id`; a rung
		// that carries the prompt necessarily carries the link too.
		const guidanceReady = rung.capability === 'checkInGuidance';
		return { rows, linksReady: guidanceReady || rung.capability === 'checkInItems', guidanceReady };
	}
	// null means "the notebook is not here", which the page renders as no
	// check-ins at all rather than as an error -- migrations are applied by hand,
	// so a deploy without them is a real state.
	return null;
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

	const [{ data: manages }, content, checkInRows] = await Promise.all([
		supabase.rpc('classroom_manages_section', { p_section_id: params.sectionId }),
		itemsForSection(supabase, params.sectionId),
		sectionCheckIns(supabase, params.sectionId, checkInsThrough(new Date()))
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
		const sessionIds = checkInRows.rows.map((c) => c.session_id);
		/**
		 * DELETED ENTRIES ARE EXCLUDED (0116), AND THE FILTER DEGRADES.
		 *
		 * Without the exclusion a student who removed a check-in entry would keep
		 * reading as "filed" on their own class page -- and a deleted FLAGGED
		 * entry would keep the card red for work that is no longer there.
		 *
		 * The retry is not caution: `deleted_at` does not exist before 0116, and
		 * PostgREST rejects a filter on an unknown column, so a single filtered
		 * read would come back empty on a pre-0116 project and every check-in on
		 * the page would silently read "missing" -- a wrong answer with no error
		 * anywhere, which is the worst shape this failure can take. So the
		 * filtered read is tried first and the original is the fallback.
		 */
		/**
		 * THREE RUNGS, WIDEST FIRST -- the notebook feed's own ladder rule, and
		 * this read needs it for the same reason twice over. `submitted_at` does
		 * not exist before 0118 and `deleted_at` does not before 0116, and
		 * PostgREST rejects a select OR a filter naming an unknown column, so a
		 * single wide read would come back empty on either older project and
		 * every check-in on the page would silently read "missing" -- a wrong
		 * answer with no error anywhere, which is the worst shape this can take.
		 *
		 * `drafts` rides back with the rows because the caller cannot tell an
		 * absent column from a null one, and the two mean opposite things: on a
		 * pre-0118 project every entry was turned in, so an unknown reads as
		 * SUBMITTED, never as a draft.
		 */
		const readEntries = async (): Promise<{ rows: unknown[] | null; drafts: boolean }> => {
			const base = (select: string) =>
				supabase
					.from('notebook_entries')
					.select(select)
					.eq('student_id', claims.sub)
					.eq('section_id', params.sectionId)
					.in('session_id', sessionIds);
			const withDrafts = await base('session_id, status, flag_reason, submitted_at').is(
				'deleted_at',
				null
			);
			if (!withDrafts.error) return { rows: withDrafts.data, drafts: true };
			const filtered = await base('session_id, status, flag_reason').is('deleted_at', null);
			if (!filtered.error) return { rows: filtered.data, drafts: false };
			const plain = await base('session_id, status, flag_reason');
			return { rows: plain.data, drafts: false };
		};
		const [{ rows: entryRows, drafts: draftsReady }, { data: excusalRows }] = await Promise.all([
			readEntries(),
			supabase
				.from('notebook_session_excusals')
				.select('session_id')
				.eq('student_id', claims.sub)
				.in('session_id', sessionIds)
		]);

		type EntryRow = {
			session_id: string;
			status: 'compliant' | 'flagged' | 'pending_review';
			flag_reason: ClassCheckIn['flag_reason'];
			submitted_at?: string | null;
		};
		/**
		 * A student may hold SEVERAL entries against one check-in (nothing forbids
		 * adding a second page). The one that decides the status is the one that
		 * still wants something: a flag outranks anything else, then an awaited
		 * review, then filed -- the same precedence cellDisplay uses on the grid.
		 *
		 * A DRAFT RANKS LAST, BELOW `filed` (0118). That is not a demotion of the
		 * draft, it is what makes the pair read correctly: a student who turned
		 * one page in and is still working on a second HAS filed this check-in,
		 * and reporting the draft over the submitted entry would ask them to do
		 * something they already did. A flagged entry still outranks a draft --
		 * the instructor asking for another look is the more urgent of the two.
		 */
		const rank = { flagged: 0, pending_review: 1, compliant: 2, draft: 3 } as const;
		// An UNKNOWN `submitted_at` (a narrower rung, where the column does not
		// exist) reads as submitted, never as a draft -- see readEntries.
		const isSubmitted = (row: EntryRow) => (draftsReady ? row.submitted_at !== null : true);
		const rankOf = (row: EntryRow) => (isSubmitted(row) ? rank[row.status] : rank.draft);
		const bySession = new Map<string, EntryRow>();
		for (const row of (entryRows ?? []) as EntryRow[]) {
			const held = bySession.get(row.session_id);
			if (!held || rankOf(row) < rankOf(held)) bySession.set(row.session_id, row);
		}
		const excused = new Set(
			((excusalRows ?? []) as { session_id: string }[]).map((r) => r.session_id)
		);

		checkIns = checkInRows.rows.map((c) => {
			const entry = bySession.get(c.session_id);
			return {
				...c,
				status: checkInStatus(
					entry ? { status: entry.status, submitted: isSubmitted(entry) } : entry,
					excused.has(c.session_id)
				),
				// A DRAFT SHOWS NO FLAG REASON even if the row carries one: a flag is
				// an instructor's note about work they were shown, and an entry
				// pulled back to a draft is not that any more.
				flag_reason:
					entry?.status === 'flagged' && isSubmitted(entry) ? (entry.flag_reason ?? null) : null
			};
		});
	} else if (checkInRows?.rows.length) {
		checkIns = checkInRows.rows.map((c) => ({ ...c, status: null, flag_reason: null }));

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
			const { data: rows } = await supabase
				.from('classroom_submissions')
				.select('item_id, state, score')
				.in('item_id', assignmentIds);
			work = studentWorkMap((rows ?? []) as SubmissionSummary[]);
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
		sectionOutstanding
	};
};
