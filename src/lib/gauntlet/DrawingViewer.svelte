<script lang="ts">
	/**
	 * IDEA // GAUNTLET reusable drawing viewer. Presents a single drawing (a PNG
	 * URL via `src`, or inline SVG markup via `svg`) on a clean white sheet floating
	 * in the graphite viewport, and makes it explorable: drag to pan, wheel / pinch /
	 * the +/- controls to zoom, and Fit to reset. A corner minimap tracks the visible
	 * window at high zoom, and author-defined focus regions (normalized 0..1 rects of
	 * the drawing) become a "Jump to" strip.
	 *
	 * Crispness: the sheet's pixel size IS the display size (content = nW*s x nH*s),
	 * so the browser re-rasterizes the raster/SVG from source at whatever size it is
	 * shown, at the device pixel ratio, and only `translate` moves it. We never
	 * CSS-`scale` a raster (that upsamples an already-downsampled bitmap and blurs),
	 * and we never magnify past native resolution. Result: sharp at every zoom level.
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

	// White margin around the linework so it reads as a sheet (intrinsic units).
	const padN = $derived(nW && nH ? Math.max(Math.round(Math.max(nW, nH) * 0.06), 8) : 0);
	// Sheet outer size (drawing + margin), intrinsic units.
	const SW = $derived(nW + 2 * padN);
	const SH = $derived(nH + 2 * padN);
	// Fit scale: whole sheet inside the stage with a little breathing room.
	const sFit = $derived(W && H && SW && SH ? Math.min(W / SW, H / SH) * 0.94 : 1);
	// Never magnify a raster past native (s = 1); SVG could go further but 1 is plenty.
	const maxS = $derived(Math.max(sFit, 1));

	const clampScale = (v: number) => Math.min(maxS, Math.max(sFit, v));

	// Keep the sheet pinned: centered on an axis it fits, edge-locked when it overflows.
	function clampPan() {
		const ow = SW * s;
		const oh = SH * s;
		tx = ow <= W ? (W - ow) / 2 : Math.min(0, Math.max(W - ow, tx));
		ty = oh <= H ? (H - oh) / 2 : Math.min(0, Math.max(H - oh, ty));
	}

	function fitView() {
		s = sFit;
		tx = (W - SW * s) / 2;
		ty = (H - SH * s) / 2;
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

	const zoomButton = (factor: number) => zoomAt(factor, W / 2, H / 2);
	const reset = () => fitView();

	function jumpTo(r: FocusRegion, i: number) {
		if (!nW || !nH || r.w <= 0 || r.h <= 0) return;
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

	// New drawing: forget the old size, re-measure, snap to fit once known.
	$effect(() => {
		void src;
		void svg;
		nW = 0;
		nH = 0;
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
				style="width:{nW * s}px;height:{nH * s}px;padding:{padN * s}px;transform:translate({tx}px,{ty}px);"
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
	/* The white drawing sheet. Its box size IS the on-screen size, so the raster is
	   re-rasterized from source at display resolution (crisp), never CSS-upscaled. */
	.dv-sheet {
		position: absolute;
		top: 0;
		left: 0;
		box-sizing: content-box;
		transform-origin: 0 0;
		background: #fbfbf6;
		border: 1px solid rgba(0, 0, 0, 0.18);
		box-shadow: 0 10px 34px rgba(0, 0, 0, 0.55);
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
