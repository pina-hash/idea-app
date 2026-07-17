<script lang="ts">
	import type { TrackRuntime } from './track-runtime';

	/**
	 * Top-down rotating SVG minimap for the GREENLINE harness: boundary outlines,
	 * checkpoint gates (next one highlighted), start/finish line, and the
	 * vehicle as a heading triangle. Pure presentation; all geometry comes
	 * from the track runtime, the pose from the physics loop.
	 *
	 * Now rotates dynamically so that the player vehicle's heading is always pointing UP.
	 */
	const {
		runtime,
		pose,
		nextCheckpoint = 0,
		others = []
	}: {
		runtime: TrackRuntime;
		pose: { x: number; z: number; hx: number; hz: number };
		nextCheckpoint?: number;
		/** Non-player vehicles, drawn as smaller amber markers. */
		others?: { x: number; z: number; hx: number; hz: number; out?: boolean }[];
	} = $props();

	const PAD = 12;
	const W = 210;
	const H = 210;

	const view = $derived.by(() => {
		const { minX, maxX, minZ, maxZ } = runtime.bbox;
		const spanX = maxX - minX || 1;
		const spanZ = maxZ - minZ || 1;
		const scale = (W - PAD * 2) / Math.max(spanX, spanZ);
		const cx = (minX + maxX) / 2;
		const cz = (minZ + maxZ) / 2;
		return { scale, cx, cz };
	});

	const mx = (x: number) => 105 + (x - view.cx) * view.scale;
	const my = (z: number) => 105 + (z - view.cz) * view.scale;

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
	const triangle = (p: { x: number; z: number; hx: number; hz: number }, s: number) => {
		const cx = mx(p.x);
		const cy = my(p.z);
		const fx = p.hx;
		const fy = p.hz;
		const px = -fy;
		const py = fx;
		const tip = `${cx + fx * s},${cy + fy * s}`;
		const a = `${cx - fx * s * 0.6 + px * s * 0.55},${cy - fy * s * 0.6 + py * s * 0.55}`;
		const b = `${cx - fx * s * 0.6 - px * s * 0.55},${cy - fy * s * 0.6 - py * s * 0.55}`;
		return `${tip} ${a} ${b}`;
	};

	// Player position & angle calculations for map rotation
	const playerCx = $derived(mx(pose.x));
	const playerCy = $derived(my(pose.z));
	const rotAngle = $derived((Math.atan2(pose.hz, pose.hx) * 180) / Math.PI);
</script>

<svg
	class="gl-minimap"
	width={W}
	height={H}
	viewBox="0 0 {W} {H}"
	aria-label="Track minimap"
>
	<g transform="translate(105, 105) rotate({-rotAngle - 90}) translate({-playerCx}, {-playerCy})">
		<path d={ribbonPath} fill="rgba(147,163,176,0.10)" fill-rule="evenodd" stroke="none" />
		{#each boundaryPaths as d (d)}
			<path {d} fill="none" stroke="rgba(147,163,176,0.4)" stroke-width="1" />
		{/each}
		{#each runtime.checkpoints as g, i (g.gate.id)}
			{@const l = gateLine(g)}
			<line
				x1={l.x1}
				y1={l.y1}
				x2={l.x2}
				y2={l.y2}
				stroke={i === nextCheckpoint ? '#8fffc4' : i < nextCheckpoint ? '#39454f' : '#6b7b88'}
				stroke-width={i === nextCheckpoint ? 2.5 : 1.5}
			/>
		{/each}
		<line x1={sfLine.x1} y1={sfLine.y1} x2={sfLine.x2} y2={sfLine.y2} stroke="#eaf4ff" stroke-width="2.5" />
		{#each others as o, i (i)}
			<polygon
				points={triangle(o, 5)}
				fill={o.out ? '#39454f' : '#eef4f8'}
				stroke="#04060a"
				stroke-width="0.6"
			/>
		{/each}
		<polygon points={triangle(pose, 7)} fill="#2ae57e" stroke="#04060a" stroke-width="0.8" />
	</g>
</svg>

<style>
	.gl-minimap {
		display: block;
		background: rgba(4, 7, 11, 0.78);
		border: 1px solid rgba(147, 163, 176, 0.28);
		border-radius: 2px;
	}
</style>
