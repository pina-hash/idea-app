<script lang="ts">
	import { onMount } from 'svelte';
	import DrawingViewer from '$lib/gauntlet/DrawingViewer.svelte';
	import { supportsDocumentPip, openPipWindow, openDrawingWindow } from '$lib/gauntlet/popout';
	import '$lib/gauntlet/viewport/viewport.css';
	import type { FocusRegion } from '$lib/gauntlet';

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
				pip.document.body.appendChild(hostEl);
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
			slotEl.appendChild(hostEl);
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

	onMount(() => {
		sampleSrc = makeRasterSample();
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
