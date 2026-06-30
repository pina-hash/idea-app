<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import Header from '$lib/gauntlet/Header.svelte';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import { difficultyLabel, formatTime, type SubmitResult } from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenge, board, myUserId, myBest } = $derived(data);

	// Drawings and option thumbnails are inline SVG authored by teachers/seeds
	// (trusted content), so {@html} is intentional here.
	let selected = $state('');
	let submitting = $state(false);
	let startTime = 0;
	let localResult = $state<SubmitResult | null>(null);
	let localAnswered = $state<string | null>(null);
	let localError = $state('');

	onMount(() => {
		startTime = performance.now();
	});

	const submitEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (!selected) {
			cancel();
			return;
		}
		formData.set('answer', selected);
		formData.set('elapsed_ms', String(Math.round(performance.now() - startTime)));
		submitting = true;
		return async ({ result, update }) => {
			if (result.type === 'success' && result.data?.result) {
				localResult = result.data.result as SubmitResult;
				localAnswered = (result.data.answered as string) ?? null;
				localError = '';
			} else if (result.type === 'failure') {
				localError = (result.data?.error as string) ?? 'Something went wrong.';
			} else if (result.type === 'error') {
				localError = result.error?.message ?? 'Something went wrong.';
			}
			// Refresh the board (re-run load) without clearing the chosen answer.
			await update({ reset: false });
			submitting = false;
		};
	};

	const tryAgain = () => {
		localResult = null;
		localAnswered = null;
		localError = '';
		selected = '';
		startTime = performance.now();
	};

	const answered = $derived(!!localResult);
	const optionClass = (id: string) => {
		if (!localResult) return selected === id ? 'selected' : '';
		if (id === localResult.correct) return 'correct';
		if (id === localAnswered) return 'wrong';
		return '';
	};
</script>

<svelte:head>
	<title>{challenge.title} // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[
		{ label: 'Drawing Reading', href: '/gauntlet/drawing-reading' },
		{ label: challenge.title }
	]}
/>

<main class="gauntlet">
	<div class="play-head">
		<span class="diff diff-{challenge.difficulty}">{difficultyLabel(challenge.difficulty)}</span>
		<h1>{challenge.title}</h1>
	</div>

	<div class="play-grid">
		<div class="drawing-panel">
			{#if challenge.prompt.drawing}
				<Asset value={challenge.prompt.drawing} />
			{:else if challenge.assetRef}
				<img src={challenge.assetRef} alt="Challenge drawing" />
			{:else}
				<p class="dim">No drawing provided.</p>
			{/if}
		</div>

		<div class="question-panel">
			{#if challenge.prompt.instructions}
				<p class="instructions">{challenge.prompt.instructions}</p>
			{/if}
			<p class="question">{challenge.prompt.question}</p>

			<form method="POST" action="?/submit" use:enhance={submitEnhance}>
				<fieldset class="options" disabled={answered || submitting}>
					{#each challenge.prompt.options ?? [] as opt (opt.id)}
						<label class="opt {optionClass(opt.id)}">
							<input
								type="radio"
								name="answer"
								value={opt.id}
								checked={selected === opt.id}
								onchange={() => (selected = opt.id)}
							/>
							<span class="opt-key">{opt.id.toUpperCase()}</span>
							{#if opt.svg}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<span class="opt-svg">{@html opt.svg}</span>
							{:else}
								<span class="opt-label">{opt.label}</span>
							{/if}
						</label>
					{/each}
				</fieldset>
				<input type="hidden" name="elapsed_ms" value="0" />

				{#if localError}
					<p class="warn">{localError}</p>
				{/if}

				{#if !answered}
					<button class="btn" type="submit" disabled={!selected || submitting}>
						{submitting ? 'Checking...' : 'Submit answer'}
					</button>
				{/if}
			</form>

			{#if localResult}
				<div class="result-banner" class:ok={localResult.is_correct} class:no={!localResult.is_correct}>
					<span class="result-verdict">{localResult.is_correct ? 'Correct' : 'Not quite'}</span>
					<span class="result-time">Your time {formatTime(localResult.score_metric)}</span>
				</div>
				{#if localResult.explanation}
					<p class="explanation">{localResult.explanation}</p>
				{/if}
				<div class="btn-row">
					<button class="btn secondary" type="button" onclick={tryAgain}>Try again</button>
					<a class="btn secondary" href="/gauntlet/drawing-reading">Back to list</a>
				</div>
			{/if}
		</div>
	</div>

	<h2>Leaderboard</h2>
	{#if board.length === 0}
		<div class="card"><p>No submissions yet. Be the first to clear it.</p></div>
	{:else}
		<table class="board">
			<thead>
				<tr>
					<th class="rank-col">#</th>
					<th>Player</th>
					<th>Result</th>
					<th class="time-col">Time</th>
				</tr>
			</thead>
			<tbody>
				{#each board as row (row.user_id)}
					<tr class:me={row.user_id === myUserId}>
						<td class="rank-col">{row.rank}</td>
						<td>{row.player}{#if row.user_id === myUserId}<span class="you">you</span>{/if}</td>
						<td>
							{#if row.is_correct}
								<span class="res-ok">Correct</span>
							{:else}
								<span class="res-no">Missed</span>
							{/if}
						</td>
						<td class="time-col">{formatTime(row.score_metric)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if myBest && !board.some((r) => r.user_id === myUserId)}
		<p class="dim board-note">
			Your best: rank #{myBest.rank}, {formatTime(myBest.score_metric)}
			({myBest.is_correct ? 'correct' : 'missed'}).
		</p>
	{/if}
</main>
