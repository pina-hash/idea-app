<script lang="ts">
	/**
	 * ONE COLLECTION, EDITED (ledger 0380, report 762bb647): rename, change its
	 * members and their order, publish or unpublish, and delete. A NEW collection
	 * is the same component with no id: Save creates it.
	 *
	 * DELETE IS TWO PRESSES and the second names what goes (the collection, not
	 * the games in it): a collection is curation, its members are only references,
	 * and no student's work is touched either way. Unpublish is the reversible
	 * way to take it off the gallery and is offered beside it.
	 */
	import FoundrySubjectList from './FoundrySubjectList.svelte';
	import type { FoundryCollection } from './gallery-extras.ts';

	type Outcome = { ok: true; id?: string } | { ok: false; message: string };

	let {
		collection = null,
		options,
		save,
		setPublished,
		remove,
		canMoveUp = false,
		canMoveDown = false,
		onMove,
		onDone
	}: {
		collection?: FoundryCollection | null;
		options: { subject: string; label: string }[];
		save: (id: string | null, title: string, description: string, members: string[]) => Promise<Outcome>;
		setPublished?: (id: string, published: boolean) => Promise<Outcome>;
		remove?: (id: string) => Promise<Outcome>;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		onMove?: (by: -1 | 1) => void;
		/** A write landed: the page re-reads. */
		onDone: () => void;
	} = $props();

	// Seeded once; the parent keys the editor on the collection and a re-read
	// remounts it, so these never follow the prop after mount.
	/* svelte-ignore state_referenced_locally */
	let title = $state(collection?.title ?? '');
	/* svelte-ignore state_referenced_locally */
	let description = $state(collection?.description ?? '');
	/* svelte-ignore state_referenced_locally */
	let members = $state<string[]>((collection?.members ?? []).map((m) => m.subject));
	let busy = $state(false);
	let note = $state<string | null>(null);
	let isProblem = $state(false);
	let armDelete = $state(false);

	async function run(action: () => Promise<Outcome>, done: string, refresh = true) {
		busy = true;
		note = null;
		try {
			const r = await action();
			isProblem = !r.ok;
			note = r.ok ? done : r.message;
			if (r.ok && refresh) onDone();
		} catch {
			isProblem = true;
			note = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<li class="fce" data-testid="foundry-collection-editor">
	<div class="fce-head">
		<h4 class="fce-name">{collection ? collection.title : 'New collection'}</h4>
		{#if collection}
			<span class="fce-state" data-state={collection.published ? 'published' : 'draft'}>
				{collection.published ? 'Published' : 'Not published'}
			</span>
		{/if}
	</div>
	<div class="fce-field">
		<label for="fce-t-{collection?.id ?? 'new'}">Name</label>
		<input id="fce-t-{collection?.id ?? 'new'}" type="text" maxlength="60" bind:value={title} />
	</div>
	<div class="fce-field">
		<label for="fce-d-{collection?.id ?? 'new'}">Description</label>
		<textarea id="fce-d-{collection?.id ?? 'new'}" rows="2" maxlength="300" bind:value={description}></textarea>
	</div>
	<FoundrySubjectList
		subjects={members}
		{options}
		onchange={(next) => (members = next)}
		testId="fce-members-{collection?.id ?? 'new'}"
	/>
	<div class="fce-actions">
		<button
			type="button"
			class="btn tap-44"
			disabled={busy}
			data-testid="foundry-collection-save"
			onclick={() =>
				run(
					() => save(collection?.id ?? null, title, description, members),
					collection ? 'Saved.' : 'Created. Publish it when it is ready.'
				)}
		>
			{collection ? 'Save' : 'Create collection'}
		</button>
		{#if collection && setPublished}
			<button
				type="button"
				class="btn tap-44"
				disabled={busy}
				data-testid="foundry-collection-publish"
				onclick={() =>
					run(
						() => setPublished(collection.id, !collection.published),
						collection.published ? 'Unpublished. It is off the gallery.' : 'Published. It is on the gallery.'
					)}
			>
				{collection.published ? 'Unpublish' : 'Publish'}
			</button>
		{/if}
		{#if collection && onMove}
			<button type="button" class="btn tap-44" aria-disabled={!canMoveUp} onclick={() => onMove(-1)}>Move up</button>
			<button type="button" class="btn tap-44" aria-disabled={!canMoveDown} onclick={() => onMove(1)}>Move down</button>
		{/if}
		{#if collection && remove}
			{#if armDelete}
				<span class="fce-confirm">
					Delete "{collection.title}"? The games in it are not touched.
					<button
						type="button"
						class="btn tap-44"
						disabled={busy}
						data-testid="foundry-collection-delete-confirm"
						onclick={() => run(() => remove(collection.id), 'Deleted.')}
					>
						Yes, delete the collection
					</button>
					<button type="button" class="btn tap-44" onclick={() => (armDelete = false)}>Keep it</button>
				</span>
			{:else}
				<button type="button" class="btn tap-44" data-testid="foundry-collection-delete" onclick={() => (armDelete = true)}>
					Delete
				</button>
			{/if}
		{/if}
	</div>
	{#if note}
		<p class="fce-note" class:is-problem={isProblem} role="status">{note}</p>
	{/if}
</li>

<style>
	.fce {
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		min-width: 0;
	}
	.fce-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-3, 0.75rem);
	}
	.fce-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1);
	}
	.fce-state {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.fce-state[data-state='published'] {
		color: var(--green);
	}
	.fce-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fce-field label {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fce-field input,
	.fce-field textarea {
		min-height: 44px;
		box-sizing: border-box;
		padding: 0.5rem 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	.fce-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	.fce-actions .btn[aria-disabled='true'] {
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.fce-confirm {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		color: var(--text-1);
	}
	.fce-note {
		margin: 0;
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.fce-note.is-problem {
		color: var(--amber);
	}
</style>
