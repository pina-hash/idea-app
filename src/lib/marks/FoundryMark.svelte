<script lang="ts">
	/**
	 * IDEA Foundry homepage mark: a crucible pouring into an INGOT MOLD -- the
	 * forge, not a browser window. The room's identity (forge.css) is molten
	 * metal poured, worked, cooled, finished; the launcher card is where that
	 * identity meets the portal, so the glyph is the pour itself: the crucible
	 * is the build, the mold is the gallery the work is cast into, and the drip
	 * is a version going in. The previous mark poured into a browser frame,
	 * which described the sandbox mechanism rather than what Foundry IS.
	 *
	 * THE TELL IS ONE DRIP, and it is deliberately quieter than the shell's
	 * molten seam: the card sits in a grid beside GAUNTLET, VANGUARD and
	 * GREENLINE and must not shout over them. Every 6.8s -- two beats of the
	 * forge's ember breath (`--fg-ember: 3.4s` in forge.css; the card renders
	 * OUTSIDE `.fg-root`, so the token cannot resolve here and the literal
	 * moves with the vocabulary) -- a single drip detaches, falls into the
	 * mold, and the melt line glints once as it lands. Transform and opacity
	 * only, one narrative event, then stillness.
	 *
	 * IT STOPS WHEN NOBODY CAN SEE IT, the MoltenSeam mechanism: an
	 * IntersectionObserver and a `visibilitychange` listener set `data-paused`,
	 * which pauses the animations. The DEFAULT is playing, so if the observer
	 * never fires the failure mode is "keeps animating", never "never
	 * animates".
	 *
	 * NOTHING IS HIDDEN AT REST, the rule every mark in this directory
	 * follows: with the animation cancelled the drip sits below the spout at
	 * full opacity and the melt line is fully lit, so a reduced-motion reader
	 * sees the whole glyph -- crucible, drip mid-air, mold, molten fill.
	 * The keyframes start AND end at that rest state; only mid-cycle does
	 * anything move. Monochrome currentColor, which the card resolves to
	 * --acc-ink (green -- the finished state, which a published gallery is).
	 * Animation only under prefers-reduced-motion: no-preference.
	 */
	import { onMount } from 'svelte';

	let el: SVGSVGElement | null = $state(null);
	let onScreen = $state(true);
	let tabVisible = $state(true);
	const paused = $derived(!(onScreen && tabVisible));

	onMount(() => {
		const target = el;
		if (!target) return;
		const io = new IntersectionObserver((entries) => {
			for (const entry of entries) if (entry.target === target) onScreen = entry.isIntersecting;
		});
		io.observe(target);
		const onVis = () => (tabVisible = document.visibilityState === 'visible');
		document.addEventListener('visibilitychange', onVis);
		onVis();
		return () => {
			io.disconnect();
			document.removeEventListener('visibilitychange', onVis);
		};
	});
</script>

<svg
	viewBox="0 0 32 32"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	data-paused={paused ? 'true' : undefined}
	bind:this={el}
>
	<!-- The crucible: a spouted vessel, tipped over the mold. -->
	<path class="crucible" d="M11.5 4h9l-1.6 4.2a2 2 0 0 1-1.9 1.3h-2a2 2 0 0 1-1.9-1.3Z" />
	<!-- The stream: a short static run of metal leaving the spout, which is
	     what makes the two vessels read as ONE pour rather than two cups.
	     It does not animate; the drip below it is the whole tell. -->
	<path class="stream" d="M16 10.6v2.4" />
	<!-- The drip, resting at the stream's end. One, not a rain. -->
	<circle class="drip" cx="16" cy="14.9" r="0.9" />
	<!-- The ingot mold: open at the top, where the pour goes in. -->
	<path class="mold" d="M9.5 19 L11.4 26.5 H20.6 L22.5 19" />
	<!-- The melt: the metal already cast, sitting molten in the mold. -->
	<path class="melt" d="M12.3 23.4 H19.7" />
</svg>

<style>
	svg {
		width: 100%;
		height: 100%;
		display: block;
	}

	@media (prefers-reduced-motion: no-preference) {
		.drip {
			animation: fd-drip 6.8s ease-in infinite;
		}
		.melt {
			animation: fd-glint 6.8s ease-out infinite;
		}
		svg[data-paused] .drip,
		svg[data-paused] .melt {
			animation-play-state: paused;
		}
	}

	/*
	   The drip starts and ENDS at its resting position and full opacity, so a
	   cancelled animation leaves it sitting under the spout rather than
	   invisible. The event occupies the first 12% of the cycle; the other 88%
	   is stillness, which is what keeps this quieter than the seam.
	*/
	@keyframes fd-drip {
		0% {
			transform: translateY(0);
			opacity: 1;
		}
		8% {
			transform: translateY(6.2px);
			opacity: 1;
		}
		10% {
			transform: translateY(7px);
			opacity: 0;
		}
		12%,
		100% {
			transform: translateY(0);
			opacity: 1;
		}
	}

	/* The melt acknowledges the landing: one dip-and-return, timed to the
	   drip's arrival at 10% of the shared cycle. Full opacity is the rest
	   state, so nothing is dimmed when the animation is cancelled. */
	@keyframes fd-glint {
		0%,
		8%,
		18%,
		100% {
			opacity: 1;
		}
		11% {
			opacity: 0.35;
		}
	}
</style>
