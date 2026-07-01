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
	let active = $state(false);
	let hovering = $state(false);
	let readout = $state('X 0.0 Y 0.0 mm');

	onMount(() => {
		if (isCoarsePointer() || prefersReducedMotion()) return;
		active = true;
		const root = wrap.closest('.gt-root');
		root?.classList.add('gt-cursor-on');

		let mx = window.innerWidth / 2;
		let my = window.innerHeight / 2;
		let x = mx;
		let y = my;
		let raf = 0;

		const reticle = wrap.querySelector<HTMLElement>('.gt-reticle');
		const label = wrap.querySelector<HTMLElement>('.gt-readout');

		const onMove = (e: MouseEvent) => {
			mx = e.clientX;
			my = e.clientY;
		};
		const onOver = (e: MouseEvent) => {
			hovering = !!(e.target instanceof Element && e.target.closest(INTERACTIVE));
		};

		const loop = () => {
			x += (mx - x) * 0.22;
			y += (my - y) * 0.22;
			if (reticle) reticle.style.transform = `translate3d(${x}px, ${y}px, 0)`;
			if (label) {
				label.style.transform = `translate3d(${x + 18}px, ${y + 22}px, 0)`;
				const xmm = (x * MM_PER_PX).toFixed(1);
				const ymm = ((window.innerHeight - y) * MM_PER_PX).toFixed(1);
				readout = `X ${xmm} Y ${ymm} mm`;
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
		<div class="gt-reticle" class:hovering>
			<span class="ring"></span>
			<span class="dot"></span>
			<span class="cross v"></span>
			<span class="cross h"></span>
		</div>
		<div class="gt-readout">{readout}</div>
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
		will-change: transform;
	}
	.ring {
		position: absolute;
		width: 26px;
		height: 26px;
		top: -13px;
		left: -13px;
		border: 1px solid var(--green);
		border-radius: 50%;
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
		transform: scale(1.55);
		border-color: var(--lime);
		box-shadow: 0 0 10px rgba(200, 255, 0, 0.45);
	}
	.gt-reticle.hovering .dot {
		background: var(--lime);
	}
	.gt-readout {
		position: absolute;
		top: 0;
		left: 0;
		font-family: var(--font-data);
		font-size: 0.58rem;
		letter-spacing: 0.08em;
		color: var(--ice);
		opacity: 0.7;
		white-space: nowrap;
		will-change: transform;
	}
</style>
