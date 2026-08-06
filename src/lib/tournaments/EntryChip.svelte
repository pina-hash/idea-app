<script lang="ts">
	import type { TournamentEntry } from './tournaments';

	/**
	 * The one place a tournament participant renders: display_name +
	 * thumbnail_url only (the identity rule; never an account name or avatar).
	 * A null entry is an undecided "TBD" slot.
	 */
	let {
		entry = null,
		seed = null,
		winner = false,
		dim = false
	}: {
		entry?: TournamentEntry | null;
		seed?: number | null;
		winner?: boolean;
		dim?: boolean;
	} = $props();

	const initial = $derived(entry ? entry.display_name.trim().charAt(0).toUpperCase() : '');
</script>

<span class="entry-chip" class:winner class:dim class:tbd={!entry}>
	{#if entry}
		{#if entry.thumbnail_url}
			<img class="thumb" src={entry.thumbnail_url} alt="" loading="lazy" />
		{:else}
			<span class="thumb initial" aria-hidden="true">{initial}</span>
		{/if}
		<span class="name">{entry.display_name}</span>
		{#if seed}
			<span class="seed">#{seed}</span>
		{/if}
	{:else}
		<span class="thumb initial" aria-hidden="true">·</span>
		<span class="name">TBD</span>
	{/if}
</span>

<style>
	.entry-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		font-weight: 600;
	}
	.entry-chip.winner .name {
		color: var(--green, #00ff41);
	}
	.entry-chip.dim,
	.entry-chip.tbd {
		opacity: 0.45;
	}
	.thumb {
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 4px;
		object-fit: cover;
		flex: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: var(--bg2, #101610);
	}
	.thumb.initial {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim, #7a8a7a);
	}
	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.seed {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		color: var(--cyan, #00f0ff);
		opacity: 0.8;
		flex: none;
	}
</style>
