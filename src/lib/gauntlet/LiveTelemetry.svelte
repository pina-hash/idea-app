<script lang="ts">
	import {
		eventNum,
		formatMass,
		deviationBandFill,
		deviationBandLabel,
		type DeviationBand,
		type RunEvent,
		type TelemetryTargets
	} from '$lib/gauntlet';

	/**
	 * Live in-run analysis for a Speedrun (0035). Renders from the append-only
	 * telemetry stream (`events`, fed live via Realtime on the play page, or a
	 * synthetic replay in /dev/run-telemetry): the part's own measured volume and
	 * mass, how close the SERVER says that is, a running feature count, a live
	 * feature activity feed, rebuild health, and pace vs par. Display only; it
	 * never affects the run. VIEWPORT styling, Share Tech Mono numerics, a crimson
	 * LIVE badge, all motion behind prefers-reduced-motion.
	 *
	 * THE CLOSENESS READING IS THE SERVER'S, AND THE TARGET IS NOT HERE (0153).
	 * This used to draw the measured volume against `targets.targetVolumeMm3` and
	 * the computed mass against `targets.targetMassLevel` -- two copies of the
	 * ranked answer, taken from the published `prompt`, which is column-granted to
	 * every signed-in student. Both fields are gone from `TelemetryTargets` and
	 * there is no honest way to refill them. What replaces them is `band`: the
	 * verdict `gauntlet_submit`'s Speedrun practice branch returns for the mass
	 * the student checked, which is coarse, unsigned, metered by 0151, and says
	 * how close without saying to what.
	 *
	 * `volume` and `computedMassLevel` STAY, and are not a disclosure: they are
	 * measurements of the student's OWN part, which they can read off Mass
	 * Properties without this panel. What was disclosed was the number beside
	 * them.
	 */
	let {
		events = [],
		targets,
		elapsedMs = null,
		live = true,
		band = null,
		bandAtMs = null,
		nowMs: nowClockMs = null
	}: {
		events?: RunEvent[];
		targets: TelemetryTargets;
		/** Server-authoritative elapsed ms; falls back to the latest event time. */
		elapsedMs?: number | null;
		live?: boolean;
		/**
		 * The server's verdict on the student's most recent practice check, or
		 * null when they have not checked yet. NEVER derived here: this component
		 * has nothing to compare against and must not acquire anything.
		 */
		band?: DeviationBand | null;
		/** Epoch ms the band was answered, so the panel can say how stale it is. */
		bandAtMs?: number | null;
		/**
		 * Epoch ms now, threaded from the caller. A component that reads its own
		 * clock disagrees with the surface it is rendered in (CLAUDE.md); null
		 * simply drops the staleness note rather than inventing one.
		 */
		nowMs?: number | null;
	} = $props();

	const snapshots = $derived(events.filter((e) => e.event_type === 'snapshot'));
	const latest = $derived(snapshots.length ? snapshots[snapshots.length - 1] : null);

	const volume = $derived(latest ? eventNum(latest.payload, 'volume_mm3') : null);
	const featureCount = $derived(latest ? eventNum(latest.payload, 'feature_count') : null);

	// Computed mass = measured volume x the LEVEL density (never the part material).
	const computedMassLevel = $derived.by(() => {
		if (volume == null || targets.densityGcm3 == null) return null;
		const g = (volume / 1000) * targets.densityGcm3;
		return targets.unitSystem === 'IPS' ? g / 453.59237 : g;
	});

	// The closeness bar. Four discrete steps straight off the band; see
	// `deviationBandFill` for why it may never be computed from a quantity.
	const bandFill = $derived(deviationBandFill(band));
	const bandAgeS = $derived(
		band != null && bandAtMs != null && nowClockMs != null
			? Math.max(0, Math.round((nowClockMs - bandAtMs) / 1000))
			: null
	);

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
				<span class="lt-label">Last check</span>
				<span class="lt-num band-{band ?? 'none'}">{band != null ? deviationBandLabel(band) : 'Not checked'}</span>
			</div>
			<div class="lt-bar">
				<div class="lt-fill band-{band ?? 'none'}" style="width:{bandFill ?? 0}%"></div>
			</div>
			<span class="lt-sub">
				{#if band == null}
					Check your mass below to see how close you are
				{:else if bandAgeS != null}
					Checked {fmtT(bandAgeS * 1000)} ago
				{:else}
					Checked against the server
				{/if}
			</span>
		</div>

		<div class="lt-gauge">
			<div class="lt-gauge-top">
				<span class="lt-label">Your part</span>
				<span class="lt-num">{computedMassLevel != null ? formatMass(computedMassLevel, targets.massUnit) : '--'}</span>
			</div>
			<div class="lt-sub">
				{volume != null ? volume.toFixed(0) : '--'} mm3 measured
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
	/* The band's own hue, matching the words beside it. Colour is never the only
	   signal: the label spells the verdict out and the bar's LENGTH is the
	   ordering, which is why `near` and `far` share amber rather than reaching for
	   a second warning hue. `--crimson` is deliberately not used -- this room
	   reserves it for live/rec/error, and a miss is a grading outcome, not an
	   error; `.gauntlet .result-banner.no` already spells the same verdict amber
	   two panels down. */
	.lt-fill.band-pass {
		background: var(--green, #00ff41);
	}
	.lt-fill.band-close {
		background: var(--teal, #2ec4a6);
	}
	.lt-fill.band-near,
	.lt-fill.band-far {
		background: var(--amber, #ff8c00);
	}
	.lt-num.band-pass {
		color: var(--green, #00ff41);
	}
	.lt-num.band-near,
	.lt-num.band-far {
		color: var(--amber, #ff8c00);
	}
	.lt-num.band-none {
		color: var(--dim, #5f8a78);
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
