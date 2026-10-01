<script lang="ts">
	/**
	 * THE MOLTEN SEAM: the forge room's signature, a slow pour of molten steel
	 * running in a casting channel. CSS only -- no video, no canvas, no image
	 * sequence -- and DECORATION only: it is `aria-hidden`, it carries no words,
	 * and every word that means something sits beside it in the caller.
	 *
	 * HOW THE POUR IS BUILT, because "a slow flowing pour rather than a looping
	 * gif" is a mechanism and not a mood. The still base is a complete molten
	 * gradient -- crust at the channel edges, ember, amber, a white-hot core
	 * line -- and THREE CONVEYOR LAYERS drift over it:
	 *
	 *   stream   the core's bright meander        23s per tile
	 *   billow   small white-hot swells riding it 13s per tile
	 *   slag     dark cooled crusts floating past 37s per tile
	 *
	 * Each layer is an element `calc(100% + tile)` wide whose background tiles
	 * at exactly `tile`, translated by one tile per cycle -- so the loop is
	 * seamless by construction, and the three periods are deliberately co-prime
	 * so the combined surface repeats on the order of minutes, not seconds.
	 * All three move the SAME direction at different speeds, which is what makes
	 * it read as depth (a stream with things floating in it) rather than as a
	 * shimmering texture.
	 *
	 * ONLY `transform` ANIMATES. Every layer is a compositor animation; nothing
	 * here invalidates layout or paint per frame, which is what the FPS
	 * measurement in the harness is about.
	 *
	 * REDUCED MOTION IS THE STILL FRAME, NOT A BLANK. The layers are plain
	 * gradients that are fully painted at rest, so under
	 * `prefers-reduced-motion: reduce` (or before hydration) the seam holds as
	 * a layered still gradient that still reads as molten. Nothing is hidden in
	 * a base state waiting for a frame.
	 *
	 * IT STOPS WHEN NOBODY CAN SEE IT. An IntersectionObserver and a
	 * `visibilitychange` listener set `data-paused`, which pauses the animation
	 * (`animation-play-state`). The DEFAULT is playing: if the observer never
	 * fires the failure mode is "keeps animating", never "never animates".
	 * (Browsers already produce no frames for a hidden tab; the pause makes it
	 * a property of the component rather than of the browser, and covers the
	 * offscreen case the browser does not.)
	 *
	 * WHERE IT BELONGS: the room's header, the submitted state, the review
	 * queue while something is waiting. Heat means in progress; a pour on a
	 * surface with nothing in progress is the identity spending itself.
	 *
	 * SIZE IS DATA THE STYLESHEET KEYS ON, never an inline style
	 * (IDEA_INTERFACE_STANDARDS 12): `variant="seam"` is the header channel,
	 * `variant="channel"` the wider banner.
	 */
	import { onMount } from 'svelte';

	let {
		variant = 'seam'
	}: {
		variant?: 'seam' | 'channel';
	} = $props();

	let el: HTMLElement | null = $state(null);
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

<div
	class="fg-pour"
	data-variant={variant}
	data-paused={paused ? 'true' : undefined}
	bind:this={el}
	aria-hidden="true"
>
	<div class="fg-pour-layer fg-pour-stream"></div>
	<div class="fg-pour-layer fg-pour-billow"></div>
	<div class="fg-pour-layer fg-pour-slag"></div>
	<div class="fg-pour-sheen"></div>
</div>

<style>
	.fg-pour {
		position: relative;
		overflow: hidden;
		border-radius: 999px;
		/* THE STILL FRAME: crusted channel edges, ember, working amber, and the
		   white-hot core line. This is what reduced motion holds and what the
		   layers ride on. The literals are the heat scale's values restated as a
		   gradient; the tokens themselves stay the source of truth in forge.css
		   and these move with them. */
		background: linear-gradient(
			to bottom,
			#1a0d05 0%,
			#572a10 16%,
			#c65a1d 32%,
			#f6952f 45%,
			#ffd9a3 52%,
			#f6952f 61%,
			#c65a1d 76%,
			#572a10 88%,
			#1a0d05 100%
		);
		/* The halo is static: the glow does not pulse, the metal under it moves. */
		box-shadow:
			0 0 10px var(--fg-heat-glow, rgba(246, 149, 47, 0.35)),
			0 0 30px rgba(246, 149, 47, 0.16);
	}

	.fg-pour[data-variant='seam'] {
		height: 0.55rem;
	}

	.fg-pour[data-variant='channel'] {
		height: 1.05rem;
	}

	/* One conveyor: each layer sets its own tile and duration. The element is
	   one tile wider than the channel and slides one tile per cycle, so the
	   loop point is invisible by construction. */
	.fg-pour-layer {
		position: absolute;
		inset: 0;
		width: calc(100% + var(--tile));
		background-repeat: repeat;
		background-size: var(--tile) 100%;
		transform: translateX(calc(-1 * var(--tile)));
	}

	/* The core's meander: broad bright pulses in the middle of the channel. */
	.fg-pour-stream {
		--tile: 260px;
		background-image:
			radial-gradient(90px 60% at 60px 50%, rgba(255, 217, 163, 0.55), transparent 70%),
			radial-gradient(120px 45% at 190px 46%, rgba(246, 149, 47, 0.45), transparent 72%);
	}

	/* White-hot swells riding the stream, smaller and faster: the layer that
	   makes the surface read as liquid rather than as a lit bar. */
	.fg-pour-billow {
		--tile: 150px;
		background-image:
			radial-gradient(34px 34% at 30px 44%, rgba(255, 236, 200, 0.5), transparent 75%),
			radial-gradient(24px 26% at 96px 56%, rgba(255, 217, 163, 0.38), transparent 75%);
	}

	/* Cooled slag floating on top, slowest: dark crusts against the glow, which
	   is what gives the pour its depth axis. */
	.fg-pour-slag {
		--tile: 390px;
		background-image:
			radial-gradient(46px 40% at 84px 30%, rgba(26, 13, 5, 0.5), transparent 72%),
			radial-gradient(64px 34% at 240px 66%, rgba(26, 13, 5, 0.42), transparent 74%),
			radial-gradient(30px 30% at 330px 40%, rgba(87, 42, 16, 0.5), transparent 72%);
	}

	/* A static top light: the channel's rim catching the glow. Not animated. */
	.fg-pour-sheen {
		position: absolute;
		inset: 0 0 auto;
		height: 30%;
		background: linear-gradient(to bottom, rgba(255, 255, 255, 0.18), transparent);
	}

	/* THE MOTION, and only here. Transform-only, linear, infinite; per-layer
	   duration from the room's motion vocabulary with a local fallback so the
	   component still pours if mounted outside the room. */
	@media (prefers-reduced-motion: no-preference) {
		.fg-pour-stream {
			animation: fg-conveyor var(--fg-flow-1, 23s) linear infinite;
		}
		.fg-pour-billow {
			animation: fg-conveyor var(--fg-flow-2, 13s) linear infinite;
		}
		.fg-pour-slag {
			animation: fg-conveyor var(--fg-flow-3, 37s) linear infinite;
		}
		.fg-pour[data-paused] .fg-pour-layer {
			animation-play-state: paused;
		}
	}

	@keyframes fg-conveyor {
		from {
			transform: translateX(calc(-1 * var(--tile)));
		}
		to {
			transform: translateX(0);
		}
	}
</style>
