import { json } from '@sveltejs/kit';
import {
	createDriveFolder,
	deleteDriveFile,
	driveConfigured,
	getDriveFileMeta,
	listDriveFolderFiles,
	uploadDriveFile
} from '$lib/server/notebook-drive';
import {
	DECK_LIMITS,
	deckFolderName,
	decksFolderId,
	deckStagedDriveFilename,
	deckUploadName,
	deckUploadsFolderId,
	driveZipSource,
	planDeck,
	readDeckFile,
	type DeckFilePlan
} from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Ingests (POST) or removes (DELETE) the presentation deck on one canonical
 * classroom item.
 *
 * THE ZIP NEVER PASSES THROUGH HERE. The browser uploads it straight to Drive
 * against a session this server opened (/api/classroom/deck/upload-session,
 * 0102) and POSTs only the resulting file id -- which is what lifted deck
 * uploads off Vercel's ~4.5 MB request-body cap, a limit every real export died
 * at.
 *
 * INGESTION IS STAGED, AND NO SINGLE REQUEST HAS TO FINISH IT (0105). Unpacking
 * means downloading the archive from Drive and pushing every file back to it,
 * which for a 43 MB deck carrying three multi-megabyte gifs is comfortably past
 * a serverless function's DURATION limit -- so the old one-shot POST was killed
 * mid-flight and the browser saw a dropped connection after an upload that had
 * genuinely succeeded. Raising that limit is not available; it is the
 * platform's. So the work is split into stages the CLIENT drives:
 *
 *   begin   claim the slot, prove the file, plan the archive, make the folder,
 *           open a job. Bounded: it reads the zip's directory and one HTML file.
 *   files   store as many of the planned files as fit in this request's own
 *           time budget, record them, report progress. Called until complete.
 *   finish  hand the accumulated manifest to classroom_replace_deck, sweep the
 *           deck this one replaced, and delete the staged zip.
 *   abort   give up: sweep the deck folder (which takes every file stored under
 *           it, recorded or not) and the staged zip.
 *
 * WHAT IS STORED IS UNCHANGED. Same planner, same skipped standalone/template
 * renderings, same hidden `.image-slots.state.json`, same refusal of a
 * traversing path, same classroom_replace_deck writing the same manifest.
 *
 * A CLIENT-SUPPLIED FILE ID IS NOT TRUSTED, and two independent things have to
 * agree before a byte is read:
 *
 *   1. THE SLOT. classroom_deck_upload_claim spends the caller's own
 *      authorization row -- once, before it expires -- and hands back the item
 *      it was opened for. The ingest TARGET comes from that row, never from the
 *      request, so a claim cannot be redirected at a second item.
 *   2. THE FILE. Its Drive name and parent must be the ones this server set
 *      when it opened the session (deckUploadName, in the deck uploads folder).
 *      A resumable PUT carries bytes and a Content-Range only, so neither is
 *      something a client can produce -- which is what makes "this file id came
 *      from that upload session" checkable at all.
 *
 * A file that fails check 2 is left completely alone. Deleting it would turn a
 * forged id into a way to destroy an arbitrary file in the shared drive.
 *
 * AUTHORIZATION IS THE RPCs'. Every stage re-asks _classroom_manages_item, and
 * classroom_replace_deck asks again when the deck finally lands -- which matters
 * more now than it did before, because ingestion spans minutes and several
 * requests and a teacher can lose a section while one runs.
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

/** Drive ids are opaque but well-formed; a wild string never reaches Google. */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{6,200}$/;

const CLAIM_REFUSALS: Record<string, string> = {
	not_found: 'That upload could not be found. Start the upload again.',
	already_used: 'That upload has already been used. Start the upload again.',
	cancelled: 'That upload was cancelled. Start the upload again.',
	expired: 'That upload took too long and expired. Start the upload again.',
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
// begin
// ---------------------------------------------------------------------------

async function begin(supabase: Supa, body: Record<string, unknown>): Promise<Response> {
	const uploadId = String(body.upload_id ?? '').trim();
	if (!UUID_RE.test(uploadId)) {
		return json({ error: 'upload_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}
	const driveFileId = String(body.drive_file_id ?? '').trim();
	if (!DRIVE_ID_RE.test(driveFileId)) {
		return json({ error: 'drive_file_id is not a Drive file id.', code: 'bad_request' }, { status: 400 });
	}

	// --- 1. Spend the slot -------------------------------------------------
	const claim = await supabase.rpc('classroom_deck_upload_claim', {
		p_upload_id: uploadId,
		p_drive_file_id: driveFileId
	});
	if (claim.error) {
		return json({ error: claim.error.message, code: 'claim_failed' }, { status: 400 });
	}
	const claimed = (claim.data ?? {}) as { ok?: boolean; reason?: string; item_id?: string };
	if (!claimed.ok || !claimed.item_id) {
		const reason = claimed.reason ?? 'not_found';
		return json(
			{ error: CLAIM_REFUSALS[reason] ?? 'That upload could not be used.', reason, code: 'claim_refused' },
			{ status: reason === 'not_allowed' ? 403 : 400 }
		);
	}
	const itemId = claimed.item_id;

	// --- 2. Prove the file is the one that slot created --------------------
	let meta;
	try {
		meta = await getDriveFileMeta(driveFileId);
	} catch (e) {
		return json({ error: (e as Error).message || 'Drive read failed.', code: 'drive_read' }, { status: 502 });
	}
	const stagingFolder = await deckUploadsFolderId();
	if (meta.name !== deckUploadName(uploadId) || !meta.parents.includes(stagingFolder)) {
		// NOT deleted: this file is not ours to remove (see the header).
		return json(
			{ error: 'That file was not produced by this upload. Start the upload again.', code: 'foreign_file' },
			{ status: 400 }
		);
	}
	if (meta.size > DECK_LIMITS.maxZipBytes) {
		await deleteDriveFile(driveFileId);
		return json(
			{
				error: `Deck uploads are capped at ${Math.floor(DECK_LIMITS.maxZipBytes / 1024 / 1024)} MB.`,
				code: 'too_large'
			},
			{ status: 413 }
		);
	}

	// From here the staged zip is ours: every failing path below deletes it,
	// and the job takes responsibility for it once one exists.
	let folderId: string | null = null;
	try {
		// --- 3. Plan (0101's unpacker, unchanged) --------------------------
		const preferredEntry = String(body.entry_path ?? '').trim() || null;
		const source = await driveZipSource(driveFileId, meta.size);
		const planned = await planDeck(source, preferredEntry);
		if (!planned.ok) {
			// A zip with several plausible entry pages is not an error the
			// uploader can act on without knowing which pages they were: hand
			// the candidates back so the surface can ask rather than guess.
			await deleteDriveFile(driveFileId);
			return json(
				{ error: planned.error, candidates: planned.candidates ?? [], code: 'plan_refused' },
				{ status: 400 }
			);
		}
		const plan = planned.plan;
		const title = String(body.title ?? '').trim().slice(0, 200) || 'Presentation';

		// --- 4. A fresh folder per upload ----------------------------------
		// Fresh, never reused: a replace has to be able to sweep the OLD tree
		// wholesale, and the two decks briefly coexist until finish runs.
		try {
			folderId = await createDriveFolder(deckFolderName(itemId), await decksFolderId());
		} catch (e) {
			await deleteDriveFile(driveFileId);
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
			zipSize: meta.size,
			files: plan.files.map((f) => ({ path: f.path, entry: f.entry, size: f.size }))
		};

		// --- 5. Open the job -----------------------------------------------
		const { data, error } = await supabase.rpc('classroom_deck_ingest_begin', {
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
			item_id: itemId,
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
// files
// ---------------------------------------------------------------------------

async function files(supabase: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}

	const claim = await supabase.rpc('classroom_deck_ingest_claim_stage', { p_job_id: jobId });
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
			await supabase.rpc('classroom_deck_ingest_record', { p_job_id: jobId, p_files: uploaded });
		}
		return json(
			{ error: (e as Error).message || 'Drive upload failed.', code: 'drive_upload' },
			{ status: 502 }
		);
	}

	const { data, error } = await supabase.rpc('classroom_deck_ingest_record', {
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
// finish
// ---------------------------------------------------------------------------

async function finish(supabase: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}

	const { data, error } = await supabase.rpc('classroom_deck_ingest_finish', { p_job_id: jobId });
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
// abort
// ---------------------------------------------------------------------------

async function abort(supabase: Supa, body: Record<string, unknown>): Promise<Response> {
	const jobId = String(body.job_id ?? '').trim();
	if (!UUID_RE.test(jobId)) {
		return json({ error: 'job_id must be a uuid.', code: 'bad_request' }, { status: 400 });
	}
	const { data, error } = await supabase.rpc('classroom_deck_ingest_abandon', { p_job_id: jobId });
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

	const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
	const stage = String(body.stage ?? 'begin').trim() || 'begin';
	const supa = supabase as unknown as Supa;

	switch (stage) {
		case 'begin':
			return begin(supa, body);
		case 'files':
			return files(supa, body);
		case 'finish':
			return finish(supa, body);
		case 'abort':
			return abort(supa, body);
		default:
			return json({ error: `Unknown deck upload stage "${stage}".`, code: 'bad_request' }, { status: 400 });
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
