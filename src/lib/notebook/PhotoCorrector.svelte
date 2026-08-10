<script lang="ts">
	import { onMount } from 'svelte';
	import { correctedFileName } from '$lib/notebook';
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

	/** Full-res sources above this get downscaled once up front: the warp
	 * output is capped at 2000px anyway, and a 12 MP ImageData is ~48 MB. */
	const SOURCE_MAX = 3200;
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
		void load();
	});

	async function load() {
		let bitmap: ImageBitmap | HTMLImageElement | null = null;
		try {
			// 'from-image' honors EXIF orientation where supported, so a
			// portrait phone shot is corrected upright, not sideways.
			bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		} catch {
			bitmap = await decodeViaImg(file);
		}
		if (!bitmap || !canvasEl) {
			// Not decodable here (e.g. HEIC on a desktop browser): skip the
			// step, upload as-is, and tell the parent why.
			onDone(null, true);
			return;
		}
		const scale = Math.min(1, SOURCE_MAX / Math.max(bitmap.width, bitmap.height));
		imgW = Math.max(1, Math.round(bitmap.width * scale));
		imgH = Math.max(1, Math.round(bitmap.height * scale));
		canvasEl.width = imgW;
		canvasEl.height = imgH;
		const ctx = canvasEl.getContext('2d');
		if (!ctx) {
			onDone(null, true);
			return;
		}
		ctx.drawImage(bitmap, 0, 0, imgW, imgH);
		if ('close' in bitmap) bitmap.close();

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
			sctx.drawImage(canvasEl, 0, 0, dw, dh);
			try {
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
	}

	function decodeViaImg(f: File): Promise<HTMLImageElement | null> {
		return new Promise((resolve) => {
			const url = URL.createObjectURL(f);
			const img = new Image();
			img.onload = () => {
				URL.revokeObjectURL(url);
				resolve(img);
			};
			img.onerror = () => {
				URL.revokeObjectURL(url);
				resolve(null);
			};
			img.src = url;
		});
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
	.pc-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: rgba(4, 6, 5, 0.96);
		padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
	}
	.pc-head {
		flex: none;
		margin-bottom: 0.6rem;
	}
	.pc-head > div {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.pc-title {
		font-weight: 600;
		font-size: 1.05rem;
		color: var(--white);
	}
	.pc-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--cyan);
	}
	.pc-hint {
		margin: 0.25rem 0 0;
		color: var(--dim);
		font-size: 0.82rem;
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
		border: 1px solid var(--line);
		background: var(--bg0);
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
		background: color-mix(in srgb, var(--green) 25%, var(--bg0));
		border: 2px solid var(--green);
		box-shadow: 0 0 8px color-mix(in srgb, var(--green) 60%, transparent);
	}
	.pc-handle.active span {
		background: var(--green);
	}
	.pc-status {
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
	}
	.pc-actions {
		flex: none;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin-top: 0.8rem;
	}
	.pc-reset {
		background: none;
		border: none;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
	}
	.pc-reset:hover:not(:disabled) {
		color: var(--cyan);
	}
	.pc-reset:disabled,
	.pc-handle:disabled {
		opacity: 0.5;
	}
</style>
