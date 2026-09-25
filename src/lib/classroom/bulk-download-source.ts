/**
 * THE TRANSPORT BEHIND "Download all files" (ledger 0298, A6): where the bytes,
 * the upload times and the wider roster come from. The plan is
 * `bulk-download.ts`; the surface is `BulkFileDownload.svelte`.
 *
 * EVERYTHING HERE RUNS AS THE TEACHER, ON THEIR OWN BROWSER CLIENT, AND NOTHING
 * WAS WIDENED TO BUILD IT. No new RPC, no new route, no new grant, no migration:
 *
 *  - A STORAGE ROW (0133, `storage_key` set) is a `download` from
 *    `submission-files` under the teacher's session. 0133's one select policy on
 *    that bucket, "submission files readable by owner or reviewer", asks
 *    `classroom_can_read_submission_object`, which admits the student AND
 *    `classroom_can_review_submission` -- exactly the predicate the proxy route
 *    already satisfies when it mints the signed URL a thumbnail follows. The
 *    feedback console's archive is the production precedent for this shape (a
 *    browser-client `download` from a private bucket, cross-origin, under the
 *    caller's own policy): `src/routes/classroom/feedback/+page.svelte`.
 *  - A LEGACY DRIVE ROW (no `storage_key`) is a same-origin `fetch` of the SAME
 *    proxy URL the thumbnail uses (`submissionFileSrc`), which streams the bytes
 *    from Drive itself -- no redirect, no second origin, cookies included.
 *  - A ROW OFF THE DEGRADED RUNG (`storage_key` undefined, so the column was
 *    never selected) goes through the proxy too, which 302s a storage row to a
 *    signed URL on the storage origin. Whether that cross-origin hop is readable
 *    by `fetch` is a CORS question NOT verified from this container; production
 *    selects the wide rung, so the path is a fallback, not the ordinary case.
 *
 * EVERY METHOD RESOLVES AND NONE THROWS. One unreachable file must never cost the
 * other forty-one their zip; the plan records the failure per file and
 * `index.csv` states it.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { submissionFileSrc, type SubmissionFileRow } from './assignment-spec';
import type { ClassroomEnrollment } from './classroom';
import { loadSectionRoster } from './transports';
import type { BlockLabel, BulkZipDeps, FetchedFile } from './bulk-download';

/**
 * The hand-in bucket, as 0133 names it. `$lib/server/classroom-attachments`
 * holds the server's copy (`SUBMISSION_FILES_BUCKET`), which the browser cannot
 * import; `tests/classroom-bulk-download.test.ts` asserts the two agree.
 */
export const SUBMISSION_FILES_BUCKET_NAME = 'submission-files';

/**
 * WHAT THE CONSOLE IS HANDED, AND ITS ABSENCE REMOVES THE CONTROL. A mount that
 * passes nothing -- the read-only surfaces, a harness proving the absence -- has
 * no Download all files button at all, rather than one that cannot work.
 */
export interface BulkFileSource extends BulkZipDeps {
	/** Readable names for block ids; the route builds them from the manifest or spec. */
	blocks: ReadonlyMap<string, BlockLabel>;
	/** One file's bytes. Never throws. */
	fetchFile(file: SubmissionFileRow): Promise<FetchedFile>;
	/** When each file of the item was uploaded, by file id. Never throws; empty on failure. */
	uploadTimes?(itemId: string): Promise<Map<string, string>>;
	/**
	 * Every roster the caller manages, so a student in another of their classes
	 * is recognised rather than filed as a stranger. Null when it cannot answer.
	 */
	managedRoster?(): Promise<ClassroomEnrollment[] | null>;
}

function storageReason(message: string | undefined): string {
	const m = (message ?? '').toLowerCase();
	if (m.includes('not found')) return 'The file is no longer in storage.';
	if (m.includes('denied') || m.includes('unauthorized') || m.includes('policy')) {
		return 'Your account was not allowed to read this file.';
	}
	return 'The file could not be downloaded.';
}

function statusReason(status: number): string {
	if (status === 401) return 'Your session expired. Reload the page and try again.';
	if (status === 404) return 'The file could not be found.';
	if (status === 503) return 'File storage is not configured on this deployment.';
	return `The file could not be retrieved (error ${status}).`;
}

/** The real transport, over the page's own browser client. */
export function createBulkFileSource(
	supabase: SupabaseClient,
	blocks: ReadonlyMap<string, BlockLabel>
): BulkFileSource {
	return {
		blocks,
		async fetchFile(file) {
			try {
				if (file.storage_key) {
					const { data, error } = await supabase.storage
						.from(SUBMISSION_FILES_BUCKET_NAME)
						.download(file.storage_key);
					if (error || !data) return { ok: false, reason: storageReason(error?.message) };
					return { ok: true, bytes: new Uint8Array(await data.arrayBuffer()) };
				}
				const res = await fetch(submissionFileSrc(file.id), { credentials: 'same-origin' });
				if (!res.ok) return { ok: false, reason: statusReason(res.status) };
				return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
			} catch {
				return { ok: false, reason: 'The connection dropped while downloading this file.' };
			}
		},
		async uploadTimes(itemId) {
			try {
				// `created_at` is 0086's own column; the console's shared file select
				// never needed it, and widening that select is a change to two
				// surfaces for one column, so it is asked here, once, at the press.
				const { data, error } = await supabase
					.from('classroom_submission_files')
					.select('id, created_at, classroom_submissions!inner(item_id)')
					.eq('classroom_submissions.item_id', itemId);
				if (error || !data) return new Map();
				return new Map(
					(data as unknown as { id: string; created_at: string | null }[])
						.filter((r) => typeof r.created_at === 'string')
						.map((r) => [r.id, r.created_at as string] as const)
				);
			} catch {
				return new Map();
			}
		},
		async managedRoster() {
			try {
				const res = await loadSectionRoster(supabase, null);
				return res.ok ? res.data.rows : null;
			} catch {
				return null;
			}
		}
	};
}
