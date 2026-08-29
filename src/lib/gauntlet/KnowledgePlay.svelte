<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { difficultyLabel, formatTime, type KnowledgePrompt, type SubmitResult } from '$lib/gauntlet';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import RunResults from '$lib/gauntlet/RunResults.svelte';
	import type { NextChallenge } from '$lib/gauntlet/next-challenge';
	import {
		AHEAD_NOTE,
		CLOCK_STARTING,
		clockAcceptsAnswers,
		clockIsServerSide,
		reviewNote,
		startKnowledgeClock,
		type KnowledgeClock
	} from '$lib/gauntlet/knowledge-clock';
	import type { SupabaseClient } from '@supabase/supabase-js';

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
		supabase,
		challenge,
		board,
		myUserId,
		myBest,
		backHref,
		next = null
	}: {
		supabase: SupabaseClient;
		challenge: Challenge;
		board: BoardRow[];
		myUserId: string;
		myBest: { is_correct: boolean | null; score_metric: number | null; rank: number } | null;
		backHref: string;
		next?: NextChallenge | null;
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
	// PB context frozen at submit time: the post-submit invalidate folds this
	// run into myBest, so the results screen compares against the snapshot.
	let bestBeforeRun = $state<typeof myBest>(null);

	// 0148: the ranked clock is the SERVER's. `startKnowledgeClock` stamps it and
	// says whether it is available at all here; see that module for the ladder.
	// `startTime` below is now only the fallback for a deployment where 0148 has
	// not been applied yet.
	let clock = $state<KnowledgeClock>(CLOCK_STARTING);

	const answerValue = $derived(isChoice ? selected : typed.trim());
	const answered = $derived(!!localResult);

	onMount(() => {
		startTime = performance.now();
		// A plain call in onMount, NOT an $effect: this is somebody else's client
		// and an effect calling it would take a dependency on whatever it touches
		// (CLAUDE.md, the injected-transport rule). It also must not run on hover
		// prefetch, which is why it is not in the route's load.
		void startKnowledgeClock(supabase, challenge.id).then((c) => (clock = c));
	});

	const submitEnhance: SubmitFunction = ({ formData, cancel }) => {
		if (!answerValue) {
			cancel();
			return;
		}
		formData.set('answer', answerValue);
		// THE SUCCESSFUL START IS WHAT LICENSES OMITTING THIS. Where the server is
		// timing the run the field is deleted outright, so the browser genuinely
		// supplies no elapsed time; where 0148 is not applied yet it is sent
		// exactly as before, because that server scores a missing value as zero.
		if (clockIsServerSide(clock)) formData.delete('elapsed_ms');
		else formData.set('elapsed_ms', String(Math.round(performance.now() - startTime)));
		bestBeforeRun = myBest ?? null;
		submitting = true;
		return async ({ result, update }) => {
			if (result.type === 'success' && result.data?.result) {
				localResult = result.data.result as SubmitResult;
				localAnswered = answerValue;
				localError = '';
				// The submit that lands CLOSES the server clock (0148), so Try again is
				// practice from here on and has to say so BEFORE the next answer, not
				// only after it.
				if (clockIsServerSide(clock)) clock = { ...clock, timed: false };
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
				<Asset value={prompt.drawing} />
			{:else}
				<p class="dim">No drawing for this question.</p>
			{/if}
		</div>

		<div class="question-panel">
			{#if prompt.instructions}
				<p class="instructions">{prompt.instructions}</p>
			{/if}
			<p class="question">{prompt.question}</p>

			{#if clock.state === 'failed'}
				<p class="warn">{clock.message}</p>
			{:else if !clock.timed && !answered}
				<p class="instructions">{AHEAD_NOTE}</p>
			{/if}

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
					<button
						class="btn"
						type="submit"
						disabled={!answerValue || submitting || !clockAcceptsAnswers(clock)}
					>
						{submitting ? 'Checking...' : 'Submit answer'}
					</button>
				{/if}
			</form>

			{#if localResult}
				<RunResults
					correct={localResult.is_correct}
					metricLabel="Time"
					metricValue={localResult.score_metric}
					formatMetric={formatTime}
					accuracyLabel="Answer"
					accuracyText={localResult.is_correct
						? 'Correct'
						: !isChoice && localResult.correct != null
							? `You said ${localAnswered}, correct is ${localResult.correct}`
							: 'Not quite'}
					prevBest={bestBeforeRun?.is_correct ? bestBeforeRun.score_metric : null}
					hadCleared={!!bestBeforeRun?.is_correct}
					hadAttempted={bestBeforeRun != null}
					verdictText={localResult.is_correct ? 'Correct' : 'Not quite'}
					{next}
					{backHref}
					onRetry={tryAgain}
				/>
				{#if reviewNote(localResult.timed_attempt)}
					<p class="instructions">{reviewNote(localResult.timed_attempt)}</p>
				{/if}
				{#if localResult.explanation}
					<p class="explanation">{localResult.explanation}</p>
				{/if}
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
