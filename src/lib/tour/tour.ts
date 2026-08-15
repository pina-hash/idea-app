/**
 * Spotlight tour: shared types for the generic engine (PLAIN DATA, client-safe,
 * like curriculum.ts). A tour is an ordered list of steps; each step points the
 * spotlight at one element on the current page. SpotlightTour.svelte renders a
 * tour; step CONTENT lives in plain config arrays (see orientation.ts) so
 * future tours reuse the engine without touching it.
 */

export interface TourStep {
	/** CSS selector for the target element on the current page. */
	target: string;
	title: string;
	/** Short body copy. Keep it under 2 sentences. */
	body: string;
	/**
	 * Let the reader click the spotlighted control while the callout is open.
	 * The engine pauses page interaction behind a transparent click-catcher by
	 * default; an interactive step lifts that catcher for the duration of the
	 * step ONLY, so a step that says "click it now" can mean it. Every other
	 * step keeps the pause. Off by default.
	 */
	interactive?: boolean;
}

/**
 * How a tour run ended. Every reason counts as "seen" for the first-time
 * auto-launch flag; callers may distinguish them for logging.
 */
export type TourCloseReason = 'completed' | 'skipped' | 'closed';
