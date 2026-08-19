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
import { NOTEBOOK_POSTING_SELECT } from '$lib/notebook-selects';
import { gridSummary, type SectionGrid } from '$lib/notebook-review';
import { driveConfigured } from '$lib/server/notebook-drive';
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
 * Reuses NOTEBOOK_POSTING_SELECT rather than writing a second select string:
 * that one names an embedded resource, PostgREST resolves embeds against real
 * foreign keys, and tests/notebook-page-load.test.ts already holds it against
 * the live catalog. A private copy here would be a second assertion about the
 * schema with nothing checking it -- which is exactly how the /notebook load
 * came to embed a key 0098 had removed.
 */
interface PostingRow {
	section_id: string;
	notebook_sessions: {
		id: string;
		unit_number: number;
		session_date: string;
		session_label: string;
	} | null;
}

async function sectionCheckIns(
	supabase: SupabaseClient,
	sectionId: string
): Promise<Omit<ClassCheckIn, 'status' | 'flag_reason'>[] | null> {
	const { data, error: postingError } = await supabase
		.from('notebook_session_postings')
		.select(NOTEBOOK_POSTING_SELECT)
		.eq('section_id', sectionId);
	// null means "the notebook is not here", which the page renders as no
	// check-ins at all rather than as an error -- migrations are applied by hand,
	// so a deploy without them is a real state.
	if (postingError) return null;
	return ((data ?? []) as unknown as PostingRow[])
		.filter((r): r is PostingRow & { notebook_sessions: NonNullable<PostingRow['notebook_sessions']> } =>
			Boolean(r.notebook_sessions)
		)
		.map((r) => ({
			session_id: r.notebook_sessions.id,
			section_id: r.section_id,
			unit_number: r.notebook_sessions.unit_number,
			session_date: r.notebook_sessions.session_date,
			session_label: r.notebook_sessions.session_label
		}));
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
 * NOTEBOOK CHECK-INS (0098) ride along as a SECOND SOURCE, merged into the
 * stream by the page. They cannot ride the item query: they live in
 * `notebook_session_postings` + `notebook_sessions`, which have no foreign key
 * to `classroom_items`, so there is nothing for PostgREST to embed through.
 * That is the same reason they are not, and must not become, a gradeable
 * Classroom item -- see $lib/classroom/class-check-ins.
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
		sectionCheckIns(supabase, params.sectionId)
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

	if (checkInRows?.length && !canManage) {
		const sessionIds = checkInRows.map((c) => c.session_id);
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

		checkIns = checkInRows.map((c) => {
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
	} else if (checkInRows?.length) {
		checkIns = checkInRows.map((c) => ({ ...c, status: null, flag_reason: null }));

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
		attachmentsEnabled: driveConfigured(),
		items,
		units,
		work,
		collapsed: collapsedGroups(readClassViewPrefs(profile?.preferences), params.sectionId),
		preferences: (profile?.preferences ?? {}) as Record<string, unknown>,
		checkIns,
		sectionOutstanding
	};
};
