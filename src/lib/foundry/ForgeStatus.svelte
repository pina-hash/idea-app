<script lang="ts">
	/**
	 * THE HEAT LANGUAGE, AS A CHIP: one component for every place a version or
	 * an app states what condition it is in.
	 *
	 * The forge reading of the lifecycle (forge.css has the token trios):
	 *
	 *   quiet    draft       cold iron: dark, unlit, matte
	 *   waiting  submitted   heating: amber, glowing, alive
	 *   ok       approved    struck and cooled to green, finished
	 *   live     published   the finished thing, out on the gallery
	 *   refused  rejected    quenched: desaturated grey, cooled wrong
	 *   shelved  hidden      shelved: flat, no heat at all
	 *
	 * The tone vocabulary is `versionLabel`'s own (surface.ts) plus `shelved`,
	 * so the arithmetic that decides a state and the chip that renders it share
	 * one spelling -- a second vocabulary here is the thing that stops agreeing.
	 *
	 * COLOUR IS NEVER THE ONLY SIGNAL. Every tone carries its own GLYPH (an
	 * ingot, a flame, a struck check, an x, a dash) beside its WORD, so the
	 * three grey-ish states (cold, quenched, shelved) stay tellable apart with
	 * no colour at all. The word comes from the caller -- this component
	 * renders a state it did not decide.
	 *
	 * ONLY THE WAITING STATE IS ALIVE: a slow ember breath on the chip's own
	 * glow layer, opacity-only (compositor), behind prefers-reduced-motion.
	 * At rest the glow holds at its mid value, so a reduced-motion reader sees
	 * a lit chip rather than a dead one. Every other tone is deliberately
	 * still: finished metal does not glow, and cold iron never did.
	 *
	 * The ink-on-fill pairs are measured in forge.css (worst 5.55:1 against a
	 * 4.5 bar); OUTSIDE the room the tokens fall back to the portal's nearest
	 * semantic equivalents so a chip in a harness or an SSR test still reads.
	 */
	let {
		tone,
		word
	}: {
		tone: 'quiet' | 'waiting' | 'ok' | 'live' | 'refused' | 'shelved';
		word: string;
	} = $props();
</script>

<span class="fg-chip" data-tone={tone}>
	<svg class="fg-chip-glyph" viewBox="0 0 12 12" aria-hidden="true">
		{#if tone === 'quiet'}
			<!-- The ingot: a bar of cold stock, unlit. -->
			<rect x="1.5" y="4" width="9" height="4.5" rx="1" />
		{:else if tone === 'waiting'}
			<!-- The flame. -->
			<path d="M6 1.5 C7.8 3.6 9.2 5.2 9.2 7.2 A3.2 3.2 0 0 1 2.8 7.2 C2.8 5.2 4.2 3.6 6 1.5 Z" />
		{:else if tone === 'ok' || tone === 'live'}
			<!-- The struck mark: work that has been finished and cooled. -->
			<path d="M2 6.5 L5 9.5 L10 2.5" />
		{:else if tone === 'refused'}
			<!-- Quenched: the cross left when a casting cools wrong. -->
			<path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" />
		{:else}
			<!-- Shelved: a flat dash, no heat at all. -->
			<path d="M2 6 L10 6" />
		{/if}
	</svg>
	<span class="fg-chip-word">{word}</span>
</span>

<style>
	.fg-chip {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		padding: 0.14rem 0.5rem;
		border-radius: var(--radius-chip, 2px);
		border: 1px solid var(--chip-edge);
		background: var(--chip-fill);
		color: var(--chip-ink);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		white-space: nowrap;
		vertical-align: baseline;
	}

	.fg-chip-glyph {
		width: 0.7rem;
		height: 0.7rem;
		flex: none;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* The ingot is the one filled glyph: cold stock is solid, not an outline. */
	.fg-chip[data-tone='quiet'] .fg-chip-glyph {
		fill: currentColor;
		stroke: none;
	}

	/* --- The trios, from the room; portal fallbacks for outside it. -------- */
	.fg-chip[data-tone='quiet'] {
		--chip-ink: var(--fg-st-draft-ink, var(--dim));
		--chip-fill: var(--fg-st-draft-fill, var(--bg2));
		--chip-edge: var(--fg-st-draft-edge, var(--hairline));
	}
	.fg-chip[data-tone='waiting'] {
		--chip-ink: var(--fg-st-heat-ink, var(--amber));
		--chip-fill: var(--fg-st-heat-fill, var(--bg2));
		--chip-edge: var(--fg-st-heat-edge, var(--amber));
	}
	.fg-chip[data-tone='ok'] {
		--chip-ink: var(--fg-st-done-ink, var(--green));
		--chip-fill: var(--fg-st-done-fill, var(--bg2));
		--chip-edge: var(--fg-st-done-edge, var(--hairline));
	}
	.fg-chip[data-tone='live'] {
		--chip-ink: var(--fg-st-live-ink, var(--green));
		--chip-fill: var(--fg-st-live-fill, var(--bg2));
		--chip-edge: var(--fg-st-live-edge, var(--green));
	}
	.fg-chip[data-tone='refused'] {
		--chip-ink: var(--fg-st-quench-ink, var(--ice));
		--chip-fill: var(--fg-st-quench-fill, var(--bg2));
		--chip-edge: var(--fg-st-quench-edge, var(--hairline));
	}
	.fg-chip[data-tone='shelved'] {
		--chip-ink: var(--fg-st-shelf-ink, var(--dim));
		--chip-fill: var(--fg-st-shelf-fill, transparent);
		--chip-edge: var(--fg-st-shelf-edge, var(--hairline));
		border-style: dashed;
	}

	/* THE EMBER BREATH: the submitted chip is the one alive thing. The glow is
	   its own layer so only opacity moves (compositor); at rest -- reduced
	   motion, or pre-hydration -- it holds at the keyframes' own midpoint. */
	.fg-chip[data-tone='waiting']::after {
		content: '';
		position: absolute;
		inset: -2px;
		border-radius: inherit;
		pointer-events: none;
		box-shadow: 0 0 8px var(--fg-heat-glow, rgba(246, 149, 47, 0.35));
		opacity: 0.55;
	}

	@media (prefers-reduced-motion: no-preference) {
		.fg-chip[data-tone='waiting']::after {
			animation: fg-ember-breath var(--fg-ember, 3.4s) ease-in-out infinite alternate;
		}
	}

	@keyframes fg-ember-breath {
		from {
			opacity: 0.25;
		}
		to {
			opacity: 0.85;
		}
	}
</style>
