<script lang="ts">
	/**
	 * ONE CARD'S FILM STILL (ledger 0475, decision 73 as amended the second
	 * time, 2026-10-30): the scene `./art.ts` draws for the app, and the grain
	 * over it. Mr. Pina chose "cinematic light" from four samples, and asked
	 * for GREENLINE and the Foundry to be "adjusted in the same way", so every
	 * card is one light in its app's hue, haze, one object, the scrim the icon
	 * and title stand on, a vignette and grain, with no words in the art.
	 *
	 * The scene is SVG built from constants (`sceneSvg`), never anything a
	 * person typed, which is the whole reason `{@html}` is allowed here.
	 *
	 * DECORATION, AND MARKED AS SUCH: the layer is aria-hidden, takes no
	 * pointer events, and does not move. It fills the banner, the card's top
	 * 88px; in the comfortable view the description and key sit under it on
	 * the card's own ground.
	 */
	import { sceneSvg } from './art';

	let { app }: { app: string } = $props();
	const svg = $derived(sceneSvg(app));
</script>

<span class="art" data-art={app} aria-hidden="true">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html svg}
	<span class="grain"></span>
</span>

<style>
	.art {
		position: absolute;
		inset: 0;
		z-index: 0;
		overflow: hidden;
		border-radius: inherit;
		pointer-events: none;
	}
	.art :global(svg.scene) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	/* Film grain: fractal noise laid over the light at a sixth, so the
	   gradients do not band and the still reads as a photograph. */
	.grain {
		position: absolute;
		inset: 0;
		background-image: url("data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22160%22%20height%3D%22160%22%3E%3Cfilter%20id%3D%22n%22%3E%3CfeTurbulence%20type%3D%22fractalNoise%22%20baseFrequency%3D%220.85%22%20numOctaves%3D%223%22%20stitchTiles%3D%22stitch%22%2F%3E%3CfeColorMatrix%20values%3D%220%200%200%200%200.5%20%200%200%200%200%200.5%20%200%200%200%200%200.5%20%200.9%200.9%200.9%200%20-1.2%22%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%22160%22%20height%3D%22160%22%20filter%3D%22url(%23n)%22%2F%3E%3C%2Fsvg%3E");
		background-size: 160px;
		opacity: 0.16;
		mix-blend-mode: overlay;
	}
</style>
