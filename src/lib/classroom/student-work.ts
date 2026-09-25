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
import { SECTION_SELECT, htmlManifestShaped, selectItemsWithDoc } from '$lib/classroom/transports';
import { checkInIsScheduled, checkInStatus, type ClassCheckIn } from '$lib/classroom/class-check-ins';
import { sectionManagedBy, type FeedSubmission } from '$lib/classroom/feed';
import { laCalendarDay } from '$lib/classroom/school-calendar';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import { NOTEBOOK_POSTING_SELECTS } from '$lib/notebook-selects';
import { isHtmlAssignment } from '$lib/classroom/html-assignment/mount';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';
import {
	hxCompletion,
	type HxCompletionFile,
	type HxCompletionResponse
} from '$lib/classroom/html-assignment/progress';

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
// Ported worksheets: finishing one is turning it in (decision 37, ledger 0298)
// ---------------------------------------------------------------------------

/** One page of a paged read. PostgREST caps a response at `max_rows` (1000 on this project and on a hosted default). */
export const WORKSHEET_PAGE_ROWS = 1000;
/** The most rows a completeness read will page through before it gives up and reports "cannot tell". */
export const WORKSHEET_MAX_ROWS = 10 * WORKSHEET_PAGE_ROWS;

type PagedAnswer = PromiseLike<{ data: unknown; error: unknown; count?: number | null }>;

/**
 * EVERY ROW A QUERY MATCHES, NOT THE FIRST THOUSAND.
 *
 * A response PostgREST truncates at `max_rows` comes back with no error, and
 * for a completeness read that is the defect this bundle exists to fix, one
 * level down: a worksheet whose last answers fell past row 1000 reads as
 * unfinished. So the read pages, advancing by the rows it actually received
 * (a server capping lower than a page still loses nothing), stops on the exact
 * `count` when the server gives one and on a short page when it does not, and
 * answers NULL -- "cannot tell" -- on any error or past `maxRows`. Null is what
 * every caller turns into today's behaviour, never into "complete".
 */
export async function readAllPages<T>(
	page: (from: number, to: number) => PagedAnswer,
	maxRows = WORKSHEET_MAX_ROWS
): Promise<T[] | null> {
	const rows: T[] = [];
	for (;;) {
		const from = rows.length;
		const { data, error, count } = await page(from, from + WORKSHEET_PAGE_ROWS - 1);
		if (error) return null;
		const got = (Array.isArray(data) ? data : []) as T[];
		rows.push(...got);
		const total = typeof count === 'number' ? count : null;
		if (total !== null ? rows.length >= total : got.length < WORKSHEET_PAGE_ROWS) return rows;
		// The server says there is more and handed over nothing: a read that
		// cannot finish is not one to judge a student by.
		if (!got.length) return null;
		if (rows.length >= maxRows) return null;
	}
}

/** One stored answer, as the completeness read selects it. */
interface WorksheetResponseRow extends HxCompletionResponse {
	item_id: string;
	student_email: string;
}

/** One hand-in file, with the submission it hangs off. */
type WorksheetFileRow = HxCompletionFile & {
	classroom_submissions: { item_id: string; student_email: string } | null;
};

/**
 * The file columns the completeness read needs: `hxImagesFromFiles`' own
 * inputs plus `created_at`, which is 0086's own column (never a rung) and is
 * what says when a photograph arrived.
 */
const WORKSHEET_FILE_SELECT =
	'id, submission_id, block_id, caption, filename, mime_type, sort_order, created_at, classroom_submissions!inner(item_id, student_email)';

/** The key a (worksheet, student) pair is held under. Emails are compared lowercased, as 0086 stores them. */
export function worksheetKey(itemId: string, email: string): string {
	return `${itemId} ${email.trim().toLowerCase()}`;
}

/**
 * WHICH OF THESE ASSIGNMENTS ARE FINISHED PORTED WORKSHEETS, AND FOR WHOM, AND
 * WHEN: `worksheetKey(item, email)` to the instant `hxCompletion` gives, for
 * every pair whose worksheet is complete. NULL when any read could not answer,
 * which every caller renders as today's behaviour (the row's own state and
 * nothing more) -- never as complete.
 *
 * FOUR READS IN TWO ROUNDS, ONE PER TABLE, NO MATTER HOW MANY ITEMS. First the
 * item's own `assignment_schema_version` (the discriminator every rendering
 * surface reads, CLAUDE.md's ported-assignment rule) beside the manifests
 * (`classroom_html_assignments`, readable wherever the item is, 0195); then,
 * for the worksheets only, the answers and the photographs. A spec assignment
 * never pays for an answers read.
 *
 * EVERY READ RUNS AS THE CALLER, AND RLS DECIDES WHOSE ROWS COME BACK:
 * `classroom_responses` is own-row-or-reviewer, so a student receives their
 * own answers and a teacher their students'. ATTRIBUTION IS THE ROW'S OWN
 * `student_email`, grouped before anything is judged, so a classmate's answer
 * can never finish somebody else's worksheet.
 *
 * `onlyEmail` IS WHAT MAKES THIS AFFORDABLE, AND EVERY PAGE LOAD PASSES IT.
 * The policy is `student_email = current_user_email() or
 * classroom_can_review_submission(...)`, evaluated PER ROW, and without an
 * email filter the answers read visits every classmate's answer on the
 * worksheet to refuse it. Measured on the test cluster, one worksheet of 60
 * blocks posted to four classes of 30 (7,200 answers), three runs: the count
 * PostgREST runs beside a page took 8.1 to 8.8 seconds as a student with no
 * email filter and 2 to 3ms with one, and 3.6 to 3.9 seconds as an admin
 * reading everybody's. The filter is an index
 * condition on `(item_id, student_email)`, so the policy only ever sees the
 * caller's own rows. An unpinned read (the dev harness, the tests of
 * attribution) is for a fixture, never for a page.
 */
export async function readWorksheetCompletions(
	supabase: SupabaseClient,
	itemIds: readonly string[],
	options: { onlyEmail?: string | null } = {}
): Promise<Map<string, string> | null> {
	// A THROW IS "CANNOT TELL" TOO. This read decorates a page whose real
	// content is the list of classes; nothing it does may take that list down.
	try {
		return await worksheetCompletions(supabase, itemIds, options);
	} catch {
		return null;
	}
}

async function worksheetCompletions(
	supabase: SupabaseClient,
	itemIds: readonly string[],
	options: { onlyEmail?: string | null }
): Promise<Map<string, string> | null> {
	const ids = [...new Set(itemIds)];
	const out = new Map<string, string>();
	if (!ids.length) return out;

	const [versions, docs] = await Promise.all([
		supabase.from('classroom_items').select('id, assignment_schema_version').in('id', ids),
		supabase.from('classroom_html_assignments').select('item_id, manifest').in('item_id', ids)
	]);
	if (versions.error || docs.error) return null;
	const stamped = new Set(
		((versions.data ?? []) as { id: string; assignment_schema_version?: unknown }[])
			.filter((row) => isHtmlAssignment(row))
			.map((row) => row.id)
	);
	const manifests = new Map<string, HtmlAssignmentManifest>();
	for (const row of (docs.data ?? []) as { item_id: string; manifest: unknown }[]) {
		// A stamped item with a manifest this cannot map is one no answer could
		// be keyed back to: it stays out, and reads exactly as it did.
		if (stamped.has(row.item_id) && htmlManifestShaped(row.manifest)) manifests.set(row.item_id, row.manifest);
	}
	const worksheetIds = [...manifests.keys()];
	if (!worksheetIds.length) return out;

	const email = options.onlyEmail ? options.onlyEmail.trim().toLowerCase() : null;
	const [responses, files] = await Promise.all([
		readAllPages<WorksheetResponseRow>((from, to) => {
			let q = supabase
				.from('classroom_responses')
				.select('item_id, student_email, block_id, value, updated_at', { count: 'exact' })
				.in('item_id', worksheetIds);
			if (email) q = q.eq('student_email', email);
			return q.order('item_id').order('student_email').order('block_id').range(from, to);
		}),
		readAllPages<WorksheetFileRow>((from, to) => {
			let q = supabase
				.from('classroom_submission_files')
				.select(WORKSHEET_FILE_SELECT, { count: 'exact' })
				.in('classroom_submissions.item_id', worksheetIds)
				.not('block_id', 'is', null);
			if (email) q = q.eq('classroom_submissions.student_email', email);
			return q.order('id').range(from, to);
		})
	]);
	if (!responses || !files) return null;

	const answers = new Map<string, WorksheetResponseRow[]>();
	for (const row of responses) {
		const key = worksheetKey(row.item_id, row.student_email ?? '');
		const list = answers.get(key);
		if (list) list.push(row);
		else answers.set(key, [row]);
	}
	const photos = new Map<string, WorksheetFileRow[]>();
	for (const file of files) {
		const owner = file.classroom_submissions;
		if (!owner) continue;
		const key = worksheetKey(owner.item_id, owner.student_email ?? '');
		const list = photos.get(key);
		if (list) list.push(file);
		else photos.set(key, [file]);
	}
	for (const key of new Set([...answers.keys(), ...photos.keys()])) {
		const itemId = key.slice(0, key.indexOf(' '));
		const manifest = manifests.get(itemId);
		if (!manifest) continue;
		const done = hxCompletion(manifest, answers.get(key) ?? [], photos.get(key) ?? []);
		// Complete with no readable instant cannot happen through this read (both
		// selects carry the column); if it ever does, it is complete and not late.
		if (done.complete) out.set(key, done.at ?? '');
	}
	return out;
}

/**
 * THE COMPLETIONS, ON THE SUBMISSION ROWS EVERY OWED-WORK SURFACE ALREADY
 * READS, so the home page, My Classes, the to-do and the feed's tally take the
 * new input without a new parameter anywhere.
 *
 * A ROW THAT IS NOT A DRAFT IS LEFT ALONE: submitted (turned in or closed) and
 * returned already say where the work stands.
 *
 * A FINISHED WORKSHEET WITH NO ROW GETS ONE, and that is the common case
 * rather than an edge: `classroom_save_response` never creates a submission
 * row (only a file, a grade, a submit or a close does), so a worksheet with
 * every answer typed and no photograph has no row at all. The row added is a
 * `draft` -- which is exactly what the absence of a row already meant to every
 * reader of this list (`FeedSubmission`'s own doc) -- carrying `completed_at`.
 * Nothing on it is invented: no score, no timestamps.
 */
export function withWorksheetCompletions<T extends { item_id: string; student_email?: string | null; state: string }>(
	rows: readonly T[],
	completions: ReadonlyMap<string, string> | null,
	blank: (itemId: string, email: string) => T
): T[] {
	if (!completions || !completions.size) return [...rows];
	const seen = new Set<string>();
	const out = rows.map((row) => {
		const key = worksheetKey(row.item_id, row.student_email ?? '');
		seen.add(key);
		const at = completions.get(key);
		return at !== undefined && row.state === 'draft' ? { ...row, completed_at: at } : row;
	});
	for (const [key, at] of completions) {
		if (seen.has(key)) continue;
		const space = key.indexOf(' ');
		out.push({ ...blank(key.slice(0, space), key.slice(space + 1)), completed_at: at });
	}
	return out;
}

/**
 * The assignments a completeness read is worth making for, out of a list of
 * items: the assignments in a class the caller TAKES. Which of them are
 * worksheets is the read's own first question.
 *
 * NEVER THE CLASSES THEY TEACH (ledger 0298, the review of this bundle). The
 * teacher's to-grade tally would need every student's answers on every
 * worksheet, and under the per-row policy that is the multi-second count above
 * for ONE worksheet, paid again beside every page of the read, on the home page
 * Mr. Pina opens at the start of every period. The tally counts a finished
 * worksheet the day a loader can afford to hand it one (a definer function
 * answering per item, decision 37's migration half); until then it counts what
 * it always counted, and the grading console's roster, which already holds
 * that one item's answers, says Complete.
 */
export function worksheetCandidates(
	items: readonly ClassroomItem[],
	takes: (item: ClassroomItem) => boolean
): string[] {
	return items.filter((item) => item.kind === 'assignment' && takes(item)).map((item) => item.id);
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

	const isAdmin = await options.isAdmin;

	/**
	 * FINISHED PORTED WORKSHEETS (decision 37, ledger 0298). A worksheet has no
	 * turn-in, so without this every one of them read "Missing" from its due
	 * instant until a grade was returned, on this list and on every surface
	 * built from it. The read is `readWorksheetCompletions`, PINNED TO THE
	 * CALLER (see its header for what an unpinned one costs), over the
	 * worksheets in the classes they take; the rows it adds or marks are
	 * `withWorksheetCompletions`'s; a read that cannot answer changes nothing.
	 * It runs beside the check-in reads, which need nothing from it.
	 */
	const readCompletions = async (): Promise<Map<string, string> | null> => {
		if (!items.length || !me) return null;
		const managed = new Set(sections.filter((s) => sectionManagedBy(s, me, isAdmin)).map((s) => s.id));
		// A worksheet of mine that is already turned in, closed or handed back
		// says where it stands on its own row; only an open one is worth a read.
		const settled = new Set(
			submissions
				.filter((s) => (s.student_email ?? '').toLowerCase() === me && s.state !== 'draft')
				.map((s) => s.item_id)
		);
		const candidates = worksheetCandidates(
			items,
			(item) =>
				!settled.has(item.id) &&
				item.postings.some((p) => sectionIds.includes(p.section_id) && !managed.has(p.section_id))
		);
		if (!candidates.length) return null;
		return readWorksheetCompletions(supabase, candidates, { onlyEmail: me });
	};

	const readCheckIns = async (): Promise<{ checkIns: ClassCheckIn[]; ready: boolean }> => {
		if (!options.checkIns) return { checkIns: [], ready: false };
		const studentSectionIds = sections.filter((s) => !sectionManagedBy(s, me, isAdmin)).map((s) => s.id);
		if (!studentSectionIds.length) return { checkIns: [], ready: false };
		const postings = await readCheckInPostings(supabase, studentSectionIds);
		if (!postings) return { checkIns: [], ready: false };
		// The guidance prompt is the class page's to render; an owed-work list
		// prints a label and a date, so the rich document is not carried.
		const rows = postings.rows.map(({ guidance_doc: _prompt, ...row }) => row);
		return { checkIns: await readOwnCheckIns(supabase, options.userId, rows, clock.today), ready: true };
	};

	const [completions, own] = await Promise.all([readCompletions(), readCheckIns()]);
	submissions = withWorksheetCompletions(submissions, completions, (item_id, student_email) => ({
		item_id,
		student_email,
		state: 'draft',
		submitted_at: null,
		returned_at: null,
		graded_at: null
	}));
	const checkIns = own.checkIns;
	const checkInsReady = own.ready;

	return { ready: true, sections, items, submissions, checkIns, checkInsReady, clock };
}
