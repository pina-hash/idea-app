import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	devIngestAbort,
	devIngestBegin,
	devIngestFiles,
	devIngestFinish,
	devUploadedBytes,
	devUploadSession
} from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production, no auth, no Supabase, no Drive):
 * unpacks the zip the browser actually UPLOADED, through the SHIPPING planner,
 * IN THE SAME FOUR STAGES the real route uses (0105).
 *
 * It mirrors the production ingest route's binding as well as its unpacking: a
 * file id is minted by the upload session itself, so naming any other one is
 * refused here exactly as a file whose Drive name and parent are not the ones
 * the server set is refused there.
 *
 * Two fault injectors exist because their symptoms are what this endpoint's
 * whole diagnosis story is about and neither can be produced locally otherwise:
 * `fail` makes a stage answer 502, and `hang` makes it never answer at all, so
 * the client's own timeout is the thing that ends it. See
 * $lib/server/dev-deck-fixture.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const body = (await request.json().catch(() => ({}))) as {
		stage?: string;
		id?: string;
		job_id?: string;
		upload_id?: string;
		drive_file_id?: string;
		entryPath?: string | null;
		/** Fault injection, harness only. */
		fail?: boolean;
		hang?: boolean;
		interrupt?: boolean;
	};

	if (body.hang) {
		// Never answers. The client's own timeout is what has to end this, and
		// that it reads as `ingest_timeout` rather than a generic failure is the
		// point of injecting it.
		await new Promise(() => {});
	}
	if (body.fail) {
		return json({ ok: false, error: 'Injected server failure.', code: 'drive_upload' }, { status: 502 });
	}

	const stage = body.stage ?? 'begin';

	if (stage === 'begin') {
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

		const res = await devIngestBegin(deckId, zip, body.entryPath ?? null);
		if (!res.ok) {
			return json(
				{ ok: false, error: res.error, candidates: res.candidates ?? [], code: 'plan_refused' },
				{ status: 400 }
			);
		}
		return json({
			ok: true,
			stage: 'begin',
			job_id: res.jobId,
			total_files: res.total,
			entry_path: res.entryPath,
			warnings: res.warnings
		});
	}

	const jobId = String(body.job_id ?? '');

	if (stage === 'files') {
		const res = await devIngestFiles(jobId, { interrupt: body.interrupt });
		if (!res.ok) {
			// An INTERRUPTED stage is not a refusal the client should give up on:
			// it is exactly the state resumption handles, so it answers as a
			// transport failure and the client's retry picks it back up.
			const status = res.reason === 'interrupted' ? 502 : 400;
			return json(
				{ ok: false, error: `Stage failed (${res.reason}).`, reason: res.reason, code: 'drive_upload' },
				{ status }
			);
		}
		return json({
			ok: true,
			stage: 'files',
			files_done: res.filesDone,
			total_files: res.total,
			complete: res.complete
		});
	}

	if (stage === 'finish') {
		const res = devIngestFinish(jobId);
		if (!res.ok || !res.deck) {
			return json({ ok: false, error: `Could not store the deck (${res.reason}).` }, { status: 400 });
		}
		const plan = res.deck.plan;
		return json({
			ok: true,
			stage: 'finish',
			deck: {
				id: res.deck.id,
				title: res.deck.title,
				item_id: 'dev-item',
				entry_path: plan.entryPath,
				thumbnail_path: plan.thumbnailPath,
				file_count: plan.files.length,
				total_bytes: plan.totalBytes,
				has_state_file: plan.hasStateFile,
				slides: plan.slides
			},
			warnings: plan.warnings,
			paths: plan.files.map((f) => f.path)
		});
	}

	if (stage === 'abort') {
		devIngestAbort(jobId);
		return json({ ok: true, stage: 'abort' });
	}

	return json({ ok: false, error: `Unknown stage "${stage}".` }, { status: 400 });
};
