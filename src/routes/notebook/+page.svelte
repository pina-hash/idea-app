<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type {
		AddPhotoResult,
		CreateEntryResult,
		EntryActionResult,
		NoteSaveResult,
		NotePayload
	} from '$lib/notebook';
	import type { TiptapNode } from '$lib/notebook-notes';
	import type { NoteFlush } from '$lib/notebook/notebook-shell';
	import type { FolderResult, FolderTransports } from '$lib/notebook-folders';

	/**
	 * Thin wrapper: the whole screen is NotebookView (so /dev/notebook mounts
	 * the identical component), and this file owns only the transport -- the
	 * five API routes, each called exactly as it expects (the two photo routes
	 * are multipart and unchanged; the three note routes are JSON). A
	 * successful save reloads the page data so the new entry, photo or note
	 * appears in the feed.
	 */
	let { data } = $props();

	/** One answer from a route: the parsed body, and the status it came with. */
	type Answered = { status: number; body: Record<string, unknown> };

	/**
	 * Every route answers JSON; a non-JSON body is reported as the status.
	 *
	 * THE STATUS IS CARRIED OUT, and it is not decoration: it is the only thing
	 * that separates a REFUSAL from a failure to deliver. These routes answer
	 * 400 for a note over the cap, an empty note and any RPC that raised, and
	 * 401 with no session -- decisions about this exact payload, which sending
	 * again cannot change. A 5xx or a thrown fetch is the opposite. Without the
	 * status here the composer's autosave has nothing to tell them apart with,
	 * and retries all of them five times over ~12s.
	 */
	async function post(url: string, body: FormData | object): Promise<Answered> {
		const json = !(body instanceof FormData);
		const res = await fetch(url, {
			method: 'POST',
			headers: json ? { 'content-type': 'application/json' } : undefined,
			body: json ? JSON.stringify(body) : body
		});
		try {
			return { status: res.status, body: (await res.json()) as Record<string, unknown> };
		} catch {
			return { status: res.status, body: { error: `The server answered ${res.status}.` } };
		}
	}

	/**
	 * 4xx IS THE SERVER HAVING CONSIDERED THIS PAYLOAD AND SAID NO. Everything
	 * else -- 5xx, and the 200-without-`ok` that these routes do not produce but
	 * that a proxy or a rewritten response could -- is left retryable, which is
	 * the behaviour every caller had before this existed. A thrown fetch never
	 * reaches here at all: it propagates, and `runSave` catches it as retryable.
	 */
	function retryableStatus(status: number): boolean {
		return !(status >= 400 && status < 500);
	}

	function readEntry(res: Answered, fallback: string): CreateEntryResult {
		const { status, body } = res;
		const entry = body.entry as { entry_id?: string; note_id?: string } | undefined;
		const entryId = entry?.entry_id;
		if (!body.ok || !entryId) {
			return {
				ok: false,
				error: (body.error as string) || fallback,
				retryable: retryableStatus(status)
			};
		}
		// The note chain the entry was created with, when it was created FROM a
		// note. Passed through so the composer's autosave edits that chain on
		// every later write instead of starting another one.
		return { ok: true, entryId, noteId: entry?.note_id };
	}

	function readOk(res: Answered, fallback: string): NoteSaveResult {
		const { status, body } = res;
		if (!body.ok) {
			return {
				ok: false,
				error: (body.error as string) || fallback,
				retryable: retryableStatus(status)
			};
		}
		return { ok: true, noteId: (body.note as { note_id?: string } | undefined)?.note_id };
	}

	async function createEntry(form: FormData): Promise<CreateEntryResult> {
		return readEntry(await post('/api/notebook/upload', form), 'The upload failed.');
	}

	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		return readEntry(await post('/api/notebook/note', payload), 'The note failed to save.');
	}

	async function addPhoto(form: FormData): Promise<AddPhotoResult> {
		const { body } = await post('/api/notebook/add-photo', form);
		if (!body.ok) return { ok: false, error: (body.error as string) || 'The upload failed.' };
		return { ok: true };
	}

	/**
	 * `autosave` (0129) is forwarded, never decided here: the composer knows
	 * whether a write came from the debounce or from a button, and the DATABASE
	 * decides whether that makes it a replacement. It reaches the RPC only when
	 * the coalescing capability came back -- see NotebookView, which is where
	 * that gate lives, so a caller cannot forget it in one transport and
	 * remember it in another.
	 */
	async function addNote(
		entryId: string,
		doc: TiptapNode,
		autosave = false
	): Promise<NoteSaveResult> {
		return readOk(
			await post('/api/notebook/add-note', { entry_id: entryId, content: doc, autosave }),
			'The note failed to save.'
		);
	}

	async function editNote(
		noteId: string,
		doc: TiptapNode,
		autosave = false
	): Promise<NoteSaveResult> {
		return readOk(
			await post('/api/notebook/edit-note', { note_id: noteId, content: doc, autosave }),
			'The change failed to save.'
		);
	}

	/**
	 * THE HIDE-PATH WRITE, and the ONLY `keepalive` request on this page.
	 *
	 * A request begun in a `visibilitychange` or `pagehide` handler is not
	 * guaranteed to leave the machine: the document is being torn down or
	 * frozen, and on iOS Safari that happens aggressively. `keepalive` is the
	 * platform's answer -- the browser takes ownership of the request and
	 * finishes it independently of the page.
	 *
	 * `keepalive` RATHER THAN `sendBeacon`, deliberately: a beacon cannot set
	 * `content-type: application/json`, so it would arrive at a route that
	 * parses JSON as something the route refuses, and the payload shape would
	 * have to fork. This sends byte-identically what the ordinary save sends,
	 * to the same route, so there is one request shape and one server contract.
	 *
	 * NOTHING IS AWAITED AND NOTHING IS REPORTED. There is no surface left to
	 * report to and no opportunity to retry; a rejection is swallowed rather
	 * than left to become an unhandled rejection during teardown.
	 *
	 * THE 64KB CEILING IS REAL. A browser is required to reject a keepalive
	 * request whose body exceeds 64KB across all in-flight keepalive requests.
	 * A note is capped at NOTE_MAX_CHARS (20,000) of TEXT, but what goes on the
	 * wire is the editor's ProseMirror JSON with its node and mark scaffolding,
	 * so the serialised body is always larger than the text and can exceed 64KB
	 * well before the cap. Nothing here truncates: an oversized body is refused
	 * whole by the browser and the write simply does not happen, which is the
	 * same outcome as today and not a silent partial save.
	 */
	function flushNote(payload: NoteFlush): void {
		const url = payload.noteId ? '/api/notebook/edit-note' : '/api/notebook/add-note';
		const body = payload.noteId
			? { note_id: payload.noteId, content: payload.content, autosave: payload.autosave }
			: { entry_id: payload.entryId, content: payload.content, autosave: payload.autosave };
		try {
			void fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body),
				keepalive: true
			}).catch(() => {});
		} catch {
			// An over-ceiling body throws synchronously in some engines. There is
			// nothing to fall back to and nobody to tell.
		}
	}

	/**
	 * STAMPING A REVISION BOUNDARY (0129, notebook_seal_notes). Straight to the
	 * RPC rather than through a route, on the rule the folder writes already
	 * follow: it is one call with one uuid and no server-side work to do first.
	 *
	 * A refusal is REPORTED, not retried -- the machine's backoff belongs to the
	 * network, and a server that considered this and said no will say no again.
	 */
	async function sealNotes(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_seal_notes', { p_entry_id: entryId });
		if (error) return { ok: false, error: error.message || 'Could not save that version.' };
		return { ok: true };
	}

	/**
	 * FOLDER WRITES GO STRAIGHT TO THE RPCs, not through an API route.
	 *
	 * The three photo/note routes exist because each does real server work
	 * before its RPC -- multipart parsing and a Drive upload, or normalizing an
	 * editor document into the stored note shape. A folder write has none of
	 * that: it is one RPC call with two strings, so a route would be a hop that
	 * adds nothing. It runs on the browser client under the CALLER'S OWN
	 * session, which is exactly what 0088's `auth.uid()` checks read, and is
	 * the same shape /notebook/review already uses for its own RPCs.
	 *
	 * A refusal is surfaced as the message the RPC raised, because those are
	 * written to be shown. The one exception is the duplicate-name case, which
	 * 0088 returns as structured jsonb rather than raising -- so it arrives
	 * with no error at all and has to be read out of the result.
	 */
	function rpcFail(err: unknown, fallback: string): FolderResult {
		const message = (err as { message?: string } | null)?.message?.trim();
		return { ok: false, error: message || fallback };
	}

	const folderTransports: FolderTransports = {
		async saveFolder(input) {
			const { data: result, error } = await data.supabase.rpc('notebook_upsert_folder', {
				p_name: input.name,
				p_color: input.color,
				p_folder_id: input.id
			});
			if (error) return rpcFail(error, 'Could not save that folder.');
			const row = result as { ok?: boolean; reason?: string } | null;
			if (row && row.ok === false) {
				return {
					ok: false,
					error:
						row.reason === 'duplicate_name'
							? 'You already have a folder with that name.'
							: 'Could not save that folder.'
				};
			}
			return { ok: true };
		},

		async deleteFolder(id) {
			const { error } = await data.supabase.rpc('notebook_delete_folder', { p_folder_id: id });
			if (error) return rpcFail(error, 'Could not delete that folder.');
			return { ok: true };
		},

		async moveEntries(entryIds, folderId) {
			const { error } = await data.supabase.rpc('notebook_move_entries', {
				p_entry_ids: entryIds,
				p_folder_id: folderId
			});
			if (error) return rpcFail(error, 'Could not move those entries.');
			return { ok: true };
		}
	};

	/** The pin write (0091), direct to the RPC for the same reason as above. */
	async function setPinned(entryId: string, pinned: boolean): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_set_entry_pinned', {
			p_entry_id: entryId,
			p_pinned: pinned
		});
		if (error) return rpcFail(error, 'Could not change that pin.');
		return { ok: true };
	}

	/**
	 * The three 0116 corrections, direct to their RPCs for the same reason as
	 * the folder writes above: each is one call with no server work of its own,
	 * so a route would be a hop that adds nothing. Every message the RPCs raise
	 * is written to be shown, so it is surfaced as-is via rpcFail.
	 */
	async function deleteEntry(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_delete_entry', { p_entry_id: entryId });
		if (error) return rpcFail(error, 'Could not delete that entry.');
		return { ok: true };
	}

	async function removePhoto(photoId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_remove_photo', { p_photo_id: photoId });
		if (error) return rpcFail(error, 'Could not remove that photo.');
		return { ok: true };
	}

	async function setEntryLabel(entryId: string, label: string | null): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_set_entry_label', {
			p_entry_id: entryId,
			p_custom_label: label
		});
		if (error) return rpcFail(error, 'Could not save that title.');
		return { ok: true };
	}

	/** The two 0117 restores, direct to their RPCs for the same reason as above. */
	async function restoreEntry(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_restore_entry', { p_entry_id: entryId });
		if (error) return rpcFail(error, 'Could not restore that entry.');
		return { ok: true };
	}

	async function restorePhoto(photoId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_restore_photo', { p_photo_id: photoId });
		if (error) return rpcFail(error, 'Could not restore that photo.');
		return { ok: true };
	}

	/**
	 * The two draft-state writes (0118), direct to their RPCs for the same
	 * reason as the corrections above: each is one call with no server work of
	 * its own, so a route would be a hop that adds nothing.
	 */
	async function submitEntry(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_submit_entry', { p_entry_id: entryId });
		if (error) return rpcFail(error, 'Could not turn in that entry.');
		return { ok: true };
	}

	async function unsubmitEntry(entryId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_unsubmit_entry', { p_entry_id: entryId });
		if (error) return rpcFail(error, 'Could not move that entry back to drafts.');
		return { ok: true };
	}

	/** The two 0119 note writes, direct to their RPCs for the same reason as above. */
	async function deleteNote(noteId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_delete_note', { p_note_id: noteId });
		if (error) return rpcFail(error, 'Could not delete that note.');
		return { ok: true };
	}

	async function restoreNote(noteId: string): Promise<EntryActionResult> {
		const { error } = await data.supabase.rpc('notebook_restore_note', { p_note_id: noteId });
		if (error) return rpcFail(error, 'Could not restore that note.');
		return { ok: true };
	}
</script>

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	folders={data.folders}
	sectionLabel={data.sectionLabel}
	canReview={data.canReview}
	configured={data.configured}
	photosReady={data.photosReady}
	notesReady={data.notesReady}
	foldersReady={data.foldersReady}
	pinsReady={data.pinsReady}
	sessionsReady={data.sessionsReady}
	draftsReady={data.draftsReady}
	initialCheckIn={data.initialCheckIn}
	activity={data.activity}
	deletionReady={data.deletionReady}
	deletedEntries={data.deletedEntries}
	uploadReady={data.uploadReady}
	historyReady={data.historyReady}
	coalescingReady={data.coalescingReady}
	viewerId={data.viewerId}
	{createEntry}
	{addPhoto}
	{createNote}
	{addNote}
	{editNote}
	{sealNotes}
	{flushNote}
	{folderTransports}
	{setPinned}
	{deleteEntry}
	{removePhoto}
	{setEntryLabel}
	{restoreEntry}
	{restorePhoto}
	{submitEntry}
	{unsubmitEntry}
	{deleteNote}
	{restoreNote}
	onChanged={() => invalidateAll()}
/>
