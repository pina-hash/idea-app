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
	<!-- Stopwatch fused with a CAD part racing to target: dial + sweeping hand,
	     a hex part inside, split ticks, and fast-forward chevrons. -->
	<svg width="72" height="60" viewBox="0 0 72 60" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
		<!-- Crown + shoulders -->
		<path d="M26 8h8M30 8v4M43 12l3-3M17 12l-3-3" />
		<!-- Dial -->
		<circle cx="30" cy="32" r="17" />
		<!-- Split ticks (12 / 3 / 6 / 9) -->
		<path d="M30 17v3.5M30 43.5V47M15 32h3.5M41.5 32H45" opacity="0.7" />
		<!-- The part being raced: a small hex boss inside the dial -->
		<path d="M30 25.5l5 3v6l-5 3-5-3v-6z" opacity="0.8" />
		<!-- Sweeping hand (animated) -->
		<g class="sr-hand">
			<path d="M30 32V21.5" stroke="var(--lime)" stroke-width="1.6" />
		</g>
		<circle cx="30" cy="32" r="1.6" fill="var(--lime)" stroke="none" />
		<!-- Fast-forward chevrons -->
		<g class="sr-ff" stroke="var(--lime)" stroke-width="1.7">
			<path class="c1" d="M52 24l6 8-6 8" />
			<path class="c2" d="M59 24l6 8-6 8" />
		</g>
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

<style>
	/* Speedrun art animation: the hand sweeps the dial, the chevrons pulse
	   forward. viewport.css force-disables all animation in .gt-root under
	   prefers-reduced-motion, so no extra guard is needed here. */
	.sr-hand {
		transform-origin: 30px 32px;
		animation: sr-sweep 4s linear infinite;
	}
	.sr-ff .c1 {
		animation: sr-ff 1.6s ease-in-out infinite;
	}
	.sr-ff .c2 {
		animation: sr-ff 1.6s ease-in-out infinite 0.25s;
	}
	@keyframes sr-sweep {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes sr-ff {
		0%,
		100% {
			opacity: 0.25;
			transform: translateX(0);
		}
		45% {
			opacity: 1;
			transform: translateX(2.5px);
		}
	}
</style>
