<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { difficultyLabel, formatTime, type KnowledgePrompt, type SubmitResult } from '$lib/gauntlet';

	/**
	 * Shared play flow for the web-only knowledge modes (Drawing Reading is its
	 * own page; GD&T and Spot the Error use this). A challenge is multiple choice
	 * (`prompt.options`) or free entry (`prompt.input`, text/numeric); the parent
	 * route's `submit` action grades through gauntlet_submit. Boards rank by
	 * correctness with elapsed time as a tiebreak, identical to Drawing Reading.
	 */
	interface Challenge {
		id: string;
		title: string;
		difficulty: number;
		prompt: KnowledgePrompt;
	}
	interface BoardRow {
		user_id: string;
		player: string;
		is_correct: boolean | null;
		score_metric: number | null;
		rank: number;
	}

	let {
		challenge,
		board,
		myUserId,
		myBest,
		backHref
	}: {
		challenge: Challenge;
		board: BoardRow[];
		myUserId: string;
		myBest: { is_correct: boolean | null; score_metric: number | null; rank: number } | null;
		backHref: string;
	} = $props();

	const prompt = $derived(challenge.prompt);
	const isChoice = $derived(!!prompt.options?.length);

	// Drawings are teacher/seed authored (trusted), so {@html} is intentional.
	let selected = $state('');
	let typed = $state('');
	let submitting = $state(false);
	let startTime = 0;
	let localResult = $state<SubmitResult | null>(null);
	let localAnswered = $state<string | null>(null);
	let localError = $state('');

	const answerValue = $derived(isChoice ? selected : typed.trim());
	const answered = $derived(!!localResult);

	onMount(() => {
		startTime = performance.now();
	});

	const submitEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (!answerValue) {
			cancel();
			return;
		}
		formData.set('answer', answerValue);
		formData.set('elapsed_ms', String(Math.round(performance.now() - startTime)));
		submitting = true;
		return async ({ result, update }) => {
			if (result.type === 'success' && result.data?.result) {
				localResult = result.data.result as SubmitResult;
				localAnswered = answerValue;
				localError = '';
			} else if (result.type === 'failure') {
				localError = (result.data?.error as string) ?? 'Something went wrong.';
			} else if (result.type === 'error') {
				localError = result.error?.message ?? 'Something went wrong.';
			}
			await update({ reset: false });
			submitting = false;
		};
	};

	const tryAgain = () => {
		localResult = null;
		localAnswered = null;
		localError = '';
		selected = '';
		typed = '';
		startTime = performance.now();
	};

	const optionClass = (id: string) => {
		if (!localResult) return selected === id ? 'selected' : '';
		if (id === localResult.correct) return 'correct';
		if (id === localAnswered) return 'wrong';
		return '';
	};
</script>

<main class="gauntlet">
	<div class="play-head">
		<span class="diff diff-{challenge.difficulty}">{difficultyLabel(challenge.difficulty)}</span>
		<h1>{challenge.title}</h1>
	</div>

	<div class="play-grid">
		<div class="drawing-panel">
			{#if prompt.drawing}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html prompt.drawing}
			{:else}
				<p class="dim">No drawing for this question.</p>
			{/if}
		</div>

		<div class="question-panel">
			{#if prompt.instructions}
				<p class="instructions">{prompt.instructions}</p>
			{/if}
			<p class="question">{prompt.question}</p>

			<form method="POST" action="?/submit" use:enhance={submitEnhance}>
				{#if isChoice}
					<fieldset class="options" disabled={answered || submitting}>
						{#each prompt.options ?? [] as opt (opt.id)}
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
				{:else if prompt.input}
					<label class="mass-field">
						<span class="mass-label">Your answer</span>
						<span class="mass-input-wrap">
							<input
								class="mass-input"
								type={prompt.input.type === 'numeric' ? 'number' : 'text'}
								name="answer"
								step={prompt.input.type === 'numeric' ? 'any' : undefined}
								inputmode={prompt.input.type === 'numeric' ? 'decimal' : undefined}
								placeholder={prompt.input.placeholder ?? ''}
								disabled={answered || submitting}
								bind:value={typed}
							/>
							{#if prompt.input.unit}<span class="mass-unit">{prompt.input.unit}</span>{/if}
						</span>
					</label>
				{/if}

				{#if localError}<p class="warn">{localError}</p>{/if}

				{#if !answered}
					<button class="btn" type="submit" disabled={!answerValue || submitting}>
						{submitting ? 'Checking...' : 'Submit answer'}
					</button>
				{/if}
			</form>

			{#if localResult}
				<div class="result-banner" class:ok={localResult.is_correct} class:no={!localResult.is_correct}>
					<span class="result-verdict">{localResult.is_correct ? 'Correct' : 'Not quite'}</span>
					<span class="result-time">Your time {formatTime(localResult.score_metric)}</span>
				</div>
				{#if !isChoice && localResult.correct != null}
					<div class="card result-detail">
						<div class="field">
							<span class="key">Your answer</span>
							<span class="val">{localAnswered}</span>
						</div>
						<div class="field">
							<span class="key">Correct answer</span>
							<span class="val meta">{localResult.correct}</span>
						</div>
					</div>
				{/if}
				{#if localResult.explanation}
					<p class="explanation">{localResult.explanation}</p>
				{/if}
				<div class="btn-row">
					<button class="btn secondary" type="button" onclick={tryAgain}>Try again</button>
					<a class="btn secondary" href={backHref}>Back to list</a>
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
							{#if row.is_correct}<span class="res-ok">Correct</span>{:else}<span class="res-no">Missed</span>{/if}
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
