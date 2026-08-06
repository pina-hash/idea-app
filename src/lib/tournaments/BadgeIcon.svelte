<script lang="ts">
	import { BADGE_BY_ID } from './entry-styles';

	/** One preset badge glyph, stroked in the current color (the pathways.ts
	 * inline-icon convention). Renders nothing for an unknown or absent id. */
	let {
		id = null,
		size = '1em'
	}: {
		id?: string | null;
		size?: string;
	} = $props();

	const def = $derived(id ? (BADGE_BY_ID[id] ?? null) : null);
</script>

{#if def}
	<svg
		class="badge-icon"
		viewBox="0 0 24 24"
		width={size}
		height={size}
		fill="none"
		stroke="currentColor"
		stroke-width="1.6"
		stroke-linejoin="round"
		stroke-linecap="round"
		aria-hidden="true"
	>
		{#each def.paths as d, i (i)}
			<path {d} />
		{/each}
	</svg>
{/if}

<style>
	.badge-icon {
		flex: none;
		display: block;
	}
</style>
