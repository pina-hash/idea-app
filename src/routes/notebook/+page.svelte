<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type { AddPhotoResult, CreateEntryResult, NoteSaveResult, NotePayload } from '$lib/notebook';
	import type { TiptapNode } from '$lib/notebook-notes';

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
</script>

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	sectionLabel={data.sectionLabel}
	canReview={data.canReview}
	configured={data.configured}
	notesReady={data.notesReady}
	uploadReady={data.uploadReady}
	{createEntry}
	{addPhoto}
	{createNote}
	{addNote}
	{editNote}
	onUploaded={() => invalidateAll()}
/>
