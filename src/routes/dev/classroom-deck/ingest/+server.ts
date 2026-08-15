import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { devIngestAbort, devIngestBegin, devIngestFiles, devIngestFinish } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production, no auth, no Supabase, no Drive):
 * unpacks a REAL zip through the SHIPPING planner, in the SAME shape the real
 * route now uses -- ONE multipart request combining authorize + write-to-Drive
 * + plan (mirrored here as one call straight into devIngestBegin, since there
 * is no auth or Drive to authorize against), then the JSON `files` / `finish`
 * / `abort` stages (0105), unchanged.
 *
 * Two fault injectors exist because their symptoms are what this endpoint's
 * whole diagnosis story is about and neither can be produced locally
 * otherwise: `fail` makes a stage answer 502, and `hang` makes it never answer
 * at all, so the client's own timeout is the thing that ends it. Both work on
 * every stage, INCLUDING the initial multipart upload -- the real server can
 * fail there too (a Drive write that errors, for instance), and the harness
 * has to be able to show what that looks like, and that nothing partial is
 * left behind. See $lib/server/dev-deck-fixture.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const contentType = request.headers.get('content-type') ?? '';

	if (contentType.toLowerCase().includes('multipart/form-data')) {
		const form = await request.formData().catch(() => null);
		if (!form) {
			return json({ ok: false, error: 'Expected multipart/form-data.' }, { status: 400 });
		}
		if (form.get('hang') === '1') {
			// Never answers. The client's own timeout has to end this.
			await new Promise(() => {});
		}
		if (form.get('fail') === '1') {
			return json({ ok: false, error: 'Injected server failure.', code: 'drive_upload' }, { status: 502 });
		}

		const deckId = String(form.get('id') ?? 'dev-deck');
		const entryPath = String(form.get('entry_path') ?? '') || null;
		const file = form.get('file');
		if (!(file instanceof File)) {
			return json({ ok: false, error: 'A zip file is required.' }, { status: 400 });
		}
		const zip = new Uint8Array(await file.arrayBuffer());

		const res = await devIngestBegin(deckId, zip, entryPath);
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

	const body = (await request.json().catch(() => ({}))) as {
		stage?: string;
		job_id?: string;
		/** Fault injection, harness only. */
		fail?: boolean;
		hang?: boolean;
		interrupt?: boolean;
	};

	if (body.hang) {
		await new Promise(() => {});
	}
	if (body.fail) {
		return json({ ok: false, error: 'Injected server failure.', code: 'drive_upload' }, { status: 502 });
	}

	const stage = body.stage ?? '';
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
