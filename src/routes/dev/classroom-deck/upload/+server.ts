import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { devUploadStart } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production): opens the harness's stand-in for a
 * Google resumable upload session, so /dev/classroom-deck can drive the REAL
 * client uploader end to end with no Drive and no session.
 *
 * The production counterpart is /api/classroom/deck/upload-session, which
 * additionally authorizes the caller against the item. There is nothing to
 * authorize here; that half is covered by tests/classroom-decks.test.ts driving
 * the real RPCs against real policies.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const body = (await request.json().catch(() => ({}))) as { upload_id?: string; size_bytes?: number };
	const id = String(body.upload_id ?? '').trim() || `dev-upload-${Date.now()}`;
	const size = Number(body.size_bytes ?? 0);
	if (!Number.isFinite(size) || size <= 0) {
		return json({ error: 'size_bytes is required.' }, { status: 400 });
	}

	devUploadStart(id, size);
	return json({ ok: true, upload_id: id, upload_url: `/dev/classroom-deck/upload/${id}` });
};
