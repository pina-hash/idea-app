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
	/**
	 * THE LIGHT LOCKUP (ledger 0298, decision 40 item 2). Space White's
	 * masthead is a light panel, and the emblem is a dark green plate with
	 * ivory letters drawn for a dark ground, so on that theme it read as a dark
	 * tile. The light copies are the same geometry repainted in
	 * `tools/idea_logo_vector.py` (the one place logo geometry lives) -- the
	 * plate in the brand green, the lettering re-inked dark, the steel gear kept
	 * -- and rasterised at these same widths by `tools/idea_emblem_raster.mjs`.
	 *
	 * CHOSEN BY THE STYLESHEET, NOT BY SCRIPT, which is what makes it
	 * flash-free: the theme attribute is on `<html>` before the body is parsed
	 * (the boot script `themeBootScript` writes), so the rule below shows the
	 * right pair from the first paint, and nothing here has to know the theme.
	 * Both pairs are in the markup; the one a theme does not show is
	 * `display: none`.
	 *
	 * THE LIGHT PAIR IS `loading="lazy"`, and that is the whole cost argument.
	 * A lazy image that is `display: none` has no box, never intersects the
	 * viewport and is never fetched, so on the dark themes -- every room but
	 * Space White's -- this adds two elements and no bytes. The dark pair stays
	 * eager, so the default look loads exactly as it did; on Space White the
	 * browser also fetches the hidden dark pair (it is eager), which is about
	 * 19 KB at 1x and the price of the dark look staying byte-for-byte what it
	 * was.
	 */
	const DEFAULT_LIGHT_TEXT = '/IDEA/idea-logo-text-light.png';
	const DEFAULT_LIGHT_GEAR = '/IDEA/idea-gear-light.png';
	const lightTextSrcset = $derived(
		srcText === DEFAULT_TEXT
			? TEXT_WIDTHS.map((w) => `/IDEA/idea-logo-text-light-${w}.png ${w}w`).join(', ') + `, ${DEFAULT_LIGHT_TEXT} 2560w`
			: undefined
	);
	const lightGearSrcset = $derived(
		srcGear === DEFAULT_GEAR
			? TEXT_WIDTHS.map((w) => {
					const g = Math.round(w * GEAR_SHARE);
					return `/IDEA/idea-gear-light-${g}.png ${g}w`;
				}).join(', ') + `, ${DEFAULT_LIGHT_GEAR} 1202w`
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
	{#if lightGearSrcset && lightTextSrcset}
		<img
			class="gear-light"
			class:spin
			src={DEFAULT_LIGHT_GEAR}
			srcset={lightGearSrcset}
			sizes={gearSizes}
			loading="lazy"
			alt=""
			aria-hidden="true"
			style="animation-duration: {duration}s"
		/>
		<img
			class="plate-light"
			src={DEFAULT_LIGHT_TEXT}
			srcset={lightTextSrcset}
			sizes={textSizes}
			loading="lazy"
			{alt}
		/>
	{/if}
</div>

<style>
	.idea-logo {
		position: relative;
		aspect-ratio: 2560 / 1204;
		line-height: 0;
	}
	.gear,
	.gear-light {
		position: absolute;
		left: 0;
		top: -1.2%;
		width: 46.95%;
		height: auto;
		transform-origin: 50% 50%;
	}
	.plate,
	.plate-light {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	/* The light pair is off everywhere but Space White, and there the dark pair
	   is off. The dark islands (IdeaCAD, the photo overlays, the deck stage)
	   keep the default look inside a light page, the same set
	   `themes/space-white.css` hands the dark tokens back to. */
	.gear-light,
	.plate-light {
		display: none;
	}
	:global(:root[data-theme='space-white']) .gear-light,
	:global(:root[data-theme='space-white']) .plate-light {
		display: block;
	}
	:global(:root[data-theme='space-white']) .gear,
	:global(:root[data-theme='space-white']) .plate {
		display: none;
	}
	:global(:root[data-theme='space-white'] :is(.ic-root, .nb-island, .deck-stage)) .gear,
	:global(:root[data-theme='space-white'] :is(.ic-root, .nb-island, .deck-stage)) .plate {
		display: block;
	}
	:global(:root[data-theme='space-white'] :is(.ic-root, .nb-island, .deck-stage)) .gear-light,
	:global(:root[data-theme='space-white'] :is(.ic-root, .nb-island, .deck-stage)) .plate-light {
		display: none;
	}

	@keyframes idea-gear-spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* Gate the animation, not just the keyframes: reduced-motion users get a
	   still emblem. Duration comes from the inline style so `duration` works. */
	@media (prefers-reduced-motion: no-preference) {
		.gear.spin,
		.gear-light.spin {
			animation-name: idea-gear-spin;
			animation-timing-function: linear;
			animation-iteration-count: infinite;
		}
	}
</style>
