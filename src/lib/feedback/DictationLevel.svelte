<script lang="ts">
	/**
	 * THE MICROPHONE'S LOUDNESS AS FIVE BARS, beside the live dot inside a STOP
	 * control (report 5ab3adb6). Decoration with a meaning the word STOP already
	 * carries, so it is `aria-hidden` and never the only signal.
	 *
	 * THE LEVEL REACHES CSS AS ONE CUSTOM PROPERTY AND MOVES NOTHING UNDER
	 * `reduce`. `--dl-level` is written on the root; the bars turn it into a
	 * `scaleY` only inside `prefers-reduced-motion: no-preference`, so a reader
	 * who asked for less motion sees five still bars at a fixed height, painted
	 * and present, with no transform at all (the browser pass's motion sweep
	 * reads exactly that). TRANSFORM ONLY: no keyframe here touches a fill, a
	 * stroke or a colour, which is the Chrome 154 renderer crash this repo has
	 * already paid for once.
	 *
	 * The ink is the caller's live colour through `--dl-ink` (the report box
	 * points it at `--fb-live`, the grading console at `--crimson`), which is
	 * what that reserved colour is FOR.
	 */
	let { level }: { level: number } = $props();
	const shown = $derived(Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0)));
	/** Each bar's share of the level: tallest in the middle. */
	const WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55];
</script>

<span class="dl" aria-hidden="true" style:--dl-level={shown.toFixed(3)} data-dictation-level>
	{#each WEIGHTS as w, i (i)}
		<span class="dl-bar" style:--dl-w={w}></span>
	{/each}
</span>

<style>
	.dl {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 0.9rem;
	}
	.dl-bar {
		display: block;
		width: 3px;
		height: 100%;
		border-radius: 1px;
		background: var(--dl-ink, currentColor);
		/* AT REST UNDER REDUCE: a still bar at 40% height, no transform. */
		transform-origin: 50% 50%;
		clip-path: inset(30% 0 30% 0);
	}
	@media (prefers-reduced-motion: no-preference) {
		.dl-bar {
			clip-path: none;
			transform: scaleY(calc(0.18 + 0.82 * var(--dl-level, 0) * var(--dl-w, 1)));
			transition: transform 90ms linear;
		}
	}
</style>
