import { json } from '@sveltejs/kit';
import { deleteDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Deletes one post or assignment AND sweeps the Drive blobs it orphaned.
 *
 * WHY THIS IS A ROUTE AND NOT A BROWSER RPC CALL. Deleting a post cascades its
 * attachment ROWS away (0083's FKs), which leaves their Drive files with
 * nothing pointing at them -- unreferenced forever, since the file id lived
 * only in the row that just went. The database cannot talk to Drive and the
 * browser cannot hold the school account's credentials, so the sweep has to
 * happen server-side: classroom_delete_post / _delete_assignment report which
 * file ids became orphaned (the last row referencing them went with the
 * parent) and this route removes exactly those.
 *
 * The RPC runs under the CALLER'S OWN cookie session, so
 * classroom_manages_section inside it is the real boundary -- the 401 here only
 * keeps an anonymous caller from reaching it at all. A blob sweep that fails is
 * best-effort by design (deleteDriveFile swallows): a stray file in the shared
 * drive is harmless, and failing the delete over it would be worse.
 *
 * JSON body: { kind: 'post' | 'assignment', id: uuid }
 */

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}

	let body: { kind?: string; id?: string };
	try {
		body = (await request.json()) as { kind?: string; id?: string };
	} catch {
		return json({ error: 'Expected a JSON body.' }, { status: 400 });
	}

	const kind = String(body.kind ?? '').trim().toLowerCase();
	if (kind !== 'post' && kind !== 'assignment') {
		return json({ error: "kind must be 'post' or 'assignment'." }, { status: 400 });
	}
	const id = String(body.id ?? '').trim();
	if (!UUID_RE.test(id)) {
		return json({ error: 'id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc(
		kind === 'post' ? 'classroom_delete_post' : 'classroom_delete_assignment',
		{ p_id: id }
	);
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
