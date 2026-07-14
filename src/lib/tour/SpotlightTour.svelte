<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type { TourCloseReason, TourStep } from './tour';

	/**
	 * Generic spotlight tour engine (reusable; step content comes in as plain
	 * config, see orientation.ts). While mounted it dims the page, cuts a gold
	 * focus ring around the current step's target, and shows a callout with
	 * title, body, step counter, Back / Next, Skip tour, and a close X.
	 *
	 * Behavior contract:
	 * - Steps whose target is missing or zero-size at launch are dropped, so one
	 *   config can serve signed-in and anonymous pages (absent controls skip).
	 * - Target position recomputes on resize and scroll (capture-phase, so
	 *   nested scroll containers re-anchor the ring too).
	 * - Keyboard: Esc closes, Enter / ArrowRight advances, ArrowLeft goes back.
	 * - Narrow viewports stack the callout below the target at full width.
	 * - Page interaction is paused behind a click-catcher while the tour is open
	 *   (scrolling still works; the wheel is not captured).
	 */
	let {
		steps,
		onclose
	}: {
		steps: TourStep[];
		onclose: (reason: TourCloseReason) => void;
	} = $props();

	const PAD = 6; // spotlight breathing room around the target
	const GAP = 14; // gap between the ring and the callout
	const MARGIN = 12; // viewport edge margin for the callout
	const CALLOUT_W = 340;

	// Steps whose targets exist with real size at launch; the run covers these.
	let visible = $state<TourStep[]>([]);
	let index = $state(0);
	let rect = $state<{ top: number; left: number; width: number; height: number } | null>(null);
	let vw = $state(0);
	let vh = $state(0);
	let calloutH = $state(0);
	let animating = $state(false);
	let calloutEl = $state<HTMLElement | null>(null);

	const step = $derived(visible[index]);
	const narrow = $derived(vw <= 640);
	const last = $derived(index === visible.length - 1);

	function findTarget(s: TourStep): HTMLElement | null {
		const el = document.querySelector<HTMLElement>(s.target);
		if (!el) return null;
		const r = el.getBoundingClientRect();
		// Zero-size means hidden (collapsed group, display:none); treat as absent.
		return r.width > 0 && r.height > 0 ? el : null;
	}

	function measure() {
		vw = window.innerWidth;
		vh = window.innerHeight;
		// Synchronous DOM read, NOT bind:clientHeight: the binding's
		// ResizeObserver delivery is rAF-aligned, and a throttled/background
		// window never ticks rAF, which would leave the callout unmeasured (and
		// hidden) forever. Same lesson as the DrawingViewer's rAF-or-timeout rule.
		if (calloutEl) calloutH = calloutEl.offsetHeight || calloutH;
		const el = step ? findTarget(step) : null;
		if (!el) {
			rect = null;
			return;
		}
		const r = el.getBoundingClientRect();
		rect = { top: r.top, left: r.left, width: r.width, height: r.height };
	}

	let animTimer: ReturnType<typeof setTimeout> | undefined;
	async function showStep() {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (!reduced) {
			// Ease the ring between steps only; scroll/resize tracking stays direct
			// so the ring never lags a user-driven scroll.
			animating = true;
			clearTimeout(animTimer);
			animTimer = setTimeout(() => (animating = false), 480);
		}
		// Let the callout re-render the new step's text before measuring its
		// height (tick is microtask-based, so this also works with rAF frozen).
		await tick();
		const el = step ? findTarget(step) : null;
		// 'instant', never 'auto': the site sets a global scroll-behavior:smooth,
		// which 'auto' would defer to, defeating the reduced-motion preference.
		el?.scrollIntoView({ block: 'center', behavior: reduced ? 'instant' : 'smooth' });
		measure();
		calloutEl?.focus({ preventScroll: true });
	}

	const next = () => {
		if (last) {
			onclose('completed');
		} else {
			index += 1;
			showStep();
		}
	};
	const back = () => {
		if (index > 0) {
			index -= 1;
			showStep();
		}
	};

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose('closed');
		} else if (e.key === 'Enter' || e.key === 'ArrowRight') {
			e.preventDefault();
			next();
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			back();
		}
	}

	onMount(() => {
		visible = steps.filter((s) => !!findTarget(s));
		if (!visible.length) {
			onclose('closed');
			return;
		}
		index = 0;
		showStep();

		// Coalesced re-measure on rAF-or-timeout (never rAF alone: a throttled
		// window stops ticking rAF and the ring would detach from its target).
		let queued = false;
		const run = () => {
			if (!queued) return;
			queued = false;
			measure();
		};
		const remeasure = () => {
			if (queued) return;
			queued = true;
			requestAnimationFrame(run);
			setTimeout(run, 50);
		};
		window.addEventListener('resize', remeasure);
		window.addEventListener('scroll', remeasure, { capture: true, passive: true });
		return () => {
			window.removeEventListener('resize', remeasure);
			window.removeEventListener('scroll', remeasure, { capture: true });
			queued = false;
			clearTimeout(animTimer);
		};
	});

	const spotStyle = $derived.by(() => {
		if (!rect) return 'display:none;';
		return `top:${rect.top - PAD}px;left:${rect.left - PAD}px;width:${rect.width + PAD * 2}px;height:${rect.height + PAD * 2}px;`;
	});

	const calloutStyle = $derived.by(() => {
		if (!rect) {
			// Target vanished mid-run (page mutation): center the callout so the
			// controls stay reachable; the backdrop supplies the dim instead.
			return `left:50%;top:50%;transform:translate(-50%,-50%);width:min(${CALLOUT_W}px, calc(100vw - ${MARGIN * 2}px));`;
		}
		const h = calloutH || 180;
		const below = rect.top + rect.height + PAD + GAP;
		const above = rect.top - PAD - GAP - h;
		if (narrow) {
			// Stack below the target at full width; above, then pinned to the
			// bottom edge, when there is no room.
			if (below + h + MARGIN <= vh) return `left:${MARGIN}px;right:${MARGIN}px;top:${below}px;`;
			if (above >= MARGIN) return `left:${MARGIN}px;right:${MARGIN}px;top:${above}px;`;
			return `left:${MARGIN}px;right:${MARGIN}px;bottom:${MARGIN}px;`;
		}
		const left = Math.min(Math.max(rect.left, MARGIN), Math.max(vw - CALLOUT_W - MARGIN, MARGIN));
		if (below + h + MARGIN <= vh) return `left:${left}px;top:${below}px;width:${CALLOUT_W}px;`;
		if (above >= MARGIN) return `left:${left}px;top:${above}px;width:${CALLOUT_W}px;`;
		return `left:${left}px;bottom:${MARGIN}px;width:${CALLOUT_W}px;`;
	});
</script>

<svelte:window onkeydown={onKeydown} />

{#if step}
	<!-- Transparent click-catcher: pauses page interaction while the tour is
	     open (the spotlight's giant shadow supplies the visible dim). -->
	<div class="tour-backdrop" class:dim={!rect} aria-hidden="true"></div>
	<div class="tour-spot" class:animate={animating} style={spotStyle} aria-hidden="true"></div>
	<div
		class="tour-callout"
		class:ready={calloutH > 0}
		style={calloutStyle}
		role="dialog"
		aria-modal="true"
		aria-labelledby="tour-step-title"
		tabindex="-1"
		bind:this={calloutEl}
	>
		<div class="tour-top">
			<span class="tour-count">{index + 1} of {visible.length}</span>
			<button class="tour-x" type="button" aria-label="Close tour" onclick={() => onclose('closed')}>
				&times;
			</button>
		</div>
		<h3 id="tour-step-title">{step.title}</h3>
		<p class="tour-body">{step.body}</p>
		<div class="tour-actions">
			<button class="tour-skip" type="button" onclick={() => onclose('skipped')}>Skip tour</button>
			<span class="tour-nav">
				<button class="tour-btn" type="button" disabled={index === 0} onclick={back}>Back</button>
				<button class="tour-btn primary" type="button" onclick={next}>{last ? 'Done' : 'Next'}</button>
			</span>
		</div>
	</div>
{/if}

<style>
	.tour-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1100;
		background: transparent;
	}
	.tour-backdrop.dim {
		background: rgba(3, 9, 5, 0.72);
	}
	.tour-spot {
		position: fixed;
		z-index: 1101;
		pointer-events: none;
		border: 2px solid var(--gold, #c8a848);
		border-radius: 8px;
		/* The last shadow's giant spread is the page dim; the cutout is simply
		   this box's interior. The first two are the gold focus glow. */
		box-shadow:
			0 0 0 3px color-mix(in srgb, var(--gold, #c8a848) 25%, transparent),
			0 0 24px color-mix(in srgb, var(--gold, #c8a848) 40%, transparent),
			0 0 0 200vmax rgba(3, 9, 5, 0.72);
	}
	.tour-spot.animate {
		transition:
			top 0.38s cubic-bezier(0.22, 1, 0.36, 1),
			left 0.38s cubic-bezier(0.22, 1, 0.36, 1),
			width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
			height 0.38s cubic-bezier(0.22, 1, 0.36, 1);
	}
	.tour-callout {
		position: fixed;
		z-index: 1102;
		background: var(--bg1, #050f07);
		border: 1px solid color-mix(in srgb, var(--gold, #c8a848) 45%, transparent);
		border-radius: 8px;
		box-shadow: 0 14px 44px rgba(0, 0, 0, 0.65);
		padding: 0.85rem 1rem 0.8rem;
		opacity: 0;
		outline: none;
	}
	.tour-callout.ready {
		opacity: 1;
		transition: opacity 0.18s ease;
	}
	.tour-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.tour-count {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.tour-x {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 1rem;
		line-height: 1;
		color: var(--dim, #4a7a52);
		background: none;
		border: none;
		padding: 0 0 0.2rem 0.4rem;
		cursor: pointer;
	}
	.tour-x:hover {
		color: var(--white, #e8ffe8);
	}
	h3 {
		margin: 0.35rem 0 0;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.03em;
		color: var(--gold, #c8a848);
	}
	.tour-body {
		margin: 0.3rem 0 0.8rem;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 0.92rem;
		line-height: 1.5;
		color: color-mix(in srgb, var(--white, #e8ffe8) 85%, transparent);
	}
	.tour-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.tour-nav {
		display: inline-flex;
		gap: 0.5rem;
	}
	.tour-btn {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--dim, #4a7a52);
		background: none;
		border: 1px solid color-mix(in srgb, var(--dim, #4a7a52) 45%, transparent);
		border-radius: 4px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.tour-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.tour-btn.primary {
		color: var(--gold, #c8a848);
		border-color: color-mix(in srgb, var(--gold, #c8a848) 55%, transparent);
		background: color-mix(in srgb, var(--gold, #c8a848) 9%, transparent);
	}
	.tour-btn.primary:hover {
		border-color: var(--gold, #c8a848);
		box-shadow: 0 0 10px color-mix(in srgb, var(--gold, #c8a848) 35%, transparent);
	}
	.tour-btn:not(.primary):not(:disabled):hover {
		color: var(--white, #e8ffe8);
	}
	.tour-skip {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		color: var(--dim, #4a7a52);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
		padding: 0;
	}
	.tour-skip:hover {
		color: var(--white, #e8ffe8);
	}
	@media (prefers-reduced-motion: reduce) {
		.tour-spot.animate,
		.tour-callout.ready {
			transition: none;
		}
	}
</style>
