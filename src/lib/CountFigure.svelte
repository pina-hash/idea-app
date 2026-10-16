<script lang="ts">
	/**
	 * A FIGURE THAT COUNTS UP WHEN THE PAGE OPENS (ledger 0392, Mr. Pina: "any
	 * numerical value should count up"). A thin caller of `countUp` from
	 * `$lib/count-up`, never a second animation: the same ease, the same
	 * duration, the same reduced-motion and hidden-tab answers.
	 *
	 * `places` counts a decimal figure (a 67.5% grade counts 0.0 to 67.5) by
	 * counting whole tenths, because the action counts integers. The final
	 * figure is what the server renders and what assistive tech reads: the
	 * counting copy is `aria-hidden` and a visually hidden copy carries the
	 * value from the first frame, so nobody hears "12, 31, 54".
	 */
	import { countUp } from '$lib/count-up';

	let {
		value,
		format = String,
		places = 0,
		testId
	}: {
		value: number;
		format?: (n: number) => string;
		places?: 0 | 1;
		testId?: string;
	} = $props();

	const scale = $derived(places === 1 ? 10 : 1);
	const final = $derived(format(value));
	const opts = $derived({
		value: Math.round(value * scale),
		format: (n: number) => format(n / scale),
		once: true
	});
</script>

<span class="cf" data-testid={testId}
	><span class="cf-count" aria-hidden="true" use:countUp={opts}>{final}</span><span class="cf-sr">{final}</span></span
>

<style>
	.cf {
		font-variant-numeric: tabular-nums;
	}
	.cf-sr {
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
