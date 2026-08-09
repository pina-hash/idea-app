<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type { AddPhotoResult, CreateEntryResult } from '$lib/notebook';

	/**
	 * Thin wrapper: the whole screen is NotebookView (so /dev/notebook mounts
	 * the identical component), and this file owns only the transport -- the
	 * two EXISTING API routes, called exactly as they already are, with no
	 * change to either. A successful upload reloads the page data so the new
	 * entry appears in the feed.
	 */
	let { data } = $props();

	/** Both routes answer JSON; a non-JSON body is reported as the status. */
	async function post(url: string, form: FormData): Promise<Record<string, unknown>> {
		const res = await fetch(url, { method: 'POST', body: form });
		try {
			return (await res.json()) as Record<string, unknown>;
		} catch {
			return { error: `The server answered ${res.status}.` };
		}
	}

	async function createEntry(form: FormData): Promise<CreateEntryResult> {
		const body = await post('/api/notebook/upload', form);
		const entryId = (body.entry as { entry_id?: string } | undefined)?.entry_id;
		if (!body.ok || !entryId) {
			return { ok: false, error: (body.error as string) || 'The upload failed.' };
		}
		return { ok: true, entryId };
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
	onUploaded={() => invalidateAll()}
/>
