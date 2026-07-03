<script lang="ts">
	import { onMount } from 'svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	/**
	 * Dev-only diagnostic: joins two clients to the same Supabase Realtime
	 * broadcast channel (namespaced by room code) and measures RTT, jitter,
	 * loss, and throughput under an optional synthetic co-op payload load.
	 * No auth, no schema, no game code.
	 */
	let { data } = $props();
	const supabase = data.supabase;

	const RATE_PRESETS = [10, 20, 30, 60] as const;
	const STRESS_PRESETS = {
		LIGHT: { enemies: 20, bullets: 50 },
		HEAVY: { enemies: 60, bullets: 300 }
	} as const;
	const PING_TIMEOUT_MS = 500;
	const RTT_HISTORY_MAX = 300;
	const LOSS_WINDOW = 100;
	const FIELD_SIZE = 1000;

	const myId = crypto.randomUUID().slice(0, 8);

	let roomCode = $state('');
	let connected = $state(false);
	let connecting = $state(false);
	let peerCount = $state(1);
	let statusMsg = $state('');

	let rateHz = $state(20);
	let stressOn = $state(false);
	let stressPreset = $state<'LIGHT' | 'HEAVY'>('LIGHT');

	let rttHistory = $state<number[]>([]);
	let currentRtt = $state<number | null>(null);
	let lossHistory = $state<boolean[]>([]);

	let sendRateActual = $state(0);
	let recvRateActual = $state(0);
	let sendBytesPerSec = $state(0);
	let recvBytesPerSec = $state(0);

	let channel: RealtimeChannel | null = null;
	let seqCounter = 0;
	const pendingPings = new Map<number, { t0: number; timeoutId: ReturnType<typeof setTimeout> }>();

	let sentCountWindow = 0;
	let recvCountWindow = 0;
	let sentBytesWindow = 0;
	let recvBytesWindow = 0;

	let entities: number[] = [];
	let entityCount = $state(0);

	const encoder = new TextEncoder();
	function byteSize(payload: unknown) {
		return encoder.encode(JSON.stringify(payload)).length;
	}

	function buildEntities(preset: 'LIGHT' | 'HEAVY') {
		const { enemies, bullets } = STRESS_PRESETS[preset];
		entityCount = enemies + bullets;
		entities = [];
		for (let i = 0; i < entityCount; i++) {
			const kind = i < enemies ? 0 : 1;
			entities.push(
				i,
				Math.random() * FIELD_SIZE,
				Math.random() * FIELD_SIZE,
				(Math.random() - 0.5) * 80,
				(Math.random() - 0.5) * 80,
				kind
			);
		}
	}

	function stepEntities(dt: number) {
		for (let i = 0; i < entityCount; i++) {
			const base = i * 6;
			let x = entities[base + 1] + entities[base + 3] * dt;
			let y = entities[base + 2] + entities[base + 4] * dt;
			if (x < 0 || x > FIELD_SIZE) entities[base + 3] *= -1;
			if (y < 0 || y > FIELD_SIZE) entities[base + 4] *= -1;
			entities[base + 1] = Math.max(0, Math.min(FIELD_SIZE, x));
			entities[base + 2] = Math.max(0, Math.min(FIELD_SIZE, y));
		}
	}

	function percentile(sorted: number[], p: number) {
		if (!sorted.length) return 0;
		const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
		return sorted[idx];
	}

	const rttStats = $derived.by(() => {
		if (rttHistory.length === 0) return { avg: null, min: null, max: null, jitter: null };
		const sorted = [...rttHistory].sort((a, b) => a - b);
		const avg = rttHistory.reduce((s, v) => s + v, 0) / rttHistory.length;
		const p50 = percentile(sorted, 50);
		const p95 = percentile(sorted, 95);
		return { avg, min: sorted[0], max: sorted[sorted.length - 1], jitter: p95 - p50 };
	});

	const lossPct = $derived(
		lossHistory.length ? (100 * lossHistory.filter((ok) => !ok).length) / lossHistory.length : null
	);

	const targetMsgsPerSec = $derived(rateHz * (stressOn ? 2 : 1));

	function rttVerdict(rtt: number | null) {
		if (rtt == null) return { label: 'n/a', cls: '' };
		if (rtt < 80) return { label: 'GOOD', cls: 'good' };
		if (rtt <= 150) return { label: 'MARGINAL', cls: 'marginal' };
		return { label: 'PROBLEMATIC', cls: 'bad' };
	}

	function lossVerdict(pct: number | null) {
		if (pct == null) return { label: 'n/a', cls: '' };
		return pct < 1 ? { label: 'GOOD', cls: 'good' } : { label: 'PROBLEMATIC', cls: 'bad' };
	}

	function tick() {
		if (!channel) return;
		const seq = seqCounter++;
		const t0 = performance.now();
		const pingPayload = { seq, t0 };
		channel.send({ type: 'broadcast', event: 'ping', payload: pingPayload });
		sentCountWindow += 1;
		sentBytesWindow += byteSize(pingPayload);

		const timeoutId = setTimeout(() => {
			pendingPings.delete(seq);
			lossHistory = [...lossHistory, false].slice(-LOSS_WINDOW);
		}, PING_TIMEOUT_MS);
		pendingPings.set(seq, { t0, timeoutId });

		if (stressOn && entityCount) {
			stepEntities(1 / rateHz);
			const statePayload = { seq, entities: entities.slice() };
			channel.send({ type: 'broadcast', event: 'state', payload: statePayload });
			sentCountWindow += 1;
			sentBytesWindow += byteSize(statePayload);
		}
	}

	$effect(() => {
		if (stressOn) buildEntities(stressPreset);
	});

	$effect(() => {
		if (!connected) return;
		const intervalMs = 1000 / rateHz;
		const id = setInterval(tick, intervalMs);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (!connected) return;
		const id = setInterval(() => {
			sendRateActual = sentCountWindow;
			recvRateActual = recvCountWindow;
			sendBytesPerSec = sentBytesWindow;
			recvBytesPerSec = recvBytesWindow;
			sentCountWindow = 0;
			recvCountWindow = 0;
			sentBytesWindow = 0;
			recvBytesWindow = 0;
		}, 1000);
		return () => clearInterval(id);
	});

	function connect() {
		const code = roomCode.trim().toUpperCase();
		if (!code || connecting || connected) return;
		connecting = true;
		statusMsg = 'Connecting...';

		const ch = supabase.channel(`coop-net:${code}`, {
			config: { broadcast: { self: false, ack: false }, presence: { key: myId } }
		});

		ch.on('broadcast', { event: 'ping' }, ({ payload }) => {
			ch.send({ type: 'broadcast', event: 'pong', payload });
			recvCountWindow += 1;
			recvBytesWindow += byteSize(payload);
		});

		ch.on('broadcast', { event: 'pong' }, ({ payload }) => {
			const pending = pendingPings.get(payload.seq);
			recvCountWindow += 1;
			recvBytesWindow += byteSize(payload);
			if (!pending) return;
			clearTimeout(pending.timeoutId);
			pendingPings.delete(payload.seq);
			const rtt = performance.now() - pending.t0;
			currentRtt = rtt;
			rttHistory = [...rttHistory, rtt].slice(-RTT_HISTORY_MAX);
			lossHistory = [...lossHistory, true].slice(-LOSS_WINDOW);
		});

		ch.on('broadcast', { event: 'state' }, ({ payload }) => {
			recvCountWindow += 1;
			recvBytesWindow += byteSize(payload);
		});

		ch.on('presence', { event: 'sync' }, () => {
			peerCount = Object.keys(ch.presenceState()).length;
		});

		ch.subscribe(async (status) => {
			if (status === 'SUBSCRIBED') {
				await ch.track({ id: myId, joined_at: Date.now() });
				connected = true;
				connecting = false;
				statusMsg = `Connected as ${myId}`;
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
				statusMsg = `Channel error: ${status}`;
				connecting = false;
			} else if (status === 'CLOSED') {
				connected = false;
			}
		});

		channel = ch;
	}

	function cleanupResources() {
		pendingPings.forEach((p) => clearTimeout(p.timeoutId));
		pendingPings.clear();
		if (channel) {
			supabase.removeChannel(channel);
			channel = null;
		}
	}

	function disconnect() {
		cleanupResources();
		connected = false;
		connecting = false;
		peerCount = 1;
		statusMsg = 'Disconnected';
		rttHistory = [];
		lossHistory = [];
		currentRtt = null;
		sendRateActual = 0;
		recvRateActual = 0;
		sendBytesPerSec = 0;
		recvBytesPerSec = 0;
	}

	onMount(() => cleanupResources);

	function fmt(n: number | null, digits = 0) {
		return n == null ? '--' : n.toFixed(digits);
	}
	function kb(bytes: number) {
		return (bytes / 1024).toFixed(2);
	}
</script>

<svelte:head><title>Co-op netcheck (dev)</title></svelte:head>

<div class="wrap">
	<h1>Co-op netcode latency spike</h1>
	<p class="note">
		Dev-only. Joins two clients to a Supabase Realtime broadcast channel (<code>coop-net:&lt;CODE&gt;</code>)
		and measures whether it can carry VANGUARD co-op traffic. No login, no schema, no game code touched.
	</p>

	<div class="panel">
		<div class="row">
			<input
				type="text"
				placeholder="ROOM CODE"
				bind:value={roomCode}
				disabled={connected || connecting}
				onkeydown={(e) => e.key === 'Enter' && connect()}
			/>
			{#if !connected}
				<button type="button" onclick={connect} disabled={connecting || !roomCode.trim()}>
					{connecting ? 'Connecting...' : 'Connect'}
				</button>
			{:else}
				<button type="button" class="danger" onclick={disconnect}>Disconnect</button>
			{/if}
			<span class="status">{statusMsg || 'idle'}</span>
		</div>

		<div class="row">
			<label>
				Rate
				<select bind:value={rateHz}>
					{#each RATE_PRESETS as r (r)}
						<option value={r}>{r} Hz</option>
					{/each}
				</select>
			</label>
			<label class="checkbox">
				<input type="checkbox" bind:checked={stressOn} />
				Payload stress test
			</label>
			<select bind:value={stressPreset} disabled={!stressOn}>
				<option value="LIGHT">LIGHT (~20 enemies / 50 bullets)</option>
				<option value="HEAVY">HEAVY (~60 enemies / 300 bullets)</option>
			</select>
			<span class="peers">peers: {connected ? peerCount : '--'}</span>
		</div>
	</div>

	<div class="grid">
		<div class="card">
			<h2>RTT</h2>
			<div class="big {rttVerdict(currentRtt).cls}">{fmt(currentRtt, 1)} ms</div>
			<div class="verdict {rttVerdict(currentRtt).cls}">{rttVerdict(currentRtt).label}</div>
			<dl>
				<dt>avg</dt>
				<dd>{fmt(rttStats.avg, 1)} ms</dd>
				<dt>min</dt>
				<dd>{fmt(rttStats.min, 1)} ms</dd>
				<dt>max</dt>
				<dd>{fmt(rttStats.max, 1)} ms</dd>
				<dt>jitter (p95-p50)</dt>
				<dd>{fmt(rttStats.jitter, 1)} ms</dd>
			</dl>
		</div>

		<div class="card">
			<h2>Packet loss</h2>
			<div class="big {lossVerdict(lossPct).cls}">{fmt(lossPct, 2)}%</div>
			<div class="verdict {lossVerdict(lossPct).cls}">{lossVerdict(lossPct).label}</div>
			<dl>
				<dt>window</dt>
				<dd>{lossHistory.length} / {LOSS_WINDOW} pings</dd>
				<dt>timeout</dt>
				<dd>{PING_TIMEOUT_MS} ms</dd>
			</dl>
		</div>

		<div class="card">
			<h2>Throughput</h2>
			<dl>
				<dt>send rate</dt>
				<dd>{sendRateActual} / {targetMsgsPerSec} msg/s</dd>
				<dt>recv rate</dt>
				<dd>{recvRateActual} / {targetMsgsPerSec} msg/s</dd>
				<dt>send</dt>
				<dd>{kb(sendBytesPerSec)} KB/s</dd>
				<dt>recv</dt>
				<dd>{kb(recvBytesPerSec)} KB/s</dd>
			</dl>
		</div>

		<div class="card">
			<h2>Stress payload</h2>
			<dl>
				<dt>state</dt>
				<dd>{stressOn ? 'ON' : 'off'}</dd>
				<dt>preset</dt>
				<dd>{stressPreset}</dd>
				<dt>entities</dt>
				<dd>{stressOn ? entityCount : '--'}</dd>
			</dl>
			<p class="hint">
				Watch RTT/loss above while this is ON to see whether the payload load degrades ping timing.
			</p>
		</div>
	</div>

	<p class="thresholds">
		Thresholds: RTT &lt;80ms good, 80-150ms marginal, &gt;150ms problematic for host-authoritative feel.
		Loss &lt;1% good.
	</p>
</div>

<style>
	.wrap {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
		font-family: 'Share Tech Mono', monospace;
		color: var(--white, #e8ffe8);
		background: var(--bg0, #020a04);
		min-height: 100vh;
	}
	h1 {
		font-size: 1.15rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--green, #00ff41);
		margin: 0 0 0.5rem;
	}
	.note {
		color: var(--dim, #4a7a52);
		font-size: 0.78rem;
		line-height: 1.5;
		margin: 0 0 1.25rem;
	}
	code {
		color: var(--cyan, #00f0ff);
	}
	.panel {
		background: var(--bg1, #050f07);
		border: 1px solid var(--dim, #4a7a52);
		border-radius: 6px;
		padding: 0.9rem 1rem;
		margin-bottom: 1.25rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.6rem;
	}
	.row:last-child {
		margin-bottom: 0;
	}
	input[type='text'] {
		font-family: 'Share Tech Mono', monospace;
		background: var(--bg2, #081209);
		border: 1px solid var(--dim, #4a7a52);
		color: var(--white, #e8ffe8);
		border-radius: 4px;
		padding: 0.4rem 0.6rem;
		font-size: 0.8rem;
		text-transform: uppercase;
		width: 10rem;
	}
	select {
		font-family: 'Share Tech Mono', monospace;
		background: var(--bg2, #081209);
		border: 1px solid var(--dim, #4a7a52);
		color: var(--white, #e8ffe8);
		border-radius: 4px;
		padding: 0.35rem 0.5rem;
		font-size: 0.75rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: var(--dim, #4a7a52);
	}
	.checkbox {
		color: var(--white, #e8ffe8);
	}
	button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--green, #00ff41);
		background: var(--bg2, #081209);
		border: 1px solid var(--green, #00ff41);
		border-radius: 4px;
		padding: 0.4rem 0.9rem;
		cursor: pointer;
		text-transform: uppercase;
	}
	button:disabled {
		color: var(--ice, #88ddff);
		border-color: var(--ice, #88ddff);
		cursor: default;
	}
	button.danger {
		color: var(--amber, #ff8c00);
		border-color: var(--amber, #ff8c00);
	}
	.status {
		font-size: 0.72rem;
		color: var(--cyan, #00f0ff);
	}
	.peers {
		font-size: 0.72rem;
		color: var(--cyan, #00f0ff);
		margin-left: auto;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 0.8rem;
	}
	.card {
		background: var(--bg1, #050f07);
		border: 1px solid var(--dim, #4a7a52);
		border-radius: 6px;
		padding: 0.85rem 1rem;
	}
	.card h2 {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim, #4a7a52);
		margin: 0 0 0.5rem;
	}
	.big {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--white, #e8ffe8);
	}
	.big.good,
	.verdict.good {
		color: var(--green, #00ff41);
	}
	.big.marginal,
	.verdict.marginal {
		color: var(--amber, #ff8c00);
	}
	.big.bad,
	.verdict.bad {
		color: var(--amber, #ff8c00);
		font-weight: 700;
	}
	.verdict {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		margin-bottom: 0.5rem;
	}
	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 0.15rem 0.6rem;
		margin: 0;
		font-size: 0.72rem;
	}
	dt {
		color: var(--dim, #4a7a52);
	}
	dd {
		margin: 0;
		color: var(--white, #e8ffe8);
		text-align: right;
	}
	.hint {
		font-size: 0.68rem;
		color: var(--dim, #4a7a52);
		margin: 0.6rem 0 0;
		line-height: 1.4;
	}
	.thresholds {
		font-size: 0.68rem;
		color: var(--dim, #4a7a52);
		margin-top: 1.25rem;
		line-height: 1.5;
	}
</style>
