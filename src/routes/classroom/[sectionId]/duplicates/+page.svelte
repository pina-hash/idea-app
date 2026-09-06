<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DuplicateDrafts from '$lib/classroom/DuplicateDrafts.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The removal transport. It posts to the GUARDED route beside this page,
	 * never to the delete endpoint directly -- the guard is what re-asks the
	 * student-work question server-side, and a client that reached past it
	 * would be making this surface's promise on its own authority.
	 *
	 * Handed in unconditionally: the page only exists for a section manager,
	 * and every row it can name is one `classroom_delete_item` would already
	 * accept from them. Which ROWS get a control is the component's decision,
	 * taken from the database's own verdict.
	 */
	async function remove(id: string): Promise<{ ok: boolean; error?: string }> {
		const res = await fetch(`/classroom/${data.section.id}/duplicates/remove`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		const out = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
		if (!res.ok || out.ok !== true) {
			return { ok: false, error: out.error ?? 'That copy could not be removed.' };
		}
		return { ok: true };
	}
</script>

<svelte:head>
	<title>Duplicate drafts | {data.section.label}</title>
</svelte:head>

<div class="dd-page">
	<DuplicateDrafts
		sectionName={data.section.label}
		answer={data.answer}
		ready={data.dupesReady}
		{remove}
		onremoved={() => invalidateAll()}
	/>
</div>

<style>
	.dd-page {
		padding: var(--cr-gutter, 1rem);
		max-width: var(--cr-measure, 92rem);
		margin: 0 auto;
	}
</style>
