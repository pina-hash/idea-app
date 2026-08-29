<script lang="ts">
	import '$lib/gauntlet/viewport/viewport.css';
	import RunResults from '$lib/gauntlet/RunResults.svelte';
	import SpeedrunClock from '$lib/gauntlet/SpeedrunClock.svelte';
	import { formatTime } from '$lib/gauntlet';

	/**
	 * Dev-only harness for the two components a student sees on EVERY run:
	 * RunResults (the post-run screen, shared by all six modes) and
	 * SpeedrunClock (the race timer). Neither was reachable from any dev route.
	 *
	 * THE FOUR RESULT STATES ARE THE POINT, and they are four rather than two
	 * because `celebrate` is a DERIVED conjunction: a first clear celebrates, a
	 * beaten personal best celebrates, and a clear that was slower than the
	 * standing PB must NOT -- which is the state a `correct ? celebrate : not`
	 * regression would silently start congratulating. Each mount below pins one
	 * of them, so the flourish can be counted as an exclusion (2 of 4) with the
	 * other two as its positive control rather than asserted as "at least one".
	 *
	 * THE CLOCK'S THREE STATES ARE STANDBY / LIVE / UNRANKED, and standby is the
	 * one worth having on screen: `running` is true and `serverStartMs` is still
	 * null, which is every ranked run between pressing reveal and the SolidWorks
	 * Start macro firing. It is a distinct treatment (dimmed digits, no glow, a
	 * static dot, the word STANDBY) and nothing else in the repo renders it.
	 *
	 * `serverStartMs` is anchored off `Date.now()` at load so the live clock
	 * actually runs; the harness never asserts the digits, only the treatment,
	 * because a rAF-driven readout has no settled value to assert.
	 */
	/*
	 * `metricValue` / `prevBest` are a `score_metric`, which for Speedrun is
	 * ELAPSED SECONDS -- that is what `formatTime` reads and what the real page
	 * hands it (`result.score_metric`). Handing it milliseconds renders
	 * "1190m 00s" for a 71-second run, which is what the first draft of this
	 * fixture did: a harness whose numbers are not shaped like the real ones
	 * measures a screen nobody will see. `serverStartMs` IS milliseconds --
	 * it is an epoch stamp, not a metric.
	 */
	const now = Date.now();
	const next = { href: '/gauntlet/speedrun/next-one', title: 'Angle Bracket' };
</script>

<svelte:head><title>GAUNTLET run surfaces harness</title></svelte:head>

<div class="gt-root">
	<div class="gt-content">
		<main class="gauntlet harness">
			<h1>Run surfaces harness</h1>
			<p class="note">
				RunResults in its four verdict states and SpeedrunClock in its three. The celebration
				flourish belongs to exactly two of the four results: a first clear and a beaten PB. A clear
				that was slower than the standing best is still a clear and must not celebrate.
			</p>

			<section class="mount" data-mount="first clear">
				<h2>Cleared, first time (celebrates)</h2>
				<RunResults
					correct={true}
					metricValue={71.4}
					formatMetric={formatTime}
					accuracyText="0.04% off target volume"
					prevBest={null}
					hadCleared={false}
					hadAttempted={false}
					{next}
					backHref="/gauntlet/speedrun"
					backLabel="Back to Speedrun"
				/>
			</section>

			<section class="mount" data-mount="pb beaten">
				<h2>Cleared, personal best beaten (celebrates)</h2>
				<RunResults
					correct={true}
					metricValue={64.2}
					formatMetric={formatTime}
					accuracyText="0.02% off target volume"
					prevBest={71.4}
					hadCleared={true}
					hadAttempted={true}
					{next}
					backHref="/gauntlet/speedrun"
					backLabel="Back to Speedrun"
				/>
			</section>

			<section class="mount" data-mount="cleared slower">
				<h2>Cleared, slower than the PB (must NOT celebrate)</h2>
				<RunResults
					correct={true}
					metricValue={88.9}
					formatMetric={formatTime}
					accuracyText="0.07% off target volume"
					prevBest={64.2}
					hadCleared={true}
					hadAttempted={true}
					next={null}
					backHref="/gauntlet/speedrun"
					backLabel="Back to Speedrun"
				/>
			</section>

			<section class="mount" data-mount="not cleared">
				<h2>Not cleared (retry offered)</h2>
				<RunResults
					correct={false}
					metricValue={52.1}
					formatMetric={formatTime}
					accuracyText="3.9% off target volume"
					prevBest={64.2}
					hadCleared={true}
					hadAttempted={true}
					next={null}
					backHref="/gauntlet/speedrun"
					backLabel="Back to Speedrun"
					onRetry={() => {}}
				/>
			</section>

			<section class="mount clocks" data-mount="clocks">
				<h2>SpeedrunClock: standby, live ranked, unranked</h2>
				<div class="clock-row">
					<SpeedrunClock serverStartMs={null} running={true} ranked={true} />
					<SpeedrunClock serverStartMs={now - 64_200} running={true} ranked={true} />
					<SpeedrunClock serverStartMs={now - 64_200} running={true} ranked={false} />
				</div>
			</section>
		</main>
	</div>
</div>

<style>
	.harness {
		max-width: 860px;
		margin: 0 auto;
		padding: 2rem 1.5rem 3rem;
	}
	h1 {
		font-family: var(--font-head, sans-serif);
		margin: 0 0 0.6rem;
	}
	h2 {
		font-family: var(--font-mono, monospace);
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ice);
		margin: 0 0 0.8rem;
	}
	.note {
		color: var(--ice);
		max-width: 62ch;
		line-height: 1.6;
	}
	.mount {
		margin: 2rem 0 0;
		padding-top: 1.4rem;
		border-top: 1px solid var(--line);
	}
	.clock-row {
		display: flex;
		flex-wrap: wrap;
		gap: 1.2rem;
		align-items: flex-start;
	}
</style>
