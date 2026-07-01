<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import StlViewer from '$lib/gauntlet/StlViewer.svelte';
	import SpeedrunClock from '$lib/gauntlet/SpeedrunClock.svelte';
	import {
		difficultyLabel,
		formatTime,
		formatMass,
		START_MACRO_PATH,
		SUBMIT_MACRO_PATH,
		DRAWINGS_BUCKET,
		type SpeedrunReveal,
		type SpeedrunResult
	} from '$lib/gauntlet';

	let { data } = $props();
	let { supabase, userName, userRole, challenge, board, myUserId, myBest, modelUrl, ruleset } =
		$derived(data);

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
	let drawingUrl = $state<string | null>(null);
	let code = $state<string | null>(null);
	let revealing = $state(false);
	let revealError = $state('');
	let copied = $state(false);

	// Server-anchored clock. `serverStartMs` is the run's server-stamped started_at
	// (epoch ms), learned the instant the SolidWorks Start macro fires via a Realtime
	// update on gauntlet_run_status (with a poll fallback). `clockOffsetMs` is the
	// browser-to-server clock offset measured once at reveal, so the on-screen timer
	// matches the time the server will score. Null until the macro fires (standby).
	let serverStartMs = $state<number | null>(null);
	let clockOffsetMs = $state(0);
	// Server time of the current reveal; a started_at older than this is a stale run
	// from a previous attempt and is ignored (both are server clocks, so comparable).
	let revealServerMs = 0;
	let statusPoll: ReturnType<typeof setInterval> | null = null;

	// Server-anchored elapsed ms right now (for the manual-practice self-check).
	const currentElapsedMs = () =>
		serverStartMs == null ? 0 : Math.max(0, Date.now() - clockOffsetMs - serverStartMs);

	// Accept a server started_at only if it belongs to this reveal's run (not a
	// stale one), then arm the live clock.
	const applyStartedAt = (startedAtIso: string | null | undefined) => {
		if (!startedAtIso) return;
		const ms = Date.parse(startedAtIso);
		if (!Number.isFinite(ms) || ms < revealServerMs - 1000) return;
		serverStartMs = ms;
		stopStatusPoll();
	};

	const stopStatusPoll = () => {
		if (statusPoll) {
			clearInterval(statusPoll);
			statusPoll = null;
		}
	};

	// Realtime is the primary signal; this poll is a belt-and-braces fallback in
	// case an event is missed. It stops as soon as the start is known.
	const startStatusPoll = () => {
		stopStatusPoll();
		statusPoll = setInterval(async () => {
			if (serverStartMs != null || phase !== 'running') {
				stopStatusPoll();
				return;
			}
			const { data: row } = await supabase
				.from('gauntlet_run_status')
				.select('started_at')
				.eq('challenge_id', challenge.id)
				.maybeSingle();
			applyStartedAt(row?.started_at);
		}, 2500);
	};

	// Click-to-zoom lightbox for the drawing.
	let zoomOpen = $state(false);

	// The macro result (ranked) arrives via Realtime; the manual practice result
	// is an inline, unranked self-check that never ends or blocks the run.
	let result = $state<{ is_correct: boolean; score_metric: number | null } | null>(null);
	let practice = $state<SpeedrunResult | null>(null);
	let mass = $state<number | null>(null);
	let submitting = $state(false);
	let submitError = $state('');
	let showPractice = $state(false);
	let refreshing = $state(false);

	const start = async () => {
		revealing = true;
		revealError = '';
		// Bracket the reveal call to measure the browser-to-server clock offset from
		// the server-stamped reveal_at (NTP-style midpoint).
		const t0 = Date.now();
		const { data: rev, error } = await supabase.rpc('gauntlet_speedrun_reveal', {
			p_challenge_id: challenge.id
		});
		const t1 = Date.now();
		if (error) {
			revealError = error.message;
			revealing = false;
			return;
		}
		const payload = rev as SpeedrunReveal | null;
		drawing = payload?.drawing ?? null;
		code = payload?.code ?? null;
		// The dimensioned PNG lives in a private bucket; its path is handed back only
		// on Start, so sign it now for display (shape STL preview stays separate).
		drawingUrl = null;
		if (payload?.drawing_image_path) {
			const { data: signed } = await supabase.storage
				.from(DRAWINGS_BUCKET)
				.createSignedUrl(payload.drawing_image_path, 60 * 60);
			drawingUrl = signed?.signedUrl ?? null;
		}

		// Clock offset + this reveal's server time (for staleness filtering).
		const revealAtMs = payload?.reveal_at ? Date.parse(payload.reveal_at) : NaN;
		if (Number.isFinite(revealAtMs)) {
			clockOffsetMs = (t0 + t1) / 2 - revealAtMs;
			revealServerMs = revealAtMs;
		} else {
			clockOffsetMs = 0;
			revealServerMs = t0;
		}

		phase = 'running';
		result = null;
		practice = null;
		mass = null;
		submitError = '';
		// Standby until the Start macro fires; Realtime (or the poll fallback) arms it.
		serverStartMs = null;
		startStatusPoll();
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
		formData.set('elapsed_ms', String(Math.round(currentElapsedMs())));
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
		stopStatusPoll();
		phase = 'framing';
		drawing = null;
		drawingUrl = null;
		code = null;
		result = null;
		practice = null;
		mass = null;
		submitError = '';
		revealError = '';
		serverStartMs = null;
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
						result = { is_correct: !!row.is_correct, score_metric: row.score_metric ?? null };
						phase = 'done';
						invalidateAll();
					}
				}
			)
			// The Start macro fires from SolidWorks; the server publishes started_at to
			// gauntlet_run_status, and this arms the race timer the instant it lands.
			// RLS scopes the stream to our own row (own challenges only).
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gauntlet_run_status', filter: `challenge_id=eq.${challenge.id}` },
				(payload) => {
					const row = payload.new as { user_id?: string; started_at?: string | null };
					if (row?.user_id === myUserId) applyStartedAt(row.started_at);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
			stopStatusPoll();
		};
	});

	const closeZoom = () => (zoomOpen = false);
	const onKeydown = (e: KeyboardEvent) => {
		if (e.key === 'Escape' && zoomOpen) closeZoom();
	};
</script>

<svelte:head>
	<title>{challenge.title} // GAUNTLET</title>
</svelte:head>

<svelte:window onkeydown={onKeydown} />

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
			<div class="drawing-frame">
				{#if phase === 'framing'}
					<div class="start-gate">
						<div class="gate-lock" aria-hidden="true">&#9632;</div>
						<p class="gate-title">Drawing hidden</p>
						<p class="gate-sub">
							This reveals the dimensioned drawing and your run code. Your time is measured on the
							server from when you run the Start macro (Ctrl + Shift + B) on a blank part to when you
							submit (Ctrl + Shift + G). Have SolidWorks ready with a new blank part.
						</p>
						<button class="btn" type="button" onclick={start} disabled={revealing}>
							{revealing ? 'Revealing...' : 'Start run'}
						</button>
						{#if revealError}<p class="warn">{revealError}</p>{/if}
					</div>
				{:else if drawingUrl}
					<button type="button" class="drawing-zoom" onclick={() => (zoomOpen = true)}>
						<img class="drawing-png" src={drawingUrl} alt="Dimensioned drawing" />
						<span class="zoom-hint">Click to zoom</span>
					</button>
				{:else if drawing}
					<button type="button" class="drawing-zoom" onclick={() => (zoomOpen = true)}>
						<Asset value={drawing} />
						<span class="zoom-hint">Click to zoom</span>
					</button>
				{:else}
					<p class="dim">No drawing provided.</p>
				{/if}
			</div>

			{#if modelUrl}
				<details class="preview-toggle">
					<summary>3D preview (shape only)</summary>
					<StlViewer url={modelUrl} height={220} />
				</details>
			{/if}
		</div>

		<div class="question-panel">
			<div class="spec card">
				{#if framing.tier}
					<div class="field">
						<span class="key">Tier</span>
						<span class="val meta">{framing.tier}</span>
					</div>
				{/if}
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
				{#if framing.par_time != null}
					<div class="field">
						<span class="key">Par time</span>
						<span class="val meta">{formatTime(framing.par_time)}</span>
					</div>
				{/if}
			</div>

			<div class="ruleset-panel card">
				<span class="ruleset-title">Speedrun rules</span>
				<div class="field">
					<span class="key">Units</span>
					<span class="val meta">{ruleset.units_label}</span>
				</div>
				<div class="field">
					<span class="key">Projection</span>
					<span class="val meta">{ruleset.projection}</span>
				</div>
				{#if ruleset.rule_lines.length}
					<ul class="rule-lines">
						{#each ruleset.rule_lines as line (line)}
							<li>{line}</li>
						{/each}
					</ul>
				{/if}
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
						In SolidWorks, start a blank part and run the GAUNTLET <strong>start</strong> macro (Ctrl +
						Shift + B), build it, then run <strong>submit</strong> (Ctrl + Shift + G). Paste this code
						when either macro asks. <a href={START_MACRO_PATH} download>Start macro</a> &middot;
						<a href={SUBMIT_MACRO_PATH} download>Submit macro</a> &middot;
						<a href="/gauntlet/tools">Setup</a>
					</p>
				</div>

				<div class="clock-wrap">
					<SpeedrunClock {serverStartMs} {clockOffsetMs} running={phase === 'running'} />
				</div>
				<div class="waiting">
					<span class="dim">
						{#if serverStartMs == null}
							Standby. Run the Start macro (Ctrl + Shift + B) on a blank part in SolidWorks. The clock
							starts the instant you do, timed on the server.
						{:else}
							Run live, timed on the server. Build your part, then submit (Ctrl + Shift + G). Your
							result appears here automatically.
						{/if}
					</span>
					<button class="btn secondary" type="button" onclick={refresh} disabled={refreshing}>
						{refreshing ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>

				<details class="practice" bind:open={showPractice}>
					<summary>Practice manually (unranked)</summary>
					<p class="instructions">
						A quick self-check without the macro. It does not rank; only macro-verified runs do.
					</p>
					<div class="clock-wrap">
						<SpeedrunClock
							{serverStartMs}
							{clockOffsetMs}
							running={phase === 'running' && showPractice}
							ranked={false}
							compact
						/>
					</div>
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

{#if zoomOpen && (drawingUrl || drawing)}
	<!-- Click-to-zoom lightbox: enlarged, pannable/scrollable drawing. The backdrop
	     is a real button (dismiss on click; Esc handled on svelte:window) so the
	     dialog above it stays clean. -->
	<div class="lightbox">
		<button class="lightbox-backdrop" type="button" aria-label="Close enlarged drawing" onclick={closeZoom}
		></button>
		<div class="lightbox-inner" role="dialog" aria-modal="true" aria-label="Dimensioned drawing">
			<button class="lightbox-close btn secondary" type="button" onclick={closeZoom}>Close &times;</button>
			<div class="lightbox-scroll">
				{#if drawingUrl}
					<img class="lightbox-img" src={drawingUrl} alt="Dimensioned drawing, enlarged" />
				{:else if drawing}
					<div class="lightbox-svg"><Asset value={drawing} /></div>
				{/if}
			</div>
		</div>
	</div>
{/if}
