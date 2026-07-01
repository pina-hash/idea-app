<script lang="ts">
	import { onMount } from 'svelte';
	import { prefersReducedMotion, isCoarsePointer } from './motion';

	/**
	 * VIEWPORT ambient scene: a fixed full-viewport canvas behind all GAUNTLET
	 * content. Receding isometric grid floor (steel, fog fade), a slowly
	 * orbiting wireframe hex-prism upper-right, an origin triad bottom-left,
	 * and a gentle parallax ease toward the mouse. Purely decorative:
	 * pointer-events none, aria-hidden, single rAF loop paused when the tab is
	 * hidden, one static frame under reduced motion.
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
		// --steel as rgb components for alpha-composed strokes.
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

		const hexPrism = (time: number) => {
			const cx = W * 0.78 + ox * 10;
			const cy = H * 0.24 + oy * 8;
			const r = Math.min(W, H) * 0.105;
			const h = r * 1.15;
			const theta = still ? 0.6 : time * 0.00022;
			const tilt = -0.5;
			const cosT = Math.cos(theta);
			const sinT = Math.sin(theta);
			const cosF = Math.cos(tilt);
			const sinF = Math.sin(tilt);
			const pts: { x: number; y: number; z: number }[][] = [[], []];
			for (let ring = 0; ring < 2; ring++) {
				const y0 = ring === 0 ? -h / 2 : h / 2;
				for (let i = 0; i < 6; i++) {
					const a = (i * Math.PI) / 3;
					const x0 = r * Math.cos(a);
					const z0 = r * Math.sin(a);
					// Rotate around Y (orbit), then around X (viewing tilt).
					const x1 = x0 * cosT + z0 * sinT;
					const z1 = -x0 * sinT + z0 * cosT;
					const y1 = y0 * cosF - z1 * sinF;
					const z2 = y0 * sinF + z1 * cosF;
					pts[ring].push({ x: x1, y: y1, z: z2 });
				}
			}
			const proj = pts.map((ring) => ring.map((p) => project(p.x, p.y, p.z, cx, cy)));

			const edge = (a: { x: number; y: number }, b: { x: number; y: number }, alpha: number) => {
				// Two-pass stroke: a wide faint pass reads as glow without shadowBlur.
				ctx.strokeStyle = `rgba(${GREEN_RGB}, ${alpha * 0.14})`;
				ctx.lineWidth = 4;
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
				ctx.strokeStyle = `rgba(${GREEN_RGB}, ${alpha})`;
				ctx.lineWidth = 1.2;
				ctx.beginPath();
				ctx.moveTo(a.x, a.y);
				ctx.lineTo(b.x, b.y);
				ctx.stroke();
			};
			const depthAlpha = (z: number) => 0.5 - (z / r) * 0.28;

			for (let i = 0; i < 6; i++) {
				const j = (i + 1) % 6;
				edge(proj[0][i], proj[0][j], depthAlpha((proj[0][i].z + proj[0][j].z) / 2));
				edge(proj[1][i], proj[1][j], depthAlpha((proj[1][i].z + proj[1][j].z) / 2));
				edge(proj[0][i], proj[1][i], depthAlpha(proj[0][i].z));
			}
			// Lime vertices, brighter toward the viewer.
			for (const ring of proj) {
				for (const p of ring) {
					ctx.fillStyle = LIME;
					ctx.globalAlpha = Math.max(0.15, 0.75 - (p.z / r) * 0.4);
					ctx.beginPath();
					ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
					ctx.fill();
				}
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

		const draw = (time: number) => {
			ctx.fillStyle = VOID;
			ctx.fillRect(0, 0, W, H);
			gridFloor(time);
			hexPrism(time);
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
