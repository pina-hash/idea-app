<script lang="ts">
	import './brand';

	/**
	 * The GREENLINE wordmark, per the art-direction reference: Archivo Black,
	 * skew -7deg, chrome gradient clipped to the text (dark band at 51% = the
	 * horizon reflection), two blurred RGB-split ghosts behind the readable
	 * face (screen blend), and optionally the integrated green signature line.
	 * Size is one CSS length; everything inside scales in em so the treatment
	 * holds from a header lockup to the title hero.
	 */
	const {
		size = 'clamp(2.4rem, 8vw, 5rem)',
		line = false
	}: {
		/** Font size (any CSS length). */
		size?: string;
		/** Render the green signature line under the mark. */
		line?: boolean;
	} = $props();
</script>

<span class="glb glw" style:font-size={size}>
	<span class="glw-ghost glw-ghost-r" aria-hidden="true">GREENLINE</span>
	<span class="glw-ghost glw-ghost-g" aria-hidden="true">GREENLINE</span>
	<span class="glw-face">GREENLINE</span>
	{#if line}<span class="glw-line" aria-hidden="true"></span>{/if}
</span>

<style>
	.glw {
		position: relative;
		display: inline-block;
		font-family: var(--glb-font-display);
		font-weight: 400;
		line-height: 0.92;
		letter-spacing: -0.015em;
		white-space: nowrap;
		user-select: none;
	}
	.glw-ghost {
		position: absolute;
		inset: 0;
		transform: skewX(-7deg) translate(0.025em, 0.008em);
		filter: blur(0.008em);
		mix-blend-mode: screen;
		pointer-events: none;
	}
	.glw-ghost-r {
		color: rgba(255, 70, 70, 0.34);
	}
	.glw-ghost-g {
		transform: skewX(-7deg) translate(-0.025em, 0.014em);
		color: rgba(60, 255, 190, 0.3);
	}
	.glw-face {
		position: relative;
		display: inline-block;
		transform: skewX(-7deg);
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
	}
	.glw-line {
		position: absolute;
		left: -0.12em;
		right: -0.12em;
		bottom: -0.14em;
		height: 0.03em;
		background: linear-gradient(
			90deg,
			rgba(42, 229, 126, 0) 0%,
			#2ae57e 12%,
			#eafff3 50%,
			#2ae57e 86%,
			rgba(42, 229, 126, 0) 100%
		);
		box-shadow:
			0 0 0.11em rgba(42, 229, 126, 0.9),
			0 0 0.28em rgba(42, 229, 126, 0.45);
	}
</style>
