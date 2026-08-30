<script lang="ts">
	import { navigating } from '$app/state';
	import { NAV_INDICATOR_DELAY_MS, NAV_PENDING_LABEL } from '$lib/pending';

	/**
	 * THE ROUTE-TRANSITION INDICATOR, mounted ONCE in the root layout.
	 *
	 * Swept before this existed, `navigating` -- in either spelling, the
	 * `$app/state` rune or the deprecated `$app/navigation` store -- was
	 * imported by ZERO files in `src/`. Every SvelteKit navigation in this
	 * application showed nothing at all until the new page painted. On school
	 * wifi that means a teacher clicks a classroom item, whose server load runs
	 * five sequential round-trip waves for a manager opening an assignment, and
	 * the screen does not change for the whole of it.
	 *
	 * ONE MOUNT, IN THE ROOT LAYOUT, for the same reason `SiteFeedback` is:
	 * there are no layout resets anywhere in `src/routes`, so this layout wraps
	 * every page route and a route added next month INHERITS the indicator
	 * rather than having to remember it. A per-surface indicator is the rejected
	 * alternative -- unlike a save state, which is per-surface precisely because
	 * a global one would speak for work it cannot see, a NAVIGATION is a single
	 * global event with exactly one answer at a time.
	 *
	 * THE DELAY IS THE WHOLE DESIGN. See `NAV_INDICATOR_DELAY_MS` for why 250ms
	 * and not a rounder number.
	 *
	 * ZERO LAYOUT SHIFT IS STRUCTURAL, NOT TUNED. The wrapper is
	 * `position: fixed` and never occupies a line box, so it cannot push
	 * anything: a bar that reserved space in flow would be a layout jump on
	 * every single click, which is the defect this is most likely to introduce
	 * while fixing the one it exists for. `pointer-events: none` for the same
	 * kind of reason -- an overlay across the top of every page must not be able
	 * to eat a tap meant for the masthead beneath it.
	 */
	let {
		/** Overridable so a harness can drive both sides of the threshold. */
		delayMs = NAV_INDICATOR_DELAY_MS,
		/**
		 * Forces the visible state with no navigation in flight, for measuring
		 * the painted bar. `null` means "follow `navigating`", which is every
		 * real mount; `true`/`false` pin it.
		 */
		force = null,
		/**
		 * The value of this element's `data-nav-progress` attribute. The real
		 * mount keeps the default, so a spec's selector for the live indicator is
		 * stable; a harness pinning a SECOND, forced instance renames its own so
		 * the two are distinguishable in a presence count.
		 *
		 * IT IS NOT `data-testid`, AND THAT IS NOT A NAMING PREFERENCE. This
		 * component is mounted in the ROOT LAYOUT, so its element is the first
		 * one in the body on every page in the application, and at rest it is
		 * correctly a ZERO BOX. `tools/browser-verify`'s `waitForApp` decides a
		 * page has painted by taking the FIRST match of
		 * `main, h1, [data-testid], .harness` and requiring it to have a box --
		 * so a `data-testid` here made that predicate pick a 375x0 element and
		 * never hold. Measured: `/dev/marks`, a route this component has nothing
		 * to do with, went from "app rendered in 479ms" to "app DID NOT RENDER
		 * (DOM never settled) in 30007ms", and a whole-suite pass from ~2.2s per
		 * route/width to ~31s. Every route in the harness, silently, from one
		 * attribute on one element in the shell.
		 */
		hook = 'nav-progress'
	}: {
		delayMs?: number;
		force?: boolean | null;
		hook?: string;
	} = $props();

	let elapsed = $state(false);

	/**
	 * THE LIVE REGION IS ALWAYS MOUNTED AND ONLY ITS TEXT CHANGES.
	 *
	 * A `role="status"` element that is inserted into the DOM at the same moment
	 * it gains its text is announced unreliably -- several screen readers only
	 * watch a live region they were already observing. So the region exists from
	 * the first frame, empty, and the sentence moves in and out of it. This is
	 * the reason the `{#if}` below wraps the BAR and not the wrapper.
	 */
	$effect(() => {
		/*
		 * TRACKED READ AT THE TOP, per the repo's effect rule: this effect
		 * re-runs when a navigation starts or finishes and on nothing else.
		 * Nothing caller-supplied is invoked in here -- there is no transport
		 * and no prop callback -- so there is no injected call to untrack; what
		 * the body does is arm a timer and write one local `$state` boolean it
		 * never reads back, which cannot re-trigger itself.
		 */
		const pending = navigating.to !== null;
		const gate = delayMs;
		if (!pending) {
			elapsed = false;
			return;
		}
		const timer = setTimeout(() => {
			elapsed = true;
		}, gate);
		return () => {
			clearTimeout(timer);
			elapsed = false;
		};
	});

	const shown = $derived(force === null ? elapsed : force);
</script>

<div class="nav-prog" role="status" aria-live="polite" data-nav-progress={hook}>
	{#if shown}
		<!--
			THE TRACK IS THE STATE AND THE SWEEP IS THE DECORATION, which is what
			makes the reduced-motion path work rather than merely not crash. With
			the animation cancelled the track is still a painted 3px rule across
			the top of the viewport at full opacity with no transform, so a reader
			at `prefers-reduced-motion: reduce` sees the same STATE, conveyed by
			presence rather than by movement. Nothing here is hidden in its base
			state (CLAUDE.md's marks rule, and the reason the sweep is a second
			element instead of an animation on the track itself).
		-->
		<div class="nav-prog-track" aria-hidden="true">
			<span class="nav-prog-sweep"></span>
		</div>
		<span class="nav-prog-label">{NAV_PENDING_LABEL}</span>
	{/if}
</div>

<style>
	.nav-prog {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		/* Above the masthead, which sits at z-index 1 with `main` (app.css). */
		z-index: 60;
		pointer-events: none;
	}

	.nav-prog-track {
		height: 3px;
		width: 100%;
		/* THE TRACK CARRIES THE COLOUR, so the reduced state is not a hairline.
		   `--green` is this repo's token for a primary, in-progress signal and
		   the tint is the same colour at the weight a full-width rule wants. */
		background: color-mix(in srgb, var(--green) 34%, transparent);
		overflow: hidden;
	}

	.nav-prog-sweep {
		display: block;
		height: 100%;
		width: 40%;
		background: var(--green);
		/* NO TRANSFORM AT REST. Under `reduce` no animation is attached, so this
		   is what paints: a solid 40% mark on a full-width track, still an
		   indicator and still not moving. */
	}

	@media (prefers-reduced-motion: no-preference) {
		.nav-prog-sweep {
			animation: nav-prog-scan 1.1s ease-in-out infinite;
		}
	}

	@keyframes nav-prog-scan {
		0% {
			transform: translateX(-110%);
		}
		100% {
			transform: translateX(310%);
		}
	}

	/*
	 * VISUALLY HIDDEN, NOT `display: none`. The sentence is for a screen reader;
	 * a hidden live region is not announced at all, and the bar above already
	 * carries the visual half. Written as a class used in the markup rather than
	 * as a pseudo-element, because Svelte prunes a scoped `::after` whose parent
	 * it cannot see used (CLAUDE.md).
	 */
	.nav-prog-label {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
		border: 0;
	}
</style>
