<script lang="ts">
	/**
	 * THE ONE STATUS CHIP (ledger 0466). Every status tag on the site is this
	 * component: a recessed solid in the tone's `-solid` face, its word and
	 * glyph in the tone's `-on`, its edge in the tone's ink. The tone, its
	 * colours and its glyph come from `status-tone.ts` and nowhere else.
	 *
	 * THE WORD IS ALWAYS THERE. A chip takes `label` or children and there is
	 * no glyph-only form; colour is never the only signal and neither is a
	 * glyph. `glyph` overrides the tone's own mark where the meaning has a
	 * better one (a live dot, a clock for "scheduled", a pin for "pinned").
	 * `paths` replaces the mark with a subsystem's own glyph where that
	 * subsystem already owns one per kind (the coin transaction types).
	 *
	 * A CHIP IS A TAG, NOT A KEY. Raised is pressable and inset is not
	 * (IDEA_INTERFACE_STANDARDS 14), so the chip has an inner shade under its
	 * top lip and no drop shadow. When it IS pressable (`href`, `onclick`) it
	 * renders as a link or a button and gains the key's drop and hover.
	 *
	 * Anything else on the element (`data-testid`, `title`, `aria-*`) passes
	 * through. `class` is appended for the caller's layout, never its colour.
	 */
	import type { Snippet } from 'svelte';
	import { STATUS_GLYPHS, STATUS_TONES, toneStyle, type StatusGlyph, type StatusTone } from './status-tone';

	let {
		tone,
		label,
		glyph,
		paths,
		pathsName,
		wrap = false,
		href,
		onclick,
		class: extra = '',
		children,
		...rest
	}: {
		tone: StatusTone;
		label?: string | number;
		glyph?: StatusGlyph;
		/** Stroke paths on a 24x24 box, in place of the tone's glyph. */
		paths?: readonly string[];
		/** What `paths` is a picture of, written to the glyph's `data-glyph`. */
		pathsName?: string;
		/** Let a chip that holds a sentence wrap instead of pushing the row wide. */
		wrap?: boolean;
		href?: string;
		onclick?: (e: MouseEvent) => void;
		class?: string;
		children?: Snippet;
		[key: string]: unknown;
	} = $props();

	const spec = $derived(STATUS_TONES[tone] ?? STATUS_TONES.neutral);
	const mark = $derived(STATUS_GLYPHS[glyph ?? spec.glyph]);
	const cls = $derived(
		`status-chip${wrap ? ' wrap' : ''}${spec.dashed ? ' dashed' : ''}${href || onclick ? ' is-key tap-reach-44' : ''}${extra ? ` ${extra}` : ''}`
	);
</script>

{#snippet inner()}
	<svg class="status-chip-glyph" viewBox="0 0 24 24" aria-hidden="true" data-glyph={paths ? pathsName : (glyph ?? spec.glyph)}>
		{#if paths}
			{#each paths as d (d)}<path {d} />{/each}
		{:else}
			<path d={mark.d} />
			{#if 'fill' in mark}<path class="solid" d={mark.fill} />{/if}
		{/if}
	</svg><span class="status-chip-word">{#if children}{@render children()}{:else}{label}{/if}</span>
{/snippet}

{#if href}
	<a {href} class={cls} data-tone={tone} style={toneStyle(tone)} {...rest}>{@render inner()}</a>
{:else if onclick}
	<button type="button" {onclick} class={cls} data-tone={tone} style={toneStyle(tone)} {...rest}>{@render inner()}</button>
{:else}
	<span class={cls} data-tone={tone} style={toneStyle(tone)} {...rest}>{@render inner()}</span>
{/if}

<style>
	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		box-sizing: border-box;
		min-height: 22px;
		max-width: 100%;
		padding: 0 7px 0 5px;
		border: 1px solid var(--st-edge);
		border-radius: var(--plate-r-small, 4px);
		background: var(--st-solid);
		/* Printed into the surface: a shade under the top lip, no drop. */
		box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.18);
		color: var(--st-on);
		font-family: var(--font-mono);
		/* The 11px floor, from the one scale (ledger 0469). */
		font-size: var(--fs-micro, 0.6875rem);
		font-weight: 400;
		line-height: 1.1;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		text-decoration: none;
		white-space: nowrap;
		vertical-align: middle;
		flex: none;
	}
	.status-chip.dashed {
		border-style: dashed;
	}
	.status-chip.wrap {
		white-space: normal;
		flex: 0 1 auto;
		padding-block: 3px;
	}
	.status-chip-word {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.status-chip:not(.wrap) .status-chip-word {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status-chip-glyph {
		flex: none;
		width: 11px;
		height: 11px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.4;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.status-chip-glyph .solid {
		fill: currentColor;
		stroke: none;
	}
	/* Pressable: the key's drop, and a hover that lifts the face. */
	/* A PRESSABLE CHIP KEEPS ITS 22px TAG AND REACHES 44px (ledger 0469): the
	   global `.tap-reach-44` grows its hit area with a centred pseudo-element,
	   in height only, so a row of chips does not hand a tap to its neighbour. */
	.status-chip.is-key {
		--tap-reach-w: 0px;
		cursor: pointer;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		font: inherit;
		font-family: var(--font-mono);
		font-size: var(--fs-micro, 0.6875rem);
		text-transform: uppercase;
	}
	.status-chip.is-key:hover {
		filter: brightness(1.08);
	}
	.status-chip.is-key:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
</style>
