import { redirect } from '@sveltejs/kit';
import { DOWNLOAD_URL_TTL_SECONDS, QUICK_POST_FILES_BUCKET, downloadFilename } from '$lib/server/classroom-attachments';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * SERVES ONE FILE ON A CLASS NOTICE (0233, ledger 0368), BY HANDING BACK A
 * SHORT-LIVED SIGNED URL AND GETTING OUT OF THE WAY. The bytes go browser <-
 * Supabase and never through this function.
 *
 * ALWAYS A DOWNLOAD, NEVER INLINE. The signed URL carries `download=`, so
 * Supabase answers `Content-Disposition: attachment` from its own origin:
 * nothing a teacher uploads is ever navigated to as a document on ours, which
 * is what pays for there being no type list (CLASSROOM FILES). A picture still
 * draws in an `<img>` from this same URL (an image element decodes or fails;
 * it never runs anything) and opens in the Lightbox, whose Download points
 * here too. Do not add an inline branch.
 *
 * TWO INDEPENDENT REFUSALS. `classroom_quick_post_file` answers only the
 * notice's own audience (its classes' managers, an active enrollee while the
 * notice is up, its author), and the URL is minted on the caller's own session,
 * so the bucket's select policy asks the same question again. Every failure is
 * the same 404: "not there" and "not yours" answer identically.
 */

/** Immutable bytes, but WHO may read them is not (a notice ends). */
const CACHE_CONTROL = 'private, max-age=60';

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': CACHE_CONTROL } });

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) return new Response('You must be signed in.', { status: 401 });
	const id = String(params.file_id ?? '').trim();
	if (!UUID_RE.test(id)) return notFound();

	const { data, error } = await supabase.rpc('classroom_quick_post_file', { p_file_id: id });
	const row = (data ?? null) as { ok?: boolean; storage_key?: string; filename?: string } | null;
	if (error || row?.ok !== true || !row.storage_key) return notFound();

	const { data: signed, error: signError } = await supabase.storage
		.from(QUICK_POST_FILES_BUCKET)
		.createSignedUrl(row.storage_key, DOWNLOAD_URL_TTL_SECONDS, {
			download: downloadFilename(row.filename || 'file')
		});
	if (signError || !signed?.signedUrl) return notFound();
	redirect(302, signed.signedUrl);
};
