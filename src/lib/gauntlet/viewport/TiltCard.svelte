<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { prefersReducedMotion, isCoarsePointer } from './motion';

	/**
	 * Magnetic 3D tilt wrapper: the card rotates toward the cursor (clamped),
	 * inner content lifts on translateZ for depth, and a specular sheen tracks
	 * the pointer. `family` picks the edge-glow color: modeling green,
	 * knowledge cyan. Inert (no tilt, no sheen) on touch and reduced motion.
	 * The parent grid supplies `perspective` (see viewport.css).
	 */

	let {
		family = 'modeling',
		children
	}: {
		family?: 'modeling' | 'knowledge';
		children: Snippet;
	} = $props();

	const MAX_DEG = 10;
	let el: HTMLDivElement;
	let enabled = $state(false);

	let rect: DOMRect | null = null;
	let pendingX = 0;
	let pendingY = 0;
	let rafId = 0;

	onMount(() => {
		enabled = !isCoarsePointer() && !prefersReducedMotion();
	});

	const applyTilt = () => {
		rafId = 0;
		if (!rect) return;
		const px = (pendingX - rect.left) / rect.width; // 0..1
		const py = (pendingY - rect.top) / rect.height;
		const ry = (px - 0.5) * 2 * MAX_DEG;
		const rx = (0.5 - py) * 2 * MAX_DEG;
		el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
		el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
		el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
		el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
	};

	const onEnter = () => {
		if (!enabled) return;
		rect = el.getBoundingClientRect();
		// Track the cursor 1:1 in real time; only the leave settle eases.
		el.style.transition = 'none';
	};

	const onMove = (e: MouseEvent) => {
		if (!enabled) return;
		if (!rect) rect = el.getBoundingClientRect();
		pendingX = e.clientX;
		pendingY = e.clientY;
		if (!rafId) rafId = requestAnimationFrame(applyTilt);
	};

	const onLeave = () => {
		if (rafId) {
			cancelAnimationFrame(rafId);
			rafId = 0;
		}
		rect = null;
		if (!enabled) return;
		el.style.transition = 'transform 0.18s ease-out';
		el.style.setProperty('--rx', '0deg');
		el.style.setProperty('--ry', '0deg');
	};
</script>

<div
	class="gt-tilt {family}"
	class:enabled
	bind:this={el}
	onmouseenter={onEnter}
	onmousemove={onMove}
	onmouseleave={onLeave}
	role="presentation"
>
	{@render children()}
	<div class="gt-sheen" aria-hidden="true"></div>
</div>

<style>
	.gt-tilt {
		position: relative;
		height: 100%;
		border-radius: var(--radius-card);
		transform-style: preserve-3d;
	}
	.gt-tilt.enabled {
		transform: rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
		transition: transform 0.18s ease-out;
	}
	/* Lift the card content off the tilt plane for depth. */
	.gt-tilt.enabled > :global(*:not(.gt-sheen)) {
		transform: translateZ(16px);
		height: 100%;
	}
	.gt-tilt > :global(*:not(.gt-sheen)) {
		height: 100%;
	}
	.gt-sheen {
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		opacity: 0;
		background: radial-gradient(
			420px circle at var(--mx, 50%) var(--my, 50%),
			rgba(232, 255, 240, 0.08),
			transparent 55%
		);
		transition: opacity 0.25s ease;
	}
	.gt-tilt.enabled:hover .gt-sheen {
		opacity: 1;
	}
	/* Edge-highlight glow in the family color. */
	.gt-tilt.modeling:hover {
		box-shadow:
			0 0 0 1px rgba(0, 255, 65, 0.35),
			0 14px 44px rgba(0, 255, 65, 0.12);
	}
	.gt-tilt.knowledge:hover {
		box-shadow:
			0 0 0 1px rgba(0, 240, 255, 0.35),
			0 14px 44px rgba(0, 240, 255, 0.12);
	}
</style>
