<script lang="ts">
	import { onMount } from 'svelte';
	import DrawingViewer from '$lib/gauntlet/DrawingViewer.svelte';
	import RegionEditor from '$lib/gauntlet/RegionEditor.svelte';
	import {
		supportsDocumentPip,
		openPipWindow,
		openDrawingWindow,
		mountPipNode,
		restorePipNode
	} from '$lib/gauntlet/popout';
	import '$lib/gauntlet/viewport/viewport.css';
	import type { FocusRegion } from '$lib/gauntlet';
	import type { FocusRegionInput } from '$lib/gauntlet/authoring';

	/**
	 * Manual verification harness for DrawingViewer (dev-only route). Mounts the
	 * viewer with a bundled high-resolution black-on-white raster (drawn to a
	 * canvas at 2400x1600 so crispness / native-resolution zoom is testable) plus
	 * a couple of focus regions, and a pop-out button that exercises popout.ts.
	 */

	let mode = $state<'raster' | 'svg'>('raster');
	let sampleSrc = $state<string | null>(null);

	// Focus regions as fractions of the drawing (both samples share this layout).
	const regions: FocusRegion[] = [
		{ label: 'Holes', x: 0.1, y: 0.22, w: 0.34, h: 0.34 },
		{ label: 'Title block', x: 0.6, y: 0.82, w: 0.36, h: 0.14 }
	];

	const SAMPLE_SVG = `<svg viewBox="0 0 800 520" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#111" stroke-width="3">
		<rect x="60" y="100" width="380" height="220"/>
		<circle cx="150" cy="210" r="34"/><circle cx="250" cy="210" r="34"/><circle cx="350" cy="210" r="34"/>
		<rect x="480" y="380" width="260" height="100"/>
		<line x1="60" y1="60" x2="440" y2="60" stroke="#111" stroke-width="1.5"/>
		<text x="230" y="48" fill="#111" stroke="none" font-family="monospace" font-size="20">380</text>
		<text x="500" y="440" fill="#111" stroke="none" font-family="monospace" font-size="18">SAMPLE SVG</text>
	</svg>`;

	// Draw a detailed technical-drawing sample to an offscreen canvas and hand back
	// a PNG data URL. High native resolution so zooming to 100% shows real detail
	// (and proves the raster is re-rasterized crisply, never CSS-upscaled).
	function makeRasterSample(): string {
		const W = 2400;
		const H = 1600;
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		const g = c.getContext('2d');
		if (!g) return '';
		g.fillStyle = '#ffffff';
		g.fillRect(0, 0, W, H);
		g.strokeStyle = '#111';
		g.fillStyle = '#111';
		g.lineJoin = 'miter';

		// Sheet border.
		g.lineWidth = 5;
		g.strokeRect(40, 40, W - 80, H - 80);

		// Front-view plate with three holes.
		g.lineWidth = 6;
		g.strokeRect(300, 420, 900, 520);
		g.lineWidth = 6;
		for (const cx of [500, 750, 1000]) {
			g.beginPath();
			g.arc(cx, 680, 78, 0, Math.PI * 2);
			g.stroke();
			g.lineWidth = 2;
			g.beginPath();
			g.moveTo(cx - 110, 680);
			g.lineTo(cx + 110, 680);
			g.moveTo(cx, 570);
			g.lineTo(cx, 790);
			g.stroke();
			g.lineWidth = 6;
		}

		// Dimension line + arrows above the plate.
		g.lineWidth = 2;
		g.beginPath();
		g.moveTo(300, 330);
		g.lineTo(1200, 330);
		g.moveTo(300, 300);
		g.lineTo(300, 420);
		g.moveTo(1200, 300);
		g.lineTo(1200, 420);
		g.stroke();
		g.beginPath();
		g.moveTo(320, 320);
		g.lineTo(300, 330);
		g.lineTo(320, 340);
		g.moveTo(1180, 320);
		g.lineTo(1200, 330);
		g.lineTo(1180, 340);
		g.stroke();
		g.font = '34px monospace';
		g.fillText('900', 720, 315);
		g.font = '30px monospace';
		g.fillText('3X ⌀8 THRU', 560, 1010);

		// Title block, bottom-right.
		g.lineWidth = 4;
		g.strokeRect(1500, 1360, 860, 200);
		g.beginPath();
		g.moveTo(1500, 1420);
		g.lineTo(2360, 1420);
		g.moveTo(1820, 1360);
		g.lineTo(1820, 1560);
		g.stroke();
		g.font = '34px monospace';
		g.fillText('IDEA // GAUNTLET', 1520, 1402);
		g.font = '26px monospace';
		g.fillText('SPEEDRUN SAMPLE', 1520, 1470);
		g.fillText('MATL: 6061-T6', 1520, 1512);
		g.fillText('SCALE 1:1', 1850, 1470);
		g.fillText('SHEET 1/1', 1850, 1512);

		// Fine note (small text; sharp only if truly re-rasterized at zoom).
		g.font = '20px monospace';
		g.fillText('UNLESS NOTED: BREAK SHARP EDGES 0.3, TOL +/- 0.2', 300, 1120);

		return c.toDataURL('image/png');
	}

	// --- Pop-out (mirrors the play page: Document PiP -> window.open -> in-app) ---
	let slotEl = $state<HTMLDivElement | null>(null);
	let hostEl = $state<HTMLDivElement | null>(null);
	let popMode = $state<'none' | 'pip' | 'window' | 'float'>('none');
	let popWin: Window | null = null;

	const content = () => ({
		src: mode === 'raster' ? sampleSrc : null,
		svg: mode === 'svg' ? SAMPLE_SVG : null,
		title: 'Sample drawing'
	});

	async function popOut() {
		if (popMode !== 'none') return;
		if (supportsDocumentPip()) {
			const pip = await openPipWindow(600, 460);
			if (pip && hostEl) {
				mountPipNode(pip, hostEl);
				popWin = pip;
				popMode = 'pip';
				pip.addEventListener('pagehide', bringBack, { once: true });
				return;
			}
		}
		const w = openDrawingWindow(content());
		if (w) {
			popWin = w;
			popMode = 'window';
			return;
		}
		popMode = 'float';
	}

	function bringBack() {
		if (popMode === 'pip' && hostEl && slotEl && hostEl.parentNode !== slotEl) {
			restorePipNode(slotEl, hostEl);
		}
		if (popWin) {
			try {
				popWin.close();
			} catch {
				/* already gone */
			}
		}
		popWin = null;
		popMode = 'none';
	}

	// --- Authoring -> viewing pipeline (the real-drawing failure case) --------
	// A SMALL raster (smaller than the stage, so the old native-resolution zoom
	// cap would lock zoom entirely) whose linework sits in the upper-left of a
	// mostly EMPTY paper (like a real SolidWorks export), shared by RegionEditor
	// and DrawingViewer with two-way-bound regions. Verifies: content (ink) fit,
	// zoom past native, region alignment, and region jumps, without Supabase.
	let sheetSrc = $state<string | null>(null);
	let edRegions = $state<FocusRegionInput[]>([
		{ label: 'FRONT', x: 3, y: 22, w: 57, h: 65 },
		{ label: 'RIGHT', x: 59, y: 8, w: 22, h: 65 }
	]);
	let edSelected = $state(-1);
	const edFractions = $derived<FocusRegion[]>(
		edRegions.map((r) => ({ label: r.label, x: r.x / 100, y: r.y / 100, w: r.w / 100, h: r.h / 100 }))
	);

	function makeSheetSample(): string {
		const W = 800;
		const H = 300;
		const c = document.createElement('canvas');
		c.width = W;
		c.height = H;
		const g = c.getContext('2d');
		if (!g) return '';
		g.fillStyle = '#ffffff';
		g.fillRect(0, 0, W, H);
		g.strokeStyle = '#111';
		g.fillStyle = '#111';

		// Front view: thin bar upper-left, with dim above and callout below.
		g.lineWidth = 2;
		g.strokeRect(30, 110, 430, 30);
		g.lineWidth = 1;
		g.setLineDash([10, 4, 2, 4]);
		g.beginPath();
		g.moveTo(30, 125);
		g.lineTo(460, 125);
		g.stroke();
		g.setLineDash([]);
		g.beginPath();
		g.moveTo(30, 90);
		g.lineTo(460, 90);
		g.moveTo(30, 82);
		g.lineTo(30, 110);
		g.moveTo(460, 82);
		g.lineTo(460, 110);
		g.stroke();
		g.font = '14px monospace';
		g.fillText('6.000', 225, 84);
		g.beginPath();
		g.moveTo(250, 140);
		g.lineTo(300, 240);
		g.stroke();
		g.fillText('2X R.125', 305, 250);

		// Right view: hex in a frame, right of the front view.
		g.lineWidth = 2;
		g.strokeRect(490, 35, 140, 155);
		g.beginPath();
		for (let i = 0; i < 6; i++) {
			const a = (i * Math.PI) / 3;
			const x = 560 + 45 * Math.cos(a);
			const y = 110 + 45 * Math.sin(a);
			if (i === 0) g.moveTo(x, y);
			else g.lineTo(x, y);
		}
		g.closePath();
		g.stroke();
		g.beginPath();
		g.arc(560, 110, 16, 0, Math.PI * 2);
		g.stroke();
		g.font = '13px monospace';
		g.fillText('0.5 HEX', 495, 215);
		// The rest of the paper (right ~20%, bottom ~15%) stays empty on purpose.

		return c.toDataURL('image/png');
	}

	onMount(() => {
		sampleSrc = makeRasterSample();
		sheetSrc = makeSheetSample();

		// Headless verification hooks (?auto=zoom|out|jump): drive the pipeline
		// viewer's controls after mount, so a one-shot --screenshot run captures
		// the post-interaction state.
		const auto = new URLSearchParams(location.search).get('auto');
		if (auto) {
			setTimeout(() => {
				const dv = document.querySelector('.pipeline .dv');
				if (!dv) return;
				const click = (sel: string) => (dv.querySelector(sel) as HTMLElement | null)?.click();
				if (auto === 'zoom') {
					click('[data-act="in"]');
					click('[data-act="in"]');
					click('[data-act="in"]');
				} else if (auto === 'out') {
					click('[data-act="out"]');
					click('[data-act="out"]');
					click('[data-act="out"]');
					click('[data-act="out"]');
				} else if (auto === 'jump') {
					click('[data-act="jump"]');
				}
			}, 900);
		}
	});
</script>

<svelte:head><title>DrawingViewer harness</title></svelte:head>

<div class="gt-root harness">
	<h1>DrawingViewer verification harness</h1>
	<p class="note">
		Dev-only route (404 in production). No login / Supabase. Sample: a
		{mode === 'raster' ? '2400x1600 black-on-white raster (canvas)' : 'inline SVG'} with two focus
		regions. Verify: crispness at zoom, Fit, +/-, drag-pan, pop-out, minimap, and the Jump-to strip.
	</p>

	<div class="bar">
		<button type="button" class:on={mode === 'raster'} onclick={() => (mode = 'raster')}>Raster sample</button>
		<button type="button" class:on={mode === 'svg'} onclick={() => (mode = 'svg')}>SVG sample</button>
		<button type="button" class="pop" onclick={popOut} disabled={popMode !== 'none'}>
			{popMode === 'none' ? 'Pop out' : 'Popped out'}
		</button>
		{#if popMode !== 'none'}<button type="button" onclick={bringBack}>Bring back</button>{/if}
		<span class="state">pop: {popMode}</span>
	</div>

	<div class="frame">
		<div class="slot" bind:this={slotEl}>
			<div class="host" bind:this={hostEl}>
				{#if mode === 'raster'}
					{#if sampleSrc}
						<DrawingViewer src={sampleSrc} {regions} alt="Sample raster drawing" />
					{:else}
						<p class="note">Generating sample...</p>
					{/if}
				{:else}
					<DrawingViewer svg={SAMPLE_SVG} {regions} alt="Sample SVG drawing" />
				{/if}
			</div>
		</div>
		{#if popMode === 'pip' || popMode === 'window'}
			<div class="popped">
				<p class="note">Drawing is in a separate window.</p>
				<button type="button" onclick={bringBack}>Bring it back</button>
			</div>
		{/if}
	</div>

	<h2>Authoring &rarr; viewing pipeline (sheet-like small raster)</h2>
	<p class="note">
		Same 1400x500 image and the same regions in both. The boxes must wrap the SAME features in the
		editor (top) and the student viewer (bottom); zoom must work even though the raster is smaller
		than the stage.
	</p>
	{#if sheetSrc}
		<RegionEditor bind:regions={edRegions} bind:selected={edSelected} src={sheetSrc} />
		<div class="frame pipeline">
			<DrawingViewer src={sheetSrc} regions={edFractions} alt="Sheet-like sample drawing" />
		</div>
	{/if}
</div>

<style>
	.harness {
		max-width: 1100px;
		margin: 0 auto;
		padding: 2rem 1.5rem 4rem;
		color: var(--white, #e8fff0);
		font-family: var(--font-body, 'Rajdhani', sans-serif);
	}
	.harness h1 {
		font-family: var(--font-head, 'Orbitron', sans-serif);
		font-size: 1.2rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.harness h2 {
		font-family: var(--font-head, 'Orbitron', sans-serif);
		font-size: 0.85rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		margin-top: 2.2rem;
	}
	.frame.pipeline {
		margin-top: 0.8rem;
		aspect-ratio: auto;
		height: 460px;
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 1rem 0;
	}
	.bar button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		color: var(--cyan, #00f0ff);
		background: var(--panel-2, #0e161b);
		border: 1px solid var(--line, #16242c);
		border-radius: 6px;
		padding: 0.4rem 0.7rem;
		cursor: pointer;
	}
	.bar button.on {
		border-color: var(--cyan, #00f0ff);
		color: #e8fff0;
	}
	.bar button.pop {
		color: var(--gold, #c8ff00);
		border-color: rgba(200, 255, 0, 0.4);
	}
	.bar button:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.state {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim, #5f8a78);
	}
	/* Mirror the play page's drawing frame: a definite 16/9 box for the viewer. */
	.frame {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: 72vh;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.4));
		border-radius: 4px;
		overflow: hidden;
	}
	.slot,
	.host {
		width: 100%;
		height: 100%;
	}
	.popped {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		text-align: center;
		background: rgba(4, 7, 10, 0.85);
	}
	.popped button {
		font-family: 'Share Tech Mono', monospace;
		color: var(--cyan, #00f0ff);
		background: var(--panel-2, #0e161b);
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.4));
		border-radius: 6px;
		padding: 0.4rem 0.8rem;
		cursor: pointer;
	}
</style>
