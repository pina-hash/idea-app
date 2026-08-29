<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		difficultyLabel,
		formatMass,
		START_MACRO_PATH,
		SUBMIT_MACRO_PATH,
		type ModelingFraming,
		type SpeedrunReveal
	} from '$lib/gauntlet';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import RunResults from '$lib/gauntlet/RunResults.svelte';
	import type { NextChallenge } from '$lib/gauntlet/next-challenge';
	import type { SupabaseClient } from '@supabase/supabase-js';

	/**
	 * Shared play flow for the macro-scored modeling modes (Reverse Engineer,
	 * Feature Golf). Reveal mints a submit code, the student runs the GAUNTLET
	 * macro, and the result + board arrive over Realtime. `gated` hides the
	 * drawing behind Start (Feature Golf, like Speedrun); when false the
	 * reference is shown up front (Reverse Engineer, untimed). The score metric
	 * differs by mode, so the parent passes a label + formatter.
	 */
	interface Challenge {
		id: string;
		title: string;
		difficulty: number;
		framing: ModelingFraming;
	}
	interface BoardRow {
		user_id: string;
		player: string;
		score_metric: number | null;
		rank: number;
	}

	let {
		supabase,
		challenge,
		board,
		myUserId,
		myBest,
		gated,
		metricLabel,
		formatMetric,
		backHref,
		ranked,
		next = null
	}: {
		supabase: SupabaseClient;
		challenge: Challenge;
		board: BoardRow[];
		myUserId: string;
		myBest: { score_metric: number | null; rank: number } | null;
		gated: boolean;
		metricLabel: string;
		formatMetric: (n: number | null | undefined) => string;
		backHref: string;
		/**
		 * Whether THIS mode's leaderboard can carry a verified run at all
		 * (`modeRanks` in `$lib/gauntlet`, mirroring `gauntlet_leaderboard`'s
		 * allowlist from `0146`). An empty board looks identical whether nobody
		 * has cleared a ranked mode yet or the mode simply never ranks, so the
		 * caller has to say which -- there is no way to infer it from `board`.
		 */
		ranked: boolean;
		next?: NextChallenge | null;
	} = $props();

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

	// Drawings/references are teacher/seed authored (trusted), so {@html} is OK.
	type Phase = 'framing' | 'running' | 'done';
	let phase = $state<Phase>('framing');
	let drawing = $state<string | null>(null);
	let code = $state<string | null>(null);
	let revealing = $state(false);
	let revealError = $state('');
	let copied = $state(false);
	let refreshing = $state(false);
	let result = $state<{ is_correct: boolean; score_metric: number | null } | null>(null);

	// PB context frozen at reveal time: the realtime result triggers
	// invalidateAll(), which folds the new run into myBest.
	let bestBeforeRun = $state<{ score_metric: number | null; rank: number } | null>(null);

	/**
	 * HAS THE POST-RUN RELOAD LANDED YET. The realtime row arrives before the
	 * load that would fold it into `myBest`, so for one tick after a pass
	 * `myBest` is still whatever it was BEFORE the run -- null on a first clear.
	 * The unranked sentence below is keyed on `myBest` being null, so without
	 * this flag it would flash on a first clear in a mode that DOES rank, and
	 * tell that student something false about their own board. Set false at the
	 * moment the result lands and true only when `invalidateAll()` has actually
	 * resolved, so the sentence is chosen against a settled `myBest`.
	 */
	let boardSettled = $state(false);

	const start = async () => {
		revealing = true;
		revealError = '';
		bestBeforeRun = myBest ?? null;
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
		result = null;
		phase = 'running';
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

	const refresh = async () => {
		refreshing = true;
		await invalidateAll();
		refreshing = false;
	};

	const reset = () => {
		phase = 'framing';
		drawing = null;
		code = null;
		result = null;
		revealError = '';
	};

	onMount(() => {
		const channel = supabase
			.channel(`modeling-${challenge.id}`)
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
						result = { is_correct: !!row.is_correct, score_metric: row.score_metric ?? null };
						phase = 'done';
						boardSettled = false;
						void invalidateAll().then(() => (boardSettled = true));
					}
				}
			)
			.subscribe();

		return () => supabase.removeChannel(channel);
	});
</script>

<main class="gauntlet">
	<div class="play-head">
		<span class="diff diff-{challenge.difficulty}">{difficultyLabel(challenge.difficulty)}</span>
		<h1>{challenge.title}</h1>
		{#if framing.demo}<span class="demo-badge">Demo placeholder</span>{/if}
	</div>

	<div class="play-grid">
		<div class="drawing-panel">
			{#if gated}
				{#if phase === 'framing'}
					<div class="start-gate">
						<div class="gate-lock" aria-hidden="true">&#9632;</div>
						<p class="gate-title">Drawing hidden</p>
						<p class="gate-sub">
							Start reveals the dimensioned drawing and mints your submit code. Have SolidWorks ready.
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
			{:else if framing.reference}
				<Asset value={framing.reference} alt="Reference" />
			{:else}
				<p class="dim">No reference provided.</p>
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
				{#if framing.par_features != null}
					<div class="field">
						<span class="key">Par</span>
						<span class="val meta">{framing.par_features} features</span>
					</div>
				{/if}
			</div>

			{#if phase === 'framing'}
				{#if framing.note}<p class="instructions">{framing.note}</p>{/if}
				<p class="instructions">
					Runs are machine verified by the GAUNTLET macro.
					<a href="/gauntlet/tools">Get the macro and setup</a>.
				</p>
				{#if framing.demo}
					<p class="instructions warn">
						Demo placeholder. The geometry is dummy; model the noted volume to pass and try the flow.
					</p>
				{/if}
				{#if !gated}
					<button class="btn" type="button" onclick={start} disabled={revealing}>
						{revealing ? 'Getting code...' : 'Get submit code'}
					</button>
					{#if revealError}<p class="warn">{revealError}</p>{/if}
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
						In SolidWorks, start a blank part and run the GAUNTLET <strong>start</strong> macro (Ctrl +
						Shift + S), build it, then run <strong>submit</strong> (Ctrl + Shift + D). Paste this code
						when either macro asks. <a href={START_MACRO_PATH} download>Start macro</a> &middot;
						<a href={SUBMIT_MACRO_PATH} download>Submit macro</a> &middot;
						<a href="/gauntlet/tools">Setup</a>
					</p>
				</div>
				<div class="waiting">
					<span class="dim">Waiting for your macro submission. It appears here automatically.</span>
					<button class="btn secondary" type="button" onclick={refresh} disabled={refreshing}>
						{refreshing ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
				<button class="text-btn" type="button" onclick={reset}>Start over</button>
			{/if}

			{#if phase === 'done' && result}
				<RunResults
					correct={result.is_correct}
					{metricLabel}
					metricValue={result.score_metric}
					formatMetric={(v) => formatMetric(v)}
					accuracyLabel="Verification"
					accuracyText={result.is_correct
						? 'Machine verified on volume, in tolerance'
						: 'Machine verified, outside tolerance'}
					prevBest={bestBeforeRun?.score_metric ?? null}
					hadCleared={bestBeforeRun != null}
					hadAttempted={bestBeforeRun != null}
					verdictText={result.is_correct ? 'Pass, verified' : 'Outside tolerance'}
					{next}
					{backHref}
					onRetry={reset}
				/>
				<!--
					THREE OUTCOMES, NOT TWO, AND THE MISSING ONE WAS A PASS THAT DOES
					NOT RANK. 0146 took Reverse Engineer and Feature Golf off
					`gauntlet_leaderboard` because neither ranks on anything the server
					can check, so `myBest` is now null for every student in both modes
					this component serves. The old pair of branches keyed the rank
					sentence on `result.is_correct && myBest` and the miss sentence on
					`!result.is_correct`, which left a PASS with no board row saying
					nothing at all: the student cleared the challenge, read "No verified
					runs yet" under the empty board below, and had no way to tell a pass
					that does not rank from a run that was not recorded. 0146's own
					header predicted this as the miss copy showing on a pass; it is
					narrower than that (the `!result.is_correct` guard holds), and the
					silence is the defect.

					`boardSettled` is what makes the third branch safe rather than
					merely likely: `myBest` is also null for one tick after a FIRST
					clear in a mode that does rank, and this sentence must never be
					shown to that student. If this component is ever mounted for a
					ranked mode, that is the thing to check.
				-->
				{#if result.is_correct && myBest}
					<p class="instructions">Ranked <strong>#{myBest.rank}</strong> on the board.</p>
				{:else if result.is_correct && boardSettled}
					<p class="instructions">
						Pass recorded, and it counts toward your XP. This mode is off the global board
						because its score is not something the server can verify, so no run in it ranks,
						yours included. Raced in a supervised room it still ranks there, live.
					</p>
				{:else if !result.is_correct}
					<p class="instructions">A miss is recorded but does not rank. Adjust your model and run again.</p>
				{/if}
			{/if}
		</div>
	</div>

	<h2>Leaderboard</h2>
	{#if ranked}
		<p class="dim board-note">Machine-verified runs, best first. Failed runs are recorded but do not rank.</p>
	{:else}
		<p class="dim board-note">
			This mode is off the leaderboard: its score is not something the server can verify, so no
			run in it ranks. Runs are still recorded, and a supervised room still ranks it live.
		</p>
	{/if}
	{#if board.length === 0}
		<div class="card">
			<p>
				{#if ranked}
					No verified runs yet. Be the first to clear it.
				{:else}
					There is no board here to be first on. Clearing this challenge still counts toward
					your XP, it just does not rank.
				{/if}
			</p>
		</div>
	{:else}
		<table class="board">
			<thead>
				<tr>
					<th class="rank-col">#</th>
					<th>Player</th>
					<th class="time-col">{metricLabel}</th>
				</tr>
			</thead>
			<tbody>
				{#each board as row (row.user_id)}
					<tr class:me={row.user_id === myUserId}>
						<td class="rank-col">{row.rank}</td>
						<td>{row.player}{#if row.user_id === myUserId}<span class="you">you</span>{/if}</td>
						<td class="time-col">{formatMetric(row.score_metric)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	{#if myBest && !board.some((r) => r.user_id === myUserId)}
		<p class="dim board-note">Your best verified run: rank #{myBest.rank}, {formatMetric(myBest.score_metric)}.</p>
	{/if}
</main>
