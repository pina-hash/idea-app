<script lang="ts">
	import { onMount } from 'svelte';
	import type { CompiledTrack } from './pieces';

	/**
	 * The track builder's primary 2D top-down view: the compiled corridor drawn
	 * piece by piece across EVERY lane (main line plus any branch spurs), with
	 * centerlines, boundaries, gates, zone triggers, spawn, joints, and
	 * travel-direction arrows. World meters ARE the SVG units (+x right, +z
	 * down, matching the schema's top-down convention), so pan/zoom is just the
	 * viewBox moving.
	 *
	 * Corridor edges come from the REAL runtime's per-path `leftEdge`/
	 * `rightEdge` projections (the exact x/z shadow of the 3D sweep), so what
	 * this view shows is what `buildRuntime` built, not a second edge
	 * computation. Lane index and `runtime.paths` index are the same number by
	 * construction, which is what lets a piece on a branch find its own edges.
	 */
	const {
		compiled,
		selected = null,
		onselect
	}: {
		compiled: CompiledTrack;
		selected?: number | null;
		onselect?: (pieceIdx: number | null) => void;
	} = $props();

	let stageEl: SVGSVGElement | undefined = $state();
	let wrapW = $state(800);
	let wrapH = $state(520);

	let view = $state<{ cx: number; cz: number; w: number } | null>(null);
	let userMoved = $state(false);

	const fitView = () => {
		const b = compiled.bbox;
		const spanX = Math.max(40, b.maxX - b.minX);
		const spanZ = Math.max(40, b.maxZ - b.minZ);
		const aspect = wrapW / Math.max(1, wrapH);
		const w = Math.max(spanX, spanZ * aspect) * 1.28 + 40;
		return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w };
	};
	$effect(() => {
		void compiled;
		void wrapW;
		void wrapH;
		if (!userMoved) view = fitView();
	});

	const vw = $derived(view?.w ?? 400);
	const vh = $derived(vw * (wrapH / Math.max(1, wrapW)));
	const viewBox = $derived(
		view ? `${view.cx - vw / 2} ${view.cz - vh / 2} ${vw} ${vh}` : '0 0 100 100'
	);
	/** Text/marker sizing in world units, so labels stay readable at any zoom. */
	const u = $derived(vw / 100);

	const rt = $derived(compiled.runtime);

	/** Lane-local sample indices a piece's polygon covers (wrap joint included). */
	const rangeSeq = (ri: number): number[] => {
		const r = compiled.ranges[ri];
		const lane = compiled.lanes[r.lane];
		const seq: number[] = [];
		for (let i = r.start; i <= r.end; i++) seq.push(i);
		// The closing wrap segment belongs to the last piece of a closed lane.
		if (lane?.closed && r.end === lane.samples.length - 1) seq.push(0);
		return seq;
	};

	interface PiecePoly {
		idx: number;
		lane: number;
		d: string;
		pts: { x: number; z: number }[];
	}
	const piecePolys = $derived.by((): PiecePoly[] => {
		if (!rt) return [];
		const out: PiecePoly[] = [];
		compiled.ranges.forEach((r, ri) => {
			const path = rt.paths[r.lane];
			const lane = compiled.lanes[r.lane];
			if (!path || !lane || path.leftEdge.length !== lane.samples.length) return;
			const seq = rangeSeq(ri);
			if (seq.length < 2) return;
			const pts = [
				...seq.map((i) => path.leftEdge[i]),
				...seq.map((i) => path.rightEdge[i]).reverse()
			];
			out.push({
				idx: ri,
				lane: r.lane,
				d: pts.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join('') + 'Z',
				pts
			});
		});
		return out;
	});

	const centerPaths = $derived(
		compiled.lanes.map((L) => ({
			isMain: L.isMain,
			d:
				L.samples.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join('') +
				(L.closed ? 'Z' : '')
		}))
	);

	const boundaryPaths = $derived(
		(compiled.track?.boundaries ?? []).map((b) => ({
			island: b.id !== 'outer' && b.id !== 'infield',
			d:
				b.points.map((p, k) => `${k ? 'L' : 'M'}${p.x.toFixed(2)} ${p.z.toFixed(2)}`).join('') +
				(b.closed ? 'Z' : '')
		}))
	);

	const gateLines = $derived.by(() => {
		if (!rt)
			return {
				sf: null as null | { x1: number; y1: number; x2: number; y2: number },
				cps: [] as { x1: number; y1: number; x2: number; y2: number; group?: string }[]
			};
		const line = (g: { ax: number; az: number; bx: number; bz: number }) => ({
			x1: g.ax,
			y1: g.az,
			x2: g.bx,
			y2: g.bz
		});
		return {
			sf: line(rt.startFinish),
			cps: rt.checkpoints.map((g) => ({ ...line(g), group: g.gate.group }))
		};
	});

	const zoneCircles = $derived(
		compiled.zones.flatMap((z) =>
			z.circles.map((c) => ({ kind: z.spec.kind, x: c.x, z: c.z, r: c.radius }))
		)
	);
	const ZONE_FILL: Record<string, string> = {
		boost: 'rgba(42,229,126,0.22)',
		hazard: 'rgba(160,110,255,0.24)',
		pit: 'rgba(255,176,46,0.22)'
	};
	const ZONE_STROKE: Record<string, string> = {
		boost: '#2ae57e',
		hazard: '#a06eff',
		pit: '#ffb02e'
	};

	/** Joint markers: each piece's entry point on its own lane. */
	const joints = $derived(
		compiled.ranges.map((r, ri) => {
			const s = compiled.lanes[r.lane]?.samples[r.start];
			return { ri, x: s?.x ?? 0, z: s?.z ?? 0, elev: s?.elev ?? 0 };
		})
	);

	/** One travel-direction arrow + index label per piece, at its midpoint. */
	const midMarks = $derived(
		compiled.ranges.map((r, ri) => {
			const L = compiled.lanes[r.lane];
			const n = L?.samples.length ?? 0;
			const i = Math.round((r.start + r.end) / 2);
			const s = L?.samples[i];
			if (!s) return { ri, x: 0, z: 0, tx: 1, tz: 0 };
			const a = L.samples[Math.max(0, i - 1)];
			const b = L.samples[Math.min(n - 1, i + 1)];
			const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
			return { ri, x: s.x, z: s.z, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
		})
	);

	const spawn = $derived(compiled.track?.spawn ?? null);

	const arrowPts = (m: { x: number; z: number; tx: number; tz: number }, s: number) => {
		const px = -m.tz;
		const pz = m.tx;
		return `${m.x + m.tx * s},${m.z + m.tz * s} ${m.x - m.tx * s * 0.7 + px * s * 0.62},${m.z - m.tz * s * 0.7 + pz * s * 0.62} ${m.x - m.tx * s * 0.7 - px * s * 0.62},${m.z - m.tz * s * 0.7 - pz * s * 0.62}`;
	};

	/* --- interaction: wheel zoom (cursor-anchored), drag pan, click select --- */

	const worldFromEvent = (e: { clientX: number; clientY: number }) => {
		if (!stageEl || !view) return { x: 0, z: 0 };
		const rect = stageEl.getBoundingClientRect();
		return {
			x: view.cx - vw / 2 + ((e.clientX - rect.left) / Math.max(1, rect.width)) * vw,
			z: view.cz - vh / 2 + ((e.clientY - rect.top) / Math.max(1, rect.height)) * vh
		};
	};

	const pointInPoly = (pts: { x: number; z: number }[], x: number, z: number) => {
		let inside = false;
		for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
			const a = pts[i];
			const b = pts[j];
			if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
		}
		return inside;
	};

	let drag: { x: number; y: number; moved: boolean } | null = null;

	onMount(() => {
		const el = stageEl;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (!view) return;
			const anchor = worldFromEvent(e);
			const f = e.deltaY > 0 ? 1.18 : 1 / 1.18;
			const w = Math.min(6000, Math.max(24, view.w * f));
			const scale = w / view.w;
			view = {
				w,
				cx: anchor.x + (view.cx - anchor.x) * scale,
				cz: anchor.z + (view.cz - anchor.z) * scale
			};
			userMoved = true;
		};
		const onDown = (e: PointerEvent) => {
			drag = { x: e.clientX, y: e.clientY, moved: false };
			el.setPointerCapture(e.pointerId);
		};
		const onMove = (e: PointerEvent) => {
			if (!drag || !view || !stageEl) return;
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			if (!drag.moved && Math.hypot(dx, dy) < 4) return;
			drag.moved = true;
			userMoved = true;
			const rect = stageEl.getBoundingClientRect();
			view = {
				w: view.w,
				cx: view.cx - (dx / Math.max(1, rect.width)) * vw,
				cz: view.cz - (dy / Math.max(1, rect.height)) * vh
			};
			drag.x = e.clientX;
			drag.y = e.clientY;
		};
		const onUp = (e: PointerEvent) => {
			const wasDrag = drag?.moved;
			drag = null;
			if (wasDrag) return;
			const w = worldFromEvent(e);
			let hit: number | null = null;
			// Later pieces win, and branch lanes beat the main line, so a spur
			// drawn over the corridor is still selectable.
			for (const poly of piecePolys) if (pointInPoly(poly.pts, w.x, w.z)) hit = poly.idx;
			onselect?.(hit);
		};
		const onDbl = () => {
			userMoved = false;
			view = fitView();
		};
		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('dblclick', onDbl);
		return () => {
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('dblclick', onDbl);
		};
	});
</script>

<div class="b2d-wrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
	<svg bind:this={stageEl} class="b2d" {viewBox} preserveAspectRatio="xMidYMid meet">
		<!-- boundaries; islands read brighter, they are what keeps routes apart -->
		{#each boundaryPaths as b, i (i)}
			<path
				d={b.d}
				fill="none"
				stroke={b.island ? 'rgba(255,176,46,0.42)' : 'rgba(147,163,176,0.30)'}
				stroke-dasharray="{u * 1.2} {u * 0.9}"
				stroke-width={u * (b.island ? 0.26 : 0.22)}
			/>
		{/each}

		<!-- corridor, piece by piece, across every lane -->
		{#each piecePolys as poly (poly.idx)}
			<path
				d={poly.d}
				fill={selected === poly.idx
					? 'rgba(42,229,126,0.26)'
					: poly.lane > 0
						? 'rgba(143,212,255,0.14)'
						: 'rgba(147,163,176,0.14)'}
				stroke={selected === poly.idx
					? '#2ae57e'
					: poly.lane > 0
						? 'rgba(143,212,255,0.5)'
						: 'rgba(147,163,176,0.45)'}
				stroke-width={selected === poly.idx ? u * 0.34 : u * 0.16}
			/>
		{/each}

		<!-- zone triggers -->
		{#each zoneCircles as z, i (i)}
			<circle
				cx={z.x}
				cy={z.z}
				r={z.r}
				fill={ZONE_FILL[z.kind]}
				stroke={ZONE_STROKE[z.kind]}
				stroke-width={u * 0.16}
			/>
		{/each}

		<!-- centerlines -->
		{#each centerPaths as cp, i (i)}
			<path
				d={cp.d}
				fill="none"
				stroke={cp.isMain ? 'rgba(234,244,255,0.30)' : 'rgba(143,212,255,0.4)'}
				stroke-dasharray="{u * 0.9} {u * 0.9}"
				stroke-width={u * 0.14}
			/>
		{/each}

		<!-- gates: grouped alternatives dashed, so a split reads at a glance -->
		{#each gateLines.cps as l, i (i)}
			<line
				x1={l.x1}
				y1={l.y1}
				x2={l.x2}
				y2={l.y2}
				stroke={l.group ? '#ffb02e' : '#22d3ee'}
				stroke-dasharray={l.group ? `${u * 0.5} ${u * 0.4}` : `${u * 0.7} ${u * 0.5}`}
				stroke-width={u * 0.3}
			/>
		{/each}
		{#if gateLines.sf}
			<line
				x1={gateLines.sf.x1}
				y1={gateLines.sf.y1}
				x2={gateLines.sf.x2}
				y2={gateLines.sf.y2}
				stroke="#eaf4ff"
				stroke-width={u * 0.4}
			/>
		{/if}

		<!-- spawn -->
		{#if spawn}
			{@const r = (spawn.headingDeg * Math.PI) / 180}
			<polygon
				points={arrowPts({ x: spawn.x, z: spawn.z, tx: Math.cos(r), tz: -Math.sin(r) }, u * 1.5)}
				fill="#2ae57e"
				stroke="#04060a"
				stroke-width={u * 0.12}
			/>
		{/if}

		<!-- joints + piece labels + direction arrows -->
		{#each joints as j (j.ri)}
			<circle cx={j.x} cy={j.z} r={u * 0.55} fill="#8fa3b0" stroke="#04060a" stroke-width={u * 0.1} />
			{#if Math.abs(j.elev) > 0.3}
				<text x={j.x + u * 0.9} y={j.z - u * 0.7} font-size={u * 1.7} fill="#8fd4ff"
					>{j.elev > 0 ? '+' : ''}{j.elev.toFixed(1)}</text
				>
			{/if}
		{/each}
		{#each midMarks as m (m.ri)}
			<polygon points={arrowPts(m, u * 0.9)} fill="rgba(234,244,255,0.5)" />
			<text
				x={m.x + u * 1.2}
				y={m.z + u * 2.4}
				font-size={u * 2.1}
				fill={selected === m.ri ? '#2ae57e' : '#6b7b88'}>{m.ri}</text
			>
		{/each}
	</svg>

	<div class="b2d-hud">
		<button
			class="b2d-btn"
			onclick={() => {
				userMoved = false;
				view = fitView();
			}}>FIT</button
		>
		<span class="b2d-note">drag pan · wheel zoom · click piece · dbl-click refit</span>
	</div>
</div>

<style>
	.b2d-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 18rem;
		background:
			radial-gradient(120% 90% at 50% 0%, rgba(120, 165, 205, 0.05), transparent 60%),
			#04060a;
		border: 1px solid rgba(147, 163, 176, 0.28);
		overflow: hidden;
	}
	.b2d {
		display: block;
		width: 100%;
		height: 100%;
		cursor: grab;
		touch-action: none;
	}
	.b2d:active {
		cursor: grabbing;
	}
	.b2d text {
		font-family: 'Share Tech Mono', monospace;
		user-select: none;
	}
	.b2d-hud {
		position: absolute;
		left: 0.5rem;
		bottom: 0.5rem;
		display: flex;
		gap: 0.6rem;
		align-items: center;
		pointer-events: none;
	}
	.b2d-btn {
		pointer-events: auto;
		background: rgba(4, 7, 11, 0.85);
		border: 1px solid rgba(147, 163, 176, 0.4);
		color: #8fffc4;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.12em;
		padding: 0.25rem 0.6rem;
		cursor: pointer;
	}
	.b2d-btn:hover {
		border-color: #2ae57e;
	}
	.b2d-note {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		letter-spacing: 0.06em;
		color: rgba(143, 163, 176, 0.6);
	}
</style>
