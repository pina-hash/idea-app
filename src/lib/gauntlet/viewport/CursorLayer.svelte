<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, isCoarsePointer } from './motion';

	/**
	 * CAD crosshair cursor: a reticle ring + center dot + faint cross lines that
	 * eases after the mouse, with a trailing mono X/Y readout in mm. The ring
	 * enlarges and shifts to lime over interactive elements. Entirely disabled
	 * on touch devices and under reduced motion (native cursor restored, since
	 * `cursor: none` is only applied while this layer is active). The layer is
	 * pointer-events: none and never blocks interaction.
	 */

	const MM_PER_PX = 25.4 / 96;
	const INTERACTIVE =
		'a, button, input, select, textarea, summary, label, [role="button"], .mode-card, .challenge-row, .tree-leaf';

	let wrap: HTMLDivElement;
	let reticleEl = $state<HTMLDivElement>();
	let labelEl = $state<HTMLDivElement>();
	let active = $state(false);
	let armed = $state(false);
	let hovering = $state(false);
	let readout = $state('X 0.0 Y 0.0 mm');

	onMount(() => {
		if (isCoarsePointer() || prefersReducedMotion()) return;
		active = true;
		const root = wrap.closest('.gt-root');

		let mx = 0;
		let my = 0;
		let x = 0;
		let y = 0;
		let raf = 0;
		let seeded = false;

		const onMove = (e: MouseEvent) => {
			mx = e.clientX;
			my = e.clientY;
			if (!seeded) {
				// Snap to the real cursor position on the first move instead of
				// easing in from an arbitrary seed point, and only hide the native
				// cursor once the reticle actually has somewhere real to be, so
				// there is never a gap where neither cursor is visible.
				x = mx;
				y = my;
				seeded = true;
				armed = true;
				root?.classList.add('gt-cursor-on');
			}
		};
		const onOver = (e: MouseEvent) => {
			hovering = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
		};

		const loop = () => {
			if (seeded && reticleEl && labelEl) {
				x += (mx - x) * 0.22;
				y += (my - y) * 0.22;
				reticleEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
				labelEl.style.transform = `translate3d(${x + 18}px, ${y + 22}px, 0)`;
				// Signed, screen-centered coordinates at 3 decimals, matching the
				// tree rail's "UNITS IPS . 3DP" readout convention.
				const xmm = (x - window.innerWidth / 2) * MM_PER_PX;
				const ymm = (window.innerHeight / 2 - y) * MM_PER_PX;
				const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
				readout = `X ${fmt(xmm)}  Y ${fmt(ymm)}`;
			}
			raf = requestAnimationFrame(loop);
		};

		window.addEventListener('mousemove', onMove, { passive: true });
		document.addEventListener('mouseover', onOver, { passive: true });
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseover', onOver);
			root?.classList.remove('gt-cursor-on');
		};
	});
</script>

<div class="gt-cursor-layer" bind:this={wrap} aria-hidden="true">
	{#if active}
		<div class="gt-reticle" class:hovering class:armed bind:this={reticleEl}>
			<span class="ring"></span>
			<span class="dot"></span>
			<span class="cross v"></span>
			<span class="cross h"></span>
		</div>
		<div class="gt-readout" class:armed bind:this={labelEl}>{readout}</div>
	{/if}
</div>

<style>
	.gt-cursor-layer {
		position: fixed;
		inset: 0;
		z-index: 900;
		pointer-events: none;
	}
	.gt-reticle {
		position: absolute;
		top: 0;
		left: 0;
		width: 0;
		height: 0;
		opacity: 0;
		will-change: transform;
	}
	/* Hidden until the first real mousemove seeds a position, so it never
	   flashes at the origin (and the native cursor stays hidden together with
	   it, since both gate on the same JS-known-position moment). */
	.gt-reticle.armed {
		opacity: 1;
	}
	.ring {
		position: absolute;
		width: 26px;
		height: 26px;
		top: -13px;
		left: -13px;
		border: 1px solid rgba(0, 255, 65, 0.55);
		border-radius: 50%;
		box-shadow: var(--glow-green);
		opacity: 0.85;
		transition:
			transform 0.18s ease,
			border-color 0.18s ease,
			box-shadow 0.18s ease;
	}
	.dot {
		position: absolute;
		width: 3px;
		height: 3px;
		top: -1.5px;
		left: -1.5px;
		border-radius: 50%;
		background: var(--green);
		box-shadow: var(--glow-green);
		transition: background-color 0.18s ease;
	}
	.cross {
		position: absolute;
		background: var(--green);
		opacity: 0.28;
	}
	.cross.v {
		width: 1px;
		height: 44px;
		top: -22px;
		left: -0.5px;
	}
	.cross.h {
		width: 44px;
		height: 1px;
		top: -0.5px;
		left: -22px;
	}
	.gt-reticle.hovering .ring {
		transform: scale(1.25);
		border-color: var(--lime);
		box-shadow: var(--glow-lime);
	}
	.gt-reticle.hovering .dot {
		background: var(--lime);
		box-shadow: var(--glow-lime);
	}
	.gt-readout {
		position: absolute;
		top: 0;
		left: 0;
		font-family: var(--font-data);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		color: var(--ice);
		text-shadow: 0 0 8px rgba(136, 221, 255, 0.5);
		opacity: 0;
		white-space: nowrap;
		will-change: transform;
	}
	.gt-readout.armed {
		opacity: 0.7;
	}
</style>
