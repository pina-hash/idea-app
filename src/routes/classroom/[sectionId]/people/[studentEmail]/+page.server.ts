import { error, redirect } from '@sveltejs/kit';
import { studentEmailParam } from '$lib/classroom/nav';
import { studentToken } from '$lib/classroom/grading-student-url';
import { loadSectionRoster, SUBMISSION_FILE_SELECT } from '$lib/classroom/transports';
import { isSubmissionFileImage, submissionFileSrc, type SubmissionFileRow } from '$lib/classroom/assignment-spec';
import { photoSrc } from '$lib/notebook';
import { photoThumbSrc } from '$lib/notebook-folders';
import { laCalendarDay } from '$lib/classroom/school-calendar';
import { timelineDayLabel } from '$lib/notebook/timeline';
import { readAllPages, readWorksheetCompletions } from '$lib/classroom/student-work';
import { createTeamTransports } from '$lib/classroom/teams';
import { classDayStreak } from '$lib/notebook/timeline';
import type { SectionGrid } from '$lib/notebook-review';
import {
	buildStudentPage,
	parseStudentOverview,
	studentGallery,
	type GalleryNotebookPhoto,
	type GallerySubmissionFile,
	type SourceState,
	type StudentOverviewPayload,
	type StudentPresenceRow,
	type StudentSubmissionRow
} from '$lib/classroom/student-overview';
import type { PageServerLoad } from './$types';

/**
 * ONE STUDENT'S PAGE IN ONE CLASS (the 2026-10-07 round, reports 792eb6b1 and
 * 63fb1c49): their work, their notebook, the activity this class recorded,
 * and a printout for a parent conference. Manager-only, and read-only: no
 * write, no transport, no poll.
 *
 * EVERY REFUSAL IS THE SAME 404, NEVER A 403 OR A REDIRECT, exactly as People
 * and Grades: not a manager of this class, a malformed address, an address with
 * no enrollment row here, and an address that MANAGES the class (0138: a
 * manager is never a student row). The gate is the section layout's own
 * `canManage` (`classroom_manages_section`), asked once there; the roster row
 * is the one roster read, `loadSectionRoster`.
 *
 * EVERY READ RUNS AS THE CALLER AND CARRIES AN ATTRIBUTION FILTER. RLS rightly
 * hands a manager the whole class's submissions, presence rows and IdeaCAD
 * documents, so each read here is pinned to the one student by
 * `.eq('student_email', ...)` (or the student's uuid), which is attribution
 * and not authorization (CLAUDE.md's read-path rule). The completeness read is
 * pinned the same way, which is what keeps it as cheap as the student's own.
 *
 * ONLY THIS STUDENT'S SLICE LEAVES THE SERVER. The notebook grid, the team
 * board and the roster each carry the whole class; `buildStudentPage` reduces
 * them to one student before anything is returned, because a load's answer is
 * serialized into the browser and the page is printed for a parent.
 *
 * EACH SOURCE FAILS SOFT TO ITS OWN SECTION SAYING SO. A load must never fail
 * over one widget, and a source that could not answer says that in words
 * rather than rendering an empty list that reads as "nothing happened".
 */
export const load: PageServerLoad = async ({ params, parent, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');
	const email = studentEmailParam(params.studentEmail);
	if (!email) error(404, 'Not found');

	const { canManage, items, checkIns, classClock } = await parent();
	if (canManage !== true) error(404, 'Not found');

	const roster = await loadSectionRoster(supabase, params.sectionId);
	const row = roster.ok ? roster.data.rows.find((r) => r.student_email.toLowerCase() === email) : undefined;
	if (!row || row.manages === true) error(404, 'Not found');

	const itemIds = items.map((i) => i.id);
	const assignmentIds = items.filter((i) => i.kind === 'assignment').map((i) => i.id);

	const [overviewRead, submissionsRead, presenceRead, gridRead, board, ideacadRead] = await Promise.all([
		supabase.rpc('classroom_student_overview', { p_section_id: params.sectionId, p_student_email: email }),
		assignmentIds.length
			? supabase
					.from('classroom_submissions')
					.select('id, item_id, student_email, state, score, submitted_at, returned_at, graded_at')
					.eq('student_email', email)
					.in('item_id', assignmentIds)
			: Promise.resolve({ data: [], error: null }),
		assignmentIds.length
			? supabase
					.from('classroom_presence')
					.select('item_id, first_seen_at, last_seen_at, last_input_at, active_seconds')
					.eq('student_email', email)
					.in('item_id', assignmentIds)
			: Promise.resolve({ data: [], error: null }),
		supabase.rpc('notebook_get_section_grid', { p_section_id: params.sectionId, p_unit_number: null }),
		createTeamTransports(supabase)
			.board(params.sectionId)
			.catch(() => null),
		readIdeaCadDocuments(supabase, email, itemIds)
	]);

	/*
	 * PGRST202 IS THE ONE "NOT YET": a database without 0233 has no such read,
	 * and the page says the section arrives with the next update. Any other
	 * failure, a NULL (the read refusing a student the roster lists) and a
	 * payload that does not parse are all "could not load", never "not yet".
	 */
	const overview: StudentOverviewPayload | null = overviewRead.error ? null : parseStudentOverview(overviewRead.data);
	const overviewState: SourceState = overview
		? 'ready'
		: (overviewRead.error as { code?: string } | null)?.code === 'PGRST202'
			? 'unavailable'
			: 'error';

	const submissions = submissionsRead.error ? null : ((submissionsRead.data ?? []) as StudentSubmissionRow[]);
	const presence = presenceRead.error ? null : ((presenceRead.data ?? []) as StudentPresenceRow[]);

	// Only an open worksheet is worth the completeness read: a turned-in, closed
	// or returned one already says where it stands (the section layout's rule).
	const settled = new Set((submissions ?? []).filter((s) => s.state !== 'draft').map((s) => s.item_id));
	const completions = await readWorksheetCompletions(
		supabase,
		assignmentIds.filter((id) => !settled.has(id)),
		// A manager's read of the stamped latches (0237): a finished worksheet stays finished here too.
		{ onlyEmail: email, latches: { sectionId: params.sectionId } }
	);

	const gridState: SourceState = gridRead.error
		? (gridRead.error as { code?: string }).code === 'PGRST202'
			? 'unavailable'
			: 'error'
		: gridRead.data
			? 'ready'
			: 'error';
	const grid = gridState === 'ready' ? (gridRead.data as SectionGrid) : null;

	const userId =
		overview?.userId ??
		grid?.students.find((s) => (s.email ?? '').toLowerCase() === email)?.id ??
		null;

	const [entries, foundry] = await Promise.all([
		userId ? readTurnedInEntries(supabase, userId, params.sectionId) : Promise.resolve([] as EntryRow[]),
		userId ? readFoundryApps(supabase, userId) : Promise.resolve([] as { id: string; slug: string; title: string }[])
	]);

	/*
	 * THEIR WORK AS PICTURES (ledger 0392): the hand-in files hanging off THIS
	 * student's submission rows, and the photos on notebook entries they turned
	 * in to this class. Both reads are the caller's own, pinned to rows already
	 * attributed to the one student, and both pictures are served by the proxies
	 * a thumbnail already uses, which re-ask the same policies.
	 */
	const [files, photos] = await Promise.all([
		readSubmissionFiles(supabase, (submissions ?? []).map((s) => s.id).filter((id): id is string => typeof id === 'string')),
		entries ? readNotebookPhotos(supabase, entries.map((e) => e.id)) : Promise.resolve(null)
	]);
	const labels = new Map(checkIns.map((c) => [c.session_id, c.session_label]));
	const gallery =
		files === null && photos === null
			? null
			: studentGallery({
					items,
					submissions: submissions ?? [],
					files: files ?? [],
					isImage: (f) => isSubmissionFileImage(f as unknown as SubmissionFileRow),
					fileSrc: submissionFileSrc,
					photos: photos ?? [],
					entries: new Map(
						(entries ?? []).map((e) => [
							e.id,
							{ at: e.submitted_at ?? e.upload_timestamp, label: e.session_id ? (labels.get(e.session_id) ?? null) : null }
						])
					),
					photoSrc,
					photoThumb: photoThumbSrc,
					day: (iso) => (iso ? timelineDayLabel(laCalendarDay(new Date(iso)), classClock.today) : '')
				});

	const studentPage = buildStudentPage({
		email,
		roster: {
			display_name: row.display_name,
			active: row.active,
			avatar: (row as { avatar?: string | null }).avatar ?? null,
			avatar_url: (row as { avatar_url?: string | null }).avatar_url ?? null
		},
		items,
		now: classClock.now,
		overview: { state: overviewState, value: overview },
		submissions,
		presence,
		completions,
		grid: { state: gridState, value: grid },
		streak: entries
			? classDayStreak(
					entries,
					checkIns.map((c) => ({ session_id: c.session_id, session_date: c.session_date })),
					classClock.today
				)
			: null,
		entriesFiled: entries ? entries.length : null,
		board,
		ideacad: ideacadRead,
		foundry,
		gallery
	});

	/**
	 * THE GRADING CONSOLE'S OPAQUE STUDENT TOKEN, ONE PER ASSIGNMENT ROW (report
	 * 5464ceb2): the console keeps the student being graded in its address as
	 * `studentToken(itemId, email)` and never as the address, so the key on
	 * each row carries the same token and the console opens on this student.
	 * Computed here, once, because the hash is async and the component is pure.
	 */
	const gradeTokens: Record<string, string> = {};
	await Promise.all(
		studentPage.assignments.map(async (row) => {
			gradeTokens[row.itemId] = await studentToken(row.itemId, email);
		})
	);

	return { student: studentPage.student, studentPage, gradeTokens };
};

type EntryRow = { id: string; session_id: string | null; upload_timestamp: string; submitted_at: string | null };

/**
 * THE FILES ON THEIR SUBMISSION ROWS, for the gallery. The storage key rides
 * its own rung (0133): without it a storage-backed picture cannot be told from
 * a CAD file, so the narrow rung's rows simply read as their recorded type.
 * Null when neither rung answers, which the page says rather than showing an
 * empty gallery as "no pictures".
 */
async function readSubmissionFiles(
	supabase: App.Locals['supabase'],
	submissionIds: string[]
): Promise<GallerySubmissionFile[] | null> {
	if (!submissionIds.length) return [];
	for (const cols of [`${SUBMISSION_FILE_SELECT}, storage_key`, SUBMISSION_FILE_SELECT]) {
		const res = await supabase
			.from('classroom_submission_files')
			.select(cols)
			.in('submission_id', submissionIds)
			.order('created_at', { ascending: false })
			.limit(400);
		if (!res.error) return (res.data ?? []) as unknown as GallerySubmissionFile[];
	}
	return null;
}

/** The photos on their turned-in entries in this class. Null when the read failed. */
async function readNotebookPhotos(
	supabase: App.Locals['supabase'],
	entryIds: string[]
): Promise<GalleryNotebookPhoto[] | null> {
	if (!entryIds.length) return [];
	const res = await supabase
		.from('notebook_entry_photos')
		.select('id, entry_id, variant, sequence_order, created_at')
		.in('entry_id', entryIds.slice(0, 300))
		.order('created_at', { ascending: false })
		.limit(400);
	return res.error ? null : ((res.data ?? []) as GalleryNotebookPhoto[]);
}

/** Postgres's undefined-column code: the one failure a narrower rung answers. */
const UNDEFINED_COLUMN = '42703';

/**
 * THE STUDENT'S TURNED-IN ENTRIES IN THIS CLASS, PAGED, for the streak and the
 * count. Staff RLS on `notebook_entries` already withholds drafts (0118); the
 * `submitted_at` filter says so out loud. Paged through `readAllPages`, the
 * completeness pager, so a read cut short answers null ("could not load")
 * rather than a smaller streak. The deleted filter rides a rung of its own
 * (0116), so a database without the column still answers -- and ONLY that:
 * the narrower rung runs on `42703` (an undefined column) alone, because any
 * other failure on the wide rung (a timeout, a dropped connection) retried
 * without the filter would count soft-deleted entries in the streak.
 */
async function readTurnedInEntries(
	supabase: App.Locals['supabase'],
	studentId: string,
	sectionId: string
): Promise<EntryRow[] | null> {
	for (const excludeDeleted of [true, false]) {
		let code: unknown = null;
		const rows = await readAllPages<EntryRow>(async (from, to) => {
			let q = supabase
				.from('notebook_entries')
				.select('id, session_id, upload_timestamp, submitted_at', { count: 'exact' })
				.eq('student_id', studentId)
				.eq('section_id', sectionId)
				.not('submitted_at', 'is', null);
			if (excludeDeleted) q = q.is('deleted_at', null);
			const answer = await q.order('id').range(from, to);
			if (answer.error) code = (answer.error as { code?: unknown }).code ?? null;
			return answer;
		});
		if (rows) return rows;
		if (code !== UNDEFINED_COLUMN) return null;
	}
	return null;
}

/**
 * THE MODELS THEY BUILT FOR THIS CLASS'S ITEMS, as titles and dates only. The
 * select is a ladder: `title` (0216) and `archived_at` (0214) on the wide rung,
 * the original columns on the narrow one, so a database between them still
 * lists the documents. One row per item per student, so it cannot approach
 * PostgREST's row cap.
 */
async function readIdeaCadDocuments(
	supabase: App.Locals['supabase'],
	email: string,
	itemIds: string[]
): Promise<{ id: string; item_id: string | null; title: string | null; updated_at: string | null; archived_at: string | null }[] | null> {
	if (!itemIds.length) return [];
	for (const cols of ['id, item_id, title, updated_at, archived_at', 'id, item_id, updated_at']) {
		const res = await supabase
			.from('ideacad_documents')
			.select(cols)
			.eq('student_email', email)
			.in('item_id', itemIds)
			.order('updated_at', { ascending: false });
		if (!res.error) {
			return ((res.data ?? []) as unknown as Record<string, unknown>[]).map((d) => ({
				id: String(d.id),
				item_id: typeof d.item_id === 'string' ? d.item_id : null,
				title: typeof d.title === 'string' ? d.title : null,
				updated_at: typeof d.updated_at === 'string' ? d.updated_at : null,
				archived_at: typeof d.archived_at === 'string' ? d.archived_at : null
			}));
		}
	}
	return null;
}

/**
 * APPS OF THEIRS THE CALLER CAN SEE IN THE FOUNDRY GALLERY: the gallery's own
 * list read with an owner, so there is no second population rule. Titles only.
 * NEVER WHAT THEY PLAYED: nobody reads another named student's play data,
 * admin included (decisions 05 and 07). An empty answer is not "published
 * nothing" (the Foundry is section-gated and has an off switch), so the page
 * omits the list rather than saying so.
 */
async function readFoundryApps(
	supabase: App.Locals['supabase'],
	ownerId: string
): Promise<{ id: string; slug: string; title: string }[] | null> {
	const { data, error: err } = await supabase.rpc('foundry_list_apps', { p_owner: ownerId });
	if (err) return null;
	return ((data ?? []) as Record<string, unknown>[])
		.filter((a) => typeof a.id === 'string' && typeof a.slug === 'string' && a.published_version_id)
		.map((a) => ({ id: a.id as string, slug: a.slug as string, title: String(a.title ?? a.slug) }));
}
