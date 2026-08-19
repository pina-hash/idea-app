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

	/** Every route answers JSON; a non-JSON body is reported as the status. */
	async function post(url: string, body: FormData | object): Promise<Record<string, unknown>> {
		const json = !(body instanceof FormData);
		const res = await fetch(url, {
			method: 'POST',
			headers: json ? { 'content-type': 'application/json' } : undefined,
			body: json ? JSON.stringify(body) : body
		});
		try {
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: `The server answered ${res.status}.` };
		}
	}

	function readEntry(body: Record<string, unknown>, fallback: string): CreateEntryResult {
		const entryId = (body.entry as { entry_id?: string } | undefined)?.entry_id;
		if (!body.ok || !entryId) return { ok: false, error: (body.error as string) || fallback };
		return { ok: true, entryId };
	}

	function readOk(body: Record<string, unknown>, fallback: string): NoteSaveResult {
		if (!body.ok) return { ok: false, error: (body.error as string) || fallback };
		return { ok: true };
	}

	async function createEntry(form: FormData): Promise<CreateEntryResult> {
		return readEntry(await post('/api/notebook/upload', form), 'The upload failed.');
	}

	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		return readEntry(await post('/api/notebook/note', payload), 'The note failed to save.');
	}

	async function addPhoto(form: FormData): Promise<AddPhotoResult> {
		const body = await post('/api/notebook/add-photo', form);
		if (!body.ok) return { ok: false, error: (body.error as string) || 'The upload failed.' };
		return { ok: true };
	}

	async function addNote(entryId: string, doc: TiptapNode): Promise<NoteSaveResult> {
		return readOk(
			await post('/api/notebook/add-note', { entry_id: entryId, content: doc }),
			'The note failed to save.'
		);
	}

	async function editNote(noteId: string, doc: TiptapNode): Promise<NoteSaveResult> {
		return readOk(
			await post('/api/notebook/edit-note', { note_id: noteId, content: doc }),
			'The change failed to save.'
		);
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
	initialCheckIn={data.initialCheckIn}
	activity={data.activity}
	uploadReady={data.uploadReady}
	{createEntry}
	{addPhoto}
	{createNote}
	{addNote}
	{editNote}
	{folderTransports}
	{setPinned}
	{deleteEntry}
	{removePhoto}
	{setEntryLabel}
	onChanged={() => invalidateAll()}
/>
