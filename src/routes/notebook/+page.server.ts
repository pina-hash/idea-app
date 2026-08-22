import { redirect } from '@sveltejs/kit';
import { driveConfigured } from '$lib/server/notebook-drive';
import { notebookAccess } from '$lib/server/notebook-access';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import type { NotebookDeletedEntry, NotebookEntry, NotebookSession } from '$lib/notebook';
import {
	NOTEBOOK_DELETED_SELECT,
	NOTEBOOK_ENTRY_SELECTS,
	NOTEBOOK_POSTING_SELECTS,
	NOTEBOOK_SESSION_SELECT,
	NOTEBOOK_SESSION_SELECTS
} from '$lib/notebook-selects';
import type { NotebookFolder } from '$lib/notebook-folders';
import type { PageServerLoad } from './$types';

/**
 * The student-facing digital notebook.
 *
 * OPEN TO ANY SIGNED-IN ACCOUNT, deliberately: a notebook is a personal
 * record, so a teacher keeping one of their own is a normal thing to do and
 * there is no role check on the personal half of this page (unlike
 * /coin-balance, which is genuinely student-only). Anonymous visitors are
 * turned away by hooks.server.ts (the '/notebook' authed prefix); the
 * redirect here is belt-and-braces for a direct load.
 *
 * EVERY read runs as the CALLER'S OWN session (locals.supabase) with NO
 * `.eq('student_id', ...)` filter: 0069 already grants a signed-in user
 * SELECT on their own notebook_entries and (via notebook_can_read_entry)
 * their photos, so the filtering IS the RLS policy rather than application
 * code -- the /coin-balance doctrine. No RPC is called at all on this page;
 * the ones that exist (notebook_create_entry / notebook_add_photo) are
 * reached only through the two API routes, untouched by this session.
 *
 * FAILING SOFT IS PER CAPABILITY, NOT ONE BOOLEAN FOR THE WHOLE PAGE. Only
 * `configured` hides the notebook, and it is decided on the NARROWEST probe
 * there is -- 0069's own scalar columns, no embedded resource of any kind --
 * so it can only ever mean what the card it drives claims: the notebook tables
 * are not there. Everything layered on top (photos, notes, folders, pins,
 * check-ins) reports itself, and a broken one costs that feature and says so.
 *
 * That split is the lesson from a real false negative: a single `configured`
 * derived from a select that embedded `notebook_sessions` reported "the
 * notebook tables are not in place" on a fully-migrated project, because 0098
 * had repointed the key that embed resolved through (see $lib/notebook-selects).
 * One stale probe blanked a working feature.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const access = await notebookAccess(supabase, claims.sub, claims.email as string | undefined);

	/**
	 * WIDEST FIRST, DROPPING ONE CAPABILITY PER RUNG. Migrations here are
	 * applied by hand, so a deploy sitting between two of them is a real state,
	 * not a hypothetical one -- and an unknown column or an unresolvable embed
	 * fails the WHOLE select, so a single wide read would blank a notebook full
	 * of perfectly readable entries over one missing extra. The rungs and what
	 * each one adds live in $lib/notebook-selects.
	 *
	 * THE DELETED FILTER RIDES ONLY THE RUNGS THAT CARRY THE COLUMN (0116).
	 * `deleted_at` does not exist on a project without 0116, and PostgREST fails
	 * a select for an unknown column in a FILTER exactly as it does for one in
	 * the column list -- so applying `.is('deleted_at', null)` unconditionally
	 * would fail every rung, the scalar probe `configured` is decided on
	 * included, and report a fully working notebook as missing. That is the 0098
	 * failure verbatim.
	 *
	 * WHICH RUNGS THOSE ARE IS THE RUNG'S OWN `excludeDeleted`, NOT SOMETHING
	 * DERIVED HERE. This asked `capability === 'deletion'` until 0118 added a
	 * wider rung above it, which then carried `deleted_at` and quietly stopped
	 * filtering on it -- deleted entries back in the feed, no error anywhere.
	 * See $lib/notebook-selects.
	 */
	const read = (select: string, excludeDeleted: boolean) => {
		const query = supabase
			.from('notebook_entries')
			.select(select)
			.order('upload_timestamp', { ascending: false });
		return excludeDeleted ? query.is('deleted_at', null) : query;
	};

	let entryRows: unknown[] | null = null;
	let entryError: unknown = null;
	/**
	 * Every capability starts unavailable and is turned ON by the rung that
	 * carries it succeeding -- so a capability can only be reported present
	 * because a read that actually included it came back, never by default.
	 */
	const ready: Record<string, boolean> = {
		history: false,
		drafts: false,
		deletion: false,
		pins: false,
		folders: false,
		notes: false,
		photos: false
	};
	for (const rung of NOTEBOOK_ENTRY_SELECTS) {
		const result = await read(rung.select, rung.excludeDeleted);
		entryRows = result.data as unknown[] | null;
		entryError = result.error;
		if (!entryError) {
			// This rung carries its own capability and every narrower one below it.
			let reached = false;
			for (const r of NOTEBOOK_ENTRY_SELECTS) {
				if (r === rung) reached = true;
				if (reached && r.capability) ready[r.capability] = true;
			}
			break;
		}
	}

	/**
	 * The ONLY thing that hides the page, and it is answered by the last rung:
	 * 0069's own columns, no embed. False here means `notebook_entries` itself
	 * is unreadable, which is exactly what the card says.
	 */
	const configured = !entryError;
	const photosReady = ready.photos;
	let notesReady = ready.notes;
	let foldersReady = ready.folders;
	let pinsReady = ready.pins;
	/**
	 * Whether deleted entries and removed photos are being EXCLUDED, which is the
	 * same question as whether 0116 is applied. False means the notebook renders
	 * exactly as it did before 0116, which is correct: nothing can be marked
	 * deleted on a database with no column to mark it in.
	 */
	const deletionReady = ready.deletion;
	/**
	 * Whether an entry can be a DRAFT at all (0118), which is the same question
	 * as whether the widest rung came back. False means every entry is turned in
	 * -- correct, because on a database with no `submitted_at` column there was
	 * never any other way to make one.
	 */
	const draftsReady = ready.drafts;
	/**
	 * Whether a note can be DELETED and an entry can show a HISTORY (0119) --
	 * one question, because both come from the same migration and neither can be
	 * present without the other.
	 *
	 * False means the notebook renders exactly as it did before 0119: every note
	 * live, no removed-notes disclosure, no timeline. Correct on a database with
	 * no column to mark a note in -- and note that this is the flag a SURFACE
	 * asks, never the thing that keeps a deleted note out of the feed. That is
	 * `noteThreads`, which drops a marked row wherever one turns up and needs no
	 * flag at all.
	 */
	const historyReady = ready.history;

	const entries: NotebookEntry[] = (entryRows ?? []).map((r) => {
		const row = r as unknown as Record<string, unknown>;
		return {
			id: row.id as string,
			session_id: (row.session_id as string | null) ?? null,
			section_id: (row.section_id as string | null) ?? null,
			folder_id: (row.folder_id as string | null) ?? null,
			pinned_at: (row.pinned_at as string | null) ?? null,
			custom_label: (row.custom_label as string | null) ?? null,
			upload_timestamp: row.upload_timestamp as string,
			/**
			 * NOT `?? null` (0118), and the difference is the whole failure this
			 * guards against. On a rung without the column the value is
			 * `undefined`, and defaulting that to null would report EVERY entry
			 * on a pre-0118 project as an unturned-in draft -- a notebook full of
			 * turned-in work suddenly reading as nothing handed in. So the fall
			 * back is the entry's own upload stamp, which is exactly what 0118's
			 * backfill writes for the same rows.
			 */
			submitted_at: draftsReady
				? ((row.submitted_at as string | null) ?? null)
				: (row.upload_timestamp as string),
			status: row.status as NotebookEntry['status'],
			/**
			 * NOT `?? null` (0119), for the reason `submitted_at` above is not
			 * either: `undefined` on a narrower rung means the column was never
			 * asked for, and flattening that to null would tell the timeline that
			 * nobody has ever reviewed the entry. Left `undefined` there, so the
			 * history emits no review event rather than a wrong one.
			 */
			reviewed_at: historyReady ? ((row.reviewed_at as string | null) ?? null) : undefined,
			flag_reason: (row.flag_reason as NotebookEntry['flag_reason']) ?? null,
			instructor_comment: (row.instructor_comment as string | null) ?? null,
			// Filled in below from its own read, never an embed: since 0098 there
			// is no foreign key between notebook_entries and notebook_sessions for
			// PostgREST to resolve one through.
			session: null,
			// Removed photos (0116) are dropped by `livePhotos` at every render,
			// count and copy site rather than here, so a surface that reads
			// `entry.photos` straight cannot miss the filter. A read on a narrower
			// rung carries no `removed_at` at all, and every photo is live.
			photos: (row.notebook_entry_photos as NotebookEntry['photos']) ?? [],
			// Every revision, not just the current one: the feed shows a note's
			// history, and which revision counts is derived (noteThreads), never
			// stored. Photo visibility and note visibility both delegate to
			// notebook_can_read_entry, so this needs no filter of its own.
			//
			// DELETED NOTES (0119) ARE CARRIED THROUGH HERE UNFILTERED, exactly
			// as removed photos are one line up, and dropped by `noteThreads` at
			// every render, count, title and copy site -- so a surface reading
			// `entry.notes` straight cannot miss the filter, and the one surface
			// that WANTS them (`deletedNoteThreads`, for the removed-notes
			// disclosure and the entry history) still has them to read. A read on
			// a narrower rung carries no `deleted_at` at all, and every note is
			// live.
			notes: (row.notebook_entry_notes as NotebookEntry['notes']) ?? []
		};
	});

	/**
	 * WHICH CHECK-IN EACH LINKED ENTRY WAS FILED AGAINST -- a SEPARATE read,
	 * and it has to be one.
	 *
	 * This used to ride the entry select as `notebook_sessions ( ... )`, which
	 * PostgREST resolved through the composite key `notebook_entries` carried to
	 * `notebook_sessions (id, section_id)`. 0098 repointed that key at
	 * `notebook_session_postings`, leaving no key between the two tables at all,
	 * so the embed became unresolvable and took every rung of the chain above
	 * down with it. Read on its own it cannot: `notebook_sessions` is readable
	 * by any signed-in user (0069, `using (true)`), so this is a plain
	 * RLS-scoped select and the id list is a payload bound, not a privacy one.
	 */
	let sessionsReady = configured;
	if (configured) {
		const linkedIds = [
			...new Set(entries.map((e) => e.session_id).filter((id): id is string => Boolean(id)))
		];
		if (linkedIds.length) {
			/**
			 * TWO RUNGS (0123), widest first. The guidance prompt is a column a
			 * project between 0122 and 0123 does not have, and PostgREST rejects
			 * the WHOLE select for one it does not know -- which would take the
			 * check-in LABEL down with it and leave every filed entry unnamed. The
			 * narrow rung is byte-identical to what this load read before, so
			 * degrading costs the prompt and nothing else.
			 *
			 * The prompt is read THROUGH the check-in, by id, on every load. It is
			 * never copied onto the entry: an instructor who corrects an unclear
			 * instruction has to correct it for the students who already answered
			 * the unclear one, and a snapshot taken at filing time cannot.
			 */
			let sessionRows: unknown[] | null = null;
			let sessionError: unknown = null;
			for (const rung of NOTEBOOK_SESSION_SELECTS) {
				const res = await supabase
					.from('notebook_sessions')
					.select(rung.select)
					.in('id', linkedIds);
				sessionError = res.error;
				if (!res.error) {
					sessionRows = (res.data ?? []) as unknown[];
					break;
				}
			}
			if (sessionError && !sessionRows) sessionsReady = false;
			else {
				const byId = new Map(
					((sessionRows ?? []) as unknown as {
						id: string;
						session_label: string;
						unit_number: number;
						session_date: string;
						guidance_doc?: ItemDoc | null;
					}[]).map((s) => [
						s.id,
						{
							session_label: s.session_label,
							unit_number: s.unit_number,
							session_date: s.session_date,
							// Undefined on the narrow rung, which is not the same claim as
							// null ("this check-in has no prompt") and is left as it is.
							guidance_doc: s.guidance_doc
						}
					])
				);
				for (const entry of entries) {
					entry.session = entry.session_id ? (byId.get(entry.session_id) ?? null) : null;
				}
			}
		}
	}

	/**
	 * The student's scheduled check-ins, from their REAL classes (0094).
	 *
	 * This replaces the loose 0003/0069 model, where enrollment was
	 * profiles.section_id -- a free-form curriculum string the student picked
	 * themselves -- matched against a notebook_sections.course_id. It is a
	 * roster now: their teacher enrolled them.
	 *
	 * NO `.eq()` ON EITHER SELECT, and that is deliberate rather than lax.
	 * 0082's "classroom sections readable to members" already scopes
	 * classroom_sections to sections the caller manages or is actively enrolled
	 * in, so the filtering IS the RLS policy -- the same /coin-balance doctrine
	 * the entry select above follows. A teacher reading their own notebook
	 * legitimately gets their own sections' check-ins here too.
	 *
	 * Both reads are part of the SAME capability as the labels above -- "your
	 * classes and their check-ins" -- so a failure in either says so through
	 * `sessionsReady` rather than being swallowed into an empty list.
	 */
	let sessions: NotebookSession[] = [];
	let sectionLabel: string | null = null;
	if (configured) {
		const { data: sectionRows, error: sectionError } = await supabase
			.from('classroom_sections')
			.select('id, label, classroom_courses ( code )');
		if (sectionError) sessionsReady = false;

		interface SectionRow {
			id: string;
			label: string;
			classroom_courses: { code: string } | { code: string }[] | null;
		}
		const rows = (sectionRows ?? []) as SectionRow[];

		// The header chip. It used to name the student's SELF-SELECTED pathway
		// year (profiles.section_id through curriculum.ts); it names their real
		// classes now, which is what the check-ins below actually come from.
		const names = rows.map((r) => {
			const course = Array.isArray(r.classroom_courses)
				? r.classroom_courses[0]
				: r.classroom_courses;
			return [course?.code, r.label].filter(Boolean).join(' · ');
		});
		sectionLabel =
			names.length === 0 ? null : names.length === 1 ? names[0] : `${names.length} classes`;

		const sectionIds = rows.map((r) => r.id);
		if (sectionIds.length) {
			// Since 0098 a check-in is a canonical record plus one posting per
			// section, so the student's own classes are matched through the
			// POSTING -- which is also what carries the section this entry will
			// be filed under when a shared check-in runs in more than one of
			// them. `!inner` makes the posting the row, so a check-in shared
			// with a class they are not in still arrives named for theirs.
			/**
			 * THREE RUNGS, widest first. The composer reads the GUIDANCE PROMPT off
			 * this list -- it is what the student sees above the entry they are
			 * about to file -- so 0123's column rides the widest one. Below it the
			 * ladder is exactly what it was: the check-ins still arrive, still
			 * named for the student's own class, with no prompt to show.
			 *
			 * `item_id` is not read here and never was: which classroom item a
			 * check-in hangs off is the CLASS page's question, not the notebook's.
			 * The rung carries it because the select string is shared; this load
			 * simply ignores the field.
			 */
			let postingRows: unknown[] | null = null;
			let postingError: unknown = null;
			for (const rung of NOTEBOOK_POSTING_SELECTS) {
				const res = await supabase
					.from('notebook_session_postings')
					.select(rung.select)
					.in('section_id', sectionIds)
					.order('session_date', { ascending: false, referencedTable: 'notebook_sessions' });
				postingError = res.error;
				if (!res.error) {
					postingRows = (res.data ?? []) as unknown[];
					break;
				}
			}
			if (postingError && !postingRows) sessionsReady = false;

			interface PostingRow {
				section_id: string;
				notebook_sessions: {
					id: string;
					unit_number: number;
					session_date: string;
					session_label: string;
					guidance_doc?: ItemDoc | null;
				} | null;
			}
			sessions = ((postingRows ?? []) as unknown as PostingRow[])
				.filter((r): r is PostingRow & { notebook_sessions: NonNullable<PostingRow['notebook_sessions']> } =>
					Boolean(r.notebook_sessions)
				)
				.map((r) => ({
					id: r.notebook_sessions.id,
					section_id: r.section_id,
					unit_number: r.notebook_sessions.unit_number,
					session_date: r.notebook_sessions.session_date,
					session_label: r.notebook_sessions.session_label,
					guidance_doc: r.notebook_sessions.guidance_doc
				}))
				.sort((a, b) => b.session_date.localeCompare(a.session_date));
		}
	}

	/**
	 * The caller's own folders (0088). A plain RLS-scoped select with no
	 * `.eq('student_id', ...)`: "students read own notebook folders" is what
	 * does the filtering, exactly as it does for entries above. An error here
	 * means 0088 is not applied, which is already known from the entry select
	 * -- this just leaves the list empty rather than failing the page.
	 */
	let folders: NotebookFolder[] = [];
	if (configured && foldersReady) {
		const { data: folderRows, error: folderError } = await supabase
			.from('notebook_folders')
			.select('id, name, color, created_at');
		if (folderError) foldersReady = false;
		else folders = (folderRows ?? []) as NotebookFolder[];
	}

	/**
	 * WHEN EACH ENTRY WAS LAST TOUCHED (0091), for the "recent activity" sort.
	 *
	 * A SECOND QUERY, and deliberately not something the feed derives from the
	 * rows above. The view computes it in the database over every note
	 * revision and every photo of every readable entry, which is the whole
	 * point: the feed paints a capped number of entries while sorting has to
	 * cover the entire notebook. Another plain RLS-scoped select -- the view is
	 * security_invoker, so it can return nothing the entries select could not.
	 */
	let activity: { id: string; last_activity_at: string }[] = [];
	if (configured && pinsReady) {
		const { data: activityRows, error: activityError } = await supabase
			.from('notebook_entry_activity')
			.select('id, last_activity_at');
		if (activityError) pinsReady = false;
		else activity = (activityRows ?? []) as { id: string; last_activity_at: string }[];
	}

	/**
	 * THE CALLER'S OWN DELETED ENTRIES (0117) -- A SEPARATE QUERY, not a relaxed
	 * filter on the live read above. `entries` keeps excluding everything with a
	 * `deleted_at` in every state this load can be in; this is the read a
	 * surface asks for only when it deliberately wants to see what was removed.
	 *
	 * `.eq('student_id', claims.sub)` IS EXPLICIT here, unlike every other read
	 * on this page. Every other list on /notebook relies on RLS alone (the
	 * /coin-balance doctrine), which for a STAFF account genuinely returns rows
	 * from every section they manage as well as their own -- an existing,
	 * documented property of this page for a personal notebook. "The caller's
	 * deleted entries" is a narrower, deliberate promise than that, so it is
	 * stated as a filter rather than left to a policy that was written to be
	 * broader.
	 */
	let deletedEntries: NotebookDeletedEntry[] = [];
	if (configured && deletionReady) {
		const { data: deletedRows, error: deletedError } = await supabase
			.from('notebook_entries')
			.select(NOTEBOOK_DELETED_SELECT)
			.eq('student_id', claims.sub)
			.not('deleted_at', 'is', null)
			.order('deleted_at', { ascending: false });
		if (!deletedError) {
			const rows = (deletedRows ?? []) as unknown as {
				id: string;
				session_id: string | null;
				custom_label: string | null;
				upload_timestamp: string;
				deleted_at: string;
				deleted_by: string | null;
			}[];
			const linkedIds = [
				...new Set(rows.map((r) => r.session_id).filter((id): id is string => Boolean(id)))
			];
			let sessionById = new Map<
				string,
				{ session_label: string; unit_number: number; session_date: string }
			>();
			if (linkedIds.length) {
				const { data: sessionRows } = await supabase
					.from('notebook_sessions')
					.select(NOTEBOOK_SESSION_SELECT)
					.in('id', linkedIds);
				sessionById = new Map(
					(
						(sessionRows ?? []) as unknown as {
							id: string;
							session_label: string;
							unit_number: number;
							session_date: string;
						}[]
					).map((s) => [
						s.id,
						{
							session_label: s.session_label,
							unit_number: s.unit_number,
							session_date: s.session_date
						}
					])
				);
			}
			deletedEntries = rows.map((r) => ({
				id: r.id,
				custom_label: r.custom_label,
				session: r.session_id ? (sessionById.get(r.session_id) ?? null) : null,
				upload_timestamp: r.upload_timestamp,
				deleted_at: r.deleted_at,
				restorable: r.deleted_by === claims.sub
			}));
		}
	}

	/**
	 * `?checkin=<session>&section=<class>` -- the deep link an IDEA Classroom
	 * stream card arrives on, so the upload flow opens already pointed at the
	 * check-in the student clicked.
	 *
	 * VALIDATED AGAINST `sessions`, WHICH IS THE POINT. That list is the
	 * student's OWN classes' check-ins, assembled above from RLS-scoped reads,
	 * so an id naming a check-in that is not theirs simply finds no match and
	 * preselects nothing -- the same shape /notebook/review uses for its own
	 * `?section=`. The parameter can therefore only ever pick something the page
	 * was already going to offer; it grants no reach of its own.
	 *
	 * BOTH ids matter. Since 0098 an entry is filed against a (check-in, class)
	 * PAIR, and a student enrolled in two classes that share a check-in has two
	 * postings to choose between. The class page knows which one the student was
	 * looking at; matching on the pair is what carries that through. A missing
	 * or unmatched `section` falls back to the first posting of that check-in,
	 * which is exactly right in the ordinary case of one.
	 */
	const askedCheckIn = url.searchParams.get('checkin');
	const askedSection = url.searchParams.get('section');
	let initialCheckIn: { sessionId: string; sectionId: string } | null = null;
	if (askedCheckIn) {
		const match =
			(askedSection
				? sessions.find((s) => s.id === askedCheckIn && s.section_id === askedSection)
				: null) ?? sessions.find((s) => s.id === askedCheckIn);
		if (match) initialCheckIn = { sessionId: match.id, sectionId: match.section_id };
	}

	return {
		configured,
		initialCheckIn,
		viewerId: claims.sub,
		historyReady,
		draftsReady,
		deletionReady,
		photosReady,
		notesReady,
		foldersReady,
		pinsReady,
		sessionsReady,
		activity,
		deletedEntries,
		folders,
		// The Drive integration is server-only; the UI just needs to know
		// whether a submit could possibly succeed, so it can say so up front
		// rather than failing at the end of a photo upload.
		uploadReady: driveConfigured(),
		sectionLabel,
		canReview: access.canReview,
		entries,
		sessions
	};
};
