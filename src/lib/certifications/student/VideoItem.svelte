<script lang="ts">
	/**
	 * One training video (ledger 0391): surface e's `YouTubePlayer` (the
	 * tracker, the 2x cap and the Continue check-ins are its), the watch rules
	 * sentence under it, this person's progress as a readout, and the coverage
	 * the last watch report answered. Every `onsession` goes to
	 * `cert_watch_report` through the injected `rpc`; nothing here decides
	 * what counts (`cert_watch_report` is the floor).
	 */
	import YouTubePlayer from '$lib/certifications/watch/YouTubePlayer.svelte';
	import { WATCH_RULES_SENTENCE } from '$lib/certifications/copy';
	import type { CertTrainingProgress, TrainingVideoItem } from '$lib/certifications/types';
	import type { CertRpc } from './actions';
	import { coverageWords, trainingWords } from './kit';
	import { readWatchReport, sessionReporter, type WatchSessionLike } from './watch-report';
	import CertNotice from './CertNotice.svelte';

	let {
		item,
		certId,
		progress = null,
		checkinTimeoutSeconds = 60,
		rpc = null,
		onreported = null
	}: {
		item: TrainingVideoItem;
		certId: string;
		progress?: CertTrainingProgress | null;
		checkinTimeoutSeconds?: number;
		rpc?: CertRpc | null;
		/** Told when a report said the training check is now done, so the page re-reads. */
		onreported?: ((trainingDone: boolean) => void) | null;
	} = $props();

	const words = $derived(trainingWords(progress, 'video'));
	let last = $state<ReturnType<typeof readWatchReport> | null>(null);

	const onsession = $derived(
		rpc
			? sessionReporter(rpc, certId, item.key, (result) => {
					last = result;
					if (result.ok) onreported?.(result.training_done);
				})
			: (session: WatchSessionLike) => {
					void session;
					return Promise.resolve();
				}
	);
</script>

<article class="cert-video" data-testid="cert-video" data-key={item.key} data-done={words.done ? 'yes' : 'no'}>
	<h3 class="cert-video-h">
		{item.title}
		<span class="cert-readout" class:is-ok={words.done} data-testid="cert-video-progress">
			{#if words.done}<span aria-hidden="true">✓</span>{/if}
			{words.word}
		</span>
	</h3>
	<div class="cert-video-stage">
		<!-- The player's own rules line is off: the sentence sits once, under the stage, beside this item's progress. -->
		<YouTubePlayer
			videoId={item.youtube_id}
			start={item.start ?? 0}
			title={item.title}
			itemKey={item.key}
			{checkinTimeoutSeconds}
			{onsession}
			showRules={false}
			priorCoverage={progress && progress.duration_seconds ? Math.min(1, progress.covered_seconds / progress.duration_seconds) : null}
		/>
	</div>
	<p class="cert-help cert-video-rules">{WATCH_RULES_SENTENCE}</p>
	{#if last}
		{#if last.ok}
			<p class="cert-help cert-video-coverage" data-testid="cert-video-coverage">{coverageWords(last.coverage, last.complete)}</p>
		{:else}
			<CertNotice tone="bad" testId="cert-video-refusal">{last.message}</CertNotice>
		{/if}
	{/if}
</article>

<style>
	.cert-video {
		margin: 0 0 1.25rem;
	}
	.cert-video-h {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		margin: 0 0 0.6rem;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 700;
	}
	.cert-video-h::before {
		content: none;
	}
	.cert-video-stage {
		margin: 0 0 0.5rem;
	}
	.cert-video-rules {
		margin: 0;
	}
	.cert-video-coverage {
		margin: 0.35rem 0 0;
		color: var(--text-1);
	}
</style>
