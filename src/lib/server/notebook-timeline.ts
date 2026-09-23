import type { SupabaseClient } from '@supabase/supabase-js';
import { readStudentEntries } from '$lib/server/notebook-student';
import { isSubmissionFileImage, type SubmissionFileRow } from '$lib/classroom/assignment-spec';
import type { TimelineFile, TimelineSubmission } from '$lib/notebook/timeline';
import type { NotebookEntry } from '$lib/notebook';

/**
 * THE READS BEHIND ONE CLASS'S PROJECT TIMELINE (ledger 0297, package F4b):
 * the student's own entries filed to the class, their own submissions on the
 * class's items, and the files on those submissions. All three on the
 * caller's own client with explicit attribution filters, because RLS answers
 * a staff account with other people's rows and this page is "mine".
 *
 * READ ONLY, and it changes nothing about how an assignment stores its work:
 * the files are listed where they already are and served by the ordinary
 * submission-file route. A read that fails costs its own layer (the entries
 * still render without the hand-ins, and the other way round), never the page.
 */
export interface ClassTimelineData {
	entries: NotebookEntry[];
	submissions: TimelineSubmission[];
	files: TimelineFile[];
	/** Each layer reports whether it answered, so an empty layer is never a silent guess. */
	ready: { entries: boolean; handIns: boolean };
}

export async function loadClassTimeline(
	supabase: SupabaseClient,
	student: { id: string; email: string },
	sectionId: string,
	itemIds: string[]
): Promise<ClassTimelineData> {
	const [read, subs] = await Promise.all([
		readStudentEntries(supabase, { studentId: student.id, sectionId }),
		itemIds.length
			? supabase
					.from('classroom_submissions')
					.select('id, item_id, state, submitted_at, returned_at')
					.eq('student_email', student.email.toLowerCase())
					.in('item_id', itemIds)
			: Promise.resolve({ data: [], error: null })
	]);
	const submissions = (subs.error ? [] : (subs.data ?? [])) as TimelineSubmission[];
	let files: TimelineFile[] = [];
	let filesOk = !subs.error;
	if (submissions.length) {
		const ids = submissions.map((s) => s.id);
		// Widest first: `storage_key` (0133) is what tells a picture from a
		// CAD file on a storage-backed hand-in; without it the recorded type is.
		for (const cols of [
			'id, submission_id, block_id, filename, mime_type, storage_key, created_at',
			'id, submission_id, block_id, filename, mime_type, created_at'
		]) {
			const res = await supabase.from('classroom_submission_files').select(cols).in('submission_id', ids);
			if (res.error) {
				filesOk = false;
				continue;
			}
			filesOk = true;
			files = ((res.data ?? []) as unknown as (SubmissionFileRow & { created_at: string })[]).map((f) => ({
				id: f.id,
				submission_id: f.submission_id,
				block_id: f.block_id ?? null,
				filename: f.filename,
				created_at: f.created_at,
				image: isSubmissionFileImage(f)
			}));
			break;
		}
	}
	return {
		entries: read.entries,
		submissions,
		files,
		ready: { entries: !read.entryError, handIns: filesOk }
	};
}
