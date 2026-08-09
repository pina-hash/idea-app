import { redirect } from '@sveltejs/kit';
import { driveConfigured } from '$lib/server/notebook-drive';
import { notebookAccess } from '$lib/server/notebook-access';
import { sectionById } from '$lib/curriculum';
import type { NotebookEntry, NotebookSession } from '$lib/notebook';
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
 * Fails soft in one direction only: with 0069 unapplied the page renders a
 * clearly-flagged "not available yet" card instead of crashing.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const [{ data: profile }, access] = await Promise.all([
		supabase.from('profiles').select('section_id').eq('id', claims.sub).maybeSingle(),
		notebookAccess(supabase, claims.sub)
	]);

	const { data: entryRows, error: entryError } = await supabase
		.from('notebook_entries')
		.select(
			`id, session_id, section_id, custom_label, upload_timestamp, status, flag_reason,
			 instructor_comment,
			 notebook_sessions ( session_label, unit_number, session_date ),
			 notebook_entry_photos ( id, drive_file_id, variant, sequence_order, original_filename )`
		)
		.order('upload_timestamp', { ascending: false });

	const configured = !entryError;

	const entries: NotebookEntry[] = (entryRows ?? []).map((r) => {
		const row = r as Record<string, unknown>;
		return {
			id: row.id as string,
			session_id: (row.session_id as string | null) ?? null,
			section_id: (row.section_id as string | null) ?? null,
			custom_label: (row.custom_label as string | null) ?? null,
			upload_timestamp: row.upload_timestamp as string,
			status: row.status as NotebookEntry['status'],
			flag_reason: (row.flag_reason as NotebookEntry['flag_reason']) ?? null,
			instructor_comment: (row.instructor_comment as string | null) ?? null,
			session: (row.notebook_sessions as NotebookEntry['session']) ?? null,
			photos: (row.notebook_entry_photos as NotebookEntry['photos']) ?? []
		};
	});

	/**
	 * The student's scheduled check-ins. Enrollment is the loose 0003/0069
	 * model: profiles.section_id is a free-form curriculum Section.id, and a
	 * notebook_sections row claims it as course_id -- so a student may map to
	 * more than one notebook section (two lab periods of one class), and the
	 * `.in()` below deliberately keeps all of them. No pinned class means no
	 * quick picks, which is a valid state, not an error: the free-form path
	 * still works.
	 */
	let sessions: NotebookSession[] = [];
	const courseId = (profile?.section_id as string | null) ?? null;
	if (configured && courseId) {
		const { data: sectionRows } = await supabase
			.from('notebook_sections')
			.select('id')
			.eq('course_id', courseId);
		const sectionIds = (sectionRows ?? []).map((s) => (s as { id: string }).id);
		if (sectionIds.length) {
			const { data: sessionRows } = await supabase
				.from('notebook_sessions')
				.select('id, section_id, unit_number, session_date, session_label')
				.in('section_id', sectionIds)
				.order('session_date', { ascending: false });
			sessions = (sessionRows ?? []) as NotebookSession[];
		}
	}

	return {
		configured,
		// The Drive integration is server-only; the UI just needs to know
		// whether a submit could possibly succeed, so it can say so up front
		// rather than failing at the end of a photo upload.
		uploadReady: driveConfigured(),
		sectionLabel: courseId ? (sectionById(courseId)?.title ?? courseId) : null,
		canReview: access.canReview,
		entries,
		sessions
	};
};
