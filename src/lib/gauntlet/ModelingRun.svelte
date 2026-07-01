<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import {
		difficultyLabel,
		formatMass,
		SUBMIT_MACRO_PATH,
		type ModelingFraming,
		type SpeedrunReveal
	} from '$lib/gauntlet';
	import Asset from '$lib/gauntlet/Asset.svelte';
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
		backHref
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
						invalidateAll();
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
						In SolidWorks, run the GAUNTLET <strong>submit</strong> macro and paste this code.
						<a href={SUBMIT_MACRO_PATH} download>Download submit macro</a> &middot;
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
				<div class="result-banner" class:ok={result.is_correct} class:no={!result.is_correct}>
					<span class="result-verdict">{result.is_correct ? 'Pass, verified' : 'Outside tolerance'}</span>
					<span class="result-time">{metricLabel} {formatMetric(result.score_metric)}</span>
				</div>
				{#if result.is_correct && myBest}
					<p class="instructions">Ranked <strong>#{myBest.rank}</strong> on the board.</p>
				{:else if !result.is_correct}
					<p class="instructions">A miss is recorded but does not rank. Adjust your model and run again.</p>
				{/if}
				<div class="btn-row">
					<button class="btn secondary" type="button" onclick={reset}>Run again</button>
					<a class="btn secondary" href={backHref}>Back to list</a>
				</div>
			{/if}
		</div>
	</div>

	<h2>Leaderboard</h2>
	<p class="dim board-note">Machine-verified runs, best first. Failed runs are recorded but do not rank.</p>
	{#if board.length === 0}
		<div class="card"><p>No verified runs yet. Be the first to clear it.</p></div>
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
