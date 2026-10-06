import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findVersion, signedInEmail } from '$lib/server/armory/page-loads';
import { armoryStorageConfig, signBlob } from '$lib/server/armory/storage';

/**
 * DOWNLOAD ONE PAST VERSION (ledger 0366): a signed GET for that version's
 * bytes, the same fifteen-minute URL `/api/armory/blob-url` signs for the
 * Windows app, named after the file so the browser saves it as one.
 *
 * Authorization is the caller's own: the file and its history are read on
 * `locals.supabase`, so a non-member, a file in another project and a version
 * of another file are all one bodyless 404. The storage keys never reach the
 * browser; the URL does, which is what a signed URL is for.
 */
export const GET: RequestHandler = async ({ locals, params, setHeaders }) => {
	if (!signedInEmail(locals.claims)) redirect(303, `/armory/${params.project}/file/${params.file}`);
	const found = await findVersion(locals.supabase, params.project, params.file, params.version);
	if (!found) error(404, 'Not found');
	const storage = armoryStorageConfig();
	if (!storage) error(503, 'File storage is not switched on yet.');
	const dot = found.file.name.lastIndexOf('.');
	const stamp = found.entry.created_at.slice(0, 16).replace(/[-:T]/g, '');
	const name =
		dot > 0
			? `${found.file.name.slice(0, dot)} (${found.entry.kind === 'side_version' ? 'side ' : ''}${stamp})${found.file.name.slice(dot)}`
			: `${found.file.name} (${stamp})`;
	const signed = signBlob(storage, found.entry.hash!, 'GET', found.entry.bytes, new Date(), name);
	setHeaders({ 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' });
	redirect(302, signed.url);
};
