<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Header from '$lib/gauntlet/Header.svelte';
	import Asset from '$lib/gauntlet/Asset.svelte';
	import {
		difficultyLabel,
		formatTime,
		formatMass,
		roomStateLabel,
		MACRO_PATH,
		type RoomReveal
	} from '$lib/gauntlet';

	let { data } = $props();
	let {
		supabase,
		userName,
		userRole,
		room,
		amHost,
		myRole,
		myUserId,
		roster,
		board,
		framing,
		speedrunChallenges
	} = $derived(data);

	const racers = $derived(roster.filter((r) => r.role === 'racer'));
	const spectators = $derived(roster.filter((r) => r.role === 'spectator'));
	const unit = $derived(framing?.mass_unit ?? 'g');

	// Reveal (drawing + this racer's submit code) is fetched once the host starts.
	let revealed = $state<RoomReveal | null>(null);
	let revealing = $state(false);
	// This racer's own result (from the manual RPC or a Realtime submission).
	let myResult = $state<{ is_correct: boolean; score_metric: number | null } | null>(null);
	let mass = $state<number | null>(null);
	let submitting = $state(false);
	let submitError = $state('');
	let busy = $state('');
	let actionError = $state('');
	let copied = $state(false);

	// Only a PASSING run locks the controls. A failed room run keeps the token
	// live, so the racer retries on the shared room clock.
	const submitted = $derived(!!myResult && myResult.is_correct);

	// The drawing is gated server-side: only revealed once the room is live. A
	// plain (non-reactive) guard so the effect only fires the RPC once per round.
	let revealRequested = false;
	$effect(() => {
		const state = room.state;
		if (state === 'lobby') {
			// Reset for a (future) re-opened round.
			revealRequested = false;
			revealed = null;
			myResult = null;
			return;
		}
		if ((state === 'live' || state === 'results') && !revealRequested) {
			revealRequested = true;
			revealing = true;
			supabase.rpc('gauntlet_room_reveal', { p_room_id: room.id }).then(({ data: r, error }) => {
				if (!error) revealed = r as RoomReveal;
				revealing = false;
			});
		}
	});

	onMount(() => {
		const channel = supabase
			.channel(`room-${room.id}`)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gauntlet_rooms', filter: `id=eq.${room.id}` },
				() => invalidateAll()
			)
			.on(
				'postgres_changes',
				{ event: '*', schema: 'public', table: 'gauntlet_room_participants', filter: `room_id=eq.${room.id}` },
				() => invalidateAll()
			)
			.on(
				'postgres_changes',
				{ event: 'INSERT', schema: 'public', table: 'submissions', filter: `room_id=eq.${room.id}` },
				(payload) => {
					const row = payload.new as { user_id?: string; is_correct?: boolean; score_metric?: number | null };
					if (row.user_id === myUserId) {
						myResult = { is_correct: !!row.is_correct, score_metric: row.score_metric ?? null };
					}
					invalidateAll();
				}
			)
			.subscribe();
		return () => supabase.removeChannel(channel);
	});

	const copyCode = async (text: string) => {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			copied = false;
		}
	};

	const setChallenge = async (id: string) => {
		busy = 'challenge';
		actionError = '';
		const { error } = await supabase.rpc('gauntlet_room_set_challenge', {
			p_room_id: room.id,
			p_challenge_id: id
		});
		if (error) actionError = error.message;
		else await invalidateAll();
		busy = '';
	};

	const start = async () => {
		busy = 'start';
		actionError = '';
		const { error } = await supabase.rpc('gauntlet_room_start', { p_room_id: room.id });
		if (error) actionError = error.message;
		else await invalidateAll();
		busy = '';
	};

	const setState = async (state: 'lobby' | 'live' | 'results') => {
		busy = state;
		actionError = '';
		const { error } = await supabase.rpc('gauntlet_room_set_state', {
			p_room_id: room.id,
			p_state: state
		});
		if (error) actionError = error.message;
		else await invalidateAll();
		busy = '';
	};

	const submitManual = async () => {
		if (mass === null || !revealed?.code) return;
		submitting = true;
		submitError = '';
		const { data: res, error } = await supabase.rpc('gauntlet_room_manual_submit', {
			p_code: revealed.code,
			p_mass_g: mass
		});
		if (error) {
			submitError = error.message;
			submitting = false;
			return;
		}
		myResult = { is_correct: !!res.is_correct, score_metric: res.score_metric ?? null };
		submitting = false;
		await invalidateAll();
	};
</script>

<svelte:head>
	<title>Room {room.join_code} // GAUNTLET</title>
</svelte:head>

<Header
	{supabase}
	{userName}
	{userRole}
	crumbs={[{ label: 'Live Rooms', href: '/gauntlet/rooms' }, { label: `Room ${room.join_code}` }]}
/>

<main class="gauntlet">
	<div class="room-head">
		<div class="room-code-block">
			<span class="room-code-label">Join code</span>
			<span class="room-code">{room.join_code}</span>
			<button class="text-copy" type="button" onclick={() => copyCode(room.join_code)}>
				{copied ? 'Copied' : 'Copy'}
			</button>
		</div>
		<div class="room-meta">
			<span class="status-badge status-{room.state}">{roomStateLabel(room.state)}</span>
			<span class="mono dim">{amHost ? 'host' : myRole}</span>
		</div>
	</div>

	{#if actionError}<p class="warn">{actionError}</p>{/if}

	<div class="room-grid">
		<div class="room-main">
			{#if amHost}
				<!-- Host controls -->
				{#if room.state === 'lobby'}
					<h2>Set up the round</h2>
					<div class="card">
						{#if framing}
							<div class="field"><span class="key">Challenge</span><span class="val">{framing.title}</span></div>
							<div class="field"><span class="key">Material</span><span class="val meta">{framing.material ?? 'TBD'}</span></div>
							<div class="field"><span class="key">Target mass</span><span class="val meta">{formatMass(framing.target_mass, unit)}</span></div>
						{:else}
							<p class="dim">Pick a published Speedrun challenge to race.</p>
						{/if}
						<label class="ff">
							<span class="ff-label">Speedrun challenge</span>
							<select
								class="ff-input"
								disabled={busy !== ''}
								onchange={(e) => {
									const v = e.currentTarget.value;
									if (v) setChallenge(v);
								}}
							>
								<option value="">{framing ? 'Change challenge...' : 'Select a challenge...'}</option>
								{#each speedrunChallenges as c (c.id)}
									<option value={c.id}>{c.title} ({difficultyLabel(c.difficulty)})</option>
								{/each}
							</select>
						</label>
					</div>
					<div class="btn-row">
						<button class="btn" type="button" disabled={busy !== '' || !room.current_challenge_id} onclick={start}>
							{busy === 'start' ? 'Starting...' : 'Start round'}
						</button>
					</div>
					<p class="dim">Racers in the lobby get the drawing and a submit code the instant you Start.</p>
				{:else if room.state === 'live'}
					<h2>Round is live</h2>
					<div class="card">
						<p>Started {room.started_at ? new Date(room.started_at).toLocaleTimeString() : ''}. Racers are modeling and submitting.</p>
						{#if revealed?.drawing}
							<div class="drawing-panel host-drawing"><Asset value={revealed.drawing} /></div>
						{/if}
					</div>
					<div class="btn-row">
						<button class="btn danger-btn" type="button" disabled={busy !== ''} onclick={() => setState('results')}>
							{busy === 'results' ? 'Ending...' : 'End and reveal results'}
						</button>
						<button class="btn secondary" type="button" disabled={busy !== ''} onclick={() => invalidateAll()}>Refresh</button>
					</div>
				{:else}
					<h2>Round complete</h2>
					<div class="card"><p>The round is over and the board is frozen below. Host a new room to race again.</p></div>
				{/if}
			{:else if room.state === 'lobby'}
				<!-- Student lobby -->
				<h2>Waiting for the host</h2>
				<div class="card">
					{#if framing}
						<div class="field"><span class="key">Challenge</span><span class="val">{framing.title}</span></div>
						<div class="field"><span class="key">Material</span><span class="val meta">{framing.material ?? 'TBD'}</span></div>
						<div class="field"><span class="key">Target mass</span><span class="val meta">{formatMass(framing.target_mass, unit)}</span></div>
						<div class="field"><span class="key">Tolerance</span><span class="val meta">&plusmn;{framing.tolerance_pct ?? '--'}%</span></div>
					{:else}
						<p class="dim">The host is choosing a challenge. Have SolidWorks ready.</p>
					{/if}
					<p class="dim">When the host starts, the drawing and your submit code appear here.</p>
				</div>
			{:else if myRole === 'racer'}
				<!-- Student racing (live or results) -->
				<h2>Race</h2>
				<div class="play-grid">
					<div class="drawing-panel">
						{#if revealing}
							<p class="dim">Revealing...</p>
						{:else if revealed?.drawing}
							<Asset value={revealed.drawing} />
						{:else}
							<p class="dim">No drawing.</p>
						{/if}
					</div>
					<div class="question-panel">
						{#if framing}
							<div class="spec card">
								<div class="field"><span class="key">Material</span><span class="val">{framing.material ?? 'TBD'}</span></div>
								<div class="field"><span class="key">Target mass</span><span class="val meta">{formatMass(framing.target_mass, unit)}</span></div>
								<div class="field"><span class="key">Tolerance</span><span class="val meta">&plusmn;{framing.tolerance_pct ?? '--'}%</span></div>
							</div>
						{/if}

						{#if myResult}
							<div class="result-banner" class:ok={myResult.is_correct} class:no={!myResult.is_correct}>
								<span class="result-verdict">{myResult.is_correct ? 'Pass, verified' : 'Outside tolerance'}</span>
								<span class="result-time">Time {formatTime(myResult.score_metric)}</span>
							</div>
							{#if myResult.is_correct}
								<p class="dim">Your run is in. See the board below.</p>
							{:else}
								<p class="warn">Outside tolerance. The clock is still running, adjust your model and submit again.</p>
							{/if}
						{/if}
						{#if !submitted && room.state === 'live' && revealed?.code}
							<div class="code-box">
								<div class="code-head">
									<span class="code-label">Your submit code</span>
									<button class="text-copy" type="button" onclick={() => copyCode(revealed?.code ?? '')}>{copied ? 'Copied' : 'Copy'}</button>
								</div>
								<div class="code-value">{revealed.code}</div>
								<p class="code-instr">
									Model the part, then run the GAUNTLET macro (<strong>Student submit</strong>) and paste this code.
									<a href={MACRO_PATH} download>Download macro</a> &middot; <a href="/gauntlet/tools">Setup</a>
								</p>
							</div>
							<details class="practice">
								<summary>Submit mass manually (supervised)</summary>
								<p class="instructions">In a room the host supervises, so manual entry ranks. The clock is the room start.</p>
								<label class="mass-field">
									<span class="mass-label">Mass from Mass Properties</span>
									<span class="mass-input-wrap">
										<input class="mass-input" type="number" step="any" min="0" inputmode="decimal" placeholder="0.0" bind:value={mass} />
										<span class="mass-unit">{unit}</span>
									</span>
								</label>
								{#if submitError}<p class="warn">{submitError}</p>{/if}
								<button class="btn" type="button" disabled={mass === null || submitting} onclick={submitManual}>
									{submitting ? 'Submitting...' : 'Submit mass'}
								</button>
							</details>
						{/if}
						{#if room.state === 'results' && !myResult}
							<p class="dim">The round has ended. Final board below.</p>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Spectator -->
				<h2>Spectating</h2>
				<div class="card">
					<p>You joined after the round started, so you are spectating this round. Watch the board below.</p>
					{#if revealed?.drawing}
						<div class="drawing-panel host-drawing"><Asset value={revealed.drawing} /></div>
					{/if}
				</div>
			{/if}

			<h2>Board</h2>
			<p class="dim board-note">Fastest passing run per racer. Manual and macro runs both rank in a room.</p>
			{#if board.length === 0}
				<div class="card"><p>No passing runs yet.</p></div>
			{:else}
				<table class="board">
					<thead>
						<tr><th class="rank-col">#</th><th>Player</th><th>Via</th><th class="time-col">Time</th></tr>
					</thead>
					<tbody>
						{#each board as row (row.user_id)}
							<tr class:me={row.user_id === myUserId}>
								<td class="rank-col">{row.rank}</td>
								<td>{row.player}{#if row.user_id === myUserId}<span class="you">you</span>{/if}</td>
								<td class="mono dim">{row.source}</td>
								<td class="time-col">{formatTime(row.score_metric)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>

		<aside class="room-side">
			<h2>Roster</h2>
			<div class="card roster">
				<div class="roster-group">
					<span class="roster-label">Racers ({racers.length})</span>
					{#each racers as r (r.user_id)}
						<div class="roster-row">{r.player}{#if r.user_id === myUserId}<span class="you">you</span>{/if}</div>
					{:else}
						<p class="dim">No racers yet.</p>
					{/each}
				</div>
				{#if spectators.length}
					<div class="roster-group">
						<span class="roster-label">Spectators ({spectators.length})</span>
						{#each spectators as r (r.user_id)}
							<div class="roster-row dim">{r.player}</div>
						{/each}
					</div>
				{/if}
			</div>
			<button class="btn secondary" type="button" onclick={() => invalidateAll()}>Refresh</button>
		</aside>
	</div>
</main>
