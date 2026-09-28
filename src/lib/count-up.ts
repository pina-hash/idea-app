/**
 * A FIGURE THAT COUNTS UP TO ITSELF, ONCE: the one implementation, shared by
 * GAUNTLET's stat tiles and the lines-of-code chip on the home page (report
 * R10). It was GAUNTLET's own (`gauntlet/viewport/motion.ts`), which still
 * re-exports it so its callers did not move; a second copy for the home page
 * would have been two eases, two durations and two answers to "what does a
 * hidden tab see", which is how a pair of these stops agreeing.
 *
 * THE FINAL VALUE IS THE DOM'S AT EVERY MOMENT THAT MATTERS. The server renders
 * it, so a reader with no script and a crawler both get it; the action only
 * animates what is already there. Under `prefers-reduced-motion: reduce` it
 * writes the final value and schedules nothing. A caller that needs assistive
 * tech to hear the final number even DURING the count puts the number in a
 * second, visually hidden element and marks the animated one `aria-hidden`
 * (CodeCounter does) -- the action cannot do that for it without owning markup.
 *
 * RAF-OR-TIMEOUT, NEVER RAF ALONE (CLAUDE.md, DOM traps). A backgrounded or
 * throttled window never ticks requestAnimationFrame, so a count started in a
 * tab that opened behind another one used to sit at 0 until somebody looked,
 * and a reader in that window never saw the final number. Every step here is
 * scheduled on whichever of a frame or a short timeout fires first, so the
 * count finishes on the clock whatever the window is doing.
 *
 * NO DOM IN THE ARITHMETIC. `countUpValue` and `easeOutCubic` are pure and are
 * what `tests/dom/count-up-mount.test.ts` pins; the action is the thin half.
 */

/** How long a count takes, in ms. GAUNTLET's figure, unchanged. */
export const COUNT_UP_MS = 900;

/** The timeout that stands in for a frame that is not coming. Longer than a
 *  30 Hz frame, so a visible tab is always driven by its frames. */
export const COUNT_UP_FALLBACK_MS = 50;

/** True when the reader asks for reduced motion (SSR-safe: false on the server). */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The ease: fast off the mark, settling onto the figure. Clamped to [0, 1]. */
export function easeOutCubic(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return 1 - Math.pow(1 - c, 3);
}

/**
 * The figure `elapsedMs` into a count toward `target`: 0 at the start, exactly
 * `target` from `durationMs` on, never past it. A non-finite target is handed
 * back untouched, which is how a caller's `NaN` stays visible rather than
 * becoming a count.
 */
export function countUpValue(target: number, elapsedMs: number, durationMs = COUNT_UP_MS): number {
	if (!Number.isFinite(target)) return target;
	if (!(durationMs > 0) || elapsedMs >= durationMs) return target;
	return Math.round(target * easeOutCubic(elapsedMs / durationMs));
}

/**
 * Run `cb` on the next animation frame OR after `fallbackMs`, whichever comes
 * first, exactly once. Returns a cancel function. `cb` receives a timestamp on
 * the `performance.now()` clock either way.
 */
export function frameOrTimeout(cb: (now: number) => void, fallbackMs = COUNT_UP_FALLBACK_MS): () => void {
	let done = false;
	let raf = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const hasRaf = typeof requestAnimationFrame === 'function';
	const fire = (now: number) => {
		if (done) return;
		done = true;
		if (hasRaf && raf) cancelAnimationFrame(raf);
		clearTimeout(timer);
		cb(now);
	};
	if (hasRaf) raf = requestAnimationFrame(fire);
	timer = setTimeout(() => fire(performance.now()), fallbackMs);
	return () => {
		done = true;
		if (hasRaf && raf) cancelAnimationFrame(raf);
		clearTimeout(timer);
	};
}

export interface CountUpOptions {
	/** The figure to count to. */
	value: number;
	/** How a figure is written, intermediate ones included. Default `String`. */
	format?: (n: number) => string;
	/** Count on the first run only; a later value is written at once. */
	once?: boolean;
	/** Duration in ms. Default `COUNT_UP_MS`. */
	durationMs?: number;
	/** Pin the element's width to the final figure's while it counts, so a
	 *  growing number does not shift what sits beside it. */
	holdWidth?: boolean;
}

const optionsOf = (p: number | CountUpOptions): CountUpOptions => (typeof p === 'number' ? { value: p } : p);

/**
 * Svelte action: count the node's text up from 0 to its value (ease-out).
 * A bare number is GAUNTLET's original call and behaves exactly as it did --
 * it re-counts whenever the value changes -- save that it now finishes in a
 * hidden tab too. The options form adds a formatter, `once` and `holdWidth`.
 *
 * `data-counting` is on the node exactly while a count is running, so a
 * harness reading the figure waits for the final one rather than racing the
 * ease: the last 60% of a count changes digits without changing the length of
 * the string, which a DOM-stability wait cannot see.
 */
export function countUp(node: HTMLElement, param: number | CountUpOptions) {
	let cancel: (() => void) | null = null;
	let ran = false;
	let pinned = false;

	const release = () => {
		if (pinned) {
			node.style.minWidth = '';
			pinned = false;
		}
		delete node.dataset.counting;
	};
	const run = (p: number | CountUpOptions) => {
		const opts = optionsOf(p);
		const format = opts.format ?? String;
		const target = opts.value;
		cancel?.();
		cancel = null;
		release();
		const settle = () => {
			node.textContent = format(target);
		};
		/* Nothing to animate: reduced motion, a figure that is not a number, a
		   `once` count that already ran, or -- for a caller that asked to hold
		   the width, which needs a box to measure -- a node with no box at all
		   (the home banner hides its chip below 768px, and a count nobody can
		   see is a second of frames for nothing). */
		const unrendered = typeof node.getClientRects === 'function' && node.getClientRects().length === 0;
		if (prefersReducedMotion() || !Number.isFinite(target) || (opts.once && ran) || (opts.holdWidth && unrendered)) {
			ran = true;
			settle();
			return;
		}
		ran = true;
		if (opts.holdWidth) {
			settle();
			const w = node.getBoundingClientRect().width;
			if (w > 0) {
				node.style.minWidth = `${w}px`;
				pinned = true;
			}
		}
		const duration = opts.durationMs ?? COUNT_UP_MS;
		const t0 = performance.now();
		node.dataset.counting = 'true';
		node.textContent = format(0);
		const tick = (now: number) => {
			const elapsed = now - t0;
			node.textContent = format(countUpValue(target, elapsed, duration));
			if (elapsed < duration) cancel = frameOrTimeout(tick);
			else {
				cancel = null;
				release();
			}
		};
		cancel = frameOrTimeout(tick);
	};

	run(param);
	return {
		update(next: number | CountUpOptions) {
			run(next);
		},
		destroy() {
			cancel?.();
			cancel = null;
			release();
		}
	};
}
