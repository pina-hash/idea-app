<script lang="ts">
	import { pathwayById, withAlpha } from '$lib/pathways';

	/**
	 * A student's pathway as a small colored pill: the pathway's lucide icon plus
	 * its short label, always together, so identity never depends on color alone.
	 * Renders nothing when the pathway is unset or unknown. It always sits BESIDE
	 * the profile image, never in place of it.
	 *
	 * THE INK DRAWS THE WORD AND THE GLYPH; THE IDENTITY DRAWS THE FILL AND THE
	 * EDGE. For three of the six they are the same value. For CSEE, MSET and
	 * BMET the raw identity measured 3.31-4.45:1 against this chip's own 12%
	 * tint of itself, so the label and the icon were the least readable part of
	 * a pill whose whole job is to be legible at a glance. The icon strokes
	 * with `currentColor` and follows the ink for the same reason. See
	 * `$lib/pathways.ts` for the derivation.
	 */
	let {
		pathway,
		size = 'sm'
	}: { pathway: string | null | undefined; size?: 'sm' | 'md' } = $props();

	const p = $derived(pathwayById(pathway));
</script>

{#if p}
	<span
		class="pathway-chip {size}"
		style="color:{p.ink}; background:{withAlpha(p.color, 0.12)}; border-color:{withAlpha(p.color, 0.45)}"
		title="{p.label} pathway"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- static markup from the pathways registry, never user input -->
			{@html p.icon}
		</svg>
		<span class="pw-label">{p.label}</span>
	</span>
{/if}

<style>
	.pathway-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.28em;
		border: 1px solid;
		border-radius: 999px;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		letter-spacing: 0.1em;
		line-height: 1;
		white-space: nowrap;
		vertical-align: middle;
	}
	.pathway-chip.sm {
		font-size: 0.58rem;
		padding: 0.14rem 0.45rem 0.14rem 0.35rem;
	}
	.pathway-chip.md {
		font-size: 0.72rem;
		padding: 0.22rem 0.6rem 0.22rem 0.45rem;
	}
	.pathway-chip svg {
		width: 1.15em;
		height: 1.15em;
		flex-shrink: 0;
	}
	.pw-label {
		transform: translateY(0.05em);
	}
</style>
