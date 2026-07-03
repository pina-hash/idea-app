<script lang="ts">
	import { eventNum, formatMass, formatTime, type RunEvent, type TelemetryTargets } from '$lib/gauntlet';

	/**
	 * Post-run CRITICAL analysis for a Speedrun (0035): a coaching-oriented read of
	 * the full append-only event stream, not just raw numbers. Dependency-light
	 * (inline SVG charts, no chart library). Everything derives from `events`;
	 * optional `selfHistory` (the student's past attempts on this level) and
	 * `classStats` (class medians) drive the comparisons and degrade gracefully.
	 * Display only; VIEWPORT styling, Share Tech Mono numerics.
	 */
	let {
		events = [],
		targets,
		selfHistory = [],
		classStats = null
	}: {
		events?: RunEvent[];
		targets: TelemetryTargets;
		/** This student's prior attempts on the same level (for the learning curve). */
		selfHistory?: { created_at: string; elapsed_ms: number | null; result: string }[];
		/** Class medians for the same level. */
		classStats?: {
			medianElapsedMs?: number | null;
			medianFeatures?: number | null;
			medianStuckMs?: number | null;
		} | null;
	} = $props();

	const snaps = $derived(
		events.filter((e) => e.event_type === 'snapshot').map((e) => ({
			t: e.t_ms,
			v: eventNum(e.payload, 'volume_mm3') ?? 0,
			f: eventNum(e.payload, 'feature_count') ?? 0
		}))
	);
	const featureAdds = $derived(events.filter((e) => e.event_type === 'feature_add'));
	const undoCount = $derived(events.filter((e) => e.event_type === 'undo').length);
	const redoCount = $derived(events.filter((e) => e.event_type === 'redo').length);
	const rebuilds = $derived(events.filter((e) => e.event_type === 'rebuild'));
	const errorCount = $derived(rebuilds.reduce((n, e) => n + (eventNum(e.payload, 'error_count') ?? 0), 0));
	const warningCount = $derived(rebuilds.reduce((n, e) => n + (eventNum(e.payload, 'warning_count') ?? 0), 0));

	const endMs = $derived(events.length ? events[events.length - 1].t_ms : 0);
	const finalVol = $derived(snaps.length ? snaps[snaps.length - 1].v : 0);
	const finalFeat = $derived(snaps.length ? snaps[snaps.length - 1].f : featureAdds.length);
	const finalMass = $derived.by(() => {
		if (!finalVol || targets.densityGcm3 == null) return null;
		const g = (finalVol / 1000) * targets.densityGcm3;
		return targets.unitSystem === 'IPS' ? g / 453.59237 : g;
	});

	// Per-feature dwell: time from each feature_add to the next (or run end).
	const dwell = $derived.by(() => {
		const names = featureAdds.map((e) => ({
			name: (e.payload?.name as string) || `Feature ${e.seq}`,
			start: e.t_ms
		}));
		return names.map((n, i) => ({
			name: n.name,
			start: n.start,
			ms: (i + 1 < names.length ? names[i + 1].start : endMs) - n.start
		}));
	});
	const stuck = $derived.by(() => {
		if (!dwell.length) return null;
		return dwell.reduce((a, b) => (b.ms > a.ms ? b : a), dwell[0]);
	});

	// Active vs idle: gaps over 8s between consecutive events read as idle.
	const activeIdle = $derived.by(() => {
		let active = 0;
		let idle = 0;
		for (let i = 1; i < events.length; i++) {
			const gap = events[i].t_ms - events[i - 1].t_ms;
			if (gap <= 0) continue;
			if (gap > 8000) idle += gap;
			else active += gap;
		}
		return { active, idle };
	});

	// Command usage breakdown.
	const commands = $derived.by(() => {
		const m = new Map<string, number>();
		for (const e of events.filter((x) => x.event_type === 'command')) {
			const id = String(e.payload?.id ?? 'cmd');
			m.set(id, (m.get(id) ?? 0) + 1);
		}
		return [...m.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n).slice(0, 6);
	});

	// --- Volume-over-time chart geometry (inline SVG) ------------------------
	const CW = 640;
	const CH = 160;
	const PAD = 8;
	const volChart = $derived.by(() => {
		if (snaps.length < 1 || !endMs) return null;
		const maxV = Math.max(targets.targetVolumeMm3 ?? 0, ...snaps.map((s) => s.v), 1);
		const x = (t: number) => PAD + (t / endMs) * (CW - 2 * PAD);
		const y = (v: number) => CH - PAD - (v / maxV) * (CH - 2 * PAD);
		const pts = snaps.map((s) => `${x(s.t).toFixed(1)},${y(s.v).toFixed(1)}`).join(' ');
		const targetY = targets.targetVolumeMm3 != null ? y(targets.targetVolumeMm3) : null;
		const area = `${PAD},${CH - PAD} ${pts} ${x(snaps[snaps.length - 1].t).toFixed(1)},${CH - PAD}`;
		return { pts, area, targetY };
	});

	const maxDwell = $derived(dwell.length ? Math.max(...dwell.map((d) => d.ms), 1) : 1);

	const fmtMs = (ms: number) => {
		const s = Math.max(0, ms / 1000);
		return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
	};

	// --- Coaching callouts (plain language) ----------------------------------
	const callouts = $derived.by(() => {
		const out: { tone: 'warn' | 'ok' | 'info'; text: string }[] = [];
		if (stuck && stuck.ms > 0) {
			const cmp = classStats?.medianStuckMs
				? ` (class median dwell ${fmtMs(classStats.medianStuckMs)})`
				: '';
			out.push({
				tone: stuck.ms > endMs * 0.35 ? 'warn' : 'info',
				text: `Longest dwell was ${fmtMs(stuck.ms)} on "${stuck.name}"${cmp}. That step is your biggest time sink.`
			});
		}
		if (redoCount + undoCount >= 4) {
			out.push({
				tone: 'warn',
				text: `${undoCount} undos and ${redoCount} redos: a lot of churn. Plan the feature before cutting it to save time.`
			});
		}
		if (targets.parFeatures && finalFeat > targets.parFeatures) {
			out.push({
				tone: 'warn',
				text: `You used ${finalFeat} features vs a par of ${targets.parFeatures}. Look for a simpler feature tree.`
			});
		} else if (targets.parFeatures && finalFeat <= targets.parFeatures) {
			out.push({ tone: 'ok', text: `Clean tree: ${finalFeat} features, at or under the ${targets.parFeatures} par.` });
		}
		if (errorCount > 0) {
			out.push({ tone: 'warn', text: `${errorCount} rebuild error(s) during the run cost you time. Watch for red rebuild flags.` });
		}
		if (activeIdle.idle > activeIdle.active && activeIdle.idle > 10000) {
			out.push({ tone: 'info', text: `More idle than active time: ${fmtMs(activeIdle.idle)} idle. Reading the drawing up front helps.` });
		}
		if (!out.length) out.push({ tone: 'ok', text: 'Steady, low-churn run. Nice work.' });
		return out.slice(0, 4);
	});

	const integrity = $derived(events.filter((e) => e.event_type === 'integrity'));
	const hasData = $derived(events.length > 1);
</script>

<div class="pra">
	<h3 class="pra-h">Run analysis</h3>
	{#if !hasData}
		<p class="pra-empty">No telemetry was captured for this run (the add-in records it live).</p>
	{:else}
		<div class="pra-stats">
			<div class="pra-stat"><span class="n">{formatMass(finalMass, targets.massUnit)}</span><span class="l">Final mass {targets.massUnit}</span></div>
			<div class="pra-stat"><span class="n">{finalVol ? finalVol.toFixed(0) : '--'}</span><span class="l">Final vol mm3</span></div>
			<div class="pra-stat"><span class="n" class:warn={targets.parFeatures != null && finalFeat > targets.parFeatures}>{finalFeat}{#if targets.parFeatures}/{targets.parFeatures}{/if}</span><span class="l">Features / par</span></div>
			<div class="pra-stat"><span class="n">{fmtMs(activeIdle.active)}</span><span class="l">Active</span></div>
			<div class="pra-stat"><span class="n" class:warn={activeIdle.idle > activeIdle.active}>{fmtMs(activeIdle.idle)}</span><span class="l">Idle</span></div>
			<div class="pra-stat"><span class="n" class:warn={undoCount + redoCount >= 4}>{undoCount}/{redoCount}</span><span class="l">Undo / redo</span></div>
			<div class="pra-stat"><span class="n" class:warn={errorCount > 0}>{errorCount}/{warningCount}</span><span class="l">Errors / warns</span></div>
		</div>

		<!-- Coaching callouts -->
		<div class="pra-coach">
			{#each callouts as c (c.text)}
				<div class="pra-callout tone-{c.tone}">{c.text}</div>
			{/each}
		</div>

		<!-- Volume over time -->
		{#if volChart}
			<div class="pra-block">
				<span class="pra-label">Volume over time (converging to target)</span>
				<svg class="pra-svg" viewBox="0 0 {CW} {CH}" preserveAspectRatio="none" role="img" aria-label="Volume over time">
					<polygon class="area" points={volChart.area} />
					<polyline class="line" points={volChart.pts} />
					{#if volChart.targetY != null}
						<line class="target" x1={PAD} y1={volChart.targetY} x2={CW - PAD} y2={volChart.targetY} />
					{/if}
				</svg>
				<span class="pra-sub">Dashed line = target volume. Curve should climb and settle on it.</span>
			</div>
		{/if}

		<!-- Modeling timeline + time per feature -->
		{#if dwell.length}
			<div class="pra-block">
				<span class="pra-label">Time per feature (longest dwell highlighted)</span>
				<div class="pra-bars">
					{#each dwell as d (d.start)}
						<div class="pra-bar-row">
							<span class="pra-bar-name" title={d.name}>{d.name}</span>
							<div class="pra-bar-track">
								<div class="pra-bar-fill" class:stuck={stuck && d.start === stuck.start} style="width:{Math.max(2, (d.ms / maxDwell) * 100)}%"></div>
							</div>
							<span class="pra-bar-t">{fmtMs(d.ms)}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Command usage -->
		{#if commands.length}
			<div class="pra-block">
				<span class="pra-label">Command usage</span>
				<div class="pra-chips">
					{#each commands as c (c.id)}<span class="pra-chip">#{c.id} <b>{c.n}</b></span>{/each}
				</div>
			</div>
		{/if}

		<!-- Comparisons -->
		<div class="pra-block pra-compare">
			<div class="pra-cmp">
				<span class="pra-label">Vs class median</span>
				{#if classStats}
					<ul>
						{#if classStats.medianElapsedMs != null}<li>Time: {formatTime(endMs / 1000)} vs {formatTime(classStats.medianElapsedMs / 1000)} median</li>{/if}
						{#if classStats.medianFeatures != null}<li>Features: {finalFeat} vs {classStats.medianFeatures} median</li>{/if}
						{#if classStats.medianStuckMs != null && stuck}<li>Longest dwell: {fmtMs(stuck.ms)} vs {fmtMs(classStats.medianStuckMs)} median</li>{/if}
					</ul>
				{:else}
					<p class="pra-sub">No class data yet.</p>
				{/if}
			</div>
			<div class="pra-cmp">
				<span class="pra-label">Your learning curve</span>
				{#if selfHistory.length}
					<ul>
						{#each selfHistory.slice(0, 5) as a (a.created_at)}
							<li>{a.result === 'passed' ? '✓' : '·'} {a.elapsed_ms != null ? formatTime(a.elapsed_ms / 1000) : '--'} <span class="pra-sub">{new Date(a.created_at).toLocaleDateString()}</span></li>
						{/each}
					</ul>
				{:else}
					<p class="pra-sub">This is your first recorded attempt on this level.</p>
				{/if}
			</div>
		</div>

		{#if integrity.length}
			<div class="pra-block">
				<span class="pra-label">Integrity</span>
				<div class="pra-chips">
					{#each integrity as e (e.seq)}<span class="pra-chip info">{String(e.payload?.kind ?? 'signal')}</span>{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.pra {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
	}
	.pra-h {
		margin: 0;
		font-family: var(--font-display, 'Rajdhani', sans-serif);
		font-size: 1.05rem;
		color: var(--white, #e8ffe8);
	}
	.pra-empty,
	.pra-sub {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--dim, #5f8a78);
	}
	.pra-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
		gap: 0.5rem;
	}
	.pra-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		padding: 0.5rem 0.3rem;
		background: var(--bg2, #0a1512);
		border-radius: 5px;
	}
	.pra-stat .n {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-variant-numeric: tabular-nums;
		font-size: 1rem;
		color: var(--cyan, #00f0ff);
	}
	.pra-stat .n.warn {
		color: var(--amber, #ff8c00);
	}
	.pra-stat .l {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.48rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
		text-align: center;
	}
	.pra-coach {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.pra-callout {
		font-family: var(--font-body, 'Rajdhani', sans-serif);
		font-size: 0.92rem;
		line-height: 1.4;
		padding: 0.5rem 0.7rem;
		border-left: 3px solid var(--line-strong, rgba(0, 255, 65, 0.3));
		background: var(--bg2, #0a1512);
		border-radius: 0 4px 4px 0;
		color: var(--white, #e8ffe8);
	}
	.pra-callout.tone-warn {
		border-left-color: var(--amber, #ff8c00);
	}
	.pra-callout.tone-ok {
		border-left-color: var(--green, #00ff41);
	}
	.pra-callout.tone-info {
		border-left-color: var(--cyan, #00f0ff);
	}
	.pra-block {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.pra-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.56rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.pra-svg {
		width: 100%;
		height: 160px;
		background: var(--bg2, #0a1512);
		border-radius: 4px;
	}
	.pra-svg .area {
		fill: rgba(0, 255, 65, 0.1);
	}
	.pra-svg .line {
		fill: none;
		stroke: var(--green, #00ff41);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.pra-svg .target {
		stroke: var(--gold, #c8ff00);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		vector-effect: non-scaling-stroke;
	}
	.pra-bars {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.pra-bar-row {
		display: grid;
		grid-template-columns: 6.5rem 1fr 3.2rem;
		align-items: center;
		gap: 0.5rem;
	}
	.pra-bar-name {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--white, #e8ffe8);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pra-bar-track {
		height: 12px;
		background: rgba(255, 255, 255, 0.05);
		border-radius: 3px;
		overflow: hidden;
	}
	.pra-bar-fill {
		height: 100%;
		background: var(--cyan, #00f0ff);
		opacity: 0.7;
	}
	.pra-bar-fill.stuck {
		background: var(--amber, #ff8c00);
		opacity: 1;
	}
	.pra-bar-t {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		color: var(--dim, #5f8a78);
		text-align: right;
	}
	.pra-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.pra-chip {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.64rem;
		color: var(--white, #e8ffe8);
		background: var(--bg2, #0a1512);
		border: 1px solid var(--line, #16242c);
		border-radius: 3px;
		padding: 0.15rem 0.45rem;
	}
	.pra-chip.info {
		color: var(--cyan, #00f0ff);
	}
	.pra-compare {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.pra-cmp ul {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--white, #e8ffe8);
	}
	@media (max-width: 560px) {
		.pra-compare {
			grid-template-columns: 1fr;
		}
		.pra-bar-row {
			grid-template-columns: 5rem 1fr 2.8rem;
		}
	}
</style>
