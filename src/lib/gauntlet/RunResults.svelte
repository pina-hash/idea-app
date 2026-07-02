<script lang="ts">
	import { xpForRun } from '$lib/gauntlet/progression';

	/**
	 * Post-run results screen, shared by every mode: verdict, metric, accuracy,
	 * PB delta, XP gained, and the suggested next drawing. Celebrates a first
	 * clear or a beaten personal best with the VIEWPORT flourish (green/gold
	 * only; crimson stays reserved for live/rec/error). Purely display: every
	 * number comes from the server-graded submission and the pre-run best.
	 */
	let {
		correct,
		metricLabel = 'Time',
		metricValue = null,
		formatMetric,
		accuracyLabel = 'Accuracy',
		accuracyText = '',
		prevBest = null,
		hadCleared = false,
		hadAttempted = false,
		verdictText = '',
		next = null,
		backHref,
		backLabel = 'Back to list',
		onRetry = null
	}: {
		correct: boolean;
		metricLabel?: string;
		metricValue?: number | null;
		formatMetric: (v: number | null) => string;
		accuracyLabel?: string;
		accuracyText?: string;
		/** The user's best metric BEFORE this run (only if it was a clear). */
		prevBest?: number | null;
		hadCleared?: boolean;
		hadAttempted?: boolean;
		verdictText?: string;
		next?: { href: string; title: string } | null;
		backHref: string;
		backLabel?: string;
		onRetry?: (() => void) | null;
	} = $props();

	const firstClear = $derived(correct && !hadCleared);
	const beatPb = $derived(
		correct && hadCleared && prevBest != null && metricValue != null && metricValue < prevBest
	);
	const celebrate = $derived(firstClear || beatPb);
	const xp = $derived(xpForRun(!hadAttempted, firstClear));

	const pbText = $derived.by(() => {
		if (!correct) return 'PB stands';
		if (firstClear) return 'First clear, PB set';
		if (prevBest == null || metricValue == null) return '--';
		const delta = metricValue - prevBest;
		if (delta < 0) return `PB beaten by ${formatMetric(Math.abs(delta))}`;
		if (delta === 0) return 'Matched your PB';
		return `${formatMetric(delta)} off your PB (${formatMetric(prevBest)})`;
	});
</script>

<div class="run-results" class:celebrate>
	<div class="result-banner" class:ok={correct} class:no={!correct}>
		<span class="result-verdict">
			{verdictText || (correct ? 'Cleared' : 'Not this time')}
		</span>
		{#if celebrate}
			<span class="pb-flash">{firstClear ? 'First clear' : 'New personal best'}</span>
		{/if}
	</div>

	<div class="card result-detail">
		<div class="field">
			<span class="key">{metricLabel}</span>
			<span class="val meta">{formatMetric(metricValue)}</span>
		</div>
		{#if accuracyText}
			<div class="field">
				<span class="key">{accuracyLabel}</span>
				<span class="val">{accuracyText}</span>
			</div>
		{/if}
		<div class="field">
			<span class="key">Personal best</span>
			<span class="val" class:pb-beat={celebrate}>{pbText}</span>
		</div>
		<div class="field">
			<span class="key">XP gained</span>
			<span class="val meta">{xp > 0 ? `+${xp} XP` : 'Already banked for this one'}</span>
		</div>
	</div>

	<div class="btn-row">
		{#if onRetry}
			<button class="btn secondary" type="button" onclick={onRetry}>Run again</button>
		{/if}
		{#if next}
			<a class="btn" href={next.href}>Next up: {next.title} &#9656;</a>
		{:else if correct}
			<a class="btn" href={backHref}>All challenges &#9656;</a>
		{/if}
		<a class="btn secondary" href={backHref}>{backLabel}</a>
	</div>
</div>
