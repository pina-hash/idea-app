<script lang="ts">
	/**
	 * A COLLECTION AS ONE CARD THAT OPENS TO ITS MEMBERS (ledger 0380, report
	 * 762bb647: "a collection shows as one card that opens to its members, the
	 * same way major releases present").
	 *
	 * THE CARD IS A REAL BUTTON with `aria-expanded` and `aria-controls`, a word
	 * on it (Open / Close) and the count, so it is never a bare picture. Closed
	 * it is the generated-cover shape (3:2, a dark island in every theme, the
	 * major-release card's own pinned ink) with up to three of the members'
	 * covers as a strip; open, the members render beneath it in the same
	 * multicol mosaic every other section uses. The members are the CALLER'S
	 * snippet, so a member is the identical card the rest of the gallery draws
	 * and there is no second card renderer here.
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		description = null,
		count,
		thumbs = [],
		children
	}: {
		title: string;
		description?: string | null;
		count: number;
		/** Up to three cover URLs, already resolved by the caller. */
		thumbs?: string[];
		children?: Snippet;
	} = $props();

	let open = $state(false);
	let broken = $state<Record<string, true>>({});
	const uid = `fdy-col-${Math.random().toString(36).slice(2, 8)}`;
	const shown = $derived(thumbs.filter((t) => !broken[t]).slice(0, 3));
</script>

<div class="fdy-col" class:is-open={open} data-testid="foundry-collection">
	<button
		type="button"
		class="fdy-col-card"
		aria-expanded={open}
		aria-controls="{uid}-members"
		data-testid="foundry-collection-toggle"
		onclick={() => (open = !open)}
	>
		{#if shown.length > 0}
			<span class="fdy-col-strip" aria-hidden="true">
				{#each shown as src (src)}
					<img {src} alt="" loading="lazy" onerror={() => (broken = { ...broken, [src]: true })} />
				{/each}
			</span>
		{/if}
		<span class="fdy-col-text">
			<span class="fdy-col-title">{title}</span>
			{#if description}<span class="fdy-col-desc">{description}</span>{/if}
			<span class="fdy-col-meta">
				{count === 1 ? '1 game' : `${count} games`} &middot; {open ? 'Close' : 'Open'}
			</span>
		</span>
	</button>
	{#if open}
		<div class="fdy-col-members" id="{uid}-members" data-testid="foundry-collection-members">
			{@render children?.()}
		</div>
	{/if}
</div>

<style>
	.fdy-col {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
		/* Opened, a collection spans the whole row of the section's grid. */
	}
	.fdy-col-card {
		display: flex;
		flex-direction: column;
		width: 100%;
		min-height: 44px;
		padding: 0;
		overflow: hidden;
		text-align: left;
		cursor: pointer;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		/* PINNED, like the major release card: a dark island in every theme. */
		--fdy-col-ink: #ece8e0;
		--fdy-col-ink-2: #c4bfb4;
		color: var(--fdy-col-ink);
		background-image: linear-gradient(150deg, hsl(262 22% 24%), hsl(272 26% 14%));
		font-family: var(--font-display);
	}
	.fdy-col-card:hover,
	.fdy-col-card:focus-visible {
		color: var(--fdy-col-ink);
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.fdy-col-card[aria-expanded='true'] {
		border-color: var(--green);
	}
	.fdy-col-strip {
		display: flex;
		height: 5.5rem;
		overflow: hidden;
	}
	.fdy-col-strip img {
		flex: 1 1 0;
		min-width: 0;
		height: 100%;
		object-fit: cover;
	}
	.fdy-col-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: var(--space-3, 0.75rem);
	}
	.fdy-col-title {
		font-size: 1.15rem;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.fdy-col-desc {
		color: var(--fdy-col-ink-2);
		font-size: 0.9rem;
		line-height: 1.35;
		overflow-wrap: anywhere;
	}
	.fdy-col-meta {
		color: var(--fdy-col-ink-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fdy-col-members {
		min-width: 0;
	}
</style>
