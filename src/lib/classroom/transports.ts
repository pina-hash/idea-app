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
import { submitFeedback, type FeedbackEntry } from '$lib/feedback/feedback';
import {
	normalizeSubmissionRow,
	type AssignmentEngineTransports,
	type AssignmentTeacherTransports,
	type EngineOpResult,
	type ModuleApprovalRow,
	type ResponseRow,
	type StudentEngineData,
	type SubmissionFileRow
} from './assignment-spec';
import type { PublicToggleResult, ReferenceTransports } from './reference-spec';
import { deckUploadSizeIssue, normalizeDeckRow, type ClassroomDeck, type DeckTransports } from './deck';
import { DeckUploadCancelled, logDeckUpload, postDeckZip, type DeckUploadError } from './deck-upload';
import {
	normalizeItemRow,
	normalizeSectionRow,
	type ClassroomAttachment,
	type ClassroomCourse,
	type ClassroomEnrollment,
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

/**
 * The classroom's feedback writer: a bound caller of the SHARED 0053 insert
 * (own-row RLS, no RPC -- a note about yourself has nothing to forge). Every
 * classroom page hands this to ClassroomFeedback so the control is identical
 * everywhere and only its `context` differs.
 */
export function classroomFeedbackSubmit(
	supabase: SupabaseClient,
	userId: string | null | undefined
): ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null {
	if (!userId) return null;
	return (entry) => submitFeedback(supabase, userId, entry);
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
	const scheduled = await run(ITEM_SELECT_SCHEDULED);
	if (!scheduled.error) return scheduled;
	const rich = await run(ITEM_SELECT_RICH);
	if (!rich.error) return rich;
	return await run(ITEM_SELECT);
}

function fail(error: { message?: string } | null): { ok: false; message: string } {
	return { ok: false, message: error?.message ?? 'Something went wrong.' };
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

async function uploadAttachment(itemId: string, file: File): Promise<TxResult<undefined>> {
	const form = new FormData();
	form.set('file', file, file.name);
	form.set('item_id', itemId);
	try {
		const res = await fetch('/api/classroom/attachment', { method: 'POST', body: form });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Upload failed.' };
	}
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
 * proxy has no ?as= support at all -- there is nothing view-as-student could
 * ever be pointed at here.
 */
async function uploadInstructorAttachment(itemId: string, file: File): Promise<TxResult<undefined>> {
	const form = new FormData();
	form.set('file', file, file.name);
	form.set('item_id', itemId);
	try {
		const res = await fetch('/api/classroom/instructor-attachment', { method: 'POST', body: form });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Upload failed.' };
	}
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
}): Promise<TxResult<{ itemId: string }>> {
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
			| { error?: string; item_id?: string }
			| null;
		if (!res.ok) {
			return { ok: false, message: body?.error ?? `Save failed (${res.status}).` };
		}
		const itemId = body?.item_id ?? payload.id;
		if (!itemId) return { ok: false, message: 'Save failed.' };
		return { ok: true, data: { itemId } };
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

const SUBMISSION_FILE_SELECT =
	'id, submission_id, block_id, caption, filename, mime_type, size_bytes, sort_order';

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
		async uploadSubmissionFile(itemId, file, blockId = null, caption = null) {
			const form = new FormData();
			form.set('file', file, file.name);
			form.set('item_id', itemId);
			if (blockId) form.set('block_id', blockId);
			if (caption) form.set('caption', caption);
			try {
				const res = await fetch('/api/classroom/submission-file', { method: 'POST', body: form });
				const body = (await res.json().catch(() => null)) as
					| { error?: string; reason?: string; file?: SubmissionFileRow }
					| null;
				if (!res.ok) {
					return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
				}
				return { ok: true, data: { file: body?.file, reason: body?.reason } };
			} catch (e) {
				return { ok: false, message: (e as Error).message || 'Upload failed.' };
			}
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
			supabase
				.from('classroom_submission_files')
				.select(`${SUBMISSION_FILE_SELECT}, classroom_submissions!inner(item_id)`)
				.eq('classroom_submissions.item_id', itemId)
				.order('sort_order'),
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
		files: (filesRes.data ?? []) as SubmissionFileRow[],
		approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
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
			return error ? fail(error) : { ok: true, data: undefined };
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

export function createTeacherEngineTransports(
	supabase: SupabaseClient
): AssignmentTeacherTransports {
	return {
		async setSpec(itemId, spec) {
			const { error } = await supabase.rpc('classroom_set_assignment_spec', {
				p_item_id: itemId,
				p_spec: spec
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			const { error } = await supabase.rpc('classroom_set_rubric', {
				p_item_id: itemId,
				p_criteria: criteria
			});
			return error ? fail(error) : { ok: true, data: undefined };
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
					supabase
						.from('classroom_enrollments')
						.select('section_id, student_email, display_name, active, updated_at')
						.eq('section_id', sectionId)
						.order('display_name'),
					selectSubmissions(supabase, itemId, false),
					supabase
						.from('classroom_responses')
						.select('item_id, student_email, block_id, value, updated_at')
						.eq('item_id', itemId),
					supabase
						.from('classroom_submission_files')
						.select(`${SUBMISSION_FILE_SELECT}, classroom_submissions!inner(item_id)`)
						.eq('classroom_submissions.item_id', itemId)
						.order('sort_order'),
					supabase
						.from('classroom_module_approvals')
						.select('item_id, student_email, module_id, approved_by, approved_at')
						.eq('item_id', itemId)
				]);
			if (rosterRes.error) return fail(rosterRes.error);
			return {
				ok: true,
				data: {
					roster: (rosterRes.data ?? []) as ClassroomEnrollment[],
					submissions: ((submissionsRes.data ?? []) as unknown as Record<string, unknown>[]).map(
						normalizeSubmissionRow
					),
					responses: (responsesRes.data ?? []) as ResponseRow[],
					files: (filesRes.data ?? []) as SubmissionFileRow[],
					approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
				}
			};
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
			const { data: rows, error } = await supabase
				.from('classroom_enrollments')
				.select('section_id, student_email, display_name, active, updated_at')
				.eq('section_id', sectionId)
				.order('display_name');
			if (error) return fail(error);
			return { ok: true, data: (rows ?? []) as ClassroomEnrollment[] };
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
			return error ? fail(error) : { ok: true, data: undefined };
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
		}
	};
}
