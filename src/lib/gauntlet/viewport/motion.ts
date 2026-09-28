/**
 * VIEWPORT motion utilities (see docs/GAUNTLET-DESIGN.md).
 *
 * Every helper here self-disables under `prefers-reduced-motion: reduce`, so
 * callers never need their own guard. The CSS side of the same gate lives in
 * `viewport.css`.
 *
 * `countUp` AND `prefersReducedMotion` LIVE IN `$lib/count-up` NOW and are
 * re-exported here, so every GAUNTLET caller keeps its import. The home page's
 * lines-of-code chip counts up with the same action (report R10), and one
 * implementation of it is the point: the count is scheduled on a frame OR a
 * timeout there, where this file's copy rode requestAnimationFrame alone and
 * never finished in a tab that opened in the background.
 */
import { prefersReducedMotion } from '$lib/count-up';

export { countUp, prefersReducedMotion } from '$lib/count-up';

/** True on touch-primary devices (SSR-safe: false on the server). */
export function isCoarsePointer(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return !window.matchMedia('(pointer: fine)').matches;
}

interface EntranceOptions {
	/** Per-element stagger delay in ms. */
	delay?: number;
}

/**
 * Svelte action: staggered entrance fade/slide when the element scrolls into
 * view. Adds `.gt-pre` (hidden) then `.gt-in` (shown, transitioned) once
 * intersecting; classes are styled in viewport.css.
 */
export function entrance(node: HTMLElement, opts: EntranceOptions = {}) {
	if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return {};
	node.classList.add('gt-pre');
	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				node.style.transitionDelay = `${opts.delay ?? 0}ms`;
				node.classList.add('gt-in');
				io.disconnect();
			}
		},
		{ threshold: 0.08 }
	);
	io.observe(node);
	return {
		destroy() {
			io.disconnect();
		}
	};
}

/**
 * Apply the entrance stagger to every direct child of a container. Used by the
 * gauntlet layout after each navigation so every page (current and future)
 * gets the choreography without per-page wiring.
 */
export function entranceSweep(container: HTMLElement, stepMs = 55) {
	if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;
	const children = Array.from(container.children)
		// Stagger grid children individually (each mode card), not the grid block.
		.flatMap((el) => (el.classList.contains('mode-grid') ? Array.from(el.children) : [el]))
		.filter(
			(el): el is HTMLElement => el instanceof HTMLElement && !el.classList.contains('gt-in')
		);
	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const el = entry.target as HTMLElement;
				el.classList.add('gt-in');
				io.unobserve(el);
			}
		},
		{ threshold: 0.05 }
	);
	children.forEach((el, i) => {
		el.classList.add('gt-pre');
		el.style.transitionDelay = `${Math.min(i * stepMs, 440)}ms`;
		io.observe(el);
	});
}
