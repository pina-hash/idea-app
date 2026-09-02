/**
 * The REAL classroom transports: thin callers of the 0082/0083/0085 SECURITY
 * DEFINER RPCs plus RLS-scoped selects, run on the browser client.
 *
 * ONE module, not one per route: the manage console, the class stream and the
 * item detail page all mount the same composer, so they must all reach the same
 * calls -- a per-page copy is how a surface quietly ends up talking to a stale
 * RPC signature. Every classroom rule (teacher of record, publish-target
 * authorization, draft visibility) lives in the database; these only carry
 * refusals back for a component to render.
 *
 * The three file paths are HTTP routes rather than RPCs on purpose: an upload
 * needs the school account's Drive credentials, and a delete needs to sweep the
 * blob the row was the last reference to -- neither is something a browser can
 * or should do.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { saveSessionGuidance } from '$lib/check-in-guidance';
import {
	normalizeSubmissionRow,
	type AssignmentEngineTransports,
	type AssignmentTeacherTransports,
	type EngineOpResult,
	type InstructorCopyData,
	type InstructorCopyRow,
	type InstructorCopyTransports,
	type InstructorKeyRow,
	type ModuleApprovalRow,
	type ResponseRow,
	type StudentEngineData,
	type SubmissionFileRow
} from './assignment-spec';
import type { PublicToggleResult, ReferenceTransports } from './reference-spec';
import {
	checkInDraftIssue,
	checkInDraftPayload,
	type ClassCheckInTransports
} from './class-check-ins';
import type {
	HallPassClosed,
	HallPassOpened,
	HallPassOpenedFor,
	HallPassRefusal,
	HallPassResult,
	HallPassState,
	HallPassTransports
} from './hall-pass';
import type {
	SongDecided,
	SongQueueState,
	SongQueueTransports,
	SongRefusal,
	SongRefusalDetail,
	SongRequested,
	SongResult
} from './song-queue';
import {
	normalizeRevisionHistory,
	type ExportOutcome,
	type ItemExportStatus,
	type RevisionTarget,
	type RevisionTransports
} from './revisions';
import { deckUploadSizeIssue, normalizeDeckRow, type ClassroomDeck, type DeckTransports } from './deck';
import { DeckUploadCancelled, logDeckUpload, postDeckZip, type DeckUploadError } from './deck-upload';
import { uploadClassroomFile } from './file-upload';
import {
	normalizeItemRow,
	normalizeSectionRow,
	normalizeUnitRow,
	type ClassroomAttachment,
	type ClassroomUnit,
	type ClassroomUnitTransports,
	type ClassroomCourse,
	type ClassroomEnrollment,
	type EnrollmentRemoval,
	type ClassroomItem,
	type ClassroomManageTransports,
	type ImportSummary,
	type ItemInput,
	type ItemLink,
	type LinkPreview,
	type SectionDeleteResult,
	type TxResult
} from './classroom';

/**
 * Link metadata for one URL, from OUR endpoint -- never the target site. A
 * browser cannot read another origin's <head> anyway, and going through the app
 * keeps the class's reading list off a third-party unfurler.
 *
 * Resolves null on any failure so a card degrades to a plain link, which is the
 * whole failure story: a preview that did not load is not an error state for
 * the page it sits on.
 */
export async function fetchLinkPreviewClient(url: string): Promise<LinkPreview | null> {
	try {
		const res = await fetch(`/api/classroom/link-preview?url=${encodeURIComponent(url)}`);
		if (!res.ok) return null;
		return (await res.json()) as LinkPreview;
	} catch {
		return null;
	}
}

export const SECTION_SELECT =
	'id, course_id, label, block, teacher_email, active, classroom_courses(id, code, title, active)';

/**
 * One canonical item and everything hanging off it. `classroom_postings` is
 * embedded NON-inner and unfiltered so an item carries the full list of classes
 * the caller may see it in -- which is what the linkage controls and the "also
 * posted to" line read. Filtering to one section happens on a SECOND embed
 * (see itemsForSection), never on this one.
 */
export const ITEM_SELECT =
	'id, kind, title, body, points, due_at, category, author_email, author_name, published, ' +
	// NOTE: `is_public` (0092) is DELIBERATELY NOT HERE. Migrations are applied
	// by hand, so a deployment sitting between 0091 and 0092 is a real state,
	// and PostgREST refuses the WHOLE select for one unknown column -- naming it
	// here would blank every classroom read until 0092 landed. The item detail
	// page fetches it on its own, fail-soft, and only for a manager.
	'pinned, sort_order, first_published_at, edited_at, created_at, updated_at, ' +
	'classroom_item_resources(id, label, url, sort_order), ' +
	'classroom_attachments(id, filename, mime_type, size_bytes, sort_order), ' +
	'classroom_postings(id, section_id), ' +
	'classroom_item_views(viewed_at)';

/**
 * ITEM_SELECT plus 0108's rich body.
 *
 * Its own constant, and never the default, for the reason spelled out above:
 * PostgREST refuses the WHOLE select for one unknown column, so naming
 * `body_doc` unconditionally would blank every classroom read on a deployment
 * sitting between 0107 and 0108. `selectItemsWithDoc` tries this one and falls
 * back, which is the same widen-then-degrade shape `selectSubmissions` uses
 * for 0095's column and the notebook's loader uses for its whole chain.
 */
export const ITEM_SELECT_RICH = `${ITEM_SELECT}, body_doc`;

/**
 * ITEM_SELECT_RICH plus 0109's go-live stamp -- the widest rung.
 *
 * ITS OWN RUNG, not folded into the one above, for the reason the chain exists
 * at all: 0108 and 0109 are applied by hand and separately, so a deployment
 * carrying one and not the other is a real state. Asking for both columns
 * together would mean a project on 0108 alone loses the RICH BODY too, to add
 * a column it does not have -- degrading strictly more than it had to.
 */
export const ITEM_SELECT_SCHEDULED = `${ITEM_SELECT_RICH}, publish_at`;

/**
 * ITEM_SELECT_SCHEDULED plus 0111's unit -- the widest rung.
 *
 * Its own rung for the reason the chain exists: 0110 and 0111 are applied by
 * hand and separately, so a deployment carrying one and not the other is a real
 * state, and PostgREST refuses the WHOLE select for one unknown column. Asking
 * for everything at once would cost a project on 0110 its rich body and its
 * schedule to add a column it does not have. Degrading here costs the GROUPING
 * for that read and nothing else: `classGroups` treats an item with no unit
 * column as unfiled, so the class view falls back to the one chronological list
 * it had before units existed.
 */
export const ITEM_SELECT_UNITS = `${ITEM_SELECT_SCHEDULED}, unit_id`;

/**
 * Run an item query with the rich body if the backend has it, without if not.
 *
 * Takes a FUNCTION OF THE SELECT STRING rather than a finished query because
 * every call site appends its own filtered `posted_in` embed -- the shared part
 * is which columns to ask for, not what to ask about. A failure of the rich
 * attempt costs one extra round trip on a pre-0108 backend and nothing at all
 * afterwards; degrading loses the FORMATTING for that read, never the body,
 * since `body` is still the plain-text projection and `itemBodyDoc` converts it.
 */
export async function selectItemsWithDoc<T extends { error: { message?: string } | null }>(
	run: (select: string) => PromiseLike<T>
): Promise<T> {
	const units = await run(ITEM_SELECT_UNITS);
	if (!units.error) return units;
	const scheduled = await run(ITEM_SELECT_SCHEDULED);
	if (!scheduled.error) return scheduled;
	const rich = await run(ITEM_SELECT_RICH);
	if (!rich.error) return rich;
	return await run(ITEM_SELECT);
}

function fail(error: { message?: string } | null): { ok: false; message: string } {
	return { ok: false, message: error?.message ?? 'Something went wrong.' };
}

// ---------------------------------------------------------------------------
// THE ROSTER READ. One reader, four callers (0138).
// ---------------------------------------------------------------------------

/** The columns the roster has always had; the degraded rung's select string. */
export const ROSTER_SELECT = 'section_id, student_email, display_name, active, updated_at';

/** A roster read, and whether it could answer the manager question at all. */
export interface RosterRead {
	rows: ClassroomEnrollment[];
	/**
	 * Did `classroom_section_roster` answer, so `manages` is real on every row?
	 *
	 * ITS OWN RUNG FLAG, never folded into anything else (the notesReady /
	 * foldersReady convention). FALSE means the project has no 0138 and the
	 * exclusion cannot be applied -- the surfaces then behave exactly as they
	 * did before the bundle, which is a known state, rather than guessing.
	 */
	managesReady: boolean;
}

/**
 * ONE class's roster, or (null) every roster the caller manages.
 *
 * WIDEST RUNG FIRST: `classroom_section_roster` (0138) carries the `manages`
 * flag, which is the whole exclusion. It DEGRADES to the plain table select
 * every one of these call sites used to make, on the `PGRST202` code ALONE --
 * an error from inside the function must fail closed rather than fall through
 * to a read that cannot tell a manager from a student.
 *
 * The null-section rung is what the home feed needs, and it has no degraded
 * form worth having: without 0138 there is nothing to filter by, so it answers
 * an empty list and the to-grade tally is the one it has always been.
 */
export async function loadSectionRoster(
	supabase: SupabaseClient,
	sectionId: string | null
): Promise<TxResult<RosterRead>> {
	const wide = await supabase.rpc('classroom_section_roster', { p_section_id: sectionId });
	if (!wide.error) {
		return {
			ok: true,
			data: { rows: (wide.data ?? []) as ClassroomEnrollment[], managesReady: true }
		};
	}
	if ((wide.error as { code?: string }).code !== 'PGRST202') return fail(wide.error);

	if (sectionId === null) return { ok: true, data: { rows: [], managesReady: false } };
	const narrow = await supabase
		.from('classroom_enrollments')
		.select(ROSTER_SELECT)
		.eq('section_id', sectionId)
		.order('display_name');
	if (narrow.error) return fail(narrow.error);
	return {
		ok: true,
		data: { rows: (narrow.data ?? []) as ClassroomEnrollment[], managesReady: false }
	};
}

/**
 * Asks the server to push this item's spec to the repo, and DOES NOT WAIT.
 *
 * Fire-and-forget on purpose, and called only after a write has already
 * succeeded: the export is best-effort and must never make a save feel slower
 * or fail one. It is its own request rather than work tacked onto the write
 * because a serverless function is torn down once it has responded, so a
 * background task started inside the save may simply never run -- see the
 * route's own header.
 *
 * Every failure is swallowed here because there is nothing useful to do with
 * one at this point: the outcome is recorded on the item server-side and shown
 * as a quiet chip with a Retry in the manage console, which is where someone is
 * actually looking.
 */
export function pingClassroomExport(itemId: string): void {
	void fetch('/api/classroom/export', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ item_id: itemId })
	}).catch(() => {});
}

/** The same call, awaited: the manage console's Retry, where someone is waiting. */
export async function runClassroomExport(itemId: string): Promise<TxResult<ExportOutcome>> {
	try {
		const res = await fetch('/api/classroom/export', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ item_id: itemId })
		});
		const body = (await res.json().catch(() => null)) as (ExportOutcome & { error?: string }) | null;
		if (!res.ok) return { ok: false, message: body?.error ?? `Export failed (${res.status}).` };
		if (!body) return { ok: false, message: 'The export gave no answer.' };
		return { ok: true, data: body };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Export failed.' };
	}
}

/**
 * The revision history for one item (0110).
 *
 * The RPC rather than a plain select because `head_revisions` -- the LIVE
 * version number per target -- is derived, and every caller needs it to say
 * "r3 of 4". It re-asks the same authorization question the table's own policy
 * asks, so this widens nothing.
 *
 * Fails soft to an EMPTY history when 0110 is not applied: migrations here are
 * pasted in by hand, so a deployment sitting between two of them is a real
 * state, and an item page must not break because it cannot show a panel.
 */
export function createRevisionTransports(supabase: SupabaseClient): RevisionTransports {
	return {
		async load(itemId) {
			const { data, error } = await supabase.rpc('classroom_item_revisions', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return { ok: true, data: normalizeRevisionHistory(data) };
		},
		async restore(revisionId) {
			const { data, error } = await supabase.rpc('classroom_restore_revision', {
				p_revision_id: revisionId
			});
			if (error) return fail(error);
			const res = (data ?? {}) as { target?: string; restored?: number; changed?: boolean };
			return {
				ok: true,
				data: {
					target: res.target as RevisionTarget,
					restored: Number(res.restored ?? 0),
					changed: res.changed === true
				}
			};
		}
	};
}

/**
 * Export bookkeeping for a batch of items, keyed by item id.
 *
 * ITS OWN QUERY rather than columns on ITEM_SELECT, for the deploy-ordering
 * reason that constant documents at length: PostgREST refuses an ENTIRE select
 * for one unknown column, so naming 0110's four columns in the shared select
 * would blank every classroom read until 0110 landed. Failing soft here costs
 * the failure chip and nothing else.
 */
export async function loadExportStatuses(
	supabase: SupabaseClient,
	itemIds: readonly string[]
): Promise<Record<string, ItemExportStatus>> {
	if (!itemIds.length) return {};
	try {
		const { data, error } = await supabase
			.from('classroom_items')
			.select('id, export_slug, last_export_at, last_export_sha, last_export_error')
			.in('id', itemIds as string[]);
		if (error) return {};
		const out: Record<string, ItemExportStatus> = {};
		for (const row of (data ?? []) as Record<string, unknown>[]) {
			out[String(row.id)] = {
				slug: (row.export_slug as string | null) ?? null,
				lastExportAt: (row.last_export_at as string | null) ?? null,
				lastExportSha: (row.last_export_sha as string | null) ?? null,
				lastExportError: (row.last_export_error as string | null) ?? null
			};
		}
		return out;
	} catch {
		return {};
	}
}

/**
 * Every item posted to one section.
 *
 * The section filter rides an aliased INNER embed (`posted_in`) rather than the
 * `classroom_postings` embed above: PostgREST applies a filter to the embed it
 * names, so filtering the unaliased one would also trim the posting LIST down
 * to the single section -- and the "also posted to Period 2 and 3" line, which
 * the linkage controls depend on, would silently always read "just this class".
 */
export async function itemsForSection(
	supabase: SupabaseClient,
	sectionId: string
): Promise<{ items: ClassroomItem[]; error: { message?: string } | null }> {
	const { data, error } = await selectItemsWithDoc((select) =>
		supabase
			.from('classroom_items')
			.select(`${select}, posted_in:classroom_postings!inner(section_id)`)
			.eq('posted_in.section_id', sectionId)
			.order('created_at', { ascending: false })
	);
	return {
		items: ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeItemRow),
		error
	};
}

/**
 * One item by id, in the same shape `itemsForSection` returns -- for a caller
 * that already knows which row it wants and does not want to refetch the
 * whole section to get it (the section layout's create composer, adding a
 * freshly created post to the list it already holds instead of reloading it).
 */
export async function itemById(
	supabase: SupabaseClient,
	itemId: string
): Promise<ClassroomItem | null> {
	const { data } = await selectItemsWithDoc((select) =>
		supabase.from('classroom_items').select(select).eq('id', itemId).maybeSingle()
	);
	return data ? normalizeItemRow(data as unknown as Record<string, unknown>) : null;
}

/**
 * THE INSTRUCTOR HALF OF THE ONE UPLOAD PATH.
 *
 * There is deliberately almost nothing here: sign, PUT, record, and the
 * classification of whatever went wrong all live in $lib/classroom/file-upload,
 * which the STUDENT half calls too. This used to be a multipart POST that put
 * the whole file through our own serverless function on its way to Drive --
 * which is where the 4 MB ceiling came from, and why a `.SLDPRT` was refused
 * for its type. Neither is true any more.
 */
async function uploadAttachment(
	itemId: string,
	file: File,
	onProgress?: (fraction: number) => void
): Promise<TxResult<undefined>> {
	const res = await uploadClassroomFile({ role: 'attachment', itemId, file, onProgress });
	// The message already NAMES its gate (size and the limit, an expired link,
	// a refusal). It is rendered verbatim; nothing here re-tones it.
	return res.ok
		? { ok: true, data: undefined }
		: { ok: false, message: res.message, gate: res.gate, retryable: res.retryable };
}

async function deleteAttachment(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch(`/api/classroom/attachment/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Remove failed.' };
	}
}

/**
 * The instructor-only counterpart of uploadAttachment/deleteAttachment (0090):
 * same shape, a DIFFERENT route (/api/classroom/instructor-attachment), whose
 * proxy answers only its own caller and is never reachable from a
 * student-facing surface.
 */
async function uploadInstructorAttachment(
	itemId: string,
	file: File,
	onProgress?: (fraction: number) => void
): Promise<TxResult<undefined>> {
	const res = await uploadClassroomFile({ role: 'instructor', itemId, file, onProgress });
	// The message already NAMES its gate. Rendered verbatim; nothing here
	// re-tones it -- the same contract the other two roles have.
	return res.ok
		? { ok: true, data: undefined }
		: { ok: false, message: res.message, gate: res.gate, retryable: res.retryable };
}

async function deleteInstructorAttachment(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch(`/api/classroom/instructor-attachment/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Remove failed.' };
	}
}

export const DECK_SELECT =
	'id, item_id, title, entry_path, thumbnail_path, file_count, total_bytes, has_state_file, slides, created_at';

/**
 * The deck on one item (0101), RLS-scoped like every other read here.
 *
 * ITS OWN QUERY RATHER THAN A JOIN ON ITEM_SELECT, and that is a deploy-ordering
 * rule rather than tidiness: migrations here are applied by hand, so a
 * deployment sitting between 0100 and 0101 is a real state, and PostgREST
 * refuses an ENTIRE select for one unknown relationship. Naming decks in the
 * shared item select would blank every classroom read until 0101 landed.
 * Failing soft here costs the deck panel and nothing else -- the 0092 reference
 * spec is loaded for exactly the same reason.
 */
export async function loadItemDeck(
	supabase: SupabaseClient,
	itemId: string
): Promise<ClassroomDeck | null> {
	try {
		const { data } = await supabase
			.from('classroom_decks')
			.select(DECK_SELECT)
			.eq('item_id', itemId)
			.maybeSingle();
		return normalizeDeckRow(data as Record<string, unknown> | null);
	} catch {
		return null;
	}
}

/**
 * One call to the ingest route, with every way it can fail told apart.
 *
 * A fetch that rejects, a fetch that runs out of time and a response that
 * carries an error status are three different diagnoses -- and on a deployment
 * whose server logs are not to hand they are the ONLY diagnosis available -- so
 * each comes back under its own code rather than as one "something went wrong".
 * The timeout is ours: a request the platform kills mid-flight can otherwise
 * hang a browser tab indefinitely, which is exactly what a stuck progress bar
 * looks like.
 */
interface StageFailure {
	failed: true;
	code: string;
	message: string;
	status?: number;
	body?: Record<string, unknown> | null;
}

async function deckStage(
	payload: Record<string, unknown>,
	opts: { timeoutMs: number; signal?: AbortSignal }
): Promise<Record<string, unknown> | StageFailure> {
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, opts.timeoutMs);
	const onAbort = () => controller.abort();
	opts.signal?.addEventListener('abort', onAbort, { once: true });

	try {
		const res = await fetch('/api/classroom/deck', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(payload),
			signal: controller.signal
		});
		const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
		if (!res.ok) {
			const failure: StageFailure = {
				failed: true,
				code: String(body?.code ?? `http_${res.status}`),
				message: String(body?.error ?? `The server refused this step (${res.status}).`),
				status: res.status,
				body
			};
			logDeckUpload(`ingest stage "${payload.stage}" refused`, {
				status: res.status,
				code: failure.code,
				reason: body?.reason,
				message: failure.message
			});
			return failure;
		}
		return body ?? {};
	} catch (e) {
		if (opts.signal?.aborted && !timedOut) throw new DeckUploadCancelled();
		const doing = payload.stage === 'finish' ? 'storing the deck' : 'unpacking the deck';
		const failure: StageFailure = timedOut
			? {
					failed: true,
					code: 'ingest_timeout',
					message: `The server did not answer within ${Math.round(opts.timeoutMs / 1000)}s while ${doing}.`
				}
			: {
					failed: true,
					code: 'ingest_network',
					message: `The connection to the server dropped while ${doing}.`
				};
		logDeckUpload(`ingest stage "${payload.stage}" failed`, {
			code: failure.code,
			message: (e as Error).message
		});
		return failure;
	} finally {
		clearTimeout(timer);
		opts.signal?.removeEventListener('abort', onAbort);
	}
}

function isFailure(v: Record<string, unknown> | StageFailure): v is StageFailure {
	return (v as StageFailure).failed === true;
}

/** How long any one ingest call may take before we call it hung. */
const STAGE_TIMEOUT_MS = 60_000;
/** A `files` stage is resumable by construction, so a blip is worth retrying. */
const STAGE_RETRIES = 3;

/**
 * Uploads a deck zip: ONE multipart POST to our own server (which authorizes
 * the caller, writes the zip to Drive, and reads the archive's index), then
 * drives the server through UNPACKING IT IN STAGES.
 *
 * The zip is capped at DECK_UPLOAD_MAX_ZIP_BYTES and refused up front,
 * client-side, if it is over -- see deckUploadSizeIssue in ./deck. Unpacking
 * is split across as many requests as it takes (0105), because storing a
 * real export's files back out to Drive is minutes of round trips and a
 * single request is killed at the platform's duration limit long before it
 * finishes -- which is what a browser sees as "the connection dropped" after
 * an upload that had actually worked.
 *
 * THE CLIENT IS THE THING THAT MAKES UNPACKING FINISH. Each `files` call does
 * what fits in its own budget and reports how far it got; this loops until
 * complete, so a request lost along the way costs one retry rather than the
 * whole deck. Every step is resumable, so a retry is safe by construction.
 *
 * Unlike uploadAttachment this carries the REFUSAL DETAIL back rather than
 * only a message: a zip with several plausible entry pages is answered with
 * the candidates, and the panel asks which one instead of the server
 * guessing. The answer comes back as `entryPath`, and re-ingesting then needs
 * a fresh upload -- the caller's slot was spent on the first attempt -- which
 * is why this path re-sends the zip rather than reusing anything.
 */
export const deckTransports: DeckTransports = {
	async uploadDeck(itemId, file, options) {
		const { entryPath = null, onProgress, signal } = options ?? {};

		const sizeIssue = deckUploadSizeIssue(file.size);
		if (sizeIssue) {
			// Refused before anything is sent: this is the "do not attempt an
			// upload the platform will reject" rule, not a server round trip.
			return { ok: false, code: 'too_large', message: sizeIssue };
		}

		let jobId: string | null = null;
		try {
			onProgress?.({ phase: 'preparing', loaded: 0, total: file.size });

			const form = new FormData();
			form.set('item_id', itemId);
			form.set('title', file.name.replace(/\.zip$/i, '').trim().slice(0, 200) || 'Presentation');
			if (entryPath) form.set('entry_path', entryPath);
			form.set('file', file, file.name);

			const started = await postDeckZip({
				form,
				total: file.size,
				signal,
				onProgress: (loaded) => onProgress?.({ phase: 'uploading', loaded, total: file.size })
			});
			if (!started.ok) {
				return {
					ok: false,
					code: started.code,
					message: started.message,
					candidates: started.candidates ?? []
				};
			}
			jobId = started.jobId;
			const total = started.totalFiles;
			const warnings = started.warnings;

			// Files, until the plan is exhausted. Each call is bounded by the
			// server's own budget, so this is where a big deck's time goes.
			let done = 0;
			onProgress?.({ phase: 'unpacking', loaded: 0, total });
			// A generous bound rather than a while(true): one call per file is
			// the worst case, and this can never spin.
			for (let call = 0; call < total + STAGE_RETRIES * 4 + 4; call++) {
				let step = await deckStage(
					{ stage: 'files', job_id: jobId },
					{ timeoutMs: STAGE_TIMEOUT_MS, signal }
				);
				// Only a TRANSPORT failure is retried: a refusal is an answer.
				for (
					let retry = 0;
					retry < STAGE_RETRIES &&
					isFailure(step) &&
					(step.code === 'ingest_network' || step.code === 'ingest_timeout');
					retry++
				) {
					await new Promise((r) => setTimeout(r, 500 * 2 ** retry));
					step = await deckStage(
						{ stage: 'files', job_id: jobId },
						{ timeoutMs: STAGE_TIMEOUT_MS, signal }
					);
				}
				if (isFailure(step)) return { ok: false, code: step.code, message: step.message };

				const next = Number(step.files_done ?? done);
				if (next <= done && step.complete !== true) {
					// No progress and not finished: stop rather than loop.
					return {
						ok: false,
						code: 'no_progress',
						message: 'The server stopped making progress unpacking this deck.'
					};
				}
				done = next;
				onProgress?.({ phase: 'unpacking', loaded: done, total });
				if (step.complete === true) break;
			}

			// Store the manifest. Short, and the only step that writes rows.
			onProgress?.({ phase: 'storing', loaded: total, total });
			const stored = await deckStage(
				{ stage: 'finish', job_id: jobId },
				{ timeoutMs: STAGE_TIMEOUT_MS, signal }
			);
			if (isFailure(stored)) return { ok: false, code: stored.code, message: stored.message };
			jobId = null;

			return {
				ok: true,
				message: 'Deck uploaded.',
				warnings,
				replaced: stored.replaced === true,
				fileCount: Number(stored.file_count ?? 0)
			};
		} catch (e) {
			if (e instanceof DeckUploadCancelled) {
				return { ok: false, cancelled: true, message: 'Upload cancelled.' };
			}
			const err = e as DeckUploadError;
			logDeckUpload('upload failed', { code: err.code, detail: err.detail, message: err.message });
			return { ok: false, code: err.code, message: err.message || 'Upload failed.' };
		} finally {
			// An unfinished job holds a Drive folder of half a deck and the
			// staged zip. Abandoning it sweeps BOTH, so a failure leaves no
			// partial deck and nothing orphaned.
			if (jobId) {
				void fetch('/api/classroom/deck', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ stage: 'abort', job_id: jobId })
				}).catch(() => {});
			}
		}
	},
	async deleteDeck(itemId) {
		try {
			const res = await fetch(`/api/classroom/deck?item_id=${encodeURIComponent(itemId)}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { error?: string } | null;
				return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
			}
			return { ok: true, message: 'Deck removed.' };
		} catch (e) {
			return { ok: false, message: (e as Error).message || 'Remove failed.' };
		}
	}
};

/**
 * NO `storage_key` HERE, DELIBERATELY. Nothing on the client needs it: the kind
 * badge and the thumbnail decision both read the FILENAME (`fileKindLabel`,
 * `isImageAttachment`), the serve route resolves the backing itself, and the
 * delete RPC reports which handle the row carried. Selecting a column no caller
 * reads would buy a rung -- and one more way for this select to fail on a
 * pre-0135 deployment -- for nothing.
 */
const INSTRUCTOR_ATTACHMENT_SELECT = 'id, item_id, filename, mime_type, size_bytes, sort_order';
const INSTRUCTOR_RESOURCE_SELECT = 'id, item_id, label, url, sort_order';

/**
 * Fetches instructor-only attachments + links for a batch of items and merges
 * them in. NEVER called for a non-manager: every server load that reads
 * `canManage === true` calls this explicitly, and every other read simply
 * never does -- so a student's item read never even carries the query, and
 * `instructorAttachments`/`instructorLinks` stay `undefined` for them (RLS
 * would also return nothing, but the caller is not supposed to ask).
 */
export async function mergeInstructorMaterials(
	supabase: SupabaseClient,
	items: ClassroomItem[]
): Promise<ClassroomItem[]> {
	if (!items.length) return items;
	const ids = items.map((i) => i.id);
	const [attRes, linkRes] = await Promise.all([
		supabase
			.from('classroom_instructor_attachments')
			.select(INSTRUCTOR_ATTACHMENT_SELECT)
			.in('item_id', ids)
			.order('sort_order'),
		supabase
			.from('classroom_instructor_resources')
			.select(INSTRUCTOR_RESOURCE_SELECT)
			.in('item_id', ids)
			.order('sort_order')
	]);

	const attByItem = new Map<string, ClassroomAttachment[]>();
	for (const row of (attRes.data ?? []) as Record<string, unknown>[]) {
		const key = String(row.item_id);
		const list = attByItem.get(key) ?? [];
		list.push({
			id: String(row.id),
			filename: String(row.filename),
			mime_type: String(row.mime_type),
			size_bytes: (row.size_bytes as number | null) ?? null,
			sort_order: Number(row.sort_order ?? 0)
		});
		attByItem.set(key, list);
	}

	const linksByItem = new Map<string, ItemLink[]>();
	for (const row of (linkRes.data ?? []) as Record<string, unknown>[]) {
		const key = String(row.item_id);
		const list = linksByItem.get(key) ?? [];
		list.push({
			id: String(row.id),
			label: String(row.label),
			url: String(row.url),
			sort_order: Number(row.sort_order ?? 0)
		});
		linksByItem.set(key, list);
	}

	return items.map((i) => ({
		...i,
		instructorAttachments: attByItem.get(i.id) ?? [],
		instructorLinks: linksByItem.get(i.id) ?? []
	}));
}

/**
 * Creating and editing an item go through a ROUTE rather than the RPC directly,
 * for the same class of reason deleting one does: there is server-side work in
 * the way. The body is an authored rich document now, and turning the editor's
 * arbitrary output into the closed stored shape is a normalization step that
 * must not be something a client could skip or replace -- so it runs in
 * /api/classroom/item, under `$lib/server`, and this is a thin caller of it.
 *
 * The RPC still runs under the caller's own cookie session inside that handler,
 * so teacher-of-record and every other authority rule are untouched, and a
 * refusal comes back as the database's own message for a component to render.
 */
async function saveItem(payload: {
	mode: 'create' | 'update';
	id?: string;
	kind?: string;
	sectionIds?: string[];
	input: ItemInput;
	published: boolean | null;
}): Promise<TxResult<{ itemId: string; formattingDropped?: boolean }>> {
	try {
		const res = await fetch('/api/classroom/item', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				mode: payload.mode,
				id: payload.id,
				kind: payload.kind,
				sectionIds: payload.sectionIds,
				published: payload.published,
				title: payload.input.title,
				bodyDoc: payload.input.bodyDoc,
				points: payload.input.points,
				dueAt: payload.input.dueAt,
				publishAt: payload.input.publishAt ?? null,
				category: payload.input.category,
				links: payload.input.links
			})
		});
		const body = (await res.json().catch(() => null)) as
			| { error?: string; item_id?: string; formatting_dropped?: boolean }
			| null;
		if (!res.ok) {
			return { ok: false, message: body?.error ?? `Save failed (${res.status}).` };
		}
		const itemId = body?.item_id ?? payload.id;
		if (!itemId) return { ok: false, message: 'Save failed.' };
		// The item's own content moved, which changes the exported metadata
		// (title, posted sections) even when the spec itself did not. The server
		// skips anything carrying no spec, so an announcement's save pings and is
		// answered "nothing to export" rather than being filtered here -- one
		// place decides what is exportable, and it is the one with the data.
		pingClassroomExport(itemId);
		return { ok: true, data: { itemId, formattingDropped: body?.formatting_dropped === true } };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Save failed.' };
	}
}

/**
 * Deleting content goes through a ROUTE, not the RPC directly: the cascade
 * takes the attachment rows with it, and the Drive blobs they were the last
 * reference to have to be swept server-side (see /api/classroom/delete-content).
 */
async function deleteItem(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch('/api/classroom/delete-content', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Delete failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Delete failed.' };
	}
}

const SUBMISSION_SELECT_BASE =
	'id, item_id, student_email, state, submitted_at, returned_at, rubric_scores, score, ' +
	'teacher_comment, graded_by, graded_at, updated_at';

/** criterion_comments arrives with 0095. */
const SUBMISSION_SELECT = `${SUBMISSION_SELECT_BASE}, criterion_comments`;

/**
 * Submissions, degrading to the pre-0095 column list when that migration has
 * not been applied yet -- migrations here are pasted in by hand, so a deploy
 * sitting between two of them is a real state, and one unknown column would
 * otherwise blank an entire assignment (the notebook loader's widen-then-degrade
 * chain).
 */
async function selectSubmissions(supabase: SupabaseClient, itemId: string, one: boolean) {
	const run = (columns: string) => {
		const q = supabase.from('classroom_submissions').select(columns).eq('item_id', itemId);
		return one ? q.maybeSingle() : q;
	};
	const full = await run(SUBMISSION_SELECT);
	return full.error ? await run(SUBMISSION_SELECT_BASE) : full;
}

/**
 * The oldest schema this app supports for a hand-in file: 0086's own columns.
 * This is the rung that must keep working on a deployment sitting anywhere
 * before 0133, and it is the answer to "what did we always have".
 */
export const SUBMISSION_FILE_SELECT =
	'id, submission_id, block_id, caption, filename, mime_type, size_bytes, sort_order';

/**
 * + 0133's storage key. ITS OWN RUNG, and the capability it reports is
 * `storageReady`.
 *
 * WHAT IT BUYS IS A THUMBNAIL, WHICH IS NOT COSMETIC HERE. Every storage-backed
 * hand-in carries `mime_type = 'application/octet-stream'` -- the record route
 * writes that literal deliberately, so nothing ever branches on a type the
 * uploader chose. So without this column there is NOTHING in the payload that
 * can tell a photograph from a CAD assembly, and `isSubmissionFileImage`
 * answers false for every hand-in ever made through 0133. An imageZone, which
 * is the block a student submits photo evidence into, then renders a column of
 * download links. That is the regression this rung exists to prevent, and it
 * would arrive silently: nothing errors, the files are all there, they are just
 * no longer pictures.
 *
 * WHY A RUNG RATHER THAN JUST ADDING THE COLUMN. Migrations here are pasted in
 * by hand, so a deployment sitting between 0132 and 0133 is a real state, and
 * PostgREST refuses the ENTIRE select for one unknown column -- naming
 * `storage_key` unconditionally would blank every hand-in on every assignment
 * until 0133 landed, which is a far worse failure than a missing thumbnail.
 */
export const SUBMISSION_FILE_SELECT_STORAGE = `${SUBMISSION_FILE_SELECT}, storage_key`;

/** The embedded parent, which is how both call sites scope to one item. */
function submissionFileQuery(supabase: SupabaseClient, itemId: string, columns: string) {
	return supabase
		.from('classroom_submission_files')
		.select(`${columns}, classroom_submissions!inner(item_id)`)
		.eq('classroom_submissions.item_id', itemId)
		.order('sort_order');
}

export interface SubmissionFilesResult {
	rows: SubmissionFileRow[];
	/**
	 * Did the payload actually come back WITH `storage_key`. Starts false and is
	 * turned on only by the wide rung succeeding -- never inferred from the rows,
	 * because an item with no hand-ins yet returns an empty array on both rungs
	 * and would otherwise report whichever the code guessed.
	 */
	storageReady: boolean;
	error: unknown;
}

/**
 * The hand-in files for one item, widest-first. THE ONE LADDER, called by both
 * the student engine load and the grading console, so the two surfaces cannot
 * end up on different rungs and disagree about which files are pictures.
 */
async function selectSubmissionFiles(
	supabase: SupabaseClient,
	itemId: string
): Promise<SubmissionFilesResult> {
	const wide = await submissionFileQuery(supabase, itemId, SUBMISSION_FILE_SELECT_STORAGE);
	if (!wide.error) {
		return { rows: (wide.data ?? []) as unknown as SubmissionFileRow[], storageReady: true, error: null };
	}
	const narrow = await submissionFileQuery(supabase, itemId, SUBMISSION_FILE_SELECT);
	return {
		rows: (narrow.data ?? []) as unknown as SubmissionFileRow[],
		storageReady: false,
		error: narrow.error
	};
}

function opResult(res: unknown): { ok: true; data: EngineOpResult } {
	return { ok: true, data: (res ?? { ok: true }) as EngineOpResult };
}

/**
 * The student half of the assignment engine: autosave, files, submit,
 * unsubmit. Reads are RLS-scoped selects with NO student_email filter (the
 * /coin-balance doctrine -- the policy IS the filter); writes are the 0086
 * SECURITY DEFINER RPCs, which resolve the caller themselves.
 */
export function createEngineTransports(supabase: SupabaseClient): AssignmentEngineTransports {
	return {
		async saveResponse(itemId, blockId, value) {
			const { data: res, error } = await supabase.rpc('classroom_save_response', {
				p_item_id: itemId,
				p_block_id: blockId,
				p_value: value
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async submitAssignment(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_submit_assignment', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async unsubmitAssignment(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_unsubmit_assignment', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		/**
		 * THE STUDENT HALF, AND IT IS THE SAME FUNCTION. What used to be a
		 * second multipart POST with its own error wording is now one call into
		 * $lib/classroom/file-upload with `role: 'submission'` -- so a hand-in
		 * and a handout cannot end up describing the same refusal differently,
		 * and a 60 MB assembly is as ordinary here as it is there.
		 */
		async uploadSubmissionFile(itemId, file, blockId = null, caption = null, onProgress) {
			const res = await uploadClassroomFile({
				role: 'submission',
				itemId,
				file,
				blockId,
				caption,
				onProgress
			});
			if (!res.ok) {
				return { ok: false, message: res.message, gate: res.gate, retryable: res.retryable };
			}
			return { ok: true, data: { file: res.row as SubmissionFileRow | undefined } };
		},
		async deleteSubmissionFile(fileId) {
			try {
				const res = await fetch(`/api/classroom/submission-file/${fileId}`, { method: 'DELETE' });
				const body = (await res.json().catch(() => null)) as
					| { error?: string; reason?: string }
					| null;
				if (!res.ok) {
					return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
				}
				return { ok: true, data: (body ?? { ok: true }) as EngineOpResult };
			} catch (e) {
				return { ok: false, message: (e as Error).message || 'Remove failed.' };
			}
		},
		async setFileCaption(fileId, caption) {
			const { data: res, error } = await supabase.rpc('classroom_set_submission_file_caption', {
				p_id: fileId,
				p_caption: caption
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async reloadStudent(itemId) {
			const data = await loadStudentEngineData(supabase, itemId);
			if (!data) return { ok: false, message: 'Could not reload this assignment.' };
			return { ok: true, data };
		}
	};
}

/**
 * The caller's OWN engine slice for one assignment. Every select here is
 * RLS-scoped with no student filter; for a student the policies return exactly
 * their own rows. (A manager would legitimately read every student's rows
 * through the same policies -- which is why this is only ever called for the
 * non-manager view; the grading console loads per-item data explicitly.)
 */
export async function loadStudentEngineData(
	supabase: SupabaseClient,
	itemId: string
): Promise<StudentEngineData | null> {
	const [specRes, rubricRes, submissionRes, responsesRes, filesRes, approvalsRes] =
		await Promise.all([
			supabase.from('classroom_assignment_specs').select('spec').eq('item_id', itemId).maybeSingle(),
			supabase.from('classroom_rubrics').select('criteria').eq('item_id', itemId).maybeSingle(),
			selectSubmissions(supabase, itemId, true),
			supabase
				.from('classroom_responses')
				.select('item_id, student_email, block_id, value, updated_at')
				.eq('item_id', itemId),
			selectSubmissionFiles(supabase, itemId),
			supabase
				.from('classroom_module_approvals')
				.select('item_id, student_email, module_id, approved_by, approved_at')
				.eq('item_id', itemId)
		]);
	// The spec/rubric miss is an ordinary state; a TABLE-level error (0086 not
	// applied) reads as "no engine" and the caller falls soft.
	if (specRes.error && submissionRes.error) return null;
	return {
		spec: (specRes.data?.spec as StudentEngineData['spec']) ?? null,
		rubric: (rubricRes.data?.criteria as StudentEngineData['rubric']) ?? null,
		submission: submissionRes.data
			? normalizeSubmissionRow(submissionRes.data as unknown as Record<string, unknown>)
			: null,
		responses: (responsesRes.data ?? []) as ResponseRow[],
		files: filesRes.rows,
		// The capability, reported rather than assumed: false means this payload
		// cannot tell a storage-backed picture from a CAD file, so the surface
		// says thumbnails are unavailable instead of silently showing none.
		filesStorageReady: filesRes.storageReady,
		approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
	};
}

// ---------------------------------------------------------------------------
// THE INSTRUCTOR WORKING COPY (0128).
// ---------------------------------------------------------------------------

const INSTRUCTOR_COPY_SELECT = 'item_id, instructor_email, block_id, value, updated_at';
const INSTRUCTOR_KEY_SELECT = 'item_id, instructor_email, designated_at, designated_by';

/**
 * The instructor's own working copy of one assignment, plus the designated key
 * when somebody else authored it.
 *
 * FAILS SOFT TO NULL, and the surface then renders exactly what a manager saw
 * before 0128 (the read-only spec). Migrations here are applied by hand, so a
 * deployment sitting between 0127 and 0128 is a real state and PostgREST
 * answers a whole select with an error for an unknown table -- a manager must
 * not lose the assignment page over a feature that has not landed yet.
 *
 * THE `mine` FILTER IS ATTRIBUTION, NOT AUTHORIZATION. RLS legitimately returns
 * two people's rows here -- the caller's own and the designated key author's --
 * so the split has to be made by somebody, and the policy is still the only
 * thing deciding what arrives.
 */
export async function loadInstructorCopy(
	supabase: SupabaseClient,
	itemId: string,
	myEmail: string
): Promise<InstructorCopyData | null> {
	const me = myEmail.trim().toLowerCase();
	const [copiesRes, keyRes] = await Promise.all([
		supabase.from('classroom_instructor_responses').select(INSTRUCTOR_COPY_SELECT).eq('item_id', itemId),
		supabase
			.from('classroom_instructor_keys')
			.select(INSTRUCTOR_KEY_SELECT)
			.eq('item_id', itemId)
			.maybeSingle()
	]);
	if (copiesRes.error) return null;
	const rows = (copiesRes.data ?? []) as InstructorCopyRow[];
	const key = (keyRes.data as InstructorKeyRow | null) ?? null;
	return {
		myEmail: me,
		mine: rows.filter((r) => r.instructor_email === me),
		key,
		keyResponses:
			key && key.instructor_email !== me
				? rows.filter((r) => r.instructor_email === key.instructor_email)
				: []
	};
}

/**
 * Writes for that copy. Every one is a 0128 RPC that resolves the caller
 * itself: none of them takes an email, so there is no identity for a client to
 * get wrong or to forge.
 */
export function createInstructorCopyTransports(
	supabase: SupabaseClient,
	myEmail: string
): InstructorCopyTransports {
	return {
		async saveResponse(itemId, blockId, value) {
			const { data: res, error } = await supabase.rpc('classroom_save_instructor_response', {
				p_item_id: itemId,
				p_block_id: blockId,
				p_value: value
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async designateKey(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_designate_instructor_key', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async undesignateKey(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_undesignate_instructor_key', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async reload(itemId) {
			const data = await loadInstructorCopy(supabase, itemId, myEmail);
			if (!data) return { ok: false, message: 'Could not reload your instructor copy.' };
			return { ok: true, data };
		}
	};
}

/** The teacher half: spec import, rubric, grading, the approval gate. */
/**
 * The reference-document half of the teacher tools (0092). Its own factory
 * rather than two more methods on the assignment engine's: an assignment and a
 * material are different kinds, the RPCs refuse each other's kind server-side,
 * and a material page has no business carrying grading transports it can never
 * call.
 */
export function createReferenceTransports(supabase: SupabaseClient): ReferenceTransports {
	return {
		async setReferenceSpec(itemId, spec) {
			const { error } = await supabase.rpc('classroom_set_reference_spec', {
				p_item_id: itemId,
				p_spec: spec
			});
			if (error) return fail(error);
			pingClassroomExport(itemId);
			return { ok: true, data: undefined };
		},
		async setPublic(itemId, isPublic) {
			const { data, error } = await supabase.rpc('classroom_set_item_public', {
				p_item_id: itemId,
				p_public: isPublic
			});
			return error
				? fail(error)
				: { ok: true, data: (data ?? { ok: true }) as PublicToggleResult };
		}
	};
}

/**
 * THE TWO CHECK-IN LINK WRITES (0120), and there are only two because the third
 * thing you might expect -- editing the check-in itself -- already has a home:
 * `/notebook/review`'s SessionManager owns the date, the label and which
 * classes it runs in, exactly as it did before an item could claim one.
 *
 * `createForItem` is ONE round trip that creates the check-in and points every
 * one of its postings at the item, because a client-side create-then-link loop
 * can stop halfway with nobody able to say how much landed. The RPC calls
 * `notebook_admin_upsert_session` and `notebook_link_session_item` itself.
 *
 * `setGuidance` (0123) is the THIRD, and it is a separate round trip on
 * purpose rather than a fourth parameter on the create: the prompt is edited
 * long after the check-in is scheduled, by whoever notices the instruction was
 * unclear, and folding it into a create would leave that edit with no door.
 * The check-in's date, label and classes are still the review console's, which
 * is why there is no fourth write here.
 */
export function createCheckInTransports(supabase: SupabaseClient): ClassCheckInTransports {
	return {
		async createForItem(itemId, draft) {
			const issue = checkInDraftIssue(draft);
			if (issue) return { ok: false, message: issue };
			// `checkInDraftPayload` deliberately drops the guidance prompt: this RPC
			// runs `notebook_admin_upsert_session`, and nothing but a check-in's own
			// authored columns may travel through a whole-row replace that also
			// reconciles the section list. The prompt follows through setGuidance.
			const payload = checkInDraftPayload(draft);
			const { data, error } = await supabase.rpc('notebook_create_item_check_in', {
				p_item_id: itemId,
				p_unit_number: payload.unit_number,
				p_session_date: payload.session_date,
				p_session_label: payload.session_label
			});
			if (error) return fail(error);
			// The id the caller needs to write a prompt against, and to retry that
			// write without scheduling a second check-in.
			const sessionId = (data as { session_id?: string } | null)?.session_id ?? null;
			return { ok: true, sessionId };
		},
		async unlink(sessionId, sectionId) {
			const { error } = await supabase.rpc('notebook_unlink_session_item', {
				p_session_id: sessionId,
				p_section_id: sectionId
			});
			return error ? fail(error) : { ok: true };
		},
		// Not a `supabase.rpc` call like its two siblings, and it cannot be: the
		// browser holds the EDITOR's document and the RPC takes the stored shape,
		// and the translation between them is a `$lib/server` whitelist. One
		// egress point for that write, in $lib/check-in-guidance, shared with the
		// review console so the two cannot drift.
		async setGuidance(sessionId, doc) {
			const res = await saveSessionGuidance(sessionId, doc);
			return res.ok ? { ok: true } : { ok: false, message: res.message };
		}
	};
}

export function createTeacherEngineTransports(
	supabase: SupabaseClient
): AssignmentTeacherTransports {
	return {
		async setSpec(itemId, spec) {
			const { error } = await supabase.rpc('classroom_set_assignment_spec', {
				p_item_id: itemId,
				p_spec: spec
			});
			if (error) return fail(error);
			pingClassroomExport(itemId);
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			const { error } = await supabase.rpc('classroom_set_rubric', {
				p_item_id: itemId,
				p_criteria: criteria
			});
			if (error) return fail(error);
			// The rubric is part of what an assignment IS, so it rides the same
			// export -- a rubric edit alone still changes the exported folder.
			pingClassroomExport(itemId);
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments) {
			const { data: res, error } = await supabase.rpc('classroom_grade_submission', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_scores: scores,
				p_comment: comment,
				p_return: release,
				p_criterion_comments: criterionComments ?? {}
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			const { error } = await supabase.rpc('classroom_approve_module', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_module_id: moduleId,
				p_approved: approved
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async loadGrading(itemId, sectionId) {
			const [rosterRes, submissionsRes, responsesRes, filesRes, approvalsRes] =
				await Promise.all([
					// The manager exclusion rides in on this read (0138): the roster
					// arrives carrying `manages`, and studentWorkRows is the one
					// place that acts on it.
					loadSectionRoster(supabase, sectionId),
					selectSubmissions(supabase, itemId, false),
					supabase
						.from('classroom_responses')
						.select('item_id, student_email, block_id, value, updated_at')
						.eq('item_id', itemId),
					selectSubmissionFiles(supabase, itemId),
					supabase
						.from('classroom_module_approvals')
						.select('item_id, student_email, module_id, approved_by, approved_at')
						.eq('item_id', itemId)
				]);
			if (!rosterRes.ok) return rosterRes;
			return {
				ok: true,
				data: {
					roster: rosterRes.data.rows,
					submissions: ((submissionsRes.data ?? []) as unknown as Record<string, unknown>[]).map(
						normalizeSubmissionRow
					),
					responses: (responsesRes.data ?? []) as ResponseRow[],
					files: filesRes.rows,
					// Same rung, same flag as the student's own view. Both surfaces
					// read ONE ladder, so a teacher grading and the student who
					// handed the file in can never be looking at different answers
					// about which of these are pictures.
					filesStorageReady: filesRes.storageReady,
					approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
				}
			};
		}
	};
}

export const UNIT_SELECT = 'id, course_id, name, sort_order';

/**
 * A course's units (0111), RLS-scoped like every other read here.
 *
 * FAILS SOFT TO AN EMPTY LIST, which is the same answer a course with no units
 * gives: migrations are pasted in by hand, so a deployment sitting between 0110
 * and 0111 is a real state, and a class view must not break because it cannot
 * group. With no units the view is one chronological list, which is exactly what
 * it was before units existed.
 */
export async function loadCourseUnits(
	supabase: SupabaseClient,
	courseId: string | null | undefined
): Promise<ClassroomUnit[]> {
	if (!courseId) return [];
	try {
		const { data, error } = await supabase
			.from('classroom_units')
			.select(UNIT_SELECT)
			.eq('course_id', courseId)
			.order('sort_order');
		if (error) return [];
		return ((data ?? []) as Record<string, unknown>[]).map(normalizeUnitRow);
	} catch {
		return [];
	}
}

/** Thin callers of 0111's four SECURITY DEFINER RPCs. */
export function createUnitTransports(supabase: SupabaseClient): ClassroomUnitTransports {
	return {
		async upsertUnit(courseId, name, id = null) {
			const args: Record<string, unknown> = { p_course_id: courseId, p_name: name };
			if (id) args.p_id = id;
			const { data, error } = await supabase.rpc('classroom_upsert_unit', args);
			if (error) return fail(error);
			const res = (data ?? {}) as { ok?: boolean; unit_id?: string; created?: boolean; reason?: string };
			return {
				ok: true,
				data: {
					unitId: res.unit_id ?? null,
					created: res.created === true,
					duplicate: res.ok === false && res.reason === 'duplicate_name'
				}
			};
		},
		async deleteUnit(id) {
			const { data, error } = await supabase.rpc('classroom_delete_unit', { p_id: id });
			if (error) return fail(error);
			return { ok: true, data: { unfiled: Number((data as { unfiled?: number })?.unfiled ?? 0) } };
		},
		async setUnitOrder(courseId, unitIds) {
			const { error } = await supabase.rpc('classroom_set_unit_order', {
				p_course_id: courseId,
				p_unit_ids: unitIds
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async setItemUnit(itemId, unitId) {
			const { data, error } = await supabase.rpc('classroom_set_item_unit', {
				p_item_id: itemId,
				p_unit_id: unitId
			});
			if (error) return fail(error);
			return { ok: true, data: (data ?? { ok: true }) as { ok: boolean; reason?: string } };
		},
		async reloadUnits(courseId) {
			return { ok: true, data: await loadCourseUnits(supabase, courseId) };
		}
	};
}

export function createClassroomTransports(supabase: SupabaseClient): ClassroomManageTransports {
	return {
		async upsertCourse(code, title, active = true, id = null) {
			const args: Record<string, unknown> = { p_code: code, p_title: title, p_active: active };
			if (id) args.p_id = id;
			const { data: res, error } = await supabase.rpc('classroom_upsert_course', args);
			if (error) return fail(error);
			const r = res as { course_id: string; created: boolean };
			return { ok: true, data: { courseId: r.course_id, created: r.created === true } };
		},
		async upsertSection(courseId, label, block, id = null, teacherEmail = null) {
			const args: Record<string, unknown> = {
				p_course_id: courseId,
				p_label: label,
				p_block: block
			};
			if (teacherEmail) args.p_teacher_email = teacherEmail;
			if (id) args.p_id = id;
			const { data: res, error } = await supabase.rpc('classroom_upsert_section', args);
			if (error) return fail(error);
			return { ok: true, data: { sectionId: (res as { section_id: string }).section_id } };
		},
		async setSectionActive(id, active) {
			const { error } = await supabase.rpc('classroom_set_section_active', {
				p_id: id,
				p_active: active
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async deleteSection(id, confirmLabel) {
			const { data: res, error } = await supabase.rpc('classroom_delete_section', {
				p_id: id,
				p_confirm_label: confirmLabel
			});
			if (error) return fail(error);
			return { ok: true, data: res as SectionDeleteResult };
		},
		async reloadSections() {
			const [sectionsRes, coursesRes] = await Promise.all([
				supabase.from('classroom_sections').select(SECTION_SELECT),
				supabase.from('classroom_courses').select('id, code, title, active').order('code')
			]);
			if (sectionsRes.error) return fail(sectionsRes.error);
			return {
				ok: true,
				data: {
					sections: ((sectionsRes.data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
					courses: (coursesRes.data ?? []) as ClassroomCourse[]
				}
			};
		},
		async loadRoster(sectionId) {
			// The People tab shows EVERY row, manager rows included -- that row is
			// what somebody came here to remove. It still reads through the one
			// roster reader, so the flag it labels them with is the same flag the
			// grading console drops them by.
			const res = await loadSectionRoster(supabase, sectionId);
			return res.ok ? { ok: true, data: res.data.rows } : res;
		},
		async removeEnrollment(sectionId, email) {
			const { data: res, error } = await supabase.rpc('classroom_remove_enrollment', {
				p_section_id: sectionId,
				p_student_email: email
			});
			if (error) return fail(error);
			return { ok: true, data: res as EnrollmentRemoval };
		},
		async setEnrollment(sectionId, email, name, active) {
			const { error } = await supabase.rpc('classroom_set_enrollment', {
				p_section_id: sectionId,
				p_student_email: email,
				p_display_name: name,
				p_active: active
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async updateEnrollment(sectionId, email, newEmail, name) {
			const { data: res, error } = await supabase.rpc('classroom_update_enrollment', {
				p_section_id: sectionId,
				p_student_email: email,
				p_new_email: newEmail,
				p_display_name: name
			});
			if (error) return fail(error);
			return { ok: true, data: res as { ok: boolean; reason?: string } };
		},
		async importRoster(rows) {
			const { data: res, error } = await supabase.rpc('classroom_import_roster', { p_rows: rows });
			if (error) return fail(error);
			return { ok: true, data: res as ImportSummary };
		},
		async loadContent(sectionId) {
			const { items, error } = await itemsForSection(supabase, sectionId);
			if (error) return fail(error);
			// The manage console is teacher-only for the whole route, so every
			// item it lists gets its instructor-only materials merged in.
			return { ok: true, data: { items: await mergeInstructorMaterials(supabase, items) } };
		},
		createItem: (kind, sectionIds, input, published) =>
			saveItem({ mode: 'create', kind, sectionIds, input, published }),
		updateItem: (id, input, published) => saveItem({ mode: 'update', id, input, published }),
		deleteItem,
		async duplicateItem(id) {
			const { data: res, error } = await supabase.rpc('classroom_duplicate_item', {
				p_item_id: id
			});
			if (error) return fail(error);
			return { ok: true, data: { itemId: (res as { item_id: string }).item_id } };
		},
		async addPostings(itemId, sectionIds) {
			const { data: res, error } = await supabase.rpc('classroom_add_postings', {
				p_item_id: itemId,
				p_section_ids: sectionIds
			});
			if (error) return fail(error);
			return { ok: true, data: { added: Number((res as { added?: number })?.added ?? 0) } };
		},
		async removePosting(itemId, sectionId) {
			const { data: res, error } = await supabase.rpc('classroom_remove_posting', {
				p_item_id: itemId,
				p_section_id: sectionId
			});
			if (error) return fail(error);
			return { ok: true, data: res as { ok: boolean; reason?: string } };
		},
		async setPublished(itemId, published) {
			const { error } = await supabase.rpc('classroom_set_published', {
				p_item_id: itemId,
				p_published: published
			});
			if (error) return fail(error);
			// "On publish", per the brief. Unpublishing pings too and lands
			// nothing new -- the export is idempotent, and deliberately does NOT
			// delete the exported folder: the repo is a record of what was
			// authored, not a mirror of what is currently visible to a class.
			pingClassroomExport(itemId);
			return { ok: true, data: undefined };
		},
		async setPinned(itemId, pinned) {
			const { error } = await supabase.rpc('classroom_set_item_pinned', {
				p_item_id: itemId,
				p_pinned: pinned
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async setOrder(itemIds) {
			const { error } = await supabase.rpc('classroom_set_item_order', { p_item_ids: itemIds });
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async markViewed(itemId) {
			const { error } = await supabase.rpc('classroom_mark_item_viewed', { p_item_id: itemId });
			return error ? fail(error) : { ok: true, data: undefined };
		},
		uploadAttachment,
		deleteAttachment,
		uploadInstructorAttachment,
		deleteInstructorAttachment,
		async setInstructorResources(itemId, links) {
			const { error } = await supabase.rpc('classroom_set_instructor_resources', {
				p_item_id: itemId,
				p_resources: links
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		/**
		 * The grading-category vocabulary of every given course (0142), RAW.
		 *
		 * AN RPC AND NOT A SELECT, WHICH IS THE ONLY THING THIS FUNCTION HAS TO
		 * GET RIGHT. `classroom_items` is read through `classroom_can_read_item`,
		 * which gates PER SECTION -- so a select of `category` filtered on
		 * `course_id` is not refused and does not error: RLS silently narrows it
		 * to the caller's OWN sections and returns that with no signal anything
		 * was dropped. The composer's scope is the COURSE deliberately (its own
		 * comment: a teacher's vocabulary follows the course, not one block of
		 * it), so the narrowed answer would be the opposite of the intent
		 * wearing the appearance of success. `classroom_course_categories` is
		 * SECURITY DEFINER and gated per course on `_classroom_manages_course`,
		 * and it projects the one column.
		 *
		 * NOTHING IS RANKED, DE-DUPLICATED OR NORMALIZED HERE OR IN SQL. That is
		 * `courseCategorySuggestions`'s job and it is already tested; the repeats
		 * this returns are what it ranks BY.
		 *
		 * EVERY FAILURE DEGRADES TO NO SUGGESTIONS, and that is the whole failure
		 * story rather than an unhandled case: the composer maps a non-ok result
		 * to an empty list, which removes the datalist and leaves the plain
		 * free-text input the field has always been. So this transport needs no
		 * `PGRST202` rung -- there is no narrower read worth degrading TO (the
		 * select this replaces is the wrong answer, not a lesser one), and a
		 * deployment sitting between this merge and 0142 being applied by hand
		 * behaves exactly as production does today. A category nobody has ever
		 * used is typeable and savable regardless of what lands here.
		 */
		async loadCategorySuggestions(courseIds) {
			const { data, error } = await supabase.rpc('classroom_course_categories', {
				p_course_ids: courseIds
			});
			if (error) return fail(error);
			return { ok: true, data: Array.isArray(data) ? (data as string[]) : [] };
		}
	};
}

// ---------------------------------------------------------------------------
// THE HALL PASS (0143).
// ---------------------------------------------------------------------------

/**
 * Every reason `0143` can refuse with, as a value the client can switch on.
 *
 * A NARROW LIST, CHECKED. An unrecognised `reason` is NOT passed through as a
 * refusal -- it falls to the generic message below, because a string this
 * module has no sentence for would otherwise reach a student as a bare token.
 */
const HALL_PASS_REFUSALS = new Set<HallPassRefusal>([
	'taken',
	'already_out',
	'not_a_student',
	'not_open',
	'not_yours',
	// `0144`, manager path only: the named pass had already been signed back in.
	'already_closed',
	// `0174`. Both carry DETAIL the sentence is built from -- an instant for
	// the cooldown, a count and a cap for the limit -- which is why
	// `hallPassOutcome` below reads those fields off the row rather than
	// answering with the word alone.
	'cooldown',
	'limit_reached',
	// `0174`, the instructor override only: the name picked is not on the live
	// roster.
	'not_enrolled'
]);

function hallPassOutcome<T>(
	data: unknown,
	shape: (row: Record<string, unknown>) => T
): HallPassResult<T> {
	const row = (data ?? {}) as Record<string, unknown>;
	if (row.ok === true) return { ok: true, data: shape(row) };
	const reason = row.reason as HallPassRefusal | undefined;
	if (reason && HALL_PASS_REFUSALS.has(reason)) {
		// THE DETAIL RIDES WITH THE WORD (`0174`). A `cooldown` with its
		// `retry_at` dropped here becomes "wait a few minutes" instead of a clock
		// time, which is the refusal-with-no-time-in-it this limit exists to
		// avoid. Absent fields stay absent rather than becoming zeroes: `0143`'s
		// five reasons carry none of them and must not start claiming a limit of
		// nought.
		const detail: { retryAt?: string; used?: number; limit?: number } = {};
		if (typeof row.retry_at === 'string') detail.retryAt = row.retry_at;
		if (typeof row.used === 'number') detail.used = row.used;
		if (typeof row.limit === 'number') detail.limit = row.limit;
		return { ok: false, refusal: reason, ...detail };
	}
	return { ok: false, message: 'Something went wrong. Try again.' };
}

/**
 * ONE SHAPE FOR BOTH CLOSES, because they answer the identical object.
 *
 * `0144`'s two functions return `0143`'s close result unchanged -- the manager
 * fields are present and null on the student path rather than absent -- so the
 * surface reading a close needs no branch and there is one place where the
 * mapping from row to result is written down. Two copies of it is what stops
 * agreeing about a field somebody adds later.
 */
const hallPassClosedShape = (row: Record<string, unknown>): HallPassClosed => ({
	pass_id: String(row.pass_id ?? ''),
	opened_at: String(row.opened_at ?? ''),
	closed_at: String(row.closed_at ?? ''),
	closed_by_manager: row.closed_by_manager === true,
	student_name: (row.student_name as string | null) ?? null
});

/**
 * The `0143`/`0144` pass RPCs, called on the browser client as the student or
 * the instructor themselves.
 *
 * NOTHING HERE IS A BOUNDARY AND NOTHING HERE FILTERS. `classroom_hall_pass_state`
 * projects by role INSIDE the database, in two separately built branches, so a
 * student's payload has never contained another student's name and there is
 * nothing for this module to strip. If a name ever appears in a student's
 * result, the bug is in the migration and stripping it here would only hide it.
 *
 * A RAW ERROR IS NEVER RENDERED. `0143` raises only on genuine misuse (no
 * session, a class the caller cannot see); everything a surface must display
 * gracefully comes back as `{ok:false, reason}`. So an `error` here is turned
 * into one flat sentence rather than passed through -- a Postgres message can
 * carry a constraint name, and the capacity check is an index whose violation
 * text names the table and the column.
 */
export function createHallPassTransports(supabase: SupabaseClient): HallPassTransports {
	const call = async (fn: string, sectionId: string) =>
		supabase.rpc(fn, { p_section_id: sectionId });

	return {
		async load(sectionId) {
			const { data, error } = await call('classroom_hall_pass_state', sectionId);
			// A failed refresh keeps whatever is already on screen rather than
			// blanking it: the poll runs unattended and a transient failure must
			// not read as "the pass is free".
			if (error) return null;
			return (data as HallPassState | null) ?? null;
		},
		async open(sectionId) {
			const { data, error } = await call('classroom_hall_pass_open', sectionId);
			if (error) return { ok: false, message: 'Could not sign you out. Try again.' };
			return hallPassOutcome<HallPassOpened>(data, (row) => ({
				pass_id: String(row.pass_id ?? ''),
				opened_at: String(row.opened_at ?? '')
			}));
		},
		/**
		 * THE STUDENT'S OWN, AND IT SENDS NO IDENTIFIER. `p_section_id` is the
		 * only argument the RPC has; the person is `current_user_email()` inside
		 * the database, so closing somebody else's is not expressible from here.
		 */
		async closeMine(sectionId) {
			const { data, error } = await call('classroom_hall_pass_close_mine', sectionId);
			if (error) return { ok: false, message: 'Could not sign back in. Try again.' };
			return hallPassOutcome<HallPassClosed>(data, hallPassClosedShape);
		},
		/**
		 * THE INSTRUCTOR'S, AND IT NAMES THE PASS. The id comes from the manager
		 * branch of this caller's OWN state payload -- a student's payload has
		 * none to send, which is why the split costs no disclosure.
		 *
		 * NAMING IT IS THE FIX: `classroom_hall_pass_close(p_section_id)` closes
		 * whatever is open in the section at the instant the request lands, so a
		 * clear pressed while one student returns and another leaves closes the
		 * SECOND student's pass. The id is what carries the instructor's intent
		 * across that gap.
		 */
		async closeById(passId) {
			const { data, error } = await supabase.rpc('classroom_hall_pass_close_by_id', {
				p_pass_id: passId
			});
			if (error) return { ok: false, message: 'Could not sign the pass back in. Try again.' };
			return hallPassOutcome<HallPassClosed>(data, hallPassClosedShape);
		},
		/**
		 * THE OVERRIDE (`0174`), AND IT IS THE ONE CALL HERE THAT NAMES A
		 * STUDENT. The database refuses anybody who does not manage the section
		 * with the same sentence a nonexistent section raises, so this is
		 * plumbing rather than a boundary -- as everything else in this module
		 * is.
		 */
		async openFor(sectionId, studentEmail) {
			const { data, error } = await supabase.rpc('classroom_hall_pass_open_for', {
				p_section_id: sectionId,
				p_student_email: studentEmail
			});
			if (error) return { ok: false, message: 'Could not send that student out. Try again.' };
			return hallPassOutcome<HallPassOpenedFor>(data, (row) => ({
				pass_id: String(row.pass_id ?? ''),
				opened_at: String(row.opened_at ?? ''),
				student_email: String(row.student_email ?? ''),
				student_name: String(row.student_name ?? ''),
				opened_by: String(row.opened_by ?? '')
			}));
		}
	};
}

// ---------------------------------------------------------------------------
// THE SONG QUEUE (0145).
// ---------------------------------------------------------------------------

/**
 * Every reason `0145` can refuse with, as a value the client can switch on.
 *
 * A NARROW LIST, CHECKED. An unrecognised `reason` is NOT passed through as a
 * refusal -- it falls to the generic message below, because a string this module
 * has no sentence for would otherwise reach a student as a bare token.
 */
const SONG_REFUSALS = new Set<SongRefusal>([
	'not_a_student',
	'bad_url',
	'url_too_long',
	'note_too_long',
	'pending_cap',
	'already_decided',
	'debt',
	'not_priced',
	'reason_required',
	'reason_too_long'
]);

/**
 * THE NUMBERS AND NAMES A REFUSAL CARRIES, LIFTED IN ONE PLACE.
 *
 * `songRefusalMessage` states the cap, the limit, the student and the balance
 * inside its sentences, so dropping them here would leave every refusal reading
 * as its own fallback -- "3 requests waiting" would silently become the
 * hardcoded default rather than what the database actually counted.
 */
function songDetail(row: Record<string, unknown>): SongRefusalDetail {
	const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
	return {
		cap: num(row.cap),
		pending: num(row.pending),
		max: num(row.max),
		balance: num(row.balance),
		price: num(row.price),
		student_name: typeof row.student_name === 'string' ? row.student_name : undefined,
		status: row.status as SongRefusalDetail['status']
	};
}

function songOutcome<T>(
	data: unknown,
	shape: (row: Record<string, unknown>) => T
): SongResult<T> {
	const row = (data ?? {}) as Record<string, unknown>;
	if (row.ok === true) return { ok: true, data: shape(row) };
	const reason = row.reason as SongRefusal | undefined;
	if (reason && SONG_REFUSALS.has(reason)) {
		return { ok: false, refusal: reason, detail: songDetail(row) };
	}
	return { ok: false, message: 'Something went wrong. Try again.' };
}

/**
 * ONE SHAPE FOR BOTH DECISIONS, because they answer the identical object.
 *
 * `charged` is read straight off the row rather than inferred from the status:
 * a rejection answers 0 explicitly, and a console that has just charged
 * somebody on the row above must not leave "was this one charged too" to be
 * worked out. Two copies of that mapping is what stops agreeing about a field
 * somebody adds later.
 */
const songDecidedShape = (row: Record<string, unknown>): SongDecided => ({
	request_id: String(row.request_id ?? ''),
	status: (row.status as SongDecided['status']) ?? 'pending',
	student_name: String(row.student_name ?? ''),
	charged: typeof row.charged === 'number' ? row.charged : 0
});

/**
 * The `0145` song-queue RPCs, called on the browser client as the student or the
 * instructor themselves.
 *
 * NOTHING HERE IS A BOUNDARY AND NOTHING HERE FILTERS. `classroom_song_queue`
 * projects by role INSIDE the database, in two separately built branches, so a
 * student's payload has never contained a classmate's pending or rejected
 * request and there is nothing for this module to strip. If one ever appears in
 * a student's result, the bug is in the migration and stripping it here would
 * only hide it.
 *
 * A RAW ERROR IS NEVER RENDERED. `0145` raises only on genuine misuse (no
 * session, a class the caller cannot see, a request they may not decide);
 * everything a surface must display gracefully comes back as
 * `{ok:false, reason}`. So an `error` here is turned into one flat sentence
 * rather than passed through.
 */
export function createSongQueueTransports(supabase: SupabaseClient): SongQueueTransports {
	return {
		async load(sectionId) {
			const { data, error } = await supabase.rpc('classroom_song_queue', {
				p_section_id: sectionId
			});
			// A failed refresh keeps whatever is already on screen rather than
			// blanking it: the poll runs unattended and a transient failure must not
			// read as "nothing has been approved".
			if (error) return null;
			return (data as SongQueueState | null) ?? null;
		},
		/**
		 * THE STUDENT'S OWN, AND IT SENDS NO IDENTIFIER. The section, the link and
		 * the note are the only arguments the RPC has; the person is
		 * `current_user_email()` inside the database, so asking on somebody else's
		 * behalf is not expressible from here.
		 */
		async submit(sectionId, url, note) {
			const { data, error } = await supabase.rpc('classroom_song_request', {
				p_section_id: sectionId,
				p_url: url,
				p_note: note
			});
			if (error) return { ok: false, message: 'Could not send the request. Try again.' };
			return songOutcome<SongRequested>(data, (row) => ({
				request_id: String(row.request_id ?? ''),
				pending: typeof row.pending === 'number' ? row.pending : 0,
				cap: typeof row.cap === 'number' ? row.cap : 0
			}));
		},
		/**
		 * THE INSTRUCTOR'S, AND EACH NAMES THE REQUEST. The id comes from the
		 * manager branch of this caller's OWN state payload -- a student's payload
		 * carries no id for anybody else's request, which is why naming it costs no
		 * disclosure.
		 */
		async approve(requestId) {
			const { data, error } = await supabase.rpc('classroom_song_approve', {
				p_request_id: requestId
			});
			if (error) return { ok: false, message: 'Could not approve that request. Try again.' };
			return songOutcome<SongDecided>(data, songDecidedShape);
		},
		async reject(requestId, reason) {
			const { data, error } = await supabase.rpc('classroom_song_reject', {
				p_request_id: requestId,
				p_reason: reason
			});
			if (error) return { ok: false, message: 'Could not reject that request. Try again.' };
			return songOutcome<SongDecided>(data, songDecidedShape);
		}
	};
}
