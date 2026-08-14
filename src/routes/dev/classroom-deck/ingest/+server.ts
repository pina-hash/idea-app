import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { devUploadedBytes, devUploadSession, ingestUploadedZip } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production, no auth, no Supabase, no Drive):
 * unpacks the zip the browser actually UPLOADED, through the SHIPPING planner.
 *
 * It mirrors the production ingest route's binding as well as its unpacking: a
 * file id is minted by the upload session itself, so naming any other one is
 * refused here exactly as a file whose Drive name and parent are not the ones
 * the server set is refused there. See $lib/server/dev-deck-fixture.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const body = (await request.json().catch(() => ({}))) as {
		id?: string;
		upload_id?: string;
		drive_file_id?: string;
		entryPath?: string | null;
	};
	const deckId = body.id ?? 'dev-deck';
	const uploadId = String(body.upload_id ?? '');

	const session = devUploadSession(uploadId);
	if (!session) {
		return json({ ok: false, error: 'That upload could not be found.' }, { status: 400 });
	}
	if (!session.fileId || session.fileId !== body.drive_file_id) {
		return json(
			{ ok: false, error: 'That file was not produced by this upload.' },
			{ status: 400 }
		);
	}
	const zip = devUploadedBytes(uploadId);
	if (!zip) {
		return json({ ok: false, error: 'That upload never finished.' }, { status: 400 });
	}

	const res = await ingestUploadedZip(deckId, zip, body.entryPath ?? null);
	if (!res.ok) {
		return json({ ok: false, error: res.error, candidates: res.candidates ?? [] }, { status: 400 });
	}
	return json({
		ok: true,
		deck: {
			id: deckId,
			title: 'IDEA FSP Day 2',
			item_id: 'dev-item',
			entry_path: res.plan.entryPath,
			thumbnail_path: res.plan.thumbnailPath,
			file_count: res.plan.files.length,
			total_bytes: res.plan.totalBytes,
			has_state_file: res.plan.hasStateFile,
			slides: res.plan.slides
		},
		warnings: res.plan.warnings,
		paths: res.plan.files.map((f) => f.path)
	});
};
