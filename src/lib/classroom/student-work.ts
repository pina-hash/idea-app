/**
 * WHAT A STUDENT'S CLASSES ASK OF THEM, READ ONCE (ledger 0297).
 *
 * ONE QUERY SET, NOT TWO. The site home read its classes, their items (with
 * each item's postings and the caller's own view stamp) and the submissions
 * behind them inline in `src/routes/+page.server.ts`; the to-do page and My
 * Classes need exactly the same three reads, and a second copy of them is a
 * second opinion about which classes count, which items are live and whose
 * submission is whose. So `loadClassroomWork` is the one place those reads are
 * written, and every surface that lists owed work calls it.
 *
 * AND ONE CHECK-IN READ. A student's notebook check-in status used to be read
 * only by the class page's layout load, one class at a time. The to-do page
 * lists every class's check-ins at once, so the posting read and the status
 * read moved here, batched over classes with `.in('section_id', ids)`, and the
 * class layout calls the same two functions with its one class. The ranking of
 * a student's entries into one status per check-in is therefore written once.
 *
 * EVERY READ RUNS AS THE CALLER'S OWN SESSION with no role branch and no
 * `student_email` filter on the classroom reads (the /coin-balance doctrine --
 * the filtering IS the policy): classroom_sections returns their enrolled
 * classes, or their own as teacher of record, or everything for an admin;
 * classroom_items is scoped by classroom_can_read_item, so a student never
 * receives a draft; classroom_submissions is own-row-or-reviewer. The `.in()`
 * filters are about PAYLOAD SIZE, not privacy.
 *
 * THE CHECK-IN STATUS READS ARE PINNED TO THE CALLER TWO WAYS, and that is
 * deliberate rather than belt-and-braces: RLS (`notebook_entries` is
 * own-rows-or-section-staff, `notebook_session_excusals` own-row-or-staff) is
 * the boundary, and `.eq('student_id', ...)` is ATTRIBUTION -- those policies
 * legitimately return other people's rows to a teacher of the section, and a
 * surface computing "my status" from whatever came back would be right only for
 * as long as nothing upstream let a manager through. See the class layout load.
 *
 * ONE CLOCK. `loadClassroomWork` reads `new Date()` exactly once, converts it
 * with `laCalendarDay`, and returns the pair as `clock`. Every classification
 * downstream (the feed, the to-do groups, the counts on My Classes) reads that
 * pair and never a clock of its own.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	normalizeItemRow,
	normalizeSectionRow,
	sortSections,
	type ClassroomItem,
	type ClassroomSection
} from '$lib/classroom/classroom';
import { SECTION_SELECT, selectItemsWithDoc } from '$lib/classroom/transports';
import { checkInIsScheduled, checkInStatus, type ClassCheckIn } from '$lib/classroom/class-check-ins';
import { sectionManagedBy, type FeedSubmission } from '$lib/classroom/feed';
import { laCalendarDay } from '$lib/classroom/school-calendar';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import { NOTEBOOK_POSTING_SELECTS } from '$lib/notebook-selects';

/** The loader's one clock read: the instant, and the school day it falls on. */
export interface ClassroomClock {
	now: string;
	today: string;
}

/** Read the clock ONCE for a load. Everything downstream is handed this pair. */
export function readClassroomClock(at: Date = new Date()): ClassroomClock {
	return { now: at.toISOString(), today: laCalendarDay(at) };
}

// ---------------------------------------------------------------------------
// Check-ins: the postings, then the caller's own status on each
// ---------------------------------------------------------------------------

/**
 * One posting of a check-in, as the posting ladder reads it (0098).
 *
 * `notebook_session_postings` and `notebook_sessions` are both readable by any
 * signed-in user (`using (true)`) and carry nothing private -- a check-in id
 * beside a class id, and a label with a date. The `.in` is what scopes this to
 * the classes asked about, and it is a scoping filter rather than a privacy
 * one; the STATUS reads below are where privacy actually lives.
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

export type CheckInPostingRow = Omit<ClassCheckIn, 'status' | 'flag_reason'>;

export interface CheckInPostings {
	rows: CheckInPostingRow[];
	/** 0120: whether this project can say which item each check-in hangs off. */
	linksReady: boolean;
	/** 0123: whether this project can carry a guidance prompt at all. */
	guidanceReady: boolean;
}

/**
 * The check-ins scheduled for these classes, without anybody's status.
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
 *
 * A CHECK-IN DATED IN THE FUTURE IS READ, AND THEN NAMED. This read has no
 * date bound; a check-in dated after today resolves to `scheduled` in
 * `readOwnCheckIns`, which `isOutstanding` does not count, `checkInTone` mutes
 * and `mergeCheckIns` puts below everything actionable. The class layout load
 * carries the full history of why the bound that used to be here is gone.
 *
 * NULL MEANS "the notebook is not here", which every caller renders as no
 * check-ins at all rather than as an error -- migrations are applied by hand,
 * so a deploy without them is a real state.
 */
export async function readCheckInPostings(
	supabase: SupabaseClient,
	sectionIds: readonly string[]
): Promise<CheckInPostings | null> {
	if (!sectionIds.length) return { rows: [], linksReady: false, guidanceReady: false };
	for (const rung of NOTEBOOK_POSTING_SELECTS) {
		const { data, error: postingError } = await supabase
			.from('notebook_session_postings')
			.select(rung.select)
			.in('section_id', [...sectionIds]);
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
	return null;
}

/** One of the caller's own entries, as the status read selects it. */
interface EntryRow {
	session_id: string;
	section_id: string;
	status: 'compliant' | 'flagged' | 'pending_review';
	flag_reason: ClassCheckIn['flag_reason'];
	submitted_at?: string | null;
}

/**
 * THE CALLER'S OWN STATUS ON EACH CHECK-IN, from THEIR OWN entries and THEIR
 * OWN excusals. Never called for a manager of these classes: their own policy
 * would hand them the whole class, and a teacher files nothing, so `status:
 * null` (the class layout's manager branch) is their honest answer.
 *
 * DELETED ENTRIES ARE EXCLUDED (0116), AND THE FILTER DEGRADES. Without the
 * exclusion a student who removed a check-in entry would keep reading as
 * "filed" -- and a deleted FLAGGED entry would keep the card red for work that
 * is no longer there.
 *
 * THREE RUNGS, WIDEST FIRST -- the notebook feed's own ladder rule, and this
 * read needs it for the same reason twice over. `submitted_at` does not exist
 * before 0118 and `deleted_at` does not before 0116, and PostgREST rejects a
 * select OR a filter naming an unknown column, so a single wide read would come
 * back empty on either older project and every check-in would silently read
 * "missing" -- a wrong answer with no error anywhere, which is the worst shape
 * this can take. `drafts` rides back with the rows because the caller cannot
 * tell an absent column from a null one, and the two mean opposite things: on a
 * pre-0118 project every entry was turned in when it was made, so an unknown
 * reads as SUBMITTED, never as a draft.
 *
 * ONE STATUS PER (CHECK-IN, CLASS) PAIR. An entry is filed against that pair
 * (the composite key `notebook_entries` carries to `notebook_session_postings`),
 * so a student in two classes that share a check-in stands on each separately.
 * An excusal is per check-in and applies to every class it runs in, which is
 * what the class layout always did with its one class.
 */
export async function readOwnCheckIns(
	supabase: SupabaseClient,
	studentId: string,
	rows: readonly CheckInPostingRow[],
	today: string
): Promise<ClassCheckIn[]> {
	if (!rows.length) return [];
	const sessionIds = [...new Set(rows.map((c) => c.session_id))];
	const sectionIds = [...new Set(rows.map((c) => c.section_id))];

	const readEntries = async (): Promise<{ rows: unknown[] | null; drafts: boolean }> => {
		const base = (select: string) =>
			supabase
				.from('notebook_entries')
				.select(select)
				.eq('student_id', studentId)
				.in('section_id', sectionIds)
				.in('session_id', sessionIds);
		const withDrafts = await base('session_id, section_id, status, flag_reason, submitted_at').is(
			'deleted_at',
			null
		);
		if (!withDrafts.error) return { rows: withDrafts.data, drafts: true };
		const filtered = await base('session_id, section_id, status, flag_reason').is('deleted_at', null);
		if (!filtered.error) return { rows: filtered.data, drafts: false };
		const plain = await base('session_id, section_id, status, flag_reason');
		return { rows: plain.data, drafts: false };
	};
	const [{ rows: entryRows, drafts: draftsReady }, { data: excusalRows }] = await Promise.all([
		readEntries(),
		supabase
			.from('notebook_session_excusals')
			.select('session_id')
			.eq('student_id', studentId)
			.in('session_id', sessionIds)
	]);

	/**
	 * A student may hold SEVERAL entries against one check-in (nothing forbids
	 * adding a second page). The one that decides the status is the one that
	 * still wants something: a flag outranks anything else, then an awaited
	 * review, then filed -- the same precedence cellDisplay uses on the grid.
	 *
	 * A DRAFT RANKS LAST, BELOW `filed` (0118). That is not a demotion of the
	 * draft, it is what makes the pair read correctly: a student who turned one
	 * page in and is still working on a second HAS filed this check-in, and
	 * reporting the draft over the submitted entry would ask them to do
	 * something they already did. A flagged entry still outranks a draft -- the
	 * instructor asking for another look is the more urgent of the two.
	 */
	const rank = { flagged: 0, pending_review: 1, compliant: 2, draft: 3 } as const;
	// An UNKNOWN `submitted_at` (a narrower rung, where the column does not
	// exist) reads as submitted, never as a draft -- see readEntries.
	const isSubmitted = (row: EntryRow) => (draftsReady ? row.submitted_at !== null : true);
	const rankOf = (row: EntryRow) => (isSubmitted(row) ? rank[row.status] : rank.draft);
	const keyOf = (sessionId: string, sectionId: string) => `${sessionId} ${sectionId}`;
	const byPair = new Map<string, EntryRow>();
	for (const row of (entryRows ?? []) as EntryRow[]) {
		const key = keyOf(row.session_id, row.section_id);
		const held = byPair.get(key);
		if (!held || rankOf(row) < rankOf(held)) byPair.set(key, row);
	}
	const excused = new Set(((excusalRows ?? []) as { session_id: string }[]).map((r) => r.session_id));

	return rows.map((c) => {
		const entry = byPair.get(keyOf(c.session_id, c.section_id));
		return {
			...c,
			status: checkInStatus(
				entry ? { status: entry.status, submitted: isSubmitted(entry) } : entry,
				excused.has(c.session_id),
				checkInIsScheduled(c.session_date, today)
			),
			// A DRAFT SHOWS NO FLAG REASON even if the row carries one: a flag is an
			// instructor's note about work they were shown, and an entry pulled back
			// to a draft is not that any more.
			flag_reason: entry?.status === 'flagged' && isSubmitted(entry) ? (entry.flag_reason ?? null) : null
		};
	});
}

// ---------------------------------------------------------------------------
// The one query set
// ---------------------------------------------------------------------------

/** The submission columns every owed-work surface reads. `score` is kept on the caller's own rows only. */
export const WORK_SUBMISSION_SELECT = 'item_id, student_email, state, submitted_at, returned_at, graded_at, score';

export interface ClassroomWork {
	/** False when the classroom tables are not there (0082 not applied): the surface says so rather than crashing. */
	ready: boolean;
	/** Active classes the caller can see, sorted the shared way. A concluded class leaves every owed-work surface. */
	sections: ClassroomSection[];
	/** Every item posted to one of those classes that the caller may read, each carrying its own postings. */
	items: ClassroomItem[];
	submissions: FeedSubmission[];
	/**
	 * The caller's own check-ins, in the classes they do NOT teach, with their
	 * own status. Empty when not asked for, when the caller teaches every class,
	 * or when the notebook is not here (`checkInsReady` false).
	 */
	checkIns: ClassCheckIn[];
	checkInsReady: boolean;
	clock: ClassroomClock;
}

export interface ClassroomWorkOptions {
	/** `claims.sub`: the status reads are attributed to this person. */
	userId: string;
	/** `claims.email`, for own-versus-others submission rows. */
	email: string;
	/**
	 * From the root layout; decides which classes count as taught
	 * (`sectionManagedBy`). A promise is accepted and awaited only where it is
	 * needed, so a page load does not hold its classroom reads behind `parent()`.
	 */
	isAdmin: boolean | PromiseLike<boolean>;
	/** Read the caller's check-ins too (the to-do, My Classes, the home page's counts). */
	checkIns?: boolean;
	/** The clock read, when the caller already made it; otherwise it is made here, once. */
	clock?: ClassroomClock;
}

/**
 * The classes, items, submissions and (optionally) check-ins every owed-work
 * surface reads, in one place.
 *
 * FAILS SOFT, the way the home page always did: an unreadable section table is
 * `ready: false` with everything empty, and an item or submission read that
 * errors reads as nothing, so the page renders a flagged card rather than an
 * error page.
 */
export async function loadClassroomWork(
	supabase: SupabaseClient,
	options: ClassroomWorkOptions
): Promise<ClassroomWork> {
	const clock = options.clock ?? readClassroomClock();
	const empty = (ready: boolean): ClassroomWork => ({
		ready,
		sections: [],
		items: [],
		submissions: [],
		checkIns: [],
		checkInsReady: false,
		clock
	});

	const { data: sectionRows, error: sectionError } = await supabase
		.from('classroom_sections')
		.select(SECTION_SELECT);
	if (sectionError) return empty(false);

	/**
	 * A CONCLUDED CLASS LEAVES EVERY OWED-WORK SURFACE ENTIRELY.
	 *
	 * `classroom_sections.active` is 0083's archive flag -- soft state, keeping
	 * the roster, the stream and every graded record exactly as they were. RLS
	 * does not filter on it (`classroom_can_read_section` asks about management
	 * and enrollment, never about the archive), so without this last term's
	 * class kept its overdue rows forever, because archiving is exactly the
	 * thing that does not unenroll anybody.
	 *
	 * FILTERED HERE, ONCE, so the classes, the item read's `sectionIds` and every
	 * surface built on them name the same set. ABSENT READS AS ACTIVE, via
	 * `normalizeSectionRow`'s own default, which keeps this fail-open: a row that
	 * cannot say it is archived is not treated as one.
	 */
	const sections = sortSections(
		((sectionRows ?? []) as Record<string, unknown>[]).map(normalizeSectionRow).filter((s) => s.active)
	);
	const sectionIds = sections.map((s) => s.id);
	if (!sectionIds.length) return { ...empty(true), sections };

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

	const me = options.email.trim().toLowerCase();
	let submissions: FeedSubmission[] = [];
	if (items.length) {
		const { data: subRows } = await supabase
			.from('classroom_submissions')
			.select(WORK_SUBMISSION_SELECT)
			.in(
				'item_id',
				items.map((i) => i.id)
			);
		// A SCORE IS THE CALLER'S OWN OR IT IS NOT HERE. A teacher's read returns
		// every student's row (the to-grade tally needs them), and nothing on any
		// owed-work surface prints another person's score, so it is not carried.
		submissions = ((subRows ?? []) as FeedSubmission[]).map((row) =>
			(row.student_email ?? '').toLowerCase() === me ? row : { ...row, score: undefined }
		);
	}

	let checkIns: ClassCheckIn[] = [];
	let checkInsReady = false;
	if (options.checkIns) {
		const isAdmin = await options.isAdmin;
		const studentSectionIds = sections.filter((s) => !sectionManagedBy(s, me, isAdmin)).map((s) => s.id);
		if (studentSectionIds.length) {
			const postings = await readCheckInPostings(supabase, studentSectionIds);
			if (postings) {
				checkInsReady = true;
				// The guidance prompt is the class page's to render; an owed-work list
				// prints a label and a date, so the rich document is not carried.
				const rows = postings.rows.map(({ guidance_doc: _prompt, ...row }) => row);
				checkIns = await readOwnCheckIns(supabase, options.userId, rows, clock.today);
			}
		}
	}

	return { ready: true, sections, items, submissions, checkIns, checkInsReady, clock };
}
