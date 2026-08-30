<script lang="ts">
	/**
	 * The one statement of what the public currently sees for an object, and
	 * the controls that change it. Every editable object -- node, item type,
	 * unique item, stock placement -- renders this same panel, so the three
	 * states read identically everywhere.
	 *
	 * THE PENDING SENTENCE IS THE HALF THAT MATTERS: the whole point of the
	 * draft-and-publish model is that the public keeps seeing the old thing
	 * until publish, and a surface that showed a staged edit without saying so
	 * would read as "already live". The published state offers NO publish
	 * control at all -- `maps_publish` answers `nothing_pending` for it, and a
	 * control whose only possible outcome is a refusal must not be offered.
	 */
	import type { MapsPublishState } from './maps';
	import MapsStatusChip from './MapsStatusChip.svelte';

	let {
		state,
		objectWord,
		publishedAt,
		busy,
		problem,
		onpublish,
		ondiscard
	}: {
		state: MapsPublishState;
		/** "node", "item type", "item", "stock placement" -- the sentence's noun. */
		objectWord: string;
		publishedAt: string | null;
		busy: boolean;
		problem: string | null;
		onpublish: () => void;
		/** Only meaningful while pending; the control renders only then. */
		ondiscard: (() => void) | null;
	} = $props();

	const publishedDate = $derived(
		publishedAt ? new Date(publishedAt).toLocaleDateString() : null
	);
</script>

<div class="publish-panel" data-publish-state={state}>
	<div class="status-row">
		<MapsStatusChip {state} />
		{#if state === 'draft'}
			<p>Only editors can see this {objectWord}. Publishing puts it on the public map.</p>
		{:else if state === 'published'}
			<p>Public{publishedDate ? ` since ${publishedDate}` : ''}. Saving an edit stages it without changing what the public sees.</p>
		{:else}
			<p class="pending-note">
				A saved edit is staged on this {objectWord}. The public map still shows the previously
				published version until you publish it.
			</p>
		{/if}
	</div>
	{#if state !== 'published'}
		<div class="publish-actions">
			<button type="button" class="btn" onclick={onpublish} disabled={busy}>
				{state === 'pending' ? 'Publish pending edit' : 'Publish'}
			</button>
			{#if state === 'pending' && ondiscard}
				<button type="button" class="btn secondary" onclick={ondiscard} disabled={busy}>
					Discard pending edit
				</button>
			{/if}
		</div>
	{/if}
	{#if problem}
		<p class="problem" role="alert">{problem}</p>
	{/if}
</div>

<style>
	.publish-panel {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.8rem;
		background: var(--bg2);
	}
	.publish-panel[data-publish-state='pending'] {
		/* The staged-edit state is the one that must not be mistaken for live:
		   the panel itself carries the warning hue on its load-bearing edge,
		   beside the chip's glyph and the sentence's words. */
		border-color: var(--amber);
	}
	.status-row {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.status-row p {
		margin: 0.05rem 0 0;
		font-size: 0.88rem;
		color: var(--white);
		flex: 1 1 14rem;
	}
	.publish-actions {
		display: flex;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.problem {
		margin: 0;
		font-size: 0.85rem;
		color: var(--crimson);
	}
</style>
