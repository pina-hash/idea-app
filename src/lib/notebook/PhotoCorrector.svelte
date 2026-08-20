<script lang="ts">
	import { onMount } from 'svelte';
	import { correctedFileName } from '$lib/notebook';
	import { decodeImageFile, imageSize, releaseImage } from './camera';
	import {
		autoLevels,
		defaultCorners,
		detectPageCorners,
		solveHomography,
		warpPerspective,
		warpedSize,
		type Quad
	} from './photo-correct';

	/**
	 * The interactive correction step between choosing a photo and uploading
	 * it: the image full-screen with four draggable corner handles (seeded by
	 * best-effort page detection, else sensible defaults), a confirm that
	 * flattens the chosen quadrilateral into a rectangle and auto-levels it,
	 * and an always-visible skip that uploads the original untouched.
	 *
	 * Pure presentation + orchestration: all the math lives in
	 * photo-correct.ts, and the parent owns what happens to the result --
	 * `onDone(enhanced)` hands back the corrected JPEG as a File, or null for
	 * a skip. An image the browser cannot decode (some HEICs off-device)
	 * reports `failed: true` alongside the null so the parent can say why the
	 * step vanished; the photo still uploads as-is.
	 *
	 * Handles are HTML elements (not SVG children) positioned by percentage,
	 * so their hit target stays a constant 44px on screen no matter how far
	 * the image is scaled down -- an SVG-space handle on a 4000px-wide photo
	 * displayed at 350px would render 2px wide. Dragging is plain pointer
	 * events with capture, which is the native path for touch and mouse alike.
	 */

	let {
		file,
		index = 1,
		total = 1,
		onDone
	}: {
		file: File;
		/** 1-based position within the staged batch, for the "Photo N of M" line. */
		index?: number;
		total?: number;
		onDone: (enhanced: File | null, failed?: boolean) => void;
	} = $props();

	/**
	 * Full-res sources above this get downscaled once up front: the warp output
	 * is capped at OUTPUT_MAX anyway, and a 12 MP ImageData is ~48 MB.
	 *
	 * Deliberately only a little above OUTPUT_MAX. The warp still supersamples
	 * (it reads a larger source than it writes), so the extra headroom above
	 * 2000 px buys real sharpness, while the step down from the old 3200 takes
	 * the getImageData allocation this holds from ~30 MB to ~17 MB -- which
	 * matters on the phones this flow is FOR, where that allocation failing is
	 * what put the whole correction step on the floor.
	 */
	const SOURCE_MAX = 2400;
	const OUTPUT_MAX = 2000;
	const DETECT_MAX = 260;

	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let imgW = $state(0);
	let imgH = $state(0);
	let corners = $state<Quad | null>(null);
	/** What Reset restores: the detection result (or the defaults). */
	let seedCorners: Quad | null = null;
	let loading = $state(true);
	let working = $state(false);
	let dragging = $state<number | null>(null);

	onMount(() => {
		// `load` resolves rather than rejects on every failure path (see below),
		// so there is no rejection here to go unhandled.
		void load();
	});

	/**
	 * Prepare the editable canvas, or bow out cleanly.
	 *
	 * EVERY failure has to end in an onDone() call, and that is the whole
	 * shape of this function. It used to guard only the decode, leaving the
	 * canvas sizing, the draw and the getContext unguarded -- and a throw from
	 * any of those escaped into `void load()` as an unhandled rejection while
	 * `loading` stayed true forever, which renders as a dark overlay stuck on
	 * "Opening photo..." with Flatten and Reset both disabled and nothing
	 * staged behind it. That is a real, reproducible phone failure and not a
	 * theoretical one: those operations allocate a canvas up to SOURCE_MAX
	 * square and draw a full-resolution decode into it, so they fail under
	 * exactly the memory pressure a 12 MP capture creates -- while the smaller
	 * images a gallery pick tends to yield sail through the same code.
	 */
	async function load() {
		let bitmap: Awaited<ReturnType<typeof decodeImageFile>> = null;
		try {
			// Honors EXIF orientation (a phone capture is nearly always rotated)
			// and, importantly, cannot hang: an oversized image on a pressured
			// device can leave a decode that never settles at all, so the helper
			// imposes a deadline and reports null instead of waiting forever.
			bitmap = await decodeImageFile(file);
			if (!bitmap || !canvasEl) {
				// Undecodable here (HEIC on a desktop browser), or the decode
				// overran: skip the step, upload as-is, and say why.
				onDone(null, true);
				return;
			}
			const { width: srcW, height: srcH } = imageSize(bitmap);
			if (!srcW || !srcH) {
				onDone(null, true);
				return;
			}
			const scale = Math.min(1, SOURCE_MAX / Math.max(srcW, srcH));
			imgW = Math.max(1, Math.round(srcW * scale));
			imgH = Math.max(1, Math.round(srcH * scale));
			canvasEl.width = imgW;
			canvasEl.height = imgH;
			const ctx = canvasEl.getContext('2d');
			if (!ctx) {
				onDone(null, true);
				return;
			}
			ctx.drawImage(bitmap, 0, 0, imgW, imgH);
			releaseImage(bitmap);
			bitmap = null;

			// Best-effort detection on a small copy; unconfident falls back to
			// near-corner defaults the student can drag from.
			const dScale = Math.min(1, DETECT_MAX / Math.max(imgW, imgH));
			const dw = Math.max(1, Math.round(imgW * dScale));
			const dh = Math.max(1, Math.round(imgH * dScale));
			const small = document.createElement('canvas');
			small.width = dw;
			small.height = dh;
			const sctx = small.getContext('2d');
			let quad: Quad | null = null;
			if (sctx) {
				try {
					sctx.drawImage(canvasEl, 0, 0, dw, dh);
					const found = detectPageCorners(sctx.getImageData(0, 0, dw, dh));
					if (found.confident) {
						quad = found.corners.map((p) => ({
							x: clamp(p.x / dScale, 0, imgW),
							y: clamp(p.y / dScale, 0, imgH)
						})) as Quad;
					}
				} catch {
					// Detection is best-effort by definition; fall through.
				}
			}
			quad ??= defaultCorners(imgW, imgH);
			seedCorners = quad.map((p) => ({ ...p })) as Quad;
			corners = quad;
			loading = false;
		} catch {
			// Correction must never strand the photo: any failure at all
			// degrades to "upload the original as-is", which is what the parent
			// does with a null result.
			onDone(null, true);
		} finally {
			releaseImage(bitmap);
		}
	}

	function clamp(v: number, lo: number, hi: number): number {
		return Math.max(lo, Math.min(hi, v));
	}

	// ---- handle dragging ---------------------------------------------------

	function startDrag(i: number, e: PointerEvent) {
		if (working || loading) return;
		dragging = i;
		try {
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		} catch {
			// Synthetic events (the dev harness's scripted drives) have no
			// active pointer to capture; move/up still arrive by bubbling.
		}
		e.preventDefault();
	}

	function moveDrag(e: PointerEvent) {
		if (dragging === null || !corners || !canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return;
		const x = clamp(((e.clientX - rect.left) / rect.width) * imgW, 0, imgW);
		const y = clamp(((e.clientY - rect.top) / rect.height) * imgH, 0, imgH);
		const next = corners.map((p) => ({ ...p })) as Quad;
		next[dragging] = { x, y };
		corners = next;
	}

	function endDrag() {
		dragging = null;
	}

	function reset() {
		if (seedCorners) corners = seedCorners.map((p) => ({ ...p })) as Quad;
	}

	// ---- confirm / skip ----------------------------------------------------

	async function confirm() {
		if (working || loading || !corners || !canvasEl) return;
		working = true;
		// Let the "Flattening..." state paint before the synchronous warp.
		await new Promise((r) => setTimeout(r, 30));
		try {
			const quad = corners.map((p) => ({ ...p })) as Quad;
			const { width, height } = warpedSize(quad, OUTPUT_MAX);
			const homography = solveHomography(quad, width, height);
			const ctx = canvasEl.getContext('2d');
			if (!homography || !ctx) {
				// Degenerate quad (collinear corners): nothing sane to produce,
				// so behave exactly like a skip.
				onDone(null);
				return;
			}
			const src = ctx.getImageData(0, 0, imgW, imgH);
			const out = warpPerspective(src, homography, width, height);
			autoLevels(out);
			const outCanvas = document.createElement('canvas');
			outCanvas.width = width;
			outCanvas.height = height;
			outCanvas.getContext('2d')?.putImageData(out, 0, 0);
			const blob = await new Promise<Blob | null>((resolve) =>
				outCanvas.toBlob(resolve, 'image/jpeg', 0.92)
			);
			if (!blob) {
				onDone(null);
				return;
			}
			onDone(new File([blob], correctedFileName(file.name), { type: 'image/jpeg' }));
		} catch {
			// Correction must never lose the photo: any failure degrades to
			// "upload the original as-is".
			onDone(null, true);
		} finally {
			working = false;
		}
	}

	function skip() {
		if (working) return;
		onDone(null);
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			skip();
		}
	}

	const polygonPoints = $derived(
		corners ? corners.map((p) => `${p.x},${p.y}`).join(' ') : ''
	);
	const HANDLE_NAMES = ['top left', 'top right', 'bottom right', 'bottom left'];
</script>

<!-- Drag continuation lives on the window so a finger sliding off the stage
     (or off the screen edge) keeps moving the handle instead of dropping it. -->
<svelte:window
	onkeydown={onKeydown}
	onpointermove={moveDrag}
	onpointerup={endDrag}
	onpointercancel={endDrag}
/>

<div class="pc-overlay" role="dialog" aria-modal="true" aria-label="Straighten photo">
	<header class="pc-head">
		<div>
			<span class="pc-title">Straighten this photo</span>
			{#if total > 1}<span class="pc-count">Photo {index} of {total}</span>{/if}
		</div>
		<p class="pc-hint">
			Drag the corners onto the page's corners, then flatten. Skip if the photo is already fine.
		</p>
	</header>

	<div class="pc-stage" data-testid="pc-stage">
		<div class="pc-frame" class:hidden={loading}>
			<canvas bind:this={canvasEl}></canvas>
			{#if corners}
				<svg viewBox="0 0 {imgW} {imgH}" preserveAspectRatio="none" aria-hidden="true">
					<polygon points={polygonPoints} />
				</svg>
				{#each corners as c, i (i)}
					<button
						type="button"
						class="pc-handle"
						class:active={dragging === i}
						data-testid={`pc-handle-${i}`}
						style={`left:${(c.x / imgW) * 100}%; top:${(c.y / imgH) * 100}%;`}
						aria-label={`Move ${HANDLE_NAMES[i]} corner`}
						onpointerdown={(e) => startDrag(i, e)}
					>
						<span></span>
					</button>
				{/each}
			{/if}
		</div>
		{#if loading}
			<p class="pc-status">Opening photo...</p>
		{/if}
	</div>

	<!-- Hidden readout so a scripted harness drive can assert exactly where
	     the warp will sample from. Corners in image pixel space. -->
	<div data-testid="pc-corners" hidden>
		{corners ? JSON.stringify(corners.map((p) => [Math.round(p.x), Math.round(p.y)])) : ''}
	</div>

	<footer class="pc-actions">
		<button type="button" class="btn" data-testid="pc-confirm" onclick={confirm} disabled={loading || working}>
			{working ? 'Flattening...' : 'Flatten and clean up'}
		</button>
		<button type="button" class="btn secondary" data-testid="pc-skip" onclick={skip} disabled={working}>
			Skip, use as-is
		</button>
		<button
			type="button"
			class="pc-reset"
			data-testid="pc-reset"
			onclick={reset}
			disabled={loading || working}
		>
			Reset corners
		</button>
	</footer>
</div>

<style>
	/* The overlay stays a DARK island inside the light notebook room, on
	   purpose: the drag quad and handles must keep their contrast over
	   arbitrary photos, and a light surround would fight the photo itself.
	   Only the CHROME (type, buttons) speaks the editorial voice; the warm
	   near-black ties it to the notebook's ink rather than the app shell. */
	.pc-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: var(--nb-shot-ground);
		padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
	}
	.pc-head {
		flex: none;
		margin-bottom: var(--space-2);
	}
	.pc-head > div {
		display: flex;
		align-items: baseline;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.pc-title {
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
		color: var(--nb-shot-ink);
	}
	.pc-count {
		font-size: 0.76rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-accent);
	}
	.pc-hint {
		margin: var(--space-1) 0 0;
		color: color-mix(in srgb, var(--nb-shot-ink) 62%, transparent);
		font-size: 0.83rem;
	}
	.pc-stage {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		touch-action: none;
	}
	.pc-frame {
		position: relative;
		max-width: 100%;
		max-height: 100%;
		display: flex;
	}
	.pc-frame.hidden {
		visibility: hidden;
	}
	.pc-frame canvas {
		display: block;
		max-width: calc(100vw - 2rem);
		max-height: calc(100vh - 11rem);
		width: auto;
		height: auto;
		border: 1px solid color-mix(in srgb, var(--nb-shot-ink) 16%, transparent);
		background: var(--nb-shot-plate);
	}
	.pc-frame svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.pc-frame svg polygon {
		fill: color-mix(in srgb, var(--green) 12%, transparent);
		stroke: var(--green);
		stroke-width: 2px;
		vector-effect: non-scaling-stroke;
	}
	.pc-handle {
		position: absolute;
		width: 44px;
		height: 44px;
		margin: 0;
		padding: 0;
		transform: translate(-50%, -50%);
		background: none;
		border: none;
		cursor: grab;
		touch-action: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.pc-handle.active {
		cursor: grabbing;
	}
	.pc-handle span {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--green) 25%, var(--nb-shot-plate));
		border: 2px solid var(--green);
		box-shadow: 0 0 8px color-mix(in srgb, var(--green) 60%, transparent);
	}
	.pc-handle.active span {
		background: var(--green);
	}
	.pc-status {
		color: color-mix(in srgb, var(--nb-shot-ink) 62%, transparent);
		font-size: 0.88rem;
	}
	.pc-actions {
		flex: none;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		margin-top: var(--space-3);
	}
	/* Overlay-local button styling: the room's ink-on-paper .btn treatment
	   inverts here (paper button on the dark stage), and these scoped rules
	   deliberately out-rank both the app shell's and the theme file's .btn. */
	.pc-actions .btn {
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-transform: none;
		color: var(--nb-shot-ink-deep);
		background: var(--nb-shot-ink);
		border: 1px solid var(--nb-shot-ink);
		border-radius: var(--radius-card);
		padding: var(--space-3) var(--space-4);
	}
	.pc-actions .btn:hover {
		color: var(--nb-shot-ink-deep);
		background: var(--nb-shot-ink-bright);
		border-color: var(--nb-shot-ink-bright);
		box-shadow: none;
		text-shadow: none;
	}
	.pc-actions .btn:disabled,
	.pc-actions .btn:disabled:hover {
		color: color-mix(in srgb, var(--nb-shot-ink) 45%, transparent);
		background: color-mix(in srgb, var(--nb-shot-ink) 12%, transparent);
		border-color: transparent;
		box-shadow: none;
		opacity: 1;
	}
	.pc-actions .btn.secondary {
		color: var(--nb-shot-ink);
		background: transparent;
		border-color: color-mix(in srgb, var(--nb-shot-ink) 38%, transparent);
	}
	.pc-actions .btn.secondary:hover {
		color: var(--nb-shot-ink-bright);
		background: transparent;
		border-color: var(--nb-shot-ink);
		box-shadow: none;
		text-shadow: none;
	}
	.pc-reset {
		background: none;
		border: none;
		color: color-mix(in srgb, var(--nb-shot-ink) 55%, transparent);
		font-family: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		cursor: pointer;
	}
	.pc-reset:hover:not(:disabled) {
		color: var(--nb-accent);
	}
	.pc-reset:disabled,
	.pc-handle:disabled {
		opacity: 0.5;
	}
</style>
