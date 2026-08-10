<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type { AddPhotoResult, CreateEntryResult, NotePayload } from '$lib/notebook';

	/**
	 * Thin wrapper: the whole screen is NotebookView (so /dev/notebook mounts
	 * the identical component), and this file owns only the transport -- the
	 * three API routes, each called exactly as it expects (the two photo routes
	 * are multipart and unchanged; the note route is JSON). A successful save
	 * reloads the page data so the new entry appears in the feed.
	 */
	let { data } = $props();

	/** Every route answers JSON; a non-JSON body is reported as the status. */
	async function post(
		url: string,
		body: FormData | NotePayload
	): Promise<Record<string, unknown>> {
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
</script>

<NotebookView
	entries={data.entries}
	sessions={data.sessions}
	sectionLabel={data.sectionLabel}
	canReview={data.canReview}
	configured={data.configured}
	uploadReady={data.uploadReady}
	{createEntry}
	{addPhoto}
	{createNote}
	onUploaded={() => invalidateAll()}
/>
