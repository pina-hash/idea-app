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

	/**
	 * RIGHT-SIZED RASTERS, AND THE BROWSER PICKS (ledger 0297, package F1b).
	 * The masthead drew this at 104px from a 2560px plate and a 1202px gear:
	 * 2,603,273 bytes of PNG on every classroom and notebook page, about a
	 * hundred times what a 104px mark needs. The same two images now also ship
	 * at 128/256/512/1024px wide (the gear at the same 0.4695 proportion it is
	 * drawn at), downsampled from these masters with premultiplied alpha, and
	 * `srcset` + `sizes` let the browser take the smallest that covers the
	 * drawn width at the screen's density: 10.8 KB + 8.4 KB at 104px on a 1x
	 * screen, 28.1 KB + 18.3 KB on a 2x one. The masters stay the `src`
	 * fallback and the reference the smaller files were made from.
	 *
	 * ONLY FOR THE DEFAULT SOURCES: a caller that hands in its own image has no
	 * smaller copies, so it gets exactly what it asked for.
	 *
	 * `sizes` IS THE DRAWN WIDTH WHEN IT IS A LENGTH THE ATTRIBUTE CAN READ. A
	 * number becomes px; a CSS expression (`clamp(...)`) is passed through; a
	 * `var()` cannot appear in `sizes`, so the browser falls back to the
	 * viewport width there and picks a larger copy -- still never the master.
	 */
	const DEFAULT_TEXT = '/IDEA/idea-logo-text.png';
	const DEFAULT_GEAR = '/IDEA/idea-gear.png';
	const TEXT_WIDTHS = [128, 256, 512, 1024] as const;
	const GEAR_SHARE = 1202 / 2560;
	const textSrcset = $derived(
		srcText === DEFAULT_TEXT
			? TEXT_WIDTHS.map((w) => `/IDEA/idea-logo-text-${w}.png ${w}w`).join(', ') + ', /IDEA/idea-logo-text.png 2560w'
			: undefined
	);
	const gearSrcset = $derived(
		srcGear === DEFAULT_GEAR
			? TEXT_WIDTHS.map((w) => {
					const g = Math.round(w * GEAR_SHARE);
					return `/IDEA/idea-gear-${g}.png ${g}w`;
				}).join(', ') + ', /IDEA/idea-gear.png 1202w'
			: undefined
	);
	const textSizes = $derived(typeof width === 'number' ? `${width}px` : width);
	const gearSizes = $derived(
		typeof width === 'number' ? `${Math.round(width * GEAR_SHARE)}px` : `calc(${GEAR_SHARE.toFixed(4)} * ${width})`
	);
</script>

<div class="idea-logo {className}" style="width: {cssWidth}; {style}">
	<img
		class="gear"
		class:spin
		src={srcGear}
		srcset={gearSrcset}
		sizes={gearSrcset ? gearSizes : undefined}
		alt=""
		aria-hidden="true"
		style="animation-duration: {duration}s"
	/>
	<img
		class="plate"
		src={srcText}
		srcset={textSrcset}
		sizes={textSrcset ? textSizes : undefined}
		{alt}
	/>
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
