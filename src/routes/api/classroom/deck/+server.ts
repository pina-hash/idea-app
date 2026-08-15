import { json } from '@sveltejs/kit';
import {
	createDriveFolder,
	deleteDriveFile,
	driveConfigured,
	listDriveFolderFiles,
	uploadDriveFile
} from '$lib/server/notebook-drive';
import {
	DECK_UPLOAD_MAX_ZIP_BYTES,
	DECK_ZIP_MIME,
	deckFolderName,
	deckStagedDriveFilename,
	deckUploadName,
	deckUploadSizeIssue,
	deckUploadsFolderId,
	decksFolderId,
	driveZipSource,
	planDeck,
	readDeckFile,
	type DeckFilePlan
} from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Attaches (POST) or removes (DELETE) the presentation deck on one canonical
 * classroom item.
 *
 * THE ZIP GOES THROUGH THIS SERVER, not straight to Drive. A direct-to-Drive
 * transport shipped once (0102) specifically to get the zip off Vercel's
 * ~4.5 MB request-body cap, and it did not survive contact with a real
 * classroom: live testing found the browser could not reach Google's
 * chunked-upload endpoint at ALL in this environment, for a small deck in one
 * chunk exactly as much as a large one across several. That is environmental,
 * not a bug in the chunking or the headers, and every OTHER upload in this
 * app already goes through the server for the same reason -- the Drive
 * credentials live here. So the deck zip is capped at
 * DECK_UPLOAD_MAX_ZIP_BYTES (refused client-side before anything is sent; see
 * $lib/classroom/deck) and posted as one ordinary multipart form, the
 * classroom-attachment shape. A deck whose kept files are over that limit,
 * almost always because it carries a gif or a video, needs that media pulled
 * out of the deck and attached to the item separately -- the platform's own
 * body cap has no workaround from here.
 *
 * ONE MULTIPART CALL therefore does everything a single request now CAN do
 * in one round trip: authorize the caller against the item
 * (classroom_deck_upload_start), write the zip to Drive on their behalf, bind
 * that file to the authorization (classroom_deck_upload_claim), plan the
 * archive, and open a staged ingest job.
 *
 * INGESTION IS STILL STAGED FROM THERE, AND THAT PART IS UNCHANGED (0105).
 * Unpacking means reading the staged archive back out of Drive and pushing
 * every file to it again, which for a real export carrying several
 * multi-megabyte assets is comfortably past a serverless function's DURATION
 * limit -- a genuinely different ceiling from the request-BODY cap the upload
 * itself works around, and not one raising the upload path could ever fix.
 * So the unpack work is still split into stages the CLIENT drives:
 *
 *   upload  (multipart/form-data) authorize, write the zip to Drive, plan the
 *           archive, open the job. Bounded: it reads the zip's directory and
 *           one HTML file.
 *   files   (application/json) store as many of the planned files as fit in
 *           this request's own time budget, record them, report progress.
 *           Called until complete.
 *   finish  hand the accumulated manifest to classroom_replace_deck, sweep
 *           the deck this one replaced, and delete the staged zip.
 *   abort   give up: sweep the deck folder (which takes every file stored
 *           under it, recorded or not) and the staged zip.
 *
 * WHAT IS STORED IS UNCHANGED. Same planner, same skipped standalone/template
 * renderings, same hidden `.image-slots.state.json`, same refusal of a
 * traversing path, same classroom_replace_deck writing the same manifest.
 *
 * AUTHORIZATION IS THE RPCs'. `upload` re-checks _classroom_manages_item
 * through classroom_deck_upload_start, and every later stage re-asks it again
 * through _classroom_deck_job / classroom_replace_deck -- which matters
 * because unpacking a large deck can span several requests, and a teacher can
 * lose a section while one runs.
 */

/**
 * How long one `files` stage will keep working before reporting back.
 *
 * Deliberately well under any plausible function limit rather than tuned to a
 * particular one: the client simply calls again, so the only cost of being
 * conservative is another round trip, while the cost of being optimistic is the
 * exact silent kill this staging exists to remove. At least one file always
 * goes up, so a deck whose single largest file takes longer than the budget
 * still makes progress instead of looping forever.
 */
const STAGE_BUDGET_MS = 8000;

/**
 * And a second bound, on COUNT, because the time budget does not catch the
 * other shape of long request: a deck of hundreds of tiny files costs two Drive
 * round trips each and almost no bytes, so it can run long while every
 * byte-based bound stays slack. It also keeps the progress the client reports
 * moving in visible steps rather than one jump.
 */
const STAGE_MAX_FILES = 12;

/**
 * Concurrency and memory bounds WITHIN a stage, carried over from the
 * single-request path. The byte bound is the one that matters: four concurrent
 * 96 MB files would hold every one of them in memory at once, plus a multipart
 * copy of each, so capping the batch's total keeps peak memory near this figure
 * however the deck is shaped -- a big file simply goes up alone.
 */
const UPLOAD_CONCURRENCY = 4;
const UPLOAD_BATCH_BYTES = 24 * 1024 * 1024;

/**
 * How large the WHOLE request body may be before it is refused without even
 * being parsed -- the zip cap plus a margin for the multipart envelope
 * (boundaries, the item_id/title/entry_path fields). The platform's own body
 * cap normally catches an oversize request first (see the module header);
 * this is the belt to that platform's braces, and what stops a large body
 * from being buffered into memory here at all.
 */
const MAX_REQUEST_BYTES = DECK_UPLOAD_MAX_ZIP_BYTES + 128 * 1024;

interface PlannedFile extends DeckFilePlan {
	/** Position in the whole plan; the Drive name is derived from it. */
	index: number;
}

/** Groups the remaining plan into batches that satisfy both bounds. */
function uploadBatches(files: PlannedFile[]): PlannedFile[][] {
	const batches: PlannedFile[][] = [];
	let batch: PlannedFile[] = [];
	let bytes = 0;
	for (const file of files) {
		if (batch.length && (batch.length >= UPLOAD_CONCURRENCY || bytes + file.size > UPLOAD_BATCH_BYTES)) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(file);
		bytes += file.size;
	}
	if (batch.length) batches.push(batch);
	return batches;
}

/** Best-effort cleanup. Deleting a Drive FOLDER takes its contents with it. */
async function sweep(fileIds: (string | null | undefined)[]): Promise<void> {
	await Promise.all(fileIds.filter((id): id is string => !!id).map((id) => deleteDriveFile(id)));
}

const CLAIM_REFUSALS: Record<string, string> = {
	not_found: 'That upload could not be found. Try uploading the deck again.',
	already_used: 'That upload has already been used. Try uploading the deck again.',
	cancelled: 'That upload was cancelled. Try uploading the deck again.',
	expired: 'That upload took too long and expired. Try uploading the deck again.',
	not_allowed:
		'Only the teacher of record for every class this is posted to can attach a deck here.'
};

const STAGE_REFUSALS: Record<string, string> = {
	already_finished: 'That deck was already stored.',
	abandoned: 'That deck upload was cancelled. Start the upload again.',
	expired: 'That deck upload took too long and expired. Start the upload again.',
	not_open: 'That deck upload is no longer running. Start the upload again.',
	incomplete: 'That deck is not finished unpacking yet.'
};

type Supa = { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string } | null }> };

/** The plan as it is stored on the job row and read back by every later stage. */
interface StoredPlan {
	entryPath: string;
	thumbnailPath: string | null;
	hasStateFile: boolean;
	slides: { index: number; label: string }[];
	warnings: string[];
	zipSize: number;
	files: { path: string; entry: DeckFilePlan['entry']; size: number }[];
}

// ---------------------------------------------------------------------------
// upload -- authorize, write to Drive, plan, open the job. ONE request.
// ---------------------------------------------------------------------------

async function upload(supa: Supa, request: Request): Promise<Response> {
	const contentLength = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
		return json(
			{
				error: deckUploadSizeIssue(contentLength) ?? 'That upload is too large.',
				code: 'too_large'
			},
			{ status: 413 }
		);
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json({ error: 'Expected multipart/form-data.', code: 'bad_request' }, { status: 400 });
	}

	const itemId = String(form.get('item_id') ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) {
		return json({ error: 'Attach the deck zip as the "file" form field.', code: 'bad_request' }, { status: 400 });
	}
	const sizeIssue = deckUploadSizeIssue(file.size);
	if (sizeIssue) {
		return json({ error: sizeIssue, code: 'too_large' }, { status: 413 });
	}
	const preferredEntry = String(form.get('entry_path') ?? '').trim() || null;
	const title = String(form.get('title') ?? '').trim().slice(0, 200) || 'Presentation';

	// --- 1. Authorize. Refused here means the caller may not touch this
	//    item's deck, and nothing has reached Drive. -------------------------
	const started = await supa.rpc('classroom_deck_upload_start', { p_item_id: itemId });
	if (started.error) {
		return json({ error: started.error.message, code: 'session_refused' }, { status: 400 });
	}
	const slot = (started.data ?? {}) as { ok?: boolean; upload_id?: string };
	if (!slot.upload_id) {
		return json({ error: 'Could not authorize that upload.', code: 'session_refused' }, { status: 400 });
	}
	const uploadId = slot.upload_id;

	// --- 2. The bytes, through THIS server, to Drive -------------------------
	let driveFileId: string;
	try {
		const bytes = new Uint8Array(await file.arrayBuffer());
		driveFileId = await uploadDriveFile({
			bytes,
			mimeType: DECK_ZIP_MIME,
			filename: deckUploadName(uploadId),
			parentId: await deckUploadsFolderId()
		});
	} catch (e) {
		await supa.rpc('classroom_deck_upload_cancel', { p_upload_id: uploadId }).catch(() => {});
		return json({ error: (e as Error).message || 'Drive upload failed.', code: 'drive_upload' }, { status: 502 });
	}

	// --- 3. Claim the slot: binds it to the file, re-checks authority --------
	const claim = await supa.rpc('classroom_deck_upload_claim', {
		p_upload_id: uploadId,
		p_drive_file_id: driveFileId
	});
	if (claim.error) {
		await sweep([driveFileId]);
		return json({ error: claim.error.message, code: 'claim_failed' }, { status: 400 });
	}
	const claimed = (claim.data ?? {}) as { ok?: boolean; reason?: string; item_id?: string };
	if (!claimed.ok || !claimed.item_id) {
		await sweep([driveFileId]);
		const reason = claimed.reason ?? 'not_found';
		return json(
			{ error: CLAIM_REFUSALS[reason] ?? 'That upload could not be used.', reason, code: 'claim_refused' },
			{ status: reason === 'not_allowed' ? 403 : 400 }
		);
	}
	const authorizedItemId = claimed.item_id;

	// --- 4. Plan (0101's unpacker, unchanged), fold, open the job -----------
	let folderId: string | null = null;
	try {
		const source = await driveZipSource(driveFileId, file.size);
		const planned = await planDeck(source, preferredEntry);
		if (!planned.ok) {
			// A zip with several plausible entry pages is not an error the
			// uploader can act on without knowing which pages they were: hand
			// the candidates back so the surface can ask rather than guess.
			await sweep([driveFileId]);
			return json(
				{ error: planned.error, candidates: planned.candidates ?? [], code: 'plan_refused' },
				{ status: 400 }
			);
		}
		const plan = planned.plan;

		// A fresh folder per upload. Fresh, never reused: a replace has to be
		// able to sweep the OLD tree wholesale, and the two decks briefly
		// coexist until finish runs.
		try {
			folderId = await createDriveFolder(deckFolderName(authorizedItemId), await decksFolderId());
		} catch (e) {
			await sweep([driveFileId]);
			return json(
				{ error: (e as Error).message || 'Drive folder create failed.', code: 'drive_folder' },
				{ status: 502 }
			);
		}

		const stored: StoredPlan = {
			entryPath: plan.entryPath,
			thumbnailPath: plan.thumbnailPath,
			hasStateFile: plan.hasStateFile,
			slides: plan.slides,
			warnings: plan.warnings,
			zipSize: file.size,
			files: plan.files.map((f) => ({ path: f.path, entry: f.entry, size: f.size }))
		};

		const { data, error } = await supa.rpc('classroom_deck_ingest_begin', {
			p_upload_id: uploadId,
			p_drive_file_id: driveFileId,
			p_drive_folder_id: folderId,
			p_title: title,
			p_plan: stored
		});
		if (error) {
			await sweep([folderId, driveFileId]);
			return json({ error: error.message, code: 'begin_failed' }, { status: 400 });
		}
		const job = (data ?? {}) as {
			job_id?: string;
			total_files?: number;
			superseded?: { drive_folder_id?: string; drive_zip_file_id?: string }[];
		};

		// A previous attempt on this item that was never finished or cancelled.
		for (const old of job.superseded ?? []) {
			await sweep([old.drive_folder_id, old.drive_zip_file_id]);
		}

		return json({
			ok: true,
			stage: 'begin',
			job_id: job.job_id ?? null,
			item_id: authorizedItemId,
			total_files: job.total_files ?? stored.files.length,
			entry_path: plan.entryPath,
			has_state_file: plan.hasStateFile,
			slides: plan.slides.length,
			warnings: plan.warnings
		});
	} catch (e) {
		await sweep([folderId, driveFileId]);
		return json({ error: (e as Error).message || 'Could not read that deck.', code: 'plan_failed' }, { status: 502 });
	}
}

// ---------------------------------------------------------------------------
// files -- unchanged from the staged-ingest design (0105).
// ---------------------------------------------------------------------------

async function files(supa: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}

	const claim = await supa.rpc('classroom_deck_ingest_claim_stage', { p_job_id: jobId });
	if (claim.error) {
		return json({ error: claim.error.message, code: 'stage_refused' }, { status: 400 });
	}
	const stage = (claim.data ?? {}) as {
		ok?: boolean;
		reason?: string;
		drive_zip_file_id?: string;
		drive_folder_id?: string;
		plan?: StoredPlan;
		files_done?: number;
		total_files?: number;
		resuming?: boolean;
	};
	if (!stage.ok || !stage.plan) {
		const reason = stage.reason ?? 'not_open';
		return json(
			{ error: STAGE_REFUSALS[reason] ?? 'That deck upload could not be continued.', reason, code: 'stage_refused' },
			{ status: 400 }
		);
	}

	const plan = stage.plan;
	const done = stage.files_done ?? 0;
	const total = stage.total_files ?? plan.files.length;
	const folderId = stage.drive_folder_id!;

	const remaining: PlannedFile[] = plan.files
		.map((f, index) => ({ ...f, index }))
		.slice(done, done + STAGE_MAX_FILES);
	if (!remaining.length) {
		return json({
			ok: true,
			stage: 'files',
			files_done: done,
			total_files: total,
			complete: done >= total
		});
	}

	// RESUMING: a previous stage took work and never reported back, so a file
	// may be on Drive already. Names are a pure function of the plan, so one
	// listing turns "already stored?" into a lookup -- the stray is ADOPTED,
	// which is what keeps a resumed deck free of duplicates.
	let already = new Map<string, string>();
	if (stage.resuming) {
		try {
			already = new Map((await listDriveFolderFiles(folderId)).map((f) => [f.name, f.id]));
		} catch {
			// A failed listing costs at worst a duplicate inside this deck's own
			// folder, which goes with the folder; it must not fail the ingest.
		}
	}

	const uploaded: { path: string; drive_file_id: string; mime_type: string; size_bytes: number }[] = [];
	const deadline = Date.now() + STAGE_BUDGET_MS;

	try {
		const source = await driveZipSource(stage.drive_zip_file_id!, plan.zipSize);
		for (const batch of uploadBatches(remaining)) {
			// At least one batch always runs, so a single file bigger than the
			// budget still makes progress instead of looping forever.
			if (uploaded.length && Date.now() > deadline) break;

			const read = await Promise.all(
				batch.map(async (f) => {
					const name = deckStagedDriveFilename(f.index, f.path);
					const adopted = already.get(name);
					const file = await readDeckFile(source, f);
					return { file, name, adopted };
				})
			);
			const ids = await Promise.all(
				read.map((r) =>
					r.adopted
						? Promise.resolve(r.adopted)
						: uploadDriveFile({
								bytes: r.file.bytes,
								mimeType: r.file.mimeType,
								filename: r.name,
								parentId: folderId
							})
				)
			);
			batch.forEach((f, n) =>
				uploaded.push({
					path: f.path,
					drive_file_id: ids[n],
					mime_type: read[n].file.mimeType,
					size_bytes: read[n].file.bytes.length
				})
			);
			// The batch's bytes go out of scope here, which is the whole point
			// of reading the archive a batch at a time.
		}
	} catch (e) {
		// Whatever this stage DID store is recorded before reporting the
		// failure: it is real, it is in the manifest's order, and re-uploading
		// it on the next attempt would be waste. Anything it did not get to
		// record goes with the folder if the job is abandoned.
		if (uploaded.length) {
			await supa.rpc('classroom_deck_ingest_record', { p_job_id: jobId, p_files: uploaded });
		}
		return json(
			{ error: (e as Error).message || 'Drive upload failed.', code: 'drive_upload' },
			{ status: 502 }
		);
	}

	const { data, error } = await supa.rpc('classroom_deck_ingest_record', {
		p_job_id: jobId,
		p_files: uploaded
	});
	if (error) {
		return json({ error: error.message, code: 'record_failed' }, { status: 400 });
	}
	const progress = (data ?? {}) as {
		ok?: boolean;
		reason?: string;
		files_done?: number;
		total_files?: number;
		complete?: boolean;
	};
	if (!progress.ok) {
		const reason = progress.reason ?? 'not_open';
		return json(
			{ error: STAGE_REFUSALS[reason] ?? 'That deck upload could not be continued.', reason, code: 'stage_refused' },
			{ status: 400 }
		);
	}

	return json({
		ok: true,
		stage: 'files',
		files_done: progress.files_done ?? done + uploaded.length,
		total_files: progress.total_files ?? total,
		complete: progress.complete === true
	});
}

// ---------------------------------------------------------------------------
// finish -- unchanged from the staged-ingest design (0105).
// ---------------------------------------------------------------------------

async function finish(supa: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}

	const { data, error } = await supa.rpc('classroom_deck_ingest_finish', { p_job_id: jobId });
	if (error) {
		return json({ error: error.message, code: 'finish_failed' }, { status: 400 });
	}
	const result = (data ?? {}) as {
		ok?: boolean;
		reason?: string;
		deck_id?: string;
		item_id?: string;
		file_count?: number;
		replaced?: boolean;
		orphaned_drive_file_ids?: string[];
		orphaned_folder_id?: string | null;
		drive_zip_file_id?: string | null;
	};
	if (!result.ok) {
		const reason = result.reason ?? 'incomplete';
		return json(
			{ error: STAGE_REFUSALS[reason] ?? 'That deck could not be stored.', reason, code: 'stage_refused' },
			{ status: 400 }
		);
	}

	// The deck this one replaced, if any, plus the staged archive that has now
	// served its purpose.
	await sweep([
		...(result.orphaned_drive_file_ids ?? []),
		result.orphaned_folder_id ?? null,
		result.drive_zip_file_id ?? null
	]);

	return json({
		ok: true,
		stage: 'finish',
		deck_id: result.deck_id ?? null,
		item_id: result.item_id ?? null,
		replaced: result.replaced === true,
		file_count: result.file_count ?? 0
	});
}

// ---------------------------------------------------------------------------
// abort -- unchanged from the staged-ingest design (0105).
// ---------------------------------------------------------------------------

async function abort(supa: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}
	const { data, error } = await supa.rpc('classroom_deck_ingest_abandon', { p_job_id: jobId });
	if (error) {
		return json({ error: error.message, code: 'abort_failed' }, { status: 400 });
	}
	const res = (data ?? {}) as { drive_folder_id?: string | null; drive_zip_file_id?: string | null };
	// The folder takes every file stored under it, recorded or not, which is
	// what makes "a failed ingest leaves no orphan" true rather than nearly.
	await sweep([res.drive_folder_id ?? null, res.drive_zip_file_id ?? null]);
	return json({ ok: true, stage: 'abort' });
}

// ---------------------------------------------------------------------------

export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.', code: 'unauthenticated' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json(
			{ error: 'Deck upload is not configured on this deployment.', code: 'not_configured' },
			{ status: 503 }
		);
	}

	const supa = supabase as unknown as Supa;
	const contentType = request.headers.get('content-type') ?? '';

	// The whole authorize + write-to-Drive + plan sequence is ONE multipart
	// request; everything after it (files/finish/abort) is JSON, the same
	// stage-dispatch shape 0105 always used.
	if (contentType.toLowerCase().includes('multipart/form-data')) {
		return upload(supa, request);
	}

	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const stage = String(body.stage ?? '').trim();

	switch (stage) {
		case 'files':
			return files(supa, body);
		case 'finish':
			return finish(supa, body);
		case 'abort':
			return abort(supa, body);
		default:
			return json(
				{ error: `Unknown deck upload stage "${stage || '(none)'}".`, code: 'bad_request' },
				{ status: 400 }
			);
	}
};

/** Removes the deck on `?item_id=`, then sweeps whatever Drive still holds. */
export const DELETE: RequestHandler = async ({ url, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	const itemId = (url.searchParams.get('item_id') ?? '').trim();
	if (!UUID_RE.test(itemId)) {
		return json({ error: 'item_id must be a uuid.' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_delete_deck', { p_item_id: itemId });
	if (error) {
		return json({ error: error.message }, { status: 400 });
	}
	const result = (data ?? {}) as {
		orphaned_drive_file_ids?: string[];
		orphaned_folder_id?: string | null;
	};
	await sweep([...(result.orphaned_drive_file_ids ?? []), result.orphaned_folder_id ?? null]);
	return json({ ok: true });
};
