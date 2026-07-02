<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, isCoarsePointer } from './motion';

	/**
	 * VIEWPORT ambient scene: a fixed full-viewport canvas behind all GAUNTLET
	 * content. Receding isometric grid floor (steel, fog fade), a slowly
	 * orbiting wireframe part upper-right (three machined geometries cycle with
	 * a fade for variety: hex boss, stepped flange, L-bracket), an origin triad
	 * bottom-left, gentle mouse parallax (the part moves more than the grid,
	 * which reads as depth), and a center scrim so the scene never fights the
	 * foreground content. Purely decorative: pointer-events none, aria-hidden,
	 * single rAF loop paused when the tab is hidden, one static frame under
	 * reduced motion.
	 */

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const styles = getComputedStyle(canvas);
		const token = (name: string, fallback: string) =>
			styles.getPropertyValue(name).trim() || fallback;
		const VOID = token('--void', '#04070a');
		const LIME = token('--lime', '#c8ff00');
		const AX_X = token('--ax-x', '#ff4d57');
		const AX_Y = token('--ax-y', '#00ff41');
		const AX_Z = token('--ax-z', '#3f8cff');
		// --steel / --green as rgb components for alpha-composed strokes.
		const STEEL_RGB = '59, 110, 143';
		const GREEN_RGB = '0, 255, 65';

		const reduced = prefersReducedMotion();
		const still = reduced; // one static frame, no loop, no parallax

		let W = 0;
		let H = 0;
		let raf = 0;
		// Parallax: target from the mouse, eased actual offset.
		let tx = 0;
		let ty = 0;
		let ox = 0;
		let oy = 0;

		const resize = () => {
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			W = window.innerWidth;
			H = window.innerHeight;
			canvas.width = Math.round(W * dpr);
			canvas.height = Math.round(H * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			if (still) draw(6000);
		};

		const onMouse = (e: MouseEvent) => {
			tx = (e.clientX / W - 0.5) * 2;
			ty = (e.clientY / H - 0.5) * 2;
		};

		/** Project a 3D point (already rotated) with weak perspective. */
		const project = (x: number, y: number, z: number, cx: number, cy: number) => {
			const f = 520;
			const s = f / (f + z);
			return { x: cx + x * s, y: cy + y * s, s, z };
		};

		// -------------------------------------------------------------------
		// Wireframe part library. Unit-space geometry (roughly -1..1), scaled
		// at draw time. `edges` carry a weight so bores/details read fainter;
		// `dots` are the lime vertex indices.
		// -------------------------------------------------------------------
		type V3 = [number, number, number];
		interface PartGeo {
			verts: V3[];
			edges: [number, number, number][]; // [a, b, weight]
			dots: number[];
		}

		const ngon = (n: number, r: number, y: number, out: V3[]): number[] => {
			const idx: number[] = [];
			for (let i = 0; i < n; i++) {
				const a = (i * 2 * Math.PI) / n;
				idx.push(out.length);
				out.push([r * Math.cos(a), y, r * Math.sin(a)]);
			}
			return idx;
		};
		const ring = (
			idx: number[],
			w: number,
			edges: [number, number, number][]
		) => {
			for (let i = 0; i < idx.length; i++) edges.push([idx[i], idx[(i + 1) % idx.length], w]);
		};
		const struts = (
			a: number[],
			b: number[],
			w: number,
			edges: [number, number, number][],
			every = 1
		) => {
			for (let i = 0; i < a.length; i += every) edges.push([a[i], b[i], w]);
		};

		/** Machined hex boss with a center bore (the original part). */
		const hexBoss = (): PartGeo => {
			const verts: V3[] = [];
			const edges: [number, number, number][] = [];
			const top = ngon(6, 1, -0.58, verts);
			const bot = ngon(6, 1, 0.58, verts);
			const boreT = ngon(6, 0.42, -0.58, verts);
			const boreB = ngon(6, 0.42, 0.58, verts);
			ring(top, 1, edges);
			ring(bot, 1, edges);
			struts(top, bot, 1, edges);
			ring(boreT, 0.55, edges);
			ring(boreB, 0.55, edges);
			struts(boreT, boreB, 0.55, edges);
			return { verts, edges, dots: [...top, ...bot] };
		};

		/** Stepped flange: wide disc, narrower shaft, small top bore. */
		const steppedFlange = (): PartGeo => {
			const verts: V3[] = [];
			const edges: [number, number, number][] = [];
			const discB = ngon(12, 1, 0.55, verts);
			const discT = ngon(12, 1, 0.18, verts);
			const shaftB = ngon(10, 0.45, 0.18, verts);
			const shaftT = ngon(10, 0.45, -0.62, verts);
			const bore = ngon(8, 0.2, -0.62, verts);
			ring(discB, 1, edges);
			ring(discT, 1, edges);
			struts(discB, discT, 0.8, edges, 2);
			ring(shaftB, 0.85, edges);
			ring(shaftT, 1, edges);
			struts(shaftB, shaftT, 0.7, edges, 2);
			ring(bore, 0.5, edges);
			return { verts, edges, dots: [...discT, ...shaftT] };
		};

		/** L-bracket: an L profile extruded through z. */
		const lBracket = (): PartGeo => {
			const profile: [number, number][] = [
				[-0.95, 0.7],
				[0.95, 0.7],
				[0.95, 0.25],
				[-0.15, 0.25],
				[-0.15, -0.85],
				[-0.95, -0.85]
			];
			const verts: V3[] = [];
			const edges: [number, number, number][] = [];
			const front: number[] = [];
			const back: number[] = [];
			for (const [x, y] of profile) {
				front.push(verts.length);
				verts.push([x, y, -0.42]);
			}
			for (const [x, y] of profile) {
				back.push(verts.length);
				verts.push([x, y, 0.42]);
			}
			ring(front, 1, edges);
			ring(back, 1, edges);
			struts(front, back, 0.8, edges);
			// Bolt slot on the base plate (a faint rectangle detail).
			const slot: V3[] = [
				[0.25, 0.7, -0.18],
				[0.7, 0.7, -0.18],
				[0.7, 0.7, 0.18],
				[0.25, 0.7, 0.18]
			];
			const slotIdx = slot.map((v) => {
				verts.push(v);
				return verts.length - 1;
			});
			ring(slotIdx, 0.45, edges);
			return { verts, edges, dots: front };
		};

		const PARTS: PartGeo[] = [hexBoss(), steppedFlange(), lBracket()];
		const CYCLE = 26000; // ms per part
		const FADE = 2200; // fade in/out at each end of a cycle
		const easeInOut = (t: number) => t * t * (3 - 2 * t);

		const wirePart = (time: number) => {
			// Which part, and its fade envelope inside this cycle.
			const idx = still ? 0 : Math.floor(time / CYCLE) % PARTS.length;
			const phase = still ? CYCLE / 2 : time % CYCLE;
			const envelope = still
				? 1
				: phase < FADE
					? easeInOut(phase / FADE)
					: phase > CYCLE - FADE
						? easeInOut((CYCLE - phase) / FADE)
						: 1;
			if (envelope <= 0.01) return;
			const part = PARTS[idx];

			// Part parallax is stronger than the grid's: reads as the nearest layer.
			const cx = W * 0.78 + ox * 22;
			const cy = H * 0.24 + oy * 16;
			const r = Math.min(W, H) * 0.115;
			const theta = still ? 0.6 : time * 0.00022;
			const tilt = -0.5;
			const cosT = Math.cos(theta);
			const sinT = Math.sin(theta);
			const cosF = Math.cos(tilt);
			const sinF = Math.sin(tilt);

			const proj = part.verts.map(([px, py, pz]) => {
				const x0 = px * r;
				const y0 = py * r;
				const z0 = pz * r;
				// Rotate around Y (orbit), then around X (viewing tilt).
				const x1 = x0 * cosT + z0 * sinT;
				const z1 = -x0 * sinT + z0 * cosT;
				const y1 = y0 * cosF - z1 * sinF;
				const z2 = y0 * sinF + z1 * cosF;
				return project(x1, y1, z2, cx, cy);
			});

			// Ambient halo behind the part: a pool of light it appears to sit in.
			const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.6);
			halo.addColorStop(0, `rgba(${STEEL_RGB}, ${0.09 * envelope})`);
			halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
			ctx.fillStyle = halo;
			ctx.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6);

			// Depth cue: nearer edges brighter AND wider; far edges thin + faint.
			const depthAlpha = (z: number) => Math.max(0.06, 0.5 - (z / r) * 0.3);
			for (const [a, b, w] of part.edges) {
				const pa = proj[a];
				const pb = proj[b];
				const zAvg = (pa.z + pb.z) / 2;
				const alpha = depthAlpha(zAvg) * w * envelope;
				const near = 1 - Math.min(1, Math.max(0, (zAvg / r + 1) / 2)); // 1 near, 0 far
				// Two-pass stroke: a wide faint pass reads as glow without shadowBlur.
				ctx.strokeStyle = `rgba(${GREEN_RGB}, ${alpha * 0.14})`;
				ctx.lineWidth = 3 + near * 2;
				ctx.beginPath();
				ctx.moveTo(pa.x, pa.y);
				ctx.lineTo(pb.x, pb.y);
				ctx.stroke();
				ctx.strokeStyle = `rgba(${GREEN_RGB}, ${alpha})`;
				ctx.lineWidth = 0.8 + near * 0.8;
				ctx.beginPath();
				ctx.moveTo(pa.x, pa.y);
				ctx.lineTo(pb.x, pb.y);
				ctx.stroke();
			}
			// Lime vertices, brighter toward the viewer.
			for (const di of part.dots) {
				const p = proj[di];
				ctx.fillStyle = LIME;
				ctx.globalAlpha = Math.max(0.1, (0.7 - (p.z / r) * 0.4) * envelope);
				ctx.beginPath();
				ctx.arc(p.x, p.y, 1.6 + (1 - p.z / r) * 0.5, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;
		};

		const gridFloor = (time: number) => {
			const horizon = H * 0.42 + oy * 6;
			const vpx = W / 2 + ox * 26;
			// Ambient steel light pooling at the horizon.
			const glow = ctx.createRadialGradient(vpx, horizon, 0, vpx, horizon, W * 0.55);
			glow.addColorStop(0, `rgba(${STEEL_RGB}, 0.10)`);
			glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
			ctx.fillStyle = glow;
			ctx.fillRect(0, 0, W, H);

			// Transverse lines, drifting slowly toward the viewer.
			const drift = still ? 0 : (time * 0.00006) % (1 / 14);
			for (let i = 0; i <= 14; i++) {
				const t = i / 14 + drift;
				if (t > 1.02) continue;
				const y = horizon + (H - horizon) * Math.pow(t, 2.4);
				const alpha = 0.04 + 0.22 * t; // fog fade near the horizon
				ctx.strokeStyle = `rgba(${STEEL_RGB}, ${alpha})`;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(0, y);
				ctx.lineTo(W, y);
				ctx.stroke();
			}
			// Radial lines fanning from the vanishing point.
			for (let k = -10; k <= 10; k++) {
				const xb = W / 2 + k * (W / 8);
				const grad = ctx.createLinearGradient(vpx, horizon, xb, H);
				grad.addColorStop(0, `rgba(${STEEL_RGB}, 0)`);
				grad.addColorStop(1, `rgba(${STEEL_RGB}, 0.22)`);
				ctx.strokeStyle = grad;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.moveTo(vpx, horizon);
				ctx.lineTo(xb, H);
				ctx.stroke();
			}
		};

		const originTriad = () => {
			const bx = 74 + ox * 4;
			const by = H - 78 + oy * 4;
			ctx.lineWidth = 1.6;
			ctx.font = '10px "Share Tech Mono", monospace';
			const axis = (dx: number, dy: number, color: string, label: string) => {
				ctx.strokeStyle = color;
				ctx.fillStyle = color;
				ctx.globalAlpha = 0.85;
				ctx.beginPath();
				ctx.moveTo(bx, by);
				ctx.lineTo(bx + dx, by + dy);
				ctx.stroke();
				ctx.fillText(label, bx + dx * 1.28 - 3, by + dy * 1.28 + 3);
				ctx.globalAlpha = 1;
			};
			axis(40, 15, AX_X, 'X');
			axis(0, -44, AX_Y, 'Y');
			axis(-30, 18, AX_Z, 'Z');
			ctx.fillStyle = `rgba(${GREEN_RGB}, 0.9)`;
			ctx.beginPath();
			ctx.arc(bx, by, 2.4, 0, Math.PI * 2);
			ctx.fill();
		};

		/**
		 * Content scrim: quiet the scene where the page column sits so the
		 * background never competes with foreground text. Painted into the
		 * canvas itself (behind the CSS vignette), centered on the content.
		 */
		const contentScrim = () => {
			const grad = ctx.createRadialGradient(
				W * 0.5,
				H * 0.58,
				0,
				W * 0.5,
				H * 0.58,
				Math.max(W, H) * 0.55
			);
			grad.addColorStop(0, 'rgba(4, 7, 10, 0.5)');
			grad.addColorStop(1, 'rgba(4, 7, 10, 0)');
			ctx.fillStyle = grad;
			ctx.fillRect(0, 0, W, H);
		};

		const draw = (time: number) => {
			ctx.fillStyle = VOID;
			ctx.fillRect(0, 0, W, H);
			gridFloor(time);
			wirePart(time);
			contentScrim();
			originTriad();
		};

		const loop = (time: number) => {
			ox += (tx - ox) * 0.04;
			oy += (ty - oy) * 0.04;
			draw(time);
			raf = requestAnimationFrame(loop);
		};

		const onVisibility = () => {
			if (still) return;
			if (document.hidden) {
				cancelAnimationFrame(raf);
				raf = 0;
			} else if (!raf) {
				raf = requestAnimationFrame(loop);
			}
		};

		resize();
		window.addEventListener('resize', resize);
		if (!still) {
			if (!isCoarsePointer()) window.addEventListener('mousemove', onMouse);
			document.addEventListener('visibilitychange', onVisibility);
			raf = requestAnimationFrame(loop);
		}

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', onMouse);
			document.removeEventListener('visibilitychange', onVisibility);
		};
	});
</script>

<canvas class="gt-viewport-bg" bind:this={canvas} aria-hidden="true"></canvas>

<style>
	.gt-viewport-bg {
		position: fixed;
		inset: 0;
		z-index: 0;
		width: 100vw;
		height: 100vh;
		pointer-events: none;
	}
</style>
