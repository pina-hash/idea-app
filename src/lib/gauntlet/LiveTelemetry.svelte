<script lang="ts">
	import { eventNum, formatMass, type RunEvent, type TelemetryTargets } from '$lib/gauntlet';

	/**
	 * Live in-run analysis for a Speedrun (0035). Renders from the append-only
	 * telemetry stream (`events`, fed live via Realtime on the play page, or a
	 * synthetic replay in /dev/run-telemetry): volume vs target, computed mass vs
	 * target (from the LEVEL density), running feature count, a live feature
	 * activity feed, rebuild health, and pace vs par. Display only; it never
	 * affects the run. VIEWPORT styling, Share Tech Mono numerics, a crimson LIVE
	 * badge, all motion behind prefers-reduced-motion.
	 */
	let {
		events = [],
		targets,
		elapsedMs = null,
		live = true
	}: {
		events?: RunEvent[];
		targets: TelemetryTargets;
		/** Server-authoritative elapsed ms; falls back to the latest event time. */
		elapsedMs?: number | null;
		live?: boolean;
	} = $props();

	const snapshots = $derived(events.filter((e) => e.event_type === 'snapshot'));
	const latest = $derived(snapshots.length ? snapshots[snapshots.length - 1] : null);

	const volume = $derived(latest ? eventNum(latest.payload, 'volume_mm3') : null);
	const featureCount = $derived(latest ? eventNum(latest.payload, 'feature_count') : null);

	const volumePct = $derived(
		volume != null && targets.targetVolumeMm3
			? Math.min(150, (volume / targets.targetVolumeMm3) * 100)
			: null
	);
	// Computed mass = measured volume x the LEVEL density (never the part material).
	const computedMassLevel = $derived.by(() => {
		if (volume == null || targets.densityGcm3 == null) return null;
		const g = (volume / 1000) * targets.densityGcm3;
		return targets.unitSystem === 'IPS' ? g / 453.59237 : g;
	});

	const rebuilds = $derived(events.filter((e) => e.event_type === 'rebuild'));
	const errorCount = $derived(
		rebuilds.reduce((n, e) => n + (eventNum(e.payload, 'error_count') ?? 0), 0)
	);
	const warningCount = $derived(
		rebuilds.reduce((n, e) => n + (eventNum(e.payload, 'warning_count') ?? 0), 0)
	);

	const nowMs = $derived(elapsedMs ?? (events.length ? events[events.length - 1].t_ms : 0));
	const pacePct = $derived(
		targets.parTime ? Math.min(150, nowMs / (targets.parTime * 1000) * 100) : null
	);

	const ACTIVITY = new Set(['feature_add', 'feature_delete', 'undo', 'redo', 'rebuild']);
	const feed = $derived(
		events
			.filter((e) => ACTIVITY.has(e.event_type))
			.slice(-8)
			.reverse()
	);

	const LABEL: Record<string, string> = {
		feature_add: 'Feature added',
		feature_delete: 'Feature deleted',
		undo: 'Undo',
		redo: 'Redo',
		rebuild: 'Rebuild'
	};

	const fmtT = (ms: number) => {
		const s = Math.max(0, Math.round(ms / 100) / 10);
		if (s < 60) return `${s.toFixed(1)}s`;
		return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
	};

	const featName = (e: RunEvent) => {
		const n = e.payload?.name;
		return typeof n === 'string' && n.length ? n : '';
	};
</script>

<div class="lt" class:live>
	<div class="lt-head">
		<span class="lt-title">Live analysis</span>
		{#if live}<span class="lt-live"><span class="lt-dot"></span>LIVE</span>{/if}
	</div>

	<div class="lt-gauges">
		<div class="lt-gauge">
			<div class="lt-gauge-top">
				<span class="lt-label">Volume vs target</span>
				<span class="lt-num">{volume != null ? volume.toFixed(0) : '--'}<span class="lt-unit">mm3</span></span>
			</div>
			<div class="lt-bar"><div class="lt-fill vol" style="width:{Math.min(100, volumePct ?? 0)}%"></div>
				{#if volumePct != null && volumePct > 100}<div class="lt-over" style="left:100%"></div>{/if}
			</div>
			<span class="lt-sub">
				target {targets.targetVolumeMm3 ? targets.targetVolumeMm3.toFixed(0) : '--'} mm3
				{#if volumePct != null} · {volumePct.toFixed(0)}%{/if}
			</span>
		</div>

		<div class="lt-gauge">
			<div class="lt-gauge-top">
				<span class="lt-label">Mass (level density)</span>
				<span class="lt-num">{computedMassLevel != null ? formatMass(computedMassLevel, targets.massUnit) : '--'}</span>
			</div>
			<div class="lt-sub">
				target {targets.targetMassLevel != null ? formatMass(targets.targetMassLevel, targets.massUnit) : '--'}
			</div>
		</div>
	</div>

	<div class="lt-stats">
		<div class="lt-stat">
			<span class="lt-stat-num">{featureCount ?? '--'}</span>
			<span class="lt-stat-label">Features{#if targets.parFeatures} / {targets.parFeatures} par{/if}</span>
		</div>
		<div class="lt-stat">
			<span class="lt-stat-num" class:warn={errorCount > 0}>{errorCount}</span>
			<span class="lt-stat-label">Rebuild errors</span>
		</div>
		<div class="lt-stat">
			<span class="lt-stat-num" class:warn={warningCount > 0}>{warningCount}</span>
			<span class="lt-stat-label">Warnings</span>
		</div>
		<div class="lt-stat">
			<span class="lt-stat-num" class:hot={pacePct != null && pacePct > 100}>
				{pacePct != null ? `${pacePct.toFixed(0)}%` : '--'}
			</span>
			<span class="lt-stat-label">Pace vs par</span>
		</div>
	</div>

	<div class="lt-feed">
		<span class="lt-label">Activity</span>
		{#if feed.length === 0}
			<p class="lt-feed-empty">Waiting for modeling activity...</p>
		{:else}
			<ul>
				{#each feed as e (e.seq)}
					<li class="lt-feed-row act-{e.event_type}">
						<span class="lt-feed-t">{fmtT(e.t_ms)}</span>
						<span class="lt-feed-what">{LABEL[e.event_type] ?? e.event_type}</span>
						{#if featName(e)}<span class="lt-feed-name">{featName(e)}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.lt {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		padding: 1rem 1.1rem;
		background: var(--bg2, #0a1512);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
	}
	.lt.live {
		border-color: rgba(255, 60, 40, 0.4);
	}
	.lt-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.lt-title {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.62rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.lt-live {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--crimson, #ff3b28);
	}
	.lt-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--crimson, #ff3b28);
		box-shadow: 0 0 8px rgba(255, 40, 20, 0.85);
		animation: lt-blink 1.1s steps(1, end) infinite;
	}
	.lt-gauges {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}
	.lt-gauge-top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.lt-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.56rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.lt-num {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-variant-numeric: tabular-nums;
		font-size: 1.15rem;
		color: var(--white, #e8ffe8);
	}
	.lt-unit {
		font-size: 0.62rem;
		color: var(--dim, #5f8a78);
		margin-left: 0.2rem;
	}
	.lt-bar {
		position: relative;
		height: 8px;
		margin: 0.35rem 0 0.25rem;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 5px;
		overflow: hidden;
	}
	.lt-fill {
		height: 100%;
		border-radius: 5px;
		background: var(--green, #00ff41);
		transition: width 0.4s ease;
	}
	.lt-over {
		position: absolute;
		top: 0;
		width: 3px;
		height: 100%;
		background: var(--amber, #ff8c00);
	}
	.lt-sub {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.58rem;
		color: var(--dim, #5f8a78);
	}
	.lt-stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.5rem;
		border-top: 1px solid var(--line, #16242c);
		border-bottom: 1px solid var(--line, #16242c);
		padding: 0.7rem 0;
	}
	.lt-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
	}
	.lt-stat-num {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-variant-numeric: tabular-nums;
		font-size: 1.3rem;
		color: var(--cyan, #00f0ff);
	}
	.lt-stat-num.warn {
		color: var(--amber, #ff8c00);
	}
	.lt-stat-num.hot {
		color: var(--crimson, #ff3b28);
	}
	.lt-stat-label {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.5rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
		text-align: center;
	}
	.lt-feed ul {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.lt-feed-row {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		padding: 0.15rem 0.4rem;
		border-left: 2px solid var(--line-strong, rgba(0, 255, 65, 0.3));
		background: rgba(255, 255, 255, 0.02);
	}
	.lt-feed-row.act-undo,
	.lt-feed-row.act-feature_delete {
		border-left-color: var(--amber, #ff8c00);
	}
	.lt-feed-t {
		color: var(--dim, #5f8a78);
		min-width: 3.2rem;
	}
	.lt-feed-what {
		color: var(--white, #e8ffe8);
	}
	.lt-feed-name {
		color: var(--cyan, #00f0ff);
	}
	.lt-feed-empty {
		font-family: var(--font-mono, 'Share Tech Mono', monospace);
		font-size: 0.66rem;
		color: var(--dim, #5f8a78);
		margin: 0.3rem 0 0;
	}
	@keyframes lt-blink {
		0%,
		49% {
			opacity: 1;
		}
		50%,
		100% {
			opacity: 0.2;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.lt-dot {
			animation: none;
		}
		.lt-fill {
			transition: none;
		}
	}
</style>
