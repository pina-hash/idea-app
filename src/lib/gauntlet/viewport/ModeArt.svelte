<script lang="ts">
	import type { GauntletModeId } from '$lib/gauntlet';

	/**
	 * Wireframe line-art icon for a mode card. Strokes inherit `currentColor`
	 * so the family color is applied by the card (viewport.css); accent marks
	 * read the lime token, and Spot the Error's magnifier is crimson (an error
	 * semantic, the one non-live/rec use the reservation allows).
	 */
	let { id }: { id: GauntletModeId } = $props();
</script>

{#if id === 'speedrun'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<path d="M22 14l14-8 14 8v20l-14 8-14-8V14Z" /><path d="M22 14l14 8 14-8M36 22v20" /><circle cx="36" cy="26" r="4" />
	</svg>
{:else if id === 'reverse_engineer'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<path d="M26 18h20v24H26z" /><path d="M26 18l8-8h20l-8 8M46 18l8-8v24l-8 8" />
		<path d="M14 30h8M50 30h8" stroke-dasharray="3 3" /><path d="M20 26l-6 4 6 4M52 26l6 4-6 4" />
	</svg>
{:else if id === 'feature_golf'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<path d="M18 42h12v-8h10v-8h10v-8" /><path d="M18 42l6-4M30 34l6-4M40 26l6-4" />
		<circle cx="52" cy="14" r="3" fill="var(--lime)" stroke="none" /><path d="M52 17v8" stroke="var(--lime)" />
	</svg>
{:else if id === 'drawing_reading'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<rect x="16" y="10" width="40" height="40" rx="1" /><path d="M16 20h40M46 10v40" /><circle cx="31" cy="34" r="6" /><path d="M22 40h18M31 28v-4" />
	</svg>
{:else if id === 'gdt_tolerance'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<rect x="14" y="20" width="44" height="16" rx="1" /><path d="M28 20v16M42 20v16" />
		<circle cx="21" cy="28" r="2.4" fill="var(--lime)" stroke="none" /><path d="M35 25l3 3-3 3" /><path d="M48 25h6M48 31h6" />
	</svg>
{:else if id === 'spot_the_error'}
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<path d="M20 16h22v28H20z" /><path d="M20 16l6-6h22v28l-6 6M42 16l6-6" />
		<circle cx="46" cy="40" r="8" stroke="var(--crimson)" /><path d="M52 46l7 7" stroke="var(--crimson)" /><path d="M43 40h6M46 37v6" stroke="var(--crimson)" />
	</svg>
{/if}
