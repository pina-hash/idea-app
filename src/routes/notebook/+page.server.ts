import { redirect } from '@sveltejs/kit';
import { driveConfigured } from '$lib/server/notebook-drive';
import { notebookAccess } from '$lib/server/notebook-access';
import type { NotebookEntry, NotebookSession } from '$lib/notebook';
import {
	NOTEBOOK_ENTRY_SELECTS,
	NOTEBOOK_POSTING_SELECT,
	NOTEBOOK_SESSION_SELECT
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
	 */
	const read = (select: string) =>
		supabase
			.from('notebook_entries')
			.select(select)
			.order('upload_timestamp', { ascending: false });

	let entryRows: unknown[] | null = null;
	let entryError: unknown = null;
	/**
	 * Every capability starts unavailable and is turned ON by the rung that
	 * carries it succeeding -- so a capability can only be reported present
	 * because a read that actually included it came back, never by default.
	 */
	const ready: Record<string, boolean> = { pins: false, folders: false, notes: false, photos: false };
	for (const rung of NOTEBOOK_ENTRY_SELECTS) {
		const result = await read(rung.select);
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
			status: row.status as NotebookEntry['status'],
			flag_reason: (row.flag_reason as NotebookEntry['flag_reason']) ?? null,
			instructor_comment: (row.instructor_comment as string | null) ?? null,
			// Filled in below from its own read, never an embed: since 0098 there
			// is no foreign key between notebook_entries and notebook_sessions for
			// PostgREST to resolve one through.
			session: null,
			photos: (row.notebook_entry_photos as NotebookEntry['photos']) ?? [],
			// Every revision, not just the current one: the feed shows a note's
			// history, and which revision counts is derived (noteThreads), never
			// stored. Photo visibility and note visibility both delegate to
			// notebook_can_read_entry, so this needs no filter of its own.
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
			const { data: sessionRows, error: sessionError } = await supabase
				.from('notebook_sessions')
				.select(NOTEBOOK_SESSION_SELECT)
				.in('id', linkedIds);
			if (sessionError) sessionsReady = false;
			else {
				const byId = new Map(
					((sessionRows ?? []) as unknown as {
						id: string;
						session_label: string;
						unit_number: number;
						session_date: string;
					}[]).map((s) => [
						s.id,
						{
							session_label: s.session_label,
							unit_number: s.unit_number,
							session_date: s.session_date
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
			const { data: sessionRows, error: postingError } = await supabase
				.from('notebook_session_postings')
				.select(NOTEBOOK_POSTING_SELECT)
				.in('section_id', sectionIds)
				.order('session_date', { ascending: false, referencedTable: 'notebook_sessions' });
			if (postingError) sessionsReady = false;

			interface PostingRow {
				section_id: string;
				notebook_sessions: {
					id: string;
					unit_number: number;
					session_date: string;
					session_label: string;
				} | null;
			}
			sessions = ((sessionRows ?? []) as unknown as PostingRow[])
				.filter((r): r is PostingRow & { notebook_sessions: NonNullable<PostingRow['notebook_sessions']> } =>
					Boolean(r.notebook_sessions)
				)
				.map((r) => ({
					id: r.notebook_sessions.id,
					section_id: r.section_id,
					unit_number: r.notebook_sessions.unit_number,
					session_date: r.notebook_sessions.session_date,
					session_label: r.notebook_sessions.session_label
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
		photosReady,
		notesReady,
		foldersReady,
		pinsReady,
		sessionsReady,
		activity,
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
