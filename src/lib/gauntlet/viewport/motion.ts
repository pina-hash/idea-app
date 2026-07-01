/**
 * VIEWPORT motion utilities (see docs/GAUNTLET-DESIGN.md).
 *
 * Every helper here self-disables under `prefers-reduced-motion: reduce`, so
 * callers never need their own guard. The CSS side of the same gate lives in
 * `viewport.css`.
 */

/** True when the user asks for reduced motion (SSR-safe: false on the server). */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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

/**
 * Svelte action: count a numeric stat up from 0 to its value (ease-out).
 * Re-runs when the bound value changes; renders the final value immediately
 * under reduced motion.
 */
export function countUp(node: HTMLElement, value: number) {
	let raf = 0;
	const run = (target: number) => {
		cancelAnimationFrame(raf);
		if (prefersReducedMotion() || !Number.isFinite(target)) {
			node.textContent = String(target);
			return;
		}
		const dur = 900;
		const t0 = performance.now();
		const tick = (now: number) => {
			const t = Math.min(1, (now - t0) / dur);
			const eased = 1 - Math.pow(1 - t, 3);
			node.textContent = String(Math.round(target * eased));
			if (t < 1) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
	};
	run(value);
	return {
		update(next: number) {
			run(next);
		},
		destroy() {
			cancelAnimationFrame(raf);
		}
	};
}
