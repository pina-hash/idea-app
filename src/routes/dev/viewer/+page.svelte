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
	 * Manual verification harness for DrawingViewer (dev-only route). Primary
	 * fixture: a runtime-generated two-page full-sheet vector PDF (hand-assembled
	 * PDF bytes, letter-landscape, real drawing content) with FRONT / RIGHT focus
	 * regions as normalized page coordinates plus a page-2 SECTION region, driven
	 * through pdf.js exactly like a real drawing. Legacy raster (2400x1600 canvas)
	 * and inline-SVG fixtures remain, plus a pop-out button exercising popout.ts
	 * and a reveal replay for the CRT scan-in.
	 */

	let mode = $state<'pdf' | 'raster' | 'svg'>('pdf');
	let sampleSrc = $state<string | null>(null);
	let pdfSrc = $state<string | null>(null);
	// Remount the viewer to replay the reveal scan-in deterministically.
	let revealKey = $state(0);

	// Focus regions as fractions of the drawing (raster/SVG samples share this).
	const regions: FocusRegion[] = [
		{ label: 'Holes', x: 0.1, y: 0.22, w: 0.34, h: 0.34 },
		{ label: 'Title block', x: 0.6, y: 0.82, w: 0.36, h: 0.14 }
	];

	// PDF fixture regions: normalized coordinates of each PAGE + a page index,
	// matched to where makeSamplePdf draws the views.
	const pdfRegions: FocusRegion[] = [
		{ label: 'FRONT', x: 0.07, y: 0.15, w: 0.44, h: 0.5, page: 0 },
		{ label: 'RIGHT', x: 0.55, y: 0.15, w: 0.24, h: 0.5, page: 0 },
		{ label: 'SECTION A-A', x: 0.28, y: 0.2, w: 0.45, h: 0.48, page: 1 }
	];

	/**
	 * Hand-assemble a small, valid two-page vector PDF (letter landscape,
	 * 792x612pt): sheet borders, a FRONT view with three bezier-circle holes and
	 * a dimension line, a RIGHT view, title blocks, and a hatched SECTION on
	 * page 2. Deterministic ASCII bytes with a correct xref, served as a blob URL
	 * so nothing ships in static/ and production never sees it.
	 */
	function makeSamplePdf(): string {
		const K = 0.5523;
		const n = (v: number) => Math.round(v * 100) / 100;
		const circle = (cx: number, cy: number, r: number) =>
			`${n(cx + r)} ${cy} m ` +
			`${n(cx + r)} ${n(cy + K * r)} ${n(cx + K * r)} ${n(cy + r)} ${cx} ${n(cy + r)} c ` +
			`${n(cx - K * r)} ${n(cy + r)} ${n(cx - r)} ${n(cy + K * r)} ${n(cx - r)} ${cy} c ` +
			`${n(cx - r)} ${n(cy - K * r)} ${n(cx - K * r)} ${n(cy - r)} ${cx} ${n(cy - r)} c ` +
			`${n(cx + K * r)} ${n(cy - r)} ${n(cx + r)} ${n(cy - K * r)} ${n(cx + r)} ${cy} c S\n`;
		const text = (x: number, y: number, size: number, s: string) =>
			`BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET\n`;
		const line = (x1: number, y1: number, x2: number, y2: number) =>
			`${x1} ${y1} m ${x2} ${y2} l S\n`;
		const titleBlock = (sheet: string) =>
			'1.5 w\n500 30 272 80 re S\n' +
			line(500, 80, 772, 80) +
			line(640, 30, 640, 110) +
			text(508, 92, 10, 'IDEA // GAUNTLET') +
			text(508, 56, 8, 'SPEEDRUN SAMPLE PDF') +
			text(648, 92, 8, 'SCALE 1:1') +
			text(648, 56, 8, sheet);

		let c1 = '0 0 0 RG 0 0 0 rg\n2 w\n20 20 752 572 re S\n';
		// FRONT view: plate with three holes, dimension line above, callout below.
		c1 += '1.5 w\n70 250 320 220 re S\n1 w\n';
		c1 += circle(150, 360, 36) + circle(230, 360, 36) + circle(310, 360, 36);
		c1 += '0.75 w\n' + line(70, 500, 390, 500) + line(70, 470, 70, 510) + line(390, 470, 390, 510);
		c1 += text(215, 505, 12, '320');
		c1 += line(250, 250, 300, 225) + text(150, 212, 10, '3X DIA 12 THRU');
		// RIGHT view: framed profile with a slot.
		c1 += '1.5 w\n450 250 160 220 re S\n1 w\n';
		c1 += line(450, 395, 610, 395) + line(450, 325, 610, 325);
		c1 += '500 340 60 40 re S\n';
		c1 += text(475, 212, 10, 'R 8 TYP');
		c1 += titleBlock('SHEET 1/2');
		c1 += text(70, 140, 7, 'UNLESS NOTED: BREAK SHARP EDGES 0.3, TOL +/-0.2');

		let c2 = '0 0 0 RG 0 0 0 rg\n2 w\n20 20 752 572 re S\n';
		// SECTION A-A: hatched cut face (45-degree lines clipped to the face) with a bore.
		c2 += '1.5 w\n250 250 300 200 re S\n';
		c2 += 'q 250 250 300 200 re W n 0.5 w\n';
		for (let i = -5; i < 8; i++) {
			const o = 250 + i * 40;
			c2 += line(o, 250, o + 200, 450);
		}
		c2 += 'Q\n1 w\n' + circle(400, 350, 50);
		c2 += text(330, 215, 12, 'SECTION A-A');
		c2 += titleBlock('SHEET 2/2');

		const objs: Record<number, string> = {
			1: '<< /Type /Catalog /Pages 2 0 R >>',
			2: '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
			3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
			4: `<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`,
			5: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 792 612] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>',
			6: `<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`,
			7: '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'
		};
		let out = '%PDF-1.4\n';
		const offsets: number[] = [0];
		for (let i = 1; i <= 7; i++) {
			offsets[i] = out.length;
			out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
		}
		const xref = out.length;
		out += 'xref\n0 8\n0000000000 65535 f \n';
		for (let i = 1; i <= 7; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
		out += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
		return URL.createObjectURL(new Blob([out], { type: 'application/pdf' }));
	}

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
		src: mode === 'pdf' ? pdfSrc : mode === 'raster' ? sampleSrc : null,
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
		{ label: 'FRONT', x: 3, y: 22, w: 57, h: 65, page: 0 },
		{ label: 'RIGHT', x: 59, y: 8, w: 22, h: 65, page: 0 }
	]);
	let edSelected = $state(-1);
	const edFractions = $derived<FocusRegion[]>(
		edRegions.map((r) => ({
			label: r.label,
			x: r.x / 100,
			y: r.y / 100,
			w: r.w / 100,
			h: r.h / 100,
			page: r.page
		}))
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
		pdfSrc = makeSamplePdf();

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
		Dev-only route (404 in production). No login / Supabase. Primary fixture: a generated two-page
		full-sheet vector PDF (rendered by pdf.js) with FRONT / RIGHT regions on page 1 and a SECTION
		region on page 2, all normalized page coordinates. Verify: fit on reveal, FIT, region chips at
		multiple zooms, pan/zoom overlay lock, seated-in-frame compositing, crisp linework, the CRT
		reveal scan-in (Replay), and reduced-motion fallback. Legacy raster / SVG fixtures below the
		same bar.
	</p>

	<div class="bar">
		<button type="button" class:on={mode === 'pdf'} onclick={() => (mode = 'pdf')}>PDF sample</button>
		<button type="button" class:on={mode === 'raster'} onclick={() => (mode = 'raster')}>Raster sample</button>
		<button type="button" class:on={mode === 'svg'} onclick={() => (mode = 'svg')}>SVG sample</button>
		<button type="button" onclick={() => (revealKey += 1)}>Replay reveal</button>
		<button type="button" class="pop" onclick={popOut} disabled={popMode !== 'none'}>
			{popMode === 'none' ? 'Pop out' : 'Popped out'}
		</button>
		{#if popMode !== 'none'}<button type="button" onclick={bringBack}>Bring back</button>{/if}
		<span class="state">pop: {popMode}</span>
	</div>

	<div class="frame">
		<div class="slot" bind:this={slotEl}>
			<div class="host" bind:this={hostEl}>
				{#key revealKey}
					{#if mode === 'pdf'}
						{#if pdfSrc}
							<DrawingViewer src={pdfSrc} pdf={true} regions={pdfRegions} alt="Sample PDF drawing" reveal />
						{:else}
							<p class="note">Generating sample...</p>
						{/if}
					{:else if mode === 'raster'}
						{#if sampleSrc}
							<DrawingViewer src={sampleSrc} {regions} alt="Sample raster drawing" reveal />
						{:else}
							<p class="note">Generating sample...</p>
						{/if}
					{:else}
						<DrawingViewer svg={SAMPLE_SVG} {regions} alt="Sample SVG drawing" reveal />
					{/if}
				{/key}
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
