<script lang="ts">
	import { onMount } from 'svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';

	/**
	 * VANGUARD co-op Phase 0 spike: measures whether Supabase Realtime
	 * broadcast can carry game-frame-rate (20-30Hz) position/input traffic
	 * on the school network, before any co-op game code is written.
	 * Dev-only. No auth beyond the existing browser client, no schema,
	 * no game code touched. Broadcast + presence only, nothing persisted.
	 */
	let { data } = $props();
	const supabase = data.supabase;

	const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O/0/I/1/L
	const PING_INTERVAL_MS = 40; // 25Hz
	const TEST_DURATION_MS = 60_000;
	const PONG_TIMEOUT_MS = 2000;
	const DRAIN_TIMEOUT_MS = 2500;
	const SPARK_SAMPLES = 80;

	const myId = crypto.randomUUID().slice(0, 8);

	type Phase = 'setup' | 'connecting' | 'connected';
	type Role = 'idle' | 'pinger' | 'echoer';
	type Verdict = 'GOOD' | 'MARGINAL' | 'POOR';

	type Summary = {
		min: number;
		median: number;
		p95: number;
		max: number;
		sent: number;
		lost: number;
		lossPct: number;
		verdict: Verdict;
		roomCode: string;
		completedAt: number;
		perspective: 'pinger' | 'echoer';
	};

	let phase = $state<Phase>('setup');
	let roomCodeInput = $state('');
	let roomCode = $state('');
	let statusMsg = $state('');
	let peerCount = $state(0);

	let role = $state<Role>('idle');
	let testRunning = $state(false);
	let testPhaseLabel = $state<'' | 'running' | 'draining'>('');
	let elapsedMs = $state(0);
	let echoCount = $state(0);

	let currentRtt = $state<number | null>(null);
	let rttHistory = $state<number[]>([]);
	let sentCount = $state(0);
	let lostCount = $state(0);

	let summary = $state<Summary | null>(null);

	let channel: RealtimeChannel | null = null;
	let seqCounter = 0;
	let testStartedAt = 0;
	let currentTestId = '';
	let rttSamples: number[] = [];
	const pendingPings = new Map<number, ReturnType<typeof setTimeout>>();
	let sendIntervalId: ReturnType<typeof setInterval> | null = null;
	let elapsedIntervalId: ReturnType<typeof setInterval> | null = null;
	let drainPollId: ReturnType<typeof setInterval> | null = null;

	function randomCode() {
		let s = '';
		for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
		return s;
	}

	function connectToChannel(code: string) {
		phase = 'connecting';
		statusMsg = 'Connecting...';

		const ch = supabase.channel(`coopnet:${code}`, {
			config: { broadcast: { self: false, ack: false }, presence: { key: myId } }
		});

		ch.on('broadcast', { event: 'ping' }, ({ payload }: { payload: any }) => {
			if (role !== 'echoer' || payload.testId !== currentTestId) return;
			echoCount += 1;
			ch.send({
				type: 'broadcast',
				event: 'pong',
				payload: { seq: payload.seq, t0: payload.t0, testId: payload.testId }
			});
		});

		ch.on('broadcast', { event: 'pong' }, ({ payload }: { payload: any }) => {
			if (role !== 'pinger' || payload.testId !== currentTestId) return;
			handlePong(payload.seq, payload.t0);
		});

		ch.on('broadcast', { event: 'start-test' }, ({ payload }: { payload: any }) => {
			if (payload.pingerId === myId) return; // this client already set its own role locally
			beginTestAsEchoer(payload.testId);
		});

		ch.on('broadcast', { event: 'stop-test' }, ({ payload }: { payload: any }) => {
			if (payload.testId !== currentTestId || role !== 'echoer') return;
			role = 'idle';
			testRunning = false;
			testPhaseLabel = '';
		});

		ch.on('broadcast', { event: 'test-summary' }, ({ payload }: { payload: Summary }) => {
			if (role !== 'echoer') return;
			testRunning = false;
			testPhaseLabel = '';
			role = 'idle';
			summary = { ...payload, perspective: 'echoer' };
		});

		ch.on('presence', { event: 'sync' }, () => {
			peerCount = Object.keys(ch.presenceState()).length;
		});

		ch.subscribe(async (status: string) => {
			if (status === 'SUBSCRIBED') {
				await ch.track({ id: myId, joinedAt: Date.now() });
				roomCode = code;
				phase = 'connected';
				statusMsg = '';
			} else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
				statusMsg = `Channel error: ${status}`;
				phase = 'setup';
			} else if (status === 'CLOSED') {
				phase = 'setup';
			}
		});

		channel = ch;
	}

	function createRoom() {
		connectToChannel(randomCode());
	}

	function joinRoom() {
		const code = roomCodeInput.trim().toUpperCase();
		if (code.length !== 4) {
			statusMsg = 'Enter the 4-character room code.';
			return;
		}
		connectToChannel(code);
	}

	function resetTestState() {
		pendingPings.forEach((t) => clearTimeout(t));
		pendingPings.clear();
		rttSamples = [];
		rttHistory = [];
		currentRtt = null;
		sentCount = 0;
		lostCount = 0;
		echoCount = 0;
		elapsedMs = 0;
		summary = null;
	}

	function startTest() {
		if (!channel || peerCount < 2 || testRunning) return;
		const testId = crypto.randomUUID();
		currentTestId = testId;
		role = 'pinger';
		channel.send({ type: 'broadcast', event: 'start-test', payload: { pingerId: myId, testId } });
		beginTestAsPinger(testId);
	}

	function beginTestAsPinger(testId: string) {
		resetTestState();
		testRunning = true;
		testPhaseLabel = 'running';
		testStartedAt = performance.now();
		seqCounter = 0;

		sendIntervalId = setInterval(() => sendPing(testId), PING_INTERVAL_MS);
		elapsedIntervalId = setInterval(() => {
			elapsedMs = performance.now() - testStartedAt;
			if (elapsedMs >= TEST_DURATION_MS) finishSending(testId);
		}, 100);
	}

	function beginTestAsEchoer(testId: string) {
		resetTestState();
		currentTestId = testId;
		role = 'echoer';
		testRunning = true;
		testPhaseLabel = 'running';
		testStartedAt = performance.now();
	}

	function sendPing(testId: string) {
		if (!channel) return;
		const seq = seqCounter++;
		const t0 = performance.now();
		channel.send({ type: 'broadcast', event: 'ping', payload: { seq, t0, testId } });
		sentCount += 1;
		const timeoutId = setTimeout(() => {
			if (pendingPings.has(seq)) {
				pendingPings.delete(seq);
				lostCount += 1;
			}
		}, PONG_TIMEOUT_MS);
		pendingPings.set(seq, timeoutId);
	}

	function handlePong(seq: number, t0: number) {
		const timeoutId = pendingPings.get(seq);
		if (timeoutId == null) return; // already timed out, or a stray duplicate
		clearTimeout(timeoutId);
		pendingPings.delete(seq);
		const rtt = performance.now() - t0;
		currentRtt = rtt;
		rttSamples.push(rtt);
		rttHistory = [...rttHistory, rtt].slice(-SPARK_SAMPLES);
	}

	function finishSending(testId: string) {
		if (sendIntervalId) {
			clearInterval(sendIntervalId);
			sendIntervalId = null;
		}
		if (elapsedIntervalId) {
			clearInterval(elapsedIntervalId);
			elapsedIntervalId = null;
		}
		testPhaseLabel = 'draining';
		const drainStart = performance.now();
		drainPollId = setInterval(() => {
			const drained = pendingPings.size === 0;
			const timedOut = performance.now() - drainStart >= DRAIN_TIMEOUT_MS;
			if (drained || timedOut) {
				if (drainPollId) clearInterval(drainPollId);
				drainPollId = null;
				finalizeTest(testId);
			}
		}, 100);
	}

	function stopTestManually() {
		if (!testRunning || role !== 'pinger') return;
		channel?.send({ type: 'broadcast', event: 'stop-test', payload: { testId: currentTestId } });
		finishSending(currentTestId);
	}

	function percentile(sorted: number[], p: number) {
		if (!sorted.length) return 0;
		const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
		return sorted[idx];
	}

	function computeVerdict(median: number, p95: number, lossPct: number): Verdict {
		if (median < 60 && p95 < 120 && lossPct < 2) return 'GOOD';
		if (median < 120 && p95 < 250 && lossPct < 5) return 'MARGINAL';
		return 'POOR';
	}

	function finalizeTest(testId: string) {
		testRunning = false;
		testPhaseLabel = '';
		pendingPings.forEach((t) => clearTimeout(t));
		const stillPending = pendingPings.size;
		pendingPings.clear();

		const sorted = [...rttSamples].sort((a, b) => a - b);
		const min = sorted[0] ?? 0;
		const max = sorted[sorted.length - 1] ?? 0;
		const median = percentile(sorted, 50);
		const p95 = percentile(sorted, 95);
		const sent = sentCount;
		const lost = lostCount + stillPending;
		const lossPct = sent > 0 ? (100 * lost) / sent : 0;
		const verdict = computeVerdict(median, p95, lossPct);

		const result: Summary = {
			min,
			median,
			p95,
			max,
			sent,
			lost,
			lossPct,
			verdict,
			roomCode,
			completedAt: Date.now(),
			perspective: 'pinger'
		};
		summary = result;
		channel?.send({ type: 'broadcast', event: 'test-summary', payload: result });
		role = 'idle';
	}

	function runAgain() {
		summary = null;
		startTest();
	}

	function disconnect() {
		cleanupAll();
		phase = 'setup';
		roomCode = '';
		roomCodeInput = '';
		peerCount = 0;
		role = 'idle';
		testRunning = false;
		testPhaseLabel = '';
		summary = null;
		statusMsg = 'Disconnected';
	}

	function cleanupAll() {
		if (sendIntervalId) clearInterval(sendIntervalId);
		if (elapsedIntervalId) clearInterval(elapsedIntervalId);
		if (drainPollId) clearInterval(drainPollId);
		sendIntervalId = null;
		elapsedIntervalId = null;
		drainPollId = null;
		pendingPings.forEach((t) => clearTimeout(t));
		pendingPings.clear();
		if (channel) {
			supabase.removeChannel(channel);
			channel = null;
		}
	}

	onMount(() => cleanupAll);

	const sparkPoints = $derived.by(() => {
		const h = rttHistory;
		if (h.length < 2) return '';
		const w = 320;
		const hgt = 56;
		const maxRtt = Math.max(150, ...h);
		const stepX = w / (h.length - 1);
		return h.map((v, i) => `${(i * stepX).toFixed(1)},${(hgt - Math.min(v, maxRtt) * (hgt / maxRtt)).toFixed(1)}`).join(' ');
	});

	function fmt(n: number | null | undefined, digits = 0) {
		return n == null ? '--' : n.toFixed(digits);
	}
	function verdictClass(v: Verdict | null | undefined) {
		if (v === 'GOOD') return 'good';
		if (v === 'MARGINAL') return 'marginal';
		if (v === 'POOR') return 'poor';
		return '';
	}
</script>

<svelte:head><title>Co-op netcheck (dev)</title></svelte:head>

<div class="wrap">
	<h1>VANGUARD co-op // network spike</h1>
	<p class="note">
		Phase 0: measures whether Supabase Realtime <code>broadcast</code> can carry 20-30Hz co-op
		position/input traffic on the school network, before any co-op game code exists. Two devices
		join the same room code and ping each other over a broadcast channel (<code>coopnet:&lt;CODE&gt;</code>).
		No login required beyond the site's existing session, no data is stored.
	</p>

	{#if phase === 'setup'}
		<div class="panel">
			<div class="row">
				<button type="button" class="primary" onclick={createRoom}>Create room</button>
				<span class="or">or</span>
				<input
					type="text"
					placeholder="ROOM CODE"
					maxlength="4"
					bind:value={roomCodeInput}
					onkeydown={(e) => e.key === 'Enter' && joinRoom()}
				/>
				<button type="button" onclick={joinRoom}>Join</button>
			</div>
			{#if statusMsg}<p class="status-msg">{statusMsg}</p>{/if}
		</div>
	{:else}
		<div class="panel">
			<div class="row">
				<span class="room-code">Room <strong>{roomCode}</strong></span>
				<span class="peers" class:ready={peerCount >= 2}>
					{#if phase === 'connecting'}
						Connecting...
					{:else if peerCount >= 2}
						CONNECTED - {peerCount} clients
					{:else}
						Waiting for second device... ({peerCount}/2)
					{/if}
				</span>
				<button type="button" class="danger" onclick={disconnect}>Disconnect</button>
			</div>
		</div>

		{#if peerCount < 2}
			<p class="hint">
				Share the room code <strong>{roomCode}</strong> with the second device. Open
				<code>/dev/coop-netcheck</code> there and join with this code.
			</p>
		{:else if testRunning}
			<div class="grid">
				<div class="card wide">
					<h2>{role === 'pinger' ? 'Running test (you are pinging)' : 'Echoing pings from peer'}</h2>
					{#if role === 'pinger'}
						<div class="big">{fmt(currentRtt, 1)} ms</div>
						<p class="sub">
							{testPhaseLabel === 'draining' ? 'Finishing up, waiting on last packets...' : `${fmt(elapsedMs / 1000, 1)}s / 60s`}
							&middot; sent {sentCount} &middot; lost {lostCount}
						</p>
						<svg class="spark" viewBox="0 0 320 56" preserveAspectRatio="none">
							<polyline points={sparkPoints} />
						</svg>
					{:else}
						<div class="big">{echoCount}</div>
						<p class="sub">pings echoed back so far. Watch the other device for live results.</p>
					{/if}
					{#if role === 'pinger'}
						<button type="button" class="danger" onclick={stopTestManually}>Stop test</button>
					{/if}
				</div>
			</div>
		{:else if summary}
			<div class="summary-panel {verdictClass(summary.verdict)}">
				<div class="summary-head">
					<span>Room {summary.roomCode}</span>
					<span>{new Date(summary.completedAt).toLocaleString()}</span>
				</div>
				<div class="verdict-big {verdictClass(summary.verdict)}">{summary.verdict}</div>
				<p class="perspective">
					This device was the {summary.perspective === 'pinger' ? 'PINGER (sender)' : 'ECHOER (reflector)'}
					for this run.
				</p>
				<div class="stat-grid">
					<div class="stat"><span class="label">Min RTT</span><span class="value">{fmt(summary.min, 1)} ms</span></div>
					<div class="stat"><span class="label">Median RTT</span><span class="value">{fmt(summary.median, 1)} ms</span></div>
					<div class="stat"><span class="label">p95 RTT</span><span class="value">{fmt(summary.p95, 1)} ms</span></div>
					<div class="stat"><span class="label">Max RTT</span><span class="value">{fmt(summary.max, 1)} ms</span></div>
					<div class="stat"><span class="label">Sent</span><span class="value">{summary.sent}</span></div>
					<div class="stat"><span class="label">Lost</span><span class="value">{summary.lost}</span></div>
					<div class="stat"><span class="label">Loss %</span><span class="value">{fmt(summary.lossPct, 2)}%</span></div>
				</div>
				<button type="button" class="primary" onclick={runAgain}>Run again</button>
				<p class="hint">
					To test the other direction, click <strong>Run again</strong> on the OTHER device instead
					so roles swap.
				</p>
			</div>
		{:else}
			<div class="grid">
				<div class="card wide">
					<h2>Ready</h2>
					<p class="sub">Either device can start. The starter sends pings for 60 seconds at 25Hz; the other echoes them back.</p>
					<button type="button" class="primary" onclick={startTest}>Start test</button>
				</div>
			</div>
		{/if}
	{/if}

	<p class="thresholds">
		Verdict thresholds (20-30Hz co-op sync target): <strong class="good">GOOD</strong> = median
		&lt;60ms, p95 &lt;120ms, loss &lt;2%. <strong class="marginal">MARGINAL</strong> = median
		&lt;120ms, p95 &lt;250ms, loss &lt;5%. <strong class="poor">POOR</strong> = worse than that.
	</p>
</div>

<style>
	.wrap {
		max-width: 760px;
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
		line-height: 1.55;
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
		margin-bottom: 1rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.or {
		color: var(--dim, #4a7a52);
		font-size: 0.72rem;
	}
	input[type='text'] {
		font-family: 'Share Tech Mono', monospace;
		background: var(--bg2, #081209);
		border: 1px solid var(--dim, #4a7a52);
		color: var(--white, #e8ffe8);
		border-radius: 4px;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
		text-transform: uppercase;
		width: 7rem;
		letter-spacing: 0.1em;
	}
	button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--white, #e8ffe8);
		background: var(--bg2, #081209);
		border: 1px solid var(--dim, #4a7a52);
		border-radius: 4px;
		padding: 0.45rem 1rem;
		cursor: pointer;
		text-transform: uppercase;
	}
	button.primary {
		color: var(--green, #00ff41);
		border-color: var(--green, #00ff41);
	}
	button.danger {
		color: var(--amber, #ff8c00);
		border-color: var(--amber, #ff8c00);
		margin-left: auto;
	}
	.status-msg {
		font-size: 0.72rem;
		color: var(--amber, #ff8c00);
		margin: 0.6rem 0 0;
	}
	.room-code {
		font-size: 0.85rem;
	}
	.room-code strong {
		color: var(--cyan, #00f0ff);
		letter-spacing: 0.15em;
	}
	.peers {
		font-size: 0.72rem;
		color: var(--dim, #4a7a52);
	}
	.peers.ready {
		color: var(--green, #00ff41);
	}
	.hint {
		font-size: 0.75rem;
		color: var(--dim, #4a7a52);
		line-height: 1.5;
	}
	.grid {
		display: grid;
		gap: 0.8rem;
	}
	.card {
		background: var(--bg1, #050f07);
		border: 1px solid var(--dim, #4a7a52);
		border-radius: 6px;
		padding: 1rem 1.15rem;
	}
	.card h2 {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim, #4a7a52);
		margin: 0 0 0.6rem;
	}
	.card .sub {
		font-size: 0.75rem;
		color: var(--dim, #4a7a52);
		margin: 0.3rem 0 0.8rem;
		line-height: 1.5;
	}
	.big {
		font-size: 2.4rem;
		font-weight: 700;
		color: var(--white, #e8ffe8);
		line-height: 1;
	}
	.spark {
		width: 100%;
		height: 56px;
		margin: 0.8rem 0;
		display: block;
	}
	.spark polyline {
		fill: none;
		stroke: var(--green, #00ff41);
		stroke-width: 1.5;
	}
	.summary-panel {
		background: var(--bg1, #050f07);
		border: 1px solid var(--dim, #4a7a52);
		border-radius: 8px;
		padding: 1.5rem;
		text-align: center;
	}
	.summary-panel.good {
		border-color: var(--green, #00ff41);
	}
	.summary-panel.marginal,
	.summary-panel.poor {
		border-color: var(--amber, #ff8c00);
	}
	.summary-head {
		display: flex;
		justify-content: space-between;
		font-size: 0.72rem;
		color: var(--dim, #4a7a52);
		margin-bottom: 0.9rem;
	}
	.verdict-big {
		font-size: 2.8rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		margin-bottom: 0.4rem;
	}
	.verdict-big.good,
	strong.good {
		color: var(--green, #00ff41);
	}
	.verdict-big.marginal,
	strong.marginal {
		color: var(--amber, #ff8c00);
	}
	.verdict-big.poor,
	strong.poor {
		color: var(--amber, #ff8c00);
		font-weight: 700;
	}
	.perspective {
		font-size: 0.75rem;
		color: var(--dim, #4a7a52);
		margin: 0 0 1.2rem;
	}
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.9rem;
		margin-bottom: 1.4rem;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.stat .label {
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--dim, #4a7a52);
	}
	.stat .value {
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--white, #e8ffe8);
	}
	.thresholds {
		font-size: 0.68rem;
		color: var(--dim, #4a7a52);
		margin-top: 1.5rem;
		line-height: 1.6;
	}
	@media (max-width: 480px) {
		.stat-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
