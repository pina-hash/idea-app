<script lang="ts">
	/**
	 * IDEA AnimatedLogo — the full emblem lockup with a live rotating gear.
	 *
	 * Layers the isolated gear (`/IDEA/idea-gear.png`) behind the isolated text
	 * plate (`/IDEA/idea-logo-text.png`) at the exact positions from the source
	 * emblem (2560x1204 canvas, gear 1202x1202 anchored at 0,0). The gear turns
	 * slowly behind the plate; the spin is gated behind
	 * `prefers-reduced-motion: no-preference`, so it NEVER rotates for
	 * reduced-motion users (the plate + still gear are the static end state).
	 *
	 * Prop-driven like the design-system React source (`components/brand/
	 * AnimatedLogo.jsx`) so the same component serves as the animated hero mark
	 * and as a static fallback (`spin={false}`).
	 */
	let {
		width = 480,
		spin = true,
		duration = 24,
		srcText = '/IDEA/idea-logo-text.png',
		srcGear = '/IDEA/idea-gear.png',
		alt = 'IDEA',
		class: className = '',
		style = ''
	}: {
		/** Rendered width (px number or any CSS length). Height follows the emblem aspect ratio. */
		width?: number | string;
		/** Rotate the gear (reduced-motion always wins). Default true. */
		spin?: boolean;
		/** Seconds per revolution. Default 24. */
		duration?: number;
		/** Path to the isolated text plate PNG. */
		srcText?: string;
		/** Path to the isolated gear PNG. */
		srcGear?: string;
		/** Accessible name for the lockup. */
		alt?: string;
		class?: string;
		style?: string;
	} = $props();

	const cssWidth = $derived(typeof width === 'number' ? `${width}px` : width);
</script>

<div class="idea-logo {className}" style="width: {cssWidth}; {style}">
	<img
		class="gear"
		class:spin
		src={srcGear}
		alt=""
		aria-hidden="true"
		style="animation-duration: {duration}s"
	/>
	<img class="plate" src={srcText} {alt} />
</div>

<style>
	.idea-logo {
		position: relative;
		aspect-ratio: 2560 / 1204;
		line-height: 0;
	}
	.gear {
		position: absolute;
		left: 0;
		top: -1.2%;
		width: 46.95%;
		height: auto;
		transform-origin: 50% 50%;
	}
	.plate {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	@keyframes idea-gear-spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* Gate the animation, not just the keyframes: reduced-motion users get a
	   still emblem. Duration comes from the inline style so `duration` works. */
	@media (prefers-reduced-motion: no-preference) {
		.gear.spin {
			animation-name: idea-gear-spin;
			animation-timing-function: linear;
			animation-iteration-count: infinite;
		}
	}
</style>
