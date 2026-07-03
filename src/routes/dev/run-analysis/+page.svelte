<script lang="ts">
	import PostRunAnalysis from '$lib/gauntlet/PostRunAnalysis.svelte';
	import '$lib/gauntlet/viewport/viewport.css';
	import type { RunEvent, TelemetryTargets } from '$lib/gauntlet';

	/**
	 * Dev-only harness for the post-run critical analysis (PostRunAnalysis). Loads
	 * a saved sample run (a full synthetic event stream) plus sample self-history
	 * and class medians, so every chart and coaching callout can be verified
	 * in-browser without SolidWorks or Supabase.
	 */
	const targets: TelemetryTargets = {
		targetVolumeMm3: 52000,
		densityGcm3: 2.7,
		targetMassLevel: 140.4,
		massUnit: 'g',
		unitSystem: 'MMGS',
		parTime: 90,
		parFeatures: 5
	};

	function sample(): RunEvent[] {
		const ev: RunEvent[] = [];
		let seq = 0;
		let t = 0;
		const push = (dt: number, type: string, payload: Record<string, unknown> = {}) => {
			t += dt;
			ev.push({ seq: seq++, t_ms: t, event_type: type, payload });
		};
		push(0, 'run_start');
		push(500, 'integrity', { kind: 'file_created', utc: '2026-07-02T20:00:00Z' });
		// Feature 1
		push(6000, 'command', { id: 101, reason: 1 });
		push(500, 'feature_add', { entity: 1, name: 'Boss-Extrude1' });
		push(300, 'rebuild', { error_count: 0, warning_count: 0 });
		push(4000, 'snapshot', { volume_mm3: 12000, area_mm2: 3000, feature_count: 1 });
		// Feature 2 (long dwell = stuck point)
		push(22000, 'command', { id: 102 });
		push(500, 'undo');
		push(2000, 'command', { id: 102 });
		push(500, 'feature_add', { entity: 1, name: 'Cut-Extrude1' });
		push(300, 'rebuild', { error_count: 1, warning_count: 1 });
		push(3000, 'snapshot', { volume_mm3: 9000, area_mm2: 4200, feature_count: 2 });
		// Feature 3
		push(8000, 'command', { id: 101 });
		push(500, 'feature_add', { entity: 1, name: 'Boss-Extrude2' });
		push(4000, 'snapshot', { volume_mm3: 33000, area_mm2: 5200, feature_count: 3 });
		// Feature 4
		push(7000, 'redo');
		push(1000, 'feature_add', { entity: 1, name: 'Fillet1' });
		push(3000, 'snapshot', { volume_mm3: 46000, area_mm2: 6000, feature_count: 4 });
		// Feature 5 -> hit target
		push(9000, 'feature_add', { entity: 1, name: 'Shell1' });
		push(3000, 'snapshot', { volume_mm3: 51950, area_mm2: 6400, feature_count: 5 });
		push(1000, 'run_end', { is_correct: true });
		return ev;
	}

	const events = sample();
	const selfHistory = [
		{ created_at: '2026-06-28T10:00:00Z', elapsed_ms: 142000, result: 'passed' },
		{ created_at: '2026-06-25T10:00:00Z', elapsed_ms: 168000, result: 'failed' },
		{ created_at: '2026-06-20T10:00:00Z', elapsed_ms: 190000, result: 'passed' }
	];
	const classStats = { medianElapsedMs: 120000, medianFeatures: 5, medianStuckMs: 18000 };
</script>

<svelte:head><title>Post-run analysis harness</title></svelte:head>

<div class="gt-root">
	<div class="harness">
		<h1>Post-run critical analysis harness</h1>
		<p class="note">
			Dev-only. A saved sample run drives every chart and callout: volume-over-time converging to
			target, time-per-feature with the stuck point (Cut-Extrude1) highlighted, command usage,
			vs-class and learning-curve comparisons, integrity, and coaching callouts. No SolidWorks or
			Supabase.
		</p>
		<PostRunAnalysis {events} {targets} {selfHistory} {classStats} />
	</div>
</div>

<style>
	.harness {
		max-width: 760px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
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
		margin-bottom: 1.2rem;
	}
</style>
