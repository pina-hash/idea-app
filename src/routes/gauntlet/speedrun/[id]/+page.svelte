<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onDestroy } from 'svelte';
	import Header from '$lib/gauntlet/Header.svelte';
	import {
		difficultyLabel,
		formatTime,
		formatMass,
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

	// Reveal-on-start state machine. The drawing is never in page data; it is
	// fetched from the hidden answer column only when Start is clicked, which is
	// the same instant the client timer begins. Drawings are teacher/seed
	// authored (trusted), so {@html} is intentional.
	type Phase = 'framing' | 'running' | 'done';
	let phase = $state<Phase>('framing');
	let drawing = $state<string | null>(null);
	let revealing = $state(false);
	let revealError = $state('');
	let startTime = 0;
	let elapsedMs = $state(0);
	let mass = $state<number | null>(null);
	let submitting = $state(false);
	let result = $state<SpeedrunResult | null>(null);
	let submitError = $state('');
	let ticker: ReturnType<typeof setInterval> | null = null;

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
		// Start the clock the instant the drawing is shown.
		phase = 'running';
		startTime = performance.now();
		elapsedMs = 0;
		stopTicker();
		ticker = setInterval(() => {
			elapsedMs = performance.now() - startTime;
		}, 100);
		revealing = false;
	};

	const submitEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (phase !== 'running' || mass === null) {
			cancel();
			return;
		}
		const elapsed = Math.round(performance.now() - startTime);
		formData.set('elapsed_ms', String(elapsed));
		submitting = true;
		stopTicker();
		elapsedMs = elapsed;
		return async ({ result: r, update }) => {
			if (r.type === 'success' && r.data?.result) {
				result = r.data.result as SpeedrunResult;
				phase = 'done';
				submitError = '';
			} else if (r.type === 'failure') {
				submitError = (r.data?.error as string) ?? 'Something went wrong.';
			} else if (r.type === 'error') {
				submitError = r.error?.message ?? 'Something went wrong.';
			}
			// Refresh the board (re-run load) without resetting the form.
			await update({ reset: false });
			submitting = false;
		};
	};

	// A retry is a fresh reveal-on-start run: re-hide the drawing and reset.
	const tryAgain = () => {
		stopTicker();
		phase = 'framing';
		drawing = null;
		mass = null;
		result = null;
		submitError = '';
		revealError = '';
		elapsedMs = 0;
	};

	onDestroy(stopTicker);
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
						Clicking Start reveals the dimensioned drawing and starts the clock at the same instant.
						Have SolidWorks ready.
					</p>
					<button class="btn" type="button" onclick={start} disabled={revealing}>
						{revealing ? 'Revealing...' : 'Start run'}
					</button>
					{#if revealError}<p class="warn">{revealError}</p>{/if}
				</div>
			{:else if drawing}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html drawing}
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
				{#if framing.demo}
					<p class="instructions warn">
						Demo placeholder: the drawing is not a real part. To try the flow, enter the target mass
						to pass or anything else to fail.
					</p>
				{/if}
			{/if}

			{#if phase === 'running'}
				<div class="run-bar">
					<span class="run-label">Elapsed</span>
					<span class="timer">{formatTime(elapsedMs / 1000)}</span>
				</div>
				<form method="POST" action="?/submit" use:enhance={submitEnhance}>
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
					<button class="btn" type="submit" disabled={mass === null || submitting}>
						{submitting ? 'Submitting...' : 'Submit mass'}
					</button>
				</form>
			{/if}

			{#if phase === 'done' && result}
				<div class="result-banner" class:ok={result.is_correct} class:no={!result.is_correct}>
					<span class="result-verdict">{result.is_correct ? 'Pass' : 'Outside tolerance'}</span>
					<span class="result-time">Time {formatTime(result.score_metric)}</span>
				</div>
				<div class="card result-detail">
					<div class="field">
						<span class="key">Your mass</span>
						<span class="val meta">{formatMass(result.your_mass, unit)}</span>
					</div>
					<div class="field">
						<span class="key">Target</span>
						<span class="val meta">
							{formatMass(result.target_mass, unit)} &plusmn;{result.tolerance_pct ?? '--'}%
						</span>
					</div>
				</div>
				{#if !result.is_correct}
					<p class="instructions">
						A miss is recorded but does not rank. Adjust your model and run it again.
					</p>
				{/if}
				<div class="btn-row">
					<button class="btn secondary" type="button" onclick={tryAgain}>Run again</button>
					<a class="btn secondary" href="/gauntlet/speedrun">Back to list</a>
				</div>
			{/if}
		</div>
	</div>

	<h2>Leaderboard</h2>
	<p class="dim board-note">Fastest passing runs. Failed attempts are recorded but do not rank.</p>
	{#if board.length === 0}
		<div class="card"><p>No passing runs yet. Be the first to clear it.</p></div>
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
		<p class="dim board-note">Your best passing run: rank #{myBest.rank}, {formatTime(myBest.score_metric)}.</p>
	{/if}
</main>
