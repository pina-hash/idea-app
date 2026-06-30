<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import {
		difficultyLabel,
		formatTime,
		formatMass,
		MACRO_PATH,
		type SpeedrunReveal,
		type SpeedrunResult
	} from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenge, board, myUserId, myBest } = $derived(data);

	const framing = $derived(challenge.framing);
	const unit = $derived(framing.mass_unit ?? 'g');
	const band = $derived(
		framing.target_mass != null && framing.tolerance_pct != null
			? {
					lo: framing.target_mass - (framing.target_mass * framing.tolerance_pct) / 100,
					hi: framing.target_mass + (framing.target_mass * framing.tolerance_pct) / 100
				}
			: null
	);

	// Reveal-on-start state. The macro is the ranked path: reveal mints a
	// single-use submit code and a server-side reveal_at, the student models the
	// part and runs the macro, and the result arrives over Realtime. The drawing
	// is teacher/seed authored (trusted), so {@html} is intentional.
	type Phase = 'framing' | 'running' | 'done';
	let phase = $state<Phase>('framing');
	let drawing = $state<string | null>(null);
	let code = $state<string | null>(null);
	let revealing = $state(false);
	let revealError = $state('');
	let copied = $state(false);

	let startTime = 0;
	let elapsedMs = $state(0);
	let ticker: ReturnType<typeof setInterval> | null = null;

	// The macro result (ranked) arrives via Realtime; the manual practice result
	// is an inline, unranked self-check that never ends or blocks the run.
	let result = $state<{ is_correct: boolean; score_metric: number | null } | null>(null);
	let practice = $state<SpeedrunResult | null>(null);
	let mass = $state<number | null>(null);
	let submitting = $state(false);
	let submitError = $state('');
	let showPractice = $state(false);
	let refreshing = $state(false);

	const stopTicker = () => {
		if (ticker) {
			clearInterval(ticker);
			ticker = null;
		}
	};

	const start = async () => {
		revealing = true;
		revealError = '';
		const { data: rev, error } = await supabase.rpc('gauntlet_speedrun_reveal', {
			p_challenge_id: challenge.id
		});
		if (error) {
			revealError = error.message;
			revealing = false;
			return;
		}
		const payload = rev as SpeedrunReveal | null;
		drawing = payload?.drawing ?? null;
		code = payload?.code ?? null;
		phase = 'running';
		result = null;
		practice = null;
		mass = null;
		submitError = '';
		startTime = performance.now();
		elapsedMs = 0;
		stopTicker();
		ticker = setInterval(() => {
			elapsedMs = performance.now() - startTime;
		}, 250);
		revealing = false;
	};

	const copyCode = async () => {
		if (!code) return;
		try {
			await navigator.clipboard.writeText(code);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	};

	// Manual practice: an unranked self-check. It posts a 'manual' submission
	// (which the leaderboard view ignores) and shows feedback inline, leaving the
	// code and the macro path live.
	const practiceEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (phase !== 'running' || mass === null) {
			cancel();
			return;
		}
		formData.set('elapsed_ms', String(Math.round(performance.now() - startTime)));
		submitting = true;
		return async ({ result: r, update }) => {
			if (r.type === 'success' && r.data?.result) {
				practice = r.data.result as SpeedrunResult;
				submitError = '';
			} else if (r.type === 'failure') {
				submitError = (r.data?.error as string) ?? 'Something went wrong.';
			} else if (r.type === 'error') {
				submitError = r.error?.message ?? 'Something went wrong.';
			}
			await update({ reset: false });
			submitting = false;
		};
	};

	const refresh = async () => {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	};

	// A retry is a fresh reveal-on-start run: re-hide everything and reset.
	const reset = () => {
		stopTicker();
		phase = 'framing';
		drawing = null;
		code = null;
		result = null;
		practice = null;
		mass = null;
		submitError = '';
		revealError = '';
		elapsedMs = 0;
	};

	onMount(() => {
		// Live-update when the macro posts this user's run. RLS limits the stream
		// to the user's own submissions; the filter narrows to this challenge.
		const channel = supabase
			.channel(`speedrun-${challenge.id}`)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'submissions', filter: `challenge_id=eq.${challenge.id}` },
				(payload) => {
					const row = payload.new as {
						source?: string;
						user_id?: string;
						is_correct?: boolean;
						score_metric?: number | null;
					};
					// Teachers can read all submissions (RLS), so scope to our own run.
					if (row.source === 'macro' && row.user_id === myUserId) {
						stopTicker();
						result = { is_correct: !!row.is_correct, score_metric: row.score_metric ?? null };
						phase = 'done';
						invalidateAll();
					}
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
			stopTicker();
		};
	});
</script>

<svelte:head>
	<title>{challenge.title} // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Speedrun', href: '/gauntlet/speedrun' }, { label: challenge.title }]}
/>

<main class="gauntlet">
	<div class="play-head">
		<span class="diff diff-{challenge.difficulty}">{difficultyLabel(challenge.difficulty)}</span>
		<h1>{challenge.title}</h1>
		{#if framing.demo}<span class="demo-badge">Demo placeholder</span>{/if}
	</div>

	<div class="play-grid">
		<div class="drawing-panel">
			{#if phase === 'framing'}
				<div class="start-gate">
					<div class="gate-lock" aria-hidden="true">&#9632;</div>
					<p class="gate-title">Drawing hidden</p>
					<p class="gate-sub">
						Start reveals the dimensioned drawing and mints your submit code. The clock starts on
						the server the instant you hit Start. Have SolidWorks ready.
					</p>
					<button class="btn" type="button" onclick={start} disabled={revealing}>
						{revealing ? 'Revealing...' : 'Start run'}
					</button>
					{#if revealError}<p class="warn">{revealError}</p>{/if}
				</div>
			{:else if drawing}
				<Asset value={drawing} />
			{:else}
				<p class="dim">No drawing provided.</p>
			{/if}
		</div>

		<div class="question-panel">
			<div class="spec card">
				<div class="field">
					<span class="key">Material</span>
					<span class="val">{framing.material ?? 'TBD'}</span>
				</div>
				<div class="field">
					<span class="key">Density</span>
					<span class="val meta">{framing.density ?? '--'} {framing.density_unit ?? ''}</span>
				</div>
				<div class="field">
					<span class="key">Target mass</span>
					<span class="val meta">{formatMass(framing.target_mass, unit)}</span>
				</div>
				<div class="field">
					<span class="key">Tolerance</span>
					<span class="val meta">
						&plusmn;{framing.tolerance_pct ?? '--'}%
						{#if band}<span class="dim"> ({formatMass(band.lo, unit)} to {formatMass(band.hi, unit)})</span>{/if}
					</span>
				</div>
			</div>

			{#if phase === 'framing'}
				{#if framing.note}<p class="instructions">{framing.note}</p>{/if}
				<p class="instructions">
					Ranked runs are machine verified by the GAUNTLET macro: it reads your part geometry and
					posts it with your submit code. <a href="/gauntlet/tools">Get the macro and setup</a>.
				</p>
				{#if framing.demo}
					<p class="instructions warn">
						Demo placeholder: the drawing is not a real part. The macro ranks on volume, so to see a
						pass you would model the target volume; or use manual practice below to try the flow.
					</p>
				{/if}
			{/if}

			{#if phase === 'running'}
				<div class="code-box">
					<div class="code-head">
						<span class="code-label">Submit code</span>
						<button class="text-copy" type="button" onclick={copyCode}>{copied ? 'Copied' : 'Copy'}</button>
					</div>
					<div class="code-value">{code ?? '--------'}</div>
					<p class="code-instr">
						In SolidWorks, run the GAUNTLET macro, choose <strong>Student submit</strong>, and paste
						this code. <a href={MACRO_PATH} download>Download macro</a> &middot;
						<a href="/gauntlet/tools">Setup</a>
					</p>
				</div>

				<div class="run-bar">
					<span class="run-label">Your clock</span>
					<span class="timer">{formatTime(elapsedMs / 1000)}</span>
				</div>
				<div class="waiting">
					<span class="dim">Waiting for your macro submission. It appears here automatically.</span>
					<button class="btn secondary" type="button" onclick={refresh} disabled={refreshing}>
						{refreshing ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>

				<details class="practice" bind:open={showPractice}>
					<summary>Practice manually (unranked)</summary>
					<p class="instructions">
						A quick self-check without the macro. It does not rank; only macro-verified runs do.
					</p>
					<form method="POST" action="?/submit" use:enhance={practiceEnhance}>
						<label class="mass-field">
							<span class="mass-label">Mass from Mass Properties</span>
							<span class="mass-input-wrap">
								<input
									class="mass-input"
									type="number"
									name="mass"
									step="any"
									min="0"
									inputmode="decimal"
									placeholder="0.0"
									bind:value={mass}
								/>
								<span class="mass-unit">{unit}</span>
							</span>
						</label>
						<input type="hidden" name="elapsed_ms" value="0" />
						{#if submitError}<p class="warn">{submitError}</p>{/if}
						<button class="btn secondary" type="submit" disabled={mass === null || submitting}>
							{submitting ? 'Checking...' : 'Check (practice)'}
						</button>
					</form>
					{#if practice}
						<div class="result-banner small" class:ok={practice.is_correct} class:no={!practice.is_correct}>
							<span class="result-verdict">{practice.is_correct ? 'In tolerance' : 'Outside tolerance'}</span>
							<span class="result-time">{formatMass(practice.your_mass, unit)} vs {formatMass(practice.target_mass, unit)}</span>
						</div>
					{/if}
				</details>

				<button class="text-btn" type="button" onclick={reset}>Start over</button>
			{/if}

			{#if phase === 'done' && result}
				<div class="result-banner" class:ok={result.is_correct} class:no={!result.is_correct}>
					<span class="result-verdict">{result.is_correct ? 'Pass, verified' : 'Outside tolerance'}</span>
					<span class="result-time">Time {formatTime(result.score_metric)}</span>
				</div>
				{#if result.is_correct && myBest}
					<p class="instructions">Ranked <strong>#{myBest.rank}</strong> on the board.</p>
				{:else if !result.is_correct}
					<p class="instructions">A miss is recorded but does not rank. Adjust your model and run again.</p>
				{/if}
				<div class="btn-row">
					<button class="btn secondary" type="button" onclick={reset}>Run again</button>
					<a class="btn secondary" href="/gauntlet/speedrun">Back to list</a>
				</div>
			{/if}
		</div>
	</div>

	<h2>Leaderboard</h2>
	<p class="dim board-note">Machine-verified runs, fastest first. Manual practice does not rank.</p>
	{#if board.length === 0}
		<div class="card"><p>No verified runs yet. Be the first to clear it.</p></div>
	{:else}
		<table class="board">
			<thead>
				<tr>
					<th class="rank-col">#</th>
					<th>Player</th>
					<th class="time-col">Time</th>
				</tr>
			</thead>
			<tbody>
				{#each board as row (row.user_id)}
					<tr class:me={row.user_id === myUserId}>
						<td class="rank-col">{row.rank}</td>
						<td>{row.player}{#if row.user_id === myUserId}<span class="you">you</span>{/if}</td>
						<td class="time-col">{formatTime(row.score_metric)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if myBest && !board.some((r) => r.user_id === myUserId)}
		<p class="dim board-note">Your best verified run: rank #{myBest.rank}, {formatTime(myBest.score_metric)}.</p>
	{/if}
</main>
