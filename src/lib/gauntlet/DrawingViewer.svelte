<script lang="ts">
	/**
	 * IDEA // GAUNTLET reusable drawing viewer. Presents a single drawing (a PNG
	 * URL via `src`, or inline SVG markup via `svg`) on a clean white sheet floating
	 * in the graphite viewport, and makes it explorable: drag to pan, wheel / pinch /
	 * the +/- controls to zoom, and Fit to reset. A corner minimap tracks the visible
	 * window at high zoom, and author-defined focus regions (normalized 0..1 rects of
	 * the drawing) become a "Jump to" strip.
	 *
	 * Transform model (ONE matrix): the sheet is laid out ONCE at its natural size
	 * (nW x nH plus a paper margin) and all pan/zoom is a single CSS transform on
	 * that one wrapper, `translate(tx,ty) scale(s)` with transform-origin 0 0.
	 * `tx`/`ty` are the sheet's top-left in stage px and `s` is display px per
	 * intrinsic unit, so one coherent matrix drives everything: wheel zoom anchors
	 * at the pointer, drag pans, Fit frames the content. Because it is a pure
	 * GPU-composited transform, a zoom never re-lays-out the page or re-decodes the
	 * drawing. (The previous model instead resized the sheet BOX every step, which
	 * re-decoded a large drawing PNG on every wheel tick, blanking/blurring the
	 * image mid-gesture so real-drawing zoom stuttered and looked broken.)
	 * Magnification past native IS allowed (up to 8x the fit): real drawings are
	 * often exported small and students need to read fine dimensions.
	 *
	 * Content fit: exports frequently carry large empty paper margins (the part in
	 * one corner of the sheet). The viewer probes the raster once for its INK
	 * bounding box (a separate crossOrigin probe, so a blocked read just degrades
	 * to full-sheet fit) and fits the default view to the CONTENT; zooming out
	 * still reaches the whole sheet. Regions stay fractions of the full image.
	 *
	 * Layout: `.dv-controls` / `.dv-minimap` are SIBLINGS of `.dv-stage` (not its
	 * children), so a click on a control never trips the stage's pointer-capture pan.
	 *
	 * Self-contained (scoped styles, hardcoded fallbacks for tokens) so the live node
	 * can be moved into a Document Picture-in-Picture window and still render. All
	 * animation is gated behind prefers-reduced-motion.
	 */
	import type { FocusRegion } from '$lib/gauntlet';

	let {
		src = null,
		svg = null,
		regions = [],
		alt = 'Drawing',
		blueprint = true
	}: {
		src?: string | null;
		svg?: string | null;
		regions?: FocusRegion[];
		alt?: string;
		/** Faint grid on the graphite stage (purely decorative). */
		blueprint?: boolean;
	} = $props();

	let dvEl = $state<HTMLDivElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);
	let drawingEl = $state<HTMLDivElement | null>(null);

	// Intrinsic drawing size (px for a raster, viewBox units for an SVG). 0 = unknown.
	let nW = $state(0);
	let nH = $state(0);
	// Stage size in CSS px.
	let W = $state(0);
	let H = $state(0);
	// View: s = display scale (CSS px per intrinsic unit); tx/ty = sheet OUTER
	// top-left in stage px (transform-origin 0 0).
	let s = $state(1);
	let tx = $state(0);
	let ty = $state(0);

	// Index of the region to flash after a jump (-1 = none). An index, not the
	// object, so we never compare a $state proxy against a raw prop value.
	let highlightIdx = $state(-1);
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

	// Ink content bounding box, fractions of the image (full until probed).
	let ink = $state({ x: 0, y: 0, w: 1, h: 1 });
	// True once the user pans/zooms/jumps; a late ink probe then leaves the view alone.
	let interacted = false;

	// Thin white paper border around the linework so the card reads as a sheet but
	// never swells into a big white slab (intrinsic units).
	const padN = $derived(nW && nH ? Math.max(Math.round(Math.max(nW, nH) * 0.025), 8) : 0);
	// Sheet outer size (drawing + margin), intrinsic units.
	const SW = $derived(nW + 2 * padN);
	const SH = $derived(nH + 2 * padN);
	// Breathing room at the default fit, so the light card always floats inside a
	// dark margin instead of bleeding to the viewport edges (framed, not full-bleed).
	const FIT = 0.88;
	// Zoom-out floor: the whole sheet inside the stage with breathing room.
	const sSheet = $derived(W && H && SW && SH ? Math.min(W / SW, H / SH) * FIT : 1);
	// Fit scale: the INK content inside the stage (equals sSheet for tight exports).
	const sFit = $derived(
		W && H && nW && nH
			? Math.min(W / Math.max(1, ink.w * nW), H / Math.max(1, ink.h * nH)) * FIT
			: 1
	);
	// Allow real magnification: small exports need to zoom PAST native so students
	// can read fine dimensions. (A hard native cap used to make min == max zoom for
	// any raster that fit at >= 100%, which locked zoom and region jumps entirely.)
	const maxS = $derived(Math.max(sFit * 8, 3));

	const clampScale = (v: number) => Math.min(maxS, Math.max(Math.min(sSheet, sFit), v));

	// Keep the sheet pinned: centered on an axis it fits, edge-locked when it overflows.
	function clampPan() {
		const ow = SW * s;
		const oh = SH * s;
		tx = ow <= W ? (W - ow) / 2 : Math.min(0, Math.max(W - ow, tx));
		ty = oh <= H ? (H - oh) / 2 : Math.min(0, Math.max(H - oh, ty));
	}

	function fitView() {
		// Frame the ink content (the whole sheet when no ink box is known).
		s = sFit;
		const cx = padN + (ink.x + ink.w / 2) * nW;
		const cy = padN + (ink.y + ink.h / 2) * nH;
		tx = W / 2 - cx * s;
		ty = H / 2 - cy * s;
		clampPan();
	}

	function zoomAt(factor: number, px: number, py: number) {
		const ns = clampScale(s * factor);
		if (ns === s) return;
		// Keep the point under (px,py) fixed while scaling.
		tx = px - (px - tx) * (ns / s);
		ty = py - (py - ty) * (ns / s);
		s = ns;
		clampPan();
	}

	const zoomButton = (factor: number) => {
		interacted = true;
		zoomAt(factor, W / 2, H / 2);
	};
	const reset = () => {
		interacted = true;
		fitView();
	};

	function jumpTo(r: FocusRegion, i: number) {
		if (!nW || !nH || r.w <= 0 || r.h <= 0) return;
		interacted = true;
		// Region -> sheet-space center (drawing sits inset by padN inside the sheet).
		const cx = padN + (r.x + r.w / 2) * nW;
		const cy = padN + (r.y + r.h / 2) * nH;
		const ns = clampScale(Math.min(W / (r.w * nW), H / (r.h * nH)) * 0.8);
		s = ns;
		tx = W / 2 - cx * ns;
		ty = H / 2 - cy * ns;
		clampPan();
		highlightIdx = i;
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlightIdx = -1), 1500);
	}

	// --- Pointer pan + two-finger pinch --------------------------------------
	const pointers = new Map<number, { x: number; y: number }>();
	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let pinchDist = 0;

	function onPointerDown(e: PointerEvent) {
		if (!stageEl) return;
		interacted = true;
		// Capture so the drag keeps tracking outside the stage and can never stick;
		// guarded because setPointerCapture can throw for a non-active pointer.
		try {
			stageEl.setPointerCapture(e.pointerId);
		} catch {
			/* no capture available; pan still works via the document-level events */
		}
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 1) {
			dragging = true;
			lastX = e.clientX;
			lastY = e.clientY;
		} else if (pointers.size === 2) {
			dragging = false;
			const p = [...pointers.values()];
			pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size >= 2) {
			const p = [...pointers.values()];
			const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
			if (pinchDist > 0 && dist > 0 && stageEl) {
				const rect = stageEl.getBoundingClientRect();
				const midX = (p[0].x + p[1].x) / 2 - rect.left;
				const midY = (p[0].y + p[1].y) / 2 - rect.top;
				zoomAt(dist / pinchDist, midX, midY);
			}
			pinchDist = dist;
			return;
		}

		if (!dragging) return;
		tx += e.clientX - lastX;
		ty += e.clientY - lastY;
		lastX = e.clientX;
		lastY = e.clientY;
		clampPan();
	}

	// End on up / cancel / lost-capture so a drag can never get stuck.
	function endPointer(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchDist = 0;
		if (pointers.size === 0) dragging = false;
		else if (pointers.size === 1) {
			const p = [...pointers.values()][0];
			dragging = true;
			lastX = p.x;
			lastY = p.y;
		}
	}

	function onWheel(e: WheelEvent) {
		if (!stageEl) return;
		interacted = true;
		e.preventDefault();
		const rect = stageEl.getBoundingClientRect();
		zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
	}

	// All control clicks route through one delegated-by-data-attr handler attached
	// with addEventListener (NOT Svelte's on:click), so it fires even after the
	// node is moved into a PiP window (Svelte delegates events to the main-document
	// root, which a PiP-hosted node can't reach).
	function onClick(e: MouseEvent) {
		const btn = (e.target as HTMLElement).closest?.('[data-act]');
		if (!btn) return;
		const act = btn.getAttribute('data-act');
		if (act === 'in') zoomButton(1.4);
		else if (act === 'out') zoomButton(1 / 1.4);
		else if (act === 'fit') reset();
		else if (act === 'jump') {
			const i = Number(btn.getAttribute('data-idx'));
			if (regions[i]) jumpTo(regions[i], i);
		}
	}

	// --- Measurement + layout -------------------------------------------------
	function measureStage() {
		if (!stageEl) return;
		const r = stageEl.getBoundingClientRect();
		W = r.width;
		H = r.height;
	}

	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) {
			nW = img.naturalWidth;
			nH = img.naturalHeight;
		}
	}

	// Monotonic guard so a slow probe for a previous drawing can never apply late.
	let loadSeq = 0;

	/** Release an ImageBitmap; a no-op for the HTMLImageElement fallback. */
	function closeBitmap(x: ImageBitmap | HTMLImageElement | null) {
		if (x && 'close' in x && typeof x.close === 'function') x.close();
	}

	/** Decode a blob to something drawable, tolerant of a missing createImageBitmap. */
	function decodeBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement | null> {
		if (typeof createImageBitmap === 'function') {
			return createImageBitmap(blob).catch(() => decodeViaObjectUrl(blob));
		}
		return decodeViaObjectUrl(blob);
	}
	function decodeViaObjectUrl(blob: Blob): Promise<HTMLImageElement | null> {
		return new Promise((resolve) => {
			const obj = URL.createObjectURL(blob);
			const img = new Image();
			img.onload = () => {
				resolve(img);
				setTimeout(() => URL.revokeObjectURL(obj), 0);
			};
			img.onerror = () => {
				URL.revokeObjectURL(obj);
				resolve(null);
			};
			img.src = obj;
		});
	}

	/**
	 * Probe the raster for its INK bounding box so Fit frames the CONTENT of a
	 * margin-heavy export (a real SolidWorks PNG parks the linework in one corner
	 * of a mostly empty sheet). The bytes are fetched ONCE as a blob and decoded
	 * from that same-origin blob, so the pixel read can never taint.
	 *
	 * Why not a second crossOrigin <img> (the old path)? The display <img> had
	 * already cached the same signed URL in no-cors mode, so the probe reused a
	 * tainted response and getImageData() threw. That silently killed content-fit
	 * in production (the drawing shrank into a corner of the whole empty sheet)
	 * while the data-URL dev harness, which never taints, always looked fine.
	 * Any failure here just keeps the full-sheet fit, so display never regresses.
	 */
	async function probeInk(url: string) {
		const seq = ++loadSeq;
		try {
			const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
			if (!res.ok || seq !== loadSeq) return;
			const bmp = await decodeBlob(await res.blob());
			if (!bmp || seq !== loadSeq) {
				closeBitmap(bmp);
				return;
			}
			const bw0 = (bmp as HTMLImageElement).naturalWidth || bmp.width;
			const bh0 = (bmp as HTMLImageElement).naturalHeight || bmp.height;
			const k = Math.min(1, 640 / (bw0 || 1));
			const cw = Math.max(1, Math.round(bw0 * k));
			const ch = Math.max(1, Math.round(bh0 * k));
			const c = document.createElement('canvas');
			c.width = cw;
			c.height = ch;
			const g = c.getContext('2d', { willReadFrequently: true });
			if (!g) {
				closeBitmap(bmp);
				return;
			}
			g.drawImage(bmp as CanvasImageSource, 0, 0, cw, ch);
			closeBitmap(bmp);
			const d = g.getImageData(0, 0, cw, ch).data;
			let x0 = cw;
			let y0 = ch;
			let x1 = -1;
			let y1 = -1;
			for (let y = 0; y < ch; y++) {
				for (let x = 0; x < cw; x++) {
					const i = (y * cw + x) * 4;
					if (d[i + 3] > 32 && Math.min(d[i], d[i + 1], d[i + 2]) < 240) {
						if (x < x0) x0 = x;
						if (x > x1) x1 = x;
						if (y < y0) y0 = y;
						if (y > y1) y1 = y;
					}
				}
			}
			if (x1 < 0) return; // blank image: keep full-sheet fit
			// Small breathing margin around the ink, clamped to the image.
			const mx = cw * 0.015;
			const my = ch * 0.015;
			const bx = Math.max(0, x0 - mx) / cw;
			const by = Math.max(0, y0 - my) / ch;
			const bw = Math.min(cw, x1 + 1 + mx) / cw - bx;
			const bh = Math.min(ch, y1 + 1 + my) / ch - by;
			// A speck-sized bbox is more likely an artifact than a drawing.
			if (bw * bh < 0.005 || seq !== loadSeq) return;
			ink = { x: bx, y: by, w: bw, h: bh };
			if (!interacted && nW && nH && W && H) fitView();
		} catch {
			/* network / CORS / decode failure: full-sheet fit stands */
		}
	}

	function measureSvg() {
		const el = drawingEl?.querySelector('svg');
		if (!el) return;
		const vb = el.getAttribute('viewBox');
		if (vb) {
			const p = vb.split(/[ ,]+/).map(Number);
			if (p.length === 4 && p[2] > 0 && p[3] > 0) {
				nW = p[2];
				nH = p[3];
				return;
			}
		}
		const r = el.getBoundingClientRect();
		if (r.width && r.height) {
			nW = r.width;
			nH = r.height;
		} else {
			nW = 1000;
			nH = 750;
		}
	}

	// New drawing: forget the old size and ink box, re-measure, snap to fit
	// once known, and probe the new raster's content extent.
	$effect(() => {
		const currentSrc = src;
		void svg;
		nW = 0;
		nH = 0;
		ink = { x: 0, y: 0, w: 1, h: 1 };
		interacted = false;
		if (currentSrc) probeInk(currentSrc);
		queueMicrotask(() => {
			measureStage();
			if (svg) measureSvg();
			if (nW && nH) fitView();
		});
	});

	// First good fit once both the stage size and the drawing size are known.
	let fitted = false;
	$effect(() => {
		if (nW && nH && W && H && !fitted) {
			fitView();
			fitted = true;
		}
	});
	$effect(() => {
		void src;
		void svg;
		fitted = false;
	});

	// Preserve the framed content across a stage resize (or a move into PiP): keep
	// the same scale and the same sheet-point under the stage center.
	$effect(() => {
		if (!stageEl) return;
		measureStage();
		const ro = new ResizeObserver(() => {
			const oldW = W;
			const oldH = H;
			const cx = oldW && s ? (oldW / 2 - tx) / s : SW / 2;
			const cy = oldH && s ? (oldH / 2 - ty) / s : SH / 2;
			measureStage();
			if (!nW || !nH) return;
			s = clampScale(s);
			tx = W / 2 - cx * s;
			ty = H / 2 - cy * s;
			clampPan();
		});
		ro.observe(stageEl);
		// Non-delegated listeners so pan / zoom / controls keep working after the
		// live node is relocated into a Document PiP window.
		const wheelOpts = { passive: false } as AddEventListenerOptions;
		const st = stageEl;
		st.addEventListener('wheel', onWheel, wheelOpts);
		st.addEventListener('pointerdown', onPointerDown);
		st.addEventListener('pointermove', onPointerMove);
		st.addEventListener('pointerup', endPointer);
		st.addEventListener('pointercancel', endPointer);
		st.addEventListener('lostpointercapture', endPointer);
		dvEl?.addEventListener('click', onClick);
		return () => {
			ro.disconnect();
			st.removeEventListener('wheel', onWheel, wheelOpts);
			st.removeEventListener('pointerdown', onPointerDown);
			st.removeEventListener('pointermove', onPointerMove);
			st.removeEventListener('pointerup', endPointer);
			st.removeEventListener('pointercancel', endPointer);
			st.removeEventListener('lostpointercapture', endPointer);
			dvEl?.removeEventListener('click', onClick);
			if (highlightTimer) clearTimeout(highlightTimer);
		};
	});

	const zoomed = $derived(s > sFit * 1.04);
	const pct = $derived(Math.round((s / (sFit || 1)) * 100));

	// Minimap: the whole drawing as a thumbnail with the visible window marked.
	const mini = $derived.by(() => {
		if (!nW || !nH || !W || !H) return null;
		const MW = 96;
		const MH = Math.max(30, Math.min(130, Math.round((MW * nH) / nW)));
		const k = MW / nW;
		// Drawing top-left in stage px = sheet origin + padding.
		const dl = -(tx + padN * s) / s;
		const dt = -(ty + padN * s) / s;
		const dr = (W - (tx + padN * s)) / s;
		const db = (H - (ty + padN * s)) / s;
		const x = Math.max(0, dl);
		const y = Math.max(0, dt);
		const x2 = Math.min(nW, dr);
		const y2 = Math.min(nH, db);
		return {
			MW,
			MH,
			x: x * k,
			y: y * k,
			w: Math.max(4, (x2 - x) * k),
			h: Math.max(4, (y2 - y) * k)
		};
	});
</script>

<div class="dv" class:blueprint bind:this={dvEl}>
	<div class="dv-viewport">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="dv-stage"
			bind:this={stageEl}
			role="application"
			aria-label="{alt}. Drag to pan, scroll to zoom."
		>
			<div
				class="dv-sheet"
				style="width:{nW}px;height:{nH}px;padding:{padN}px;transform:translate({tx}px,{ty}px) scale({s});"
			>
				<div class="dv-drawing" bind:this={drawingEl}>
					{#if src}
						<img class="dv-img" {src} {alt} draggable="false" onload={onImgLoad} />
					{:else if svg}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html svg}
					{/if}
					{#each regions as r, i (i)}
						<div
							class="dv-region"
							class:active={highlightIdx === i}
							style="left:{r.x * 100}%;top:{r.y * 100}%;width:{r.w * 100}%;height:{r.h * 100}%;"
						></div>
					{/each}
				</div>
			</div>
		</div>

		<div class="dv-controls">
			<button type="button" class="dv-btn" title="Zoom in" aria-label="Zoom in" data-act="in">+</button>
			<span class="dv-pct" aria-hidden="true">{pct}%</span>
			<button type="button" class="dv-btn" title="Zoom out" aria-label="Zoom out" data-act="out">&minus;</button>
			<button type="button" class="dv-btn fit" title="Fit to view" aria-label="Fit to view" data-act="fit">Fit</button>
		</div>

		{#if mini && zoomed}
			<div class="dv-minimap" style="width:{mini.MW}px;height:{mini.MH}px;" aria-hidden="true">
				{#if src}
					<img class="dv-mini-img" {src} alt="" />
				{:else if svg}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="dv-mini-svg">{@html svg}</div>
				{/if}
				<div class="dv-mini-view" style="left:{mini.x}px;top:{mini.y}px;width:{mini.w}px;height:{mini.h}px;"></div>
			</div>
		{/if}
	</div>

	{#if regions.length}
		<div class="dv-regions">
			<span class="dv-regions-label">Jump to</span>
			{#each regions as r, i (i)}
				<button type="button" class="dv-region-btn" data-act="jump" data-idx={i}>{r.label || `Detail ${i + 1}`}</button>
			{/each}
			<button type="button" class="dv-region-btn reset" data-act="fit">Whole drawing</button>
		</div>
	{/if}
</div>

<style>
	.dv {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		height: 100%;
		min-height: 0;
	}
	.dv-viewport {
		position: relative;
		flex: 1;
		min-height: 0;
		width: 100%;
		overflow: hidden;
		border-radius: 4px;
		/* Graphite viewport: dark neutral with a faint depth gradient. */
		background:
			radial-gradient(130% 120% at 50% 38%, #0c1310, #05080a 80%);
	}
	/* Faint reference grid (decorative). */
	.dv.blueprint .dv-viewport {
		background-image:
			radial-gradient(130% 120% at 50% 38%, #0c1310, #05080a 80%),
			linear-gradient(rgba(0, 255, 65, 0.045) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 255, 65, 0.045) 1px, transparent 1px);
		background-size:
			100% 100%,
			26px 26px,
			26px 26px;
	}
	.dv-stage {
		position: absolute;
		inset: 0;
		touch-action: none;
		cursor: grab;
	}
	.dv-stage:active {
		cursor: grabbing;
	}
	/* The white drawing sheet. Laid out ONCE at natural size (content nW x nH plus a
	   padN paper margin); pan/zoom is the single translate()+scale() matrix on this
	   one element, GPU-composited, so a zoom never re-lays-out or re-decodes it. */
	.dv-sheet {
		position: absolute;
		top: 0;
		left: 0;
		box-sizing: content-box;
		transform-origin: 0 0;
		/* Framed light sheet: a warm near-white drawing card, kept legible (black
		   linework on light paper) but lifted off the dark viewport by a shadow and a
		   faint on-theme green hairline, so it reads as a framed drawing, not a white
		   slab. The default fit leaves a dark margin all around it. */
		background: #f5f4ee;
		border: 1px solid rgba(0, 0, 0, 0.32);
		box-shadow:
			0 8px 30px rgba(0, 0, 0, 0.62),
			0 0 0 1px rgba(0, 255, 65, 0.14);
		will-change: transform;
	}
	.dv-drawing {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.dv-img,
	.dv-drawing :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
		-webkit-user-drag: none;
	}
	.dv-region {
		position: absolute;
		border: 1px solid rgba(0, 120, 160, 0.55);
		border-radius: 2px;
		pointer-events: none;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.4);
	}
	.dv-region.active {
		border-color: #0088b0;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 12px rgba(0, 160, 200, 0.7);
		animation: dv-pulse 1.3s ease-out;
	}
	@keyframes dv-pulse {
		0% {
			box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 0 rgba(0, 160, 200, 0.9);
		}
		100% {
			box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5), 0 0 14px rgba(0, 160, 200, 0.4);
		}
	}
	.dv-controls {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 3;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 3px 5px;
		background: rgba(4, 7, 10, 0.86);
		border: 1px solid rgba(0, 240, 255, 0.28);
		border-radius: 8px;
		-webkit-backdrop-filter: blur(4px);
		backdrop-filter: blur(4px);
	}
	.dv-btn {
		min-width: 26px;
		height: 26px;
		padding: 0 6px;
		border: 1px solid rgba(0, 240, 255, 0.3);
		border-radius: 6px;
		background: rgba(14, 22, 27, 0.9);
		color: var(--cyan, #00f0ff);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}
	.dv-btn.fit {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.dv-btn:hover {
		border-color: var(--cyan, #00f0ff);
		color: #e8fff0;
	}
	.dv-pct {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.6rem;
		color: var(--dim, #5f8a78);
		min-width: 40px;
		text-align: center;
	}
	.dv-minimap {
		position: absolute;
		left: 8px;
		bottom: 8px;
		z-index: 3;
		border: 1px solid rgba(0, 240, 255, 0.35);
		border-radius: 3px;
		overflow: hidden;
		background: #fbfbf6;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
	}
	.dv-mini-img,
	.dv-mini-svg {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.dv-mini-svg :global(svg) {
		width: 100%;
		height: 100%;
	}
	.dv-mini-view {
		position: absolute;
		border: 1.5px solid var(--cyan, #00f0ff);
		background: rgba(0, 240, 255, 0.14);
		box-shadow: 0 0 8px rgba(0, 240, 255, 0.5);
	}
	.dv-regions {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem;
		flex-shrink: 0;
	}
	.dv-regions-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.56rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--dim, #5f8a78);
	}
	.dv-region-btn {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.04em;
		color: var(--cyan, #00f0ff);
		background: rgba(4, 7, 10, 0.6);
		border: 1px solid rgba(0, 240, 255, 0.3);
		border-radius: 6px;
		padding: 0.22rem 0.5rem;
		cursor: pointer;
	}
	.dv-region-btn:hover {
		border-color: var(--cyan, #00f0ff);
		background: rgba(0, 240, 255, 0.1);
	}
	.dv-region-btn.reset {
		color: var(--dim, #5f8a78);
	}
	@media (prefers-reduced-motion: reduce) {
		.dv-region.active {
			animation: none;
		}
	}
</style>
