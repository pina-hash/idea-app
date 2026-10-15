<script lang="ts">
	/**
	 * /dev/cert-exam: the exam runtime's every state and the proctor's live
	 * view, through the REAL components over in-memory transports. See
	 * +page.server.ts for the query string. The room is `.cert-root` with
	 * `cert.css`, and `/dev/cert-` is in `SITE_PLATE_DEV_PREFIXES`, so the plate
	 * paints here exactly as it does on `/certifications`.
	 */
	import '$lib/certifications/cert.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ExamRunner from '$lib/certifications/exam/ExamRunner.svelte';
	import ProctorLive from '$lib/certifications/exam/ProctorLive.svelte';
	import { startExamLivePoller } from '$lib/certifications/exam/live-poll';
	import type { ExamLiveRow } from '$lib/certifications/types';
	import { FAILED_RESULT, LIVE_ROWS, memoryTransport, PASSED_RESULT, TOPIC_NAMES } from './fixtures';

	let { data }: { data: { only: string | null; pollMs: number } } = $props();

	const show = (state: string) => data.only === null || data.only === state;
	const single = $derived(data.only !== null);

	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const themeParam = page.url.searchParams.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const transports = {
		lobby: memoryTransport(),
		question: memoryTransport(),
		result: memoryTransport(),
		expired: memoryTransport({ expired: true })
	};

	/* The live view: the real poller over an in-memory read, counted. */
	let liveRows = $state<ExamLiveRow[]>(LIVE_ROWS.map((r) => ({ ...r, flags: [...r.flags] })));
	let livePolls = $state(0);
	let liveLoading = $state(false);
	onMount(() => {
		if (!show('live')) return;
		const poller = startExamLivePoller({
			load: async () => {
				liveLoading = true;
				livePolls++;
				await new Promise((r) => setTimeout(r, 40));
				liveLoading = false;
				return liveRows;
			},
			onrows: (rows) => {
				if (rows) liveRows = rows;
			},
			pollMs: data.pollMs
		});
		return () => poller.stop();
	});

	async function endExam(examId: string) {
		await new Promise((r) => setTimeout(r, 80));
		liveRows = liveRows.map((r) => (r.exam_id === examId ? { ...r, state: 'submitted', passed: false, submitted_at: new Date().toISOString() } : r));
	}
	async function releaseAgain(examId: string) {
		await new Promise((r) => setTimeout(r, 80));
		liveRows = liveRows.map((r) =>
			r.exam_id === examId ? { ...r, state: 'released', released_at: new Date().toISOString(), release_expires_at: new Date(Date.now() + 600_000).toISOString() } : r
		);
	}

	const BACK = '/certifications/MILL-1';
</script>

<svelte:head><title>Certification exam harness</title></svelte:head>

<main class="cert-root" data-cert-exam-hydrated={hydrated ? 'yes' : undefined} data-live-polls={livePolls}>
	<header class="cert-titlebar">
		<div>
			<p class="eyebrow cert-eyebrow">IDEA // Certifications // harness</p>
			<h1 class="cert-title">Exam runtime</h1>
		</div>
	</header>
	<p class="cert-lead">
		Every state of the exam runtime over an in-memory transport. The question state answers like the real database (one question at a time, out of
		order refused, scored on submit); the failed and passed states are handed a result; the expired state is a release that ran out.
	</p>

	{#if show('lobby')}
		<section data-view="lobby" class="harness-view">
			{#if !single}<h2 class="cert-section-h">Lobby</h2>{/if}
			<ExamRunner examId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" transport={transports.lobby} fullscreen={single} topicNames={TOPIC_NAMES} backHref={BACK} />
		</section>
	{/if}
	{#if show('question')}
		<section data-view="question" class="harness-view">
			{#if !single}<h2 class="cert-section-h">A question</h2>{/if}
			<ExamRunner examId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" transport={transports.question} fullscreen={false} initial={{ kind: 'open' }} topicNames={TOPIC_NAMES} backHref={BACK} />
		</section>
	{/if}
	{#if show('failed')}
		<section data-view="failed" class="harness-view">
			{#if !single}<h2 class="cert-section-h">Not this time</h2>{/if}
			<ExamRunner examId="cccccccc-cccc-4ccc-8ccc-cccccccccccc" transport={transports.result} fullscreen={false} initial={{ kind: 'result', result: FAILED_RESULT }} topicNames={TOPIC_NAMES} backHref={BACK} backLabel="Back to Manual Mill Level 1" />
		</section>
	{/if}
	{#if show('passed')}
		<section data-view="passed" class="harness-view">
			{#if !single}<h2 class="cert-section-h">Passed</h2>{/if}
			<ExamRunner examId="dddddddd-dddd-4ddd-8ddd-dddddddddddd" transport={transports.result} fullscreen={false} initial={{ kind: 'result', result: PASSED_RESULT }} topicNames={TOPIC_NAMES} backHref={BACK} backLabel="Back to Manual Mill Level 1" />
		</section>
	{/if}
	{#if show('expired')}
		<section data-view="expired" class="harness-view">
			{#if !single}<h2 class="cert-section-h">Expired release</h2>{/if}
			<ExamRunner examId="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" transport={transports.expired} fullscreen={false} initial={{ kind: 'expired' }} topicNames={TOPIC_NAMES} backHref={BACK} />
		</section>
	{/if}
	{#if show('live')}
		<section data-view="live" class="harness-view cert-console">
			{#if !single}<h2 class="cert-section-h">The proctor's live view</h2>{/if}
			<p class="cert-help" data-testid="cert-live-poll-count">Polled {livePolls} time{livePolls === 1 ? '' : 's'} at {data.pollMs} ms.</p>
			<ProctorLive rows={liveRows} loading={liveLoading} onend={endExam} onrelease={releaseAgain} />
		</section>
	{/if}
</main>

<style>
	.harness-view {
		margin: 0 0 2.5rem;
	}
</style>
