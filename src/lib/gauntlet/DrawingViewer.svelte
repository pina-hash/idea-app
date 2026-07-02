<script lang="ts">
	/**
	 * IDEA // GAUNTLET reusable drawing viewer (feature 1). Wraps a single drawing
	 * (a PNG URL via `src`, or inline SVG markup via `svg`) in an interactive
	 * viewport: drag to pan, wheel / pinch / the +/- controls to zoom, and a
	 * fit-to-view reset. A minimap in the corner shows where the visible window
	 * sits in the whole drawing at high zoom, and an author-defined set of focus
	 * regions (normalized rectangles) becomes a jump strip so students can snap to
	 * a detail. Degrades gracefully: no regions -> no strip, no zoom -> no minimap.
	 *
	 * Self-contained on purpose: all chrome and the blueprint recolor live in this
	 * component's scoped styles (not the global .gauntlet rules), so the node can be
	 * moved into a Document Picture-in-Picture window (feature 2) and still render
	 * correctly once the stylesheets are copied across.
	 *
	 * The transform model: `.dv-content` is sized to the drawing's fit rectangle
	 * (fw x fh, letterboxed into the stage at scale 1) with transform-origin 0 0,
	 * so translate/scale math is exact and focus regions positioned as % of the
	 * content map straight onto the drawing. All animation is gated behind
	 * prefers-reduced-motion.
	 */
	import { prefersReducedMotion } from '$lib/gauntlet/viewport/motion';
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
		blueprint?: boolean;
	} = $props();

	const MAX_SCALE = 10;

	let stageEl = $state<HTMLDivElement | null>(null);
	let contentEl = $state<HTMLDivElement | null>(null);

	// View state: s = scale (1 = fit-to-view), tx/ty = content top-left in stage px.
	let s = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let W = $state(0);
	let H = $state(0);
	// Intrinsic width/height ratio of the drawing (0 until known).
	let aspect = $state(0);
	// Smooth transition for button / jump moves only; off during drag & wheel.
	let smooth = $state(false);
	let highlight = $state<FocusRegion | null>(null);
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

	const reduce = () => prefersReducedMotion();

	// The drawing's fit rectangle inside the current stage, preserving aspect.
	const fit = $derived.by(() => {
		if (!W || !H) return { fw: 0, fh: 0 };
		if (!aspect) return { fw: W, fh: H };
		const stageA = W / H;
		if (aspect >= stageA) return { fw: W, fh: W / aspect };
		return { fw: H * aspect, fh: H };
	});

	const clampScale = (v: number) => Math.min(MAX_SCALE, Math.max(1, v));

	// Keep the drawing pinned: centered when it fits an axis, edge-locked when it
	// overflows, so it can never be dragged fully out of view.
	function clamp() {
		const { fw, fh } = fit;
		const sw = fw * s;
		const sh = fh * s;
		tx = sw <= W ? (W - sw) / 2 : Math.min(0, Math.max(W - sw, tx));
		ty = sh <= H ? (H - sh) / 2 : Math.min(0, Math.max(H - sh, ty));
	}

	function applyFit() {
		s = 1;
		const { fw, fh } = fit;
		tx = (W - fw) / 2;
		ty = (H - fh) / 2;
	}

	function zoomAt(factor: number, px: number, py: number) {
		const ns = clampScale(s * factor);
		if (ns === s) return;
		// Keep the point under the cursor stationary while scaling.
		tx = px - (px - tx) * (ns / s);
		ty = py - (py - ty) * (ns / s);
		s = ns;
		clamp();
	}

	function zoomButton(factor: number) {
		smooth = !reduce();
		zoomAt(factor, W / 2, H / 2);
	}

	function reset() {
		smooth = !reduce();
		applyFit();
	}

	function jumpTo(r: FocusRegion) {
		const { fw, fh } = fit;
		if (!fw || !fh || r.w <= 0 || r.h <= 0) return;
		const sFit = Math.min(W / (r.w * fw), H / (r.h * fh)) * 0.86;
		const ns = clampScale(sFit);
		const cx = (r.x + r.w / 2) * fw;
		const cy = (r.y + r.h / 2) * fh;
		s = ns;
		tx = W / 2 - cx * ns;
		ty = H / 2 - cy * ns;
		clamp();
		smooth = !reduce();
		highlight = r;
		if (highlightTimer) clearTimeout(highlightTimer);
		highlightTimer = setTimeout(() => (highlight = null), 1400);
	}

	// --- Pointer pan + pinch zoom --------------------------------------------
	const pointers = new Map<number, { x: number; y: number }>();
	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let pinchDist = 0;

	function stagePoint(e: PointerEvent) {
		const rect = stageEl!.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	}

	function onPointerDown(e: PointerEvent) {
		if (!stageEl) return;
		stageEl.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		smooth = false;
		if (pointers.size === 1) {
			dragging = true;
			lastX = e.clientX;
			lastY = e.clientY;
		} else if (pointers.size === 2) {
			dragging = false;
			const pts = [...pointers.values()];
			pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

		if (pointers.size === 2) {
			const pts = [...pointers.values()];
			const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
			if (pinchDist > 0 && dist > 0) {
				const rect = stageEl!.getBoundingClientRect();
				const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
				const midY = (pts[0].y + pts[1].y) / 2 - rect.top;
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
		clamp();
	}

	function endPointer(e: PointerEvent) {
		pointers.delete(e.pointerId);
		if (pointers.size < 2) pinchDist = 0;
		if (pointers.size === 0) dragging = false;
	}

	function onWheel(e: WheelEvent) {
		if (!stageEl) return;
		e.preventDefault();
		smooth = false;
		const rect = stageEl.getBoundingClientRect();
		zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
	}

	// --- Layout: measure the stage, learn the aspect, keep the view on resize ---
	function measureStage(): DOMRect | null {
		return stageEl ? stageEl.getBoundingClientRect() : null;
	}

	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) aspect = img.naturalWidth / img.naturalHeight;
	}

	// Read an inline SVG's intrinsic ratio from its viewBox (fallback: bbox).
	function measureSvg() {
		const el = contentEl?.querySelector('svg');
		if (!el) return;
		const vb = el.getAttribute('viewBox');
		if (vb) {
			const p = vb.split(/[ ,]+/).map(Number);
			if (p.length === 4 && p[2] > 0 && p[3] > 0) {
				aspect = p[2] / p[3];
				return;
			}
		}
		const r = el.getBoundingClientRect();
		if (r.width && r.height) aspect = r.width / r.height;
	}

	// Preserve the view (scale + the content fraction at stage center) across a
	// stage resize or a move into a PiP window, so pan/zoom carries over.
	function applyResize() {
		const rect = measureStage();
		if (!rect) return;
		const oldW = W;
		const oldH = H;
		const old = fit;
		let cN = { x: 0.5, y: 0.5 };
		if (oldW && oldH && old.fw && old.fh) {
			cN = {
				x: (oldW / 2 - tx) / s / old.fw,
				y: (oldH / 2 - ty) / s / old.fh
			};
		}
		W = rect.width;
		H = rect.height;
		const nf = fit;
		tx = W / 2 - cN.x * nf.fw * s;
		ty = H / 2 - cN.y * nf.fh * s;
		clamp();
	}

	// Content changed (new drawing): re-measure and snap to fit.
	$effect(() => {
		void src;
		void svg;
		aspect = 0;
		queueMicrotask(() => {
			if (svg) measureSvg();
			const rect = measureStage();
			if (rect) {
				W = rect.width;
				H = rect.height;
			}
			applyFit();
		});
	});

	// Re-fit once the aspect is finally known (image onload / svg measured).
	$effect(() => {
		if (aspect && W && H) applyFit();
	});

	$effect(() => {
		if (!stageEl) return;
		const rect = measureStage();
		if (rect) {
			W = rect.width;
			H = rect.height;
		}
		const ro = new ResizeObserver(() => applyResize());
		ro.observe(stageEl);
		return () => {
			ro.disconnect();
			if (highlightTimer) clearTimeout(highlightTimer);
		};
	});

	const zoomed = $derived(s > 1.02);

	// Minimap geometry: the whole drawing as a small box, with a rectangle marking
	// the currently visible window. Only meaningful once zoomed in.
	const mini = $derived.by(() => {
		const { fw, fh } = fit;
		if (!fw || !fh) return null;
		const MW = 92;
		const MH = Math.max(34, Math.min(120, Math.round((MW * fh) / fw)));
		const k = MW / fw;
		const vl = Math.max(0, -tx / s);
		const vt = Math.max(0, -ty / s);
		const vr = Math.min(fw, (W - tx) / s);
		const vb = Math.min(fh, (H - ty) / s);
		return {
			MW,
			MH,
			x: vl * k,
			y: vt * k,
			w: Math.max(6, (vr - vl) * k),
			h: Math.max(6, (vb - vt) * k)
		};
	});

	const pct = $derived(Math.round(s * 100));
</script>

<div class="dv" class:blueprint>
	<div
		class="dv-stage"
		bind:this={stageEl}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={endPointer}
		onpointercancel={endPointer}
		onwheel={onWheel}
		role="application"
		aria-label="{alt}. Drag to pan, scroll to zoom."
	>
		<div
			class="dv-content"
			bind:this={contentEl}
			class:smooth
			style="width:{fit.fw}px;height:{fit.fh}px;transform:translate({tx}px,{ty}px) scale({s});"
		>
			{#if src}
				<img class="dv-img" {src} {alt} draggable="false" onload={onImgLoad} />
			{:else if svg}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html svg}
			{/if}
			{#each regions as r, i (i)}
				<div
					class="dv-region"
					class:active={highlight === r}
					style="left:{r.x * 100}%;top:{r.y * 100}%;width:{r.w * 100}%;height:{r.h * 100}%;"
				></div>
			{/each}
		</div>

		<div class="dv-controls">
			<button type="button" class="dv-btn" title="Zoom in" aria-label="Zoom in" onclick={() => zoomButton(1.4)}>+</button>
			<span class="dv-pct" aria-hidden="true">{pct}%</span>
			<button type="button" class="dv-btn" title="Zoom out" aria-label="Zoom out" onclick={() => zoomButton(1 / 1.4)}>&minus;</button>
			<button type="button" class="dv-btn fit" title="Fit to view" aria-label="Fit to view" onclick={reset}>Fit</button>
		</div>

		{#if mini && zoomed}
			<div class="dv-minimap" style="width:{mini.MW}px;height:{mini.MH}px;" aria-hidden="true">
				{#if src}
					<img class="dv-mini-img" {src} alt="" />
				{:else if svg}
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					<div class="dv-mini-svg">{@html svg}</div>
				{/if}
				<div
					class="dv-mini-view"
					style="left:{mini.x}px;top:{mini.y}px;width:{mini.w}px;height:{mini.h}px;"
				></div>
			</div>
		{/if}
	</div>

	{#if regions.length}
		<div class="dv-regions">
			<span class="dv-regions-label">Jump to</span>
			{#each regions as r, i (i)}
				<button type="button" class="dv-region-btn" onclick={() => jumpTo(r)}>{r.label || `Detail ${i + 1}`}</button>
			{/each}
			<button type="button" class="dv-region-btn reset" onclick={reset}>Whole drawing</button>
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
	}
	.dv-stage {
		position: relative;
		flex: 1;
		min-height: 0;
		width: 100%;
		height: 100%;
		overflow: hidden;
		touch-action: none;
		cursor: grab;
	}
	.dv-stage:active {
		cursor: grabbing;
	}
	.dv-content {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		will-change: transform;
	}
	.dv-content.smooth {
		transition: transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1);
	}
	.dv-img,
	.dv-content :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: contain;
		user-select: none;
		-webkit-user-drag: none;
	}
	/* Blueprint recolor: drop the paper, keep the linework (invert to light-on-dark,
	   screen the former white field into the grid behind it). Matches the inline
	   frame / lightbox treatment so a popped-out drawing looks identical. */
	.dv.blueprint .dv-stage {
		background-color: #04130c;
		background-image:
			linear-gradient(rgba(0, 255, 65, 0.07) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 255, 65, 0.07) 1px, transparent 1px);
		background-size: 24px 24px;
	}
	.dv.blueprint .dv-img,
	.dv.blueprint .dv-content :global(svg) {
		filter: invert(1) drop-shadow(0 0 1px rgba(0, 255, 65, 0.5));
		mix-blend-mode: screen;
	}
	.dv-region {
		position: absolute;
		border: 1px solid rgba(0, 240, 255, 0.35);
		border-radius: 2px;
		pointer-events: none;
		box-shadow: 0 0 0 1px rgba(4, 19, 12, 0.4);
	}
	.dv-region.active {
		border-color: var(--cyan, #00f0ff);
		box-shadow: 0 0 12px rgba(0, 240, 255, 0.6);
		animation: dv-pulse 1.2s ease-out;
	}
	@keyframes dv-pulse {
		0% {
			box-shadow: 0 0 0 rgba(0, 240, 255, 0.8);
		}
		100% {
			box-shadow: 0 0 14px rgba(0, 240, 255, 0.4);
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
		background: rgba(4, 7, 10, 0.82);
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
		min-width: 34px;
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
		background: #04130c;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
	}
	.dv-mini-img,
	.dv-mini-svg {
		width: 100%;
		height: 100%;
		object-fit: contain;
		opacity: 0.55;
		filter: invert(1);
	}
	.dv-mini-svg :global(svg) {
		width: 100%;
		height: 100%;
	}
	.dv-mini-view {
		position: absolute;
		border: 1.5px solid var(--cyan, #00f0ff);
		background: rgba(0, 240, 255, 0.12);
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
		.dv-content.smooth {
			transition: none;
		}
		.dv-region.active {
			animation: none;
		}
	}
</style>
