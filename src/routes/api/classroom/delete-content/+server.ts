import { json } from '@sveltejs/kit';
import { deleteDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Deletes one canonical classroom item AND sweeps the Drive blobs it orphaned.
 *
 * WHY THIS IS A ROUTE AND NOT A BROWSER RPC CALL. Deleting an item cascades its
 * postings, links and attachment ROWS away, which leaves their Drive files with
 * nothing pointing at them -- unreferenced forever, since the file id lived
 * only in the row that just went. The database cannot talk to Drive and the
 * browser cannot hold the school account's credentials, so the sweep has to
 * happen server-side: classroom_delete_item reports which file ids became
 * orphaned (the last row referencing them went with the item) and this route
 * removes exactly those. A DUPLICATE holds its own row against the same blob,
 * so a file backing a copy is never reported orphaned.
 *
 * The RPC runs under the CALLER'S OWN cookie session, so its own management
 * check is the real boundary -- the 401 here only keeps an anonymous caller
 * from reaching it at all. A blob sweep that fails is best-effort by design
 * (deleteDriveFile swallows): a stray file in the shared drive is harmless, and
 * failing the delete over it would be worse.
 *
 * JSON body: { id: uuid }
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { id?: string };
	try {
		body = (await request.json()) as { id?: string };
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const id = String(body.id ?? '').trim();
	if (!UUID_RE.test(id)) {
		return json({ error: 'id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_item', { p_id: id });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}

	const orphans = (data as { orphaned_drive_file_ids?: string[] } | null)?.orphaned_drive_file_ids;
	if (driveConfigured() && Array.isArray(orphans)) {
		for (const fileId of orphans) {
			await deleteDriveFile(fileId);
		}
	}

	return json({ ok: true });
};
