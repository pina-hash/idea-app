<script lang="ts">
	import Glyph from './Glyph.svelte';
	import { starWords } from './market';

	/** A rating as five stars AND words: colour and shape are never the only signal. */
	let { average, count, compact = false, single = false }: { average: number | null; count: number; compact?: boolean; single?: boolean } = $props();
	const filled = $derived(average === null ? 0 : Math.round(average));
</script>

<span class="mk-stars" data-testid="mk-stars">
	{#each [1, 2, 3, 4, 5] as i (i)}
		<span class:off={i > filled}><Glyph name="star" size={15} fill={i <= filled} /></span>
	{/each}
	{#if single}
		<span class="mk-visually-hidden">{average ?? 0} out of 5</span>
	{:else if compact}
		<span class="mk-visually-hidden">{starWords(average, count)}</span>
		<span class="mk-note" aria-hidden="true">({count})</span>
	{:else}
		<span class="mk-note">{starWords(average, count)}</span>
	{/if}
</span>
