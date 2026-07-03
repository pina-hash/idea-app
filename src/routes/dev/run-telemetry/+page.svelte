<script lang="ts">
	import { onMount } from 'svelte';
	import LiveTelemetry from '$lib/gauntlet/LiveTelemetry.svelte';
	import '$lib/gauntlet/viewport/viewport.css';
	import type { RunEvent, TelemetryTargets } from '$lib/gauntlet';

	/**
	 * Dev-only harness for the live in-run analysis (LiveTelemetry). Replays a
	 * synthetic modeling-session event stream (no SolidWorks, no Supabase) so the
	 * live UI can be verified in-browser: the volume gauge fills toward target,
	 * the feature count climbs, the activity feed scrolls, an undo and a rebuild
	 * error land, and the pace crosses par.
	 */
	const targets: TelemetryTargets = {
		targetVolumeMm3: 52000,
		densityGcm3: 2.7,
		targetMassLevel: 140.4, // 52000 mm3 -> 52 cm3 * 2.7 g/cm3
		massUnit: 'g',
		unitSystem: 'MMGS',
		parTime: 90,
		parFeatures: 7
	};

	// Build a realistic stream: features land over time, volume ramps to target,
	// with an undo and a rebuild-with-error partway through.
	function buildStream(): RunEvent[] {
		const ev: RunEvent[] = [];
		let seq = 0;
		let t = 0;
		const push = (type: string, payload: Record<string, unknown> = {}) =>
			ev.push({ seq: seq++, t_ms: t, event_type: type, payload });
		push('run_start');
		const steps = [
			{ vol: 8000, feat: 1, name: 'Boss-Extrude1' },
			{ vol: 21000, feat: 2, name: 'Boss-Extrude2' },
			{ vol: 19500, feat: 3, name: 'Cut-Extrude1', undo: true },
			{ vol: 34000, feat: 3, name: 'Boss-Extrude3' },
			{ vol: 41000, feat: 4, name: 'Fillet1', rebuildErr: true },
			{ vol: 48000, feat: 5, name: 'Chamfer1' },
			{ vol: 51900, feat: 6, name: 'Shell1' }
		];
		for (const s of steps) {
			t += 9000 + Math.round((s.feat % 3) * 1500);
			if (s.undo) push('undo');
			push('feature_add', { entity: 1, name: s.name });
			if (s.rebuildErr) push('rebuild', { error_count: 1, warning_count: 2 });
			else push('rebuild', { error_count: 0, warning_count: 0 });
			push('snapshot', { volume_mm3: s.vol, area_mm2: s.vol / 6, feature_count: s.feat });
		}
		push('run_end', { is_correct: true });
		return ev;
	}

	const all = buildStream();
	let idx = $state(1);
	let playing = $state(true);
	const shown = $derived(all.slice(0, idx));
	const elapsedMs = $derived(shown.length ? shown[shown.length - 1].t_ms : 0);
	const done = $derived(idx >= all.length);

	function reset() {
		idx = 1;
		playing = true;
	}

	onMount(() => {
		const id = setInterval(() => {
			if (playing && idx < all.length) idx += 1;
		}, 650);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Live telemetry harness</title></svelte:head>

<div class="gt-root">
	<div class="harness">
		<h1>Live in-run telemetry harness</h1>
		<p class="note">
			Dev-only replay of a synthetic modeling session. The volume gauge should fill toward target, the
			feature count climb to 6, the activity feed scroll (with an undo and a rebuild error), and pace
			cross par. No SolidWorks or Supabase.
		</p>
		<div class="bar">
			<button type="button" onclick={() => (playing = !playing)}>{playing ? 'Pause' : 'Play'}</button>
			<button type="button" onclick={reset}>Reset</button>
			<span class="state">event {idx} / {all.length}{done ? ' · done' : ''}</span>
		</div>

		<LiveTelemetry events={shown} {targets} {elapsedMs} live={!done} />
	</div>
</div>

<style>
	.harness {
		max-width: 640px;
		margin: 0 auto;
		padding: 2rem 1.5rem;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
	}
	h1 {
		font-family: 'Orbitron', sans-serif;
		font-size: 1.1rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 1rem 0 1.4rem;
	}
	.bar button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--cyan, #00f0ff);
		background: var(--panel-2, #0e161b);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
	}
	.state {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim, #5f8a78);
	}
</style>
