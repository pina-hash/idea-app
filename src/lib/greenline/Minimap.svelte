<script lang="ts">
	import type { TrackRuntime } from './track-runtime';

	/**
	 * Top-down SVG minimap for the GREENLINE harness: boundary outlines,
	 * checkpoint gates (next one highlighted), start/finish line, and the
	 * vehicle as a heading triangle. Pure presentation; all geometry comes
	 * from the track runtime, the pose from the physics loop.
	 *
	 * Mapping: world x -> map x, world z -> map -y, so a car turning left on
	 * screen turns left on the map.
	 */
	const {
		runtime,
		pose,
		nextCheckpoint = 0
	}: {
		runtime: TrackRuntime;
		pose: { x: number; z: number; hx: number; hz: number };
		nextCheckpoint?: number;
	} = $props();

	const PAD = 12;
	const W = 210;

	const view = $derived.by(() => {
		const { minX, maxX, minZ, maxZ } = runtime.bbox;
		const spanX = maxX - minX || 1;
		const spanZ = maxZ - minZ || 1;
		const scale = (W - PAD * 2) / spanX;
		const H = Math.round(spanZ * scale + PAD * 2);
		return { minX, maxZ, scale, H };
	});

	const mx = (x: number) => PAD + (x - view.minX) * view.scale;
	const my = (z: number) => PAD + (view.maxZ - z) * view.scale;

	const loopPath = (pts: { x: number; z: number }[]) =>
		pts.map((p, i) => `${i ? 'L' : 'M'}${mx(p.x).toFixed(1)} ${my(p.z).toFixed(1)}`).join('') + 'Z';

	const boundaryPaths = $derived(
		runtime.boundaries.filter((b) => b.closed).map((b) => loopPath(b.points))
	);
	const ribbonPath = $derived(
		loopPath(runtime.leftEdge) + ' ' + loopPath([...runtime.rightEdge].reverse())
	);

	const gateLine = (g: (typeof runtime.checkpoints)[number]) => ({
		x1: mx(g.ax),
		y1: my(g.az),
		x2: mx(g.bx),
		y2: my(g.bz)
	});
	const sfLine = $derived(gateLine(runtime.startFinish));

	// Vehicle triangle from position + heading vector (hx, hz)
	const marker = $derived.by(() => {
		const cx = mx(pose.x);
		const cy = my(pose.z);
		const fx = pose.hx;
		const fy = -pose.hz;
		const s = 7;
		const px = -fy;
		const py = fx;
		const tip = `${cx + fx * s},${cy + fy * s}`;
		const a = `${cx - fx * s * 0.6 + px * s * 0.55},${cy - fy * s * 0.6 + py * s * 0.55}`;
		const b = `${cx - fx * s * 0.6 - px * s * 0.55},${cy - fy * s * 0.6 - py * s * 0.55}`;
		return `${tip} ${a} ${b}`;
	});
</script>

<svg
	class="gl-minimap"
	width={W}
	height={view.H}
	viewBox="0 0 {W} {view.H}"
	aria-label="Track minimap"
>
	<path d={ribbonPath} fill="rgba(0,255,65,0.10)" fill-rule="evenodd" stroke="none" />
	{#each boundaryPaths as d (d)}
		<path {d} fill="none" stroke="rgba(0,255,65,0.45)" stroke-width="1" />
	{/each}
	{#each runtime.checkpoints as g, i (g.gate.id)}
		{@const l = gateLine(g)}
		<line
			x1={l.x1}
			y1={l.y1}
			x2={l.x2}
			y2={l.y2}
			stroke={i === nextCheckpoint ? '#00f0ff' : i < nextCheckpoint ? '#2a5f43' : '#5f8f74'}
			stroke-width={i === nextCheckpoint ? 2.5 : 1.5}
		/>
	{/each}
	<line x1={sfLine.x1} y1={sfLine.y1} x2={sfLine.x2} y2={sfLine.y2} stroke="#c8ff00" stroke-width="2.5" />
	<polygon points={marker} fill="#00ff41" stroke="#052" stroke-width="0.8" />
</svg>

<style>
	.gl-minimap {
		display: block;
		background: rgba(6, 12, 8, 0.82);
		border: 1px solid rgba(0, 255, 65, 0.25);
	}
</style>
