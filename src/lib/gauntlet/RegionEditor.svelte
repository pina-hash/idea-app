<script lang="ts">
	/**
	 * IDEA // GAUNTLET visual focus-region picker (Speedrun authoring). Authors draw
	 * rectangles directly on the drawing instead of typing X/Y/W/H. It renders the
	 * same two drawing cases the student viewer handles, a PNG URL (`src`) or inline
	 * SVG markup (`svg`), fit to the canvas with the same blueprint recolor, then
	 * overlays editable region boxes.
	 *
	 * Storage contract is unchanged: `regions` are the form's FocusRegionInput rows
	 * in PERCENT of the drawing (0 to 100, top-left origin), the exact shape the
	 * numeric inputs bind to and that buildPayload turns into answer.focus_regions.
	 * Because the picker mutates those same objects, the numeric fields and the
	 * boxes stay two-way synced for free. Region order is the student "Jump to"
	 * order.
	 *
	 * All motion is gated behind prefers-reduced-motion (drag itself is instant).
	 */
	import type { FocusRegionInput } from '$lib/gauntlet/authoring';

	let {
		regions = $bindable([]),
		selected = $bindable(-1),
		src = null,
		svg = null
	}: {
		regions?: FocusRegionInput[];
		selected?: number;
		src?: string | null;
		svg?: string | null;
	} = $props();

	const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
	type Handle = (typeof HANDLES)[number];

	let canvasEl = $state<HTMLDivElement | null>(null);
	let boxEl = $state<HTMLDivElement | null>(null);
	let canvasW = $state(0);
	let canvasH = $state(0);
	let aspect = $state(0);
	let zoom = $state(1);

	// Transient draw rectangle (percent) shown while dragging out a new region.
	let drawPreview = $state<{ x: number; y: number; w: number; h: number } | null>(null);

	// Gesture bookkeeping.
	type Mode = 'idle' | 'draw' | 'move' | 'resize';
	let mode: Mode = 'idle';
	let activeHandle: Handle | null = null;
	let dragStartPt = { x: 0, y: 0 };
	let dragStartBox = { left: 0, right: 0, top: 0, bottom: 0 };
	let moveOffset = { x: 0, y: 0 };

	const cl = (v: number) => Math.max(0, Math.min(100, v));
	const r1 = (v: number) => Math.round(v * 10) / 10;
	const MIN = 2; // smallest region, percent

	// Fit the drawing into the canvas (contain), preserving aspect; zoom scales it.
	const fitBox = $derived.by(() => {
		const pad = 24;
		const cw = Math.max(0, canvasW - pad);
		const ch = Math.max(0, canvasH - pad);
		if (!cw || !ch) return { w: 0, h: 0 };
		if (!aspect) return { w: cw, h: ch };
		const a = cw / ch;
		if (aspect >= a) return { w: cw, h: cw / aspect };
		return { w: ch * aspect, h: ch };
	});
	const boxW = $derived(fitBox.w * zoom);
	const boxH = $derived(fitBox.h * zoom);

	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) aspect = img.naturalWidth / img.naturalHeight;
	}
	// Inline SVG intrinsic ratio from its viewBox (fallback: rendered rect).
	function measureSvg() {
		const el = boxEl?.querySelector('svg');
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

	$effect(() => {
		void src;
		void svg;
		aspect = 0;
		queueMicrotask(() => {
			if (svg) measureSvg();
		});
	});

	$effect(() => {
		if (!canvasEl) return;
		const measure = () => {
			if (!canvasEl) return;
			canvasW = canvasEl.clientWidth;
			canvasH = canvasEl.clientHeight;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(canvasEl);
		return () => ro.disconnect();
	});

	// Pointer position as a percent of the drawing box (clamped to it).
	function pctFromEvent(e: PointerEvent) {
		const rect = boxEl!.getBoundingClientRect();
		return {
			x: cl(((e.clientX - rect.left) / rect.width) * 100),
			y: cl(((e.clientY - rect.top) / rect.height) * 100)
		};
	}

	function onPointerDown(e: PointerEvent) {
		if (!boxEl || e.button !== 0) return;
		const target = e.target as HTMLElement;
		const handleEl = target.closest<HTMLElement>('[data-handle]');
		const regionEl = target.closest<HTMLElement>('[data-idx]');
		boxEl.setPointerCapture(e.pointerId);
		const p = pctFromEvent(e);

		if (handleEl && regionEl) {
			// Resize the selected region from a handle.
			const idx = Number(regionEl.dataset.idx);
			selected = idx;
			mode = 'resize';
			activeHandle = handleEl.dataset.handle as Handle;
			const rg = regions[idx];
			dragStartBox = { left: rg.x, right: rg.x + rg.w, top: rg.y, bottom: rg.y + rg.h };
		} else if (regionEl) {
			// Move an existing region.
			const idx = Number(regionEl.dataset.idx);
			selected = idx;
			mode = 'move';
			const rg = regions[idx];
			moveOffset = { x: p.x - rg.x, y: p.y - rg.y };
		} else {
			// Draw a new region on empty drawing space.
			mode = 'draw';
			dragStartPt = p;
			drawPreview = { x: p.x, y: p.y, w: 0, h: 0 };
		}
		e.preventDefault();
	}

	function onPointerMove(e: PointerEvent) {
		if (mode === 'idle') return;
		const p = pctFromEvent(e);

		if (mode === 'draw') {
			const x = Math.min(dragStartPt.x, p.x);
			const y = Math.min(dragStartPt.y, p.y);
			drawPreview = { x, y, w: Math.abs(p.x - dragStartPt.x), h: Math.abs(p.y - dragStartPt.y) };
			return;
		}

		if (mode === 'move' && selected >= 0) {
			const rg = regions[selected];
			rg.x = r1(cl(Math.min(p.x - moveOffset.x, 100 - rg.w)));
			rg.y = r1(cl(Math.min(p.y - moveOffset.y, 100 - rg.h)));
			return;
		}

		if (mode === 'resize' && selected >= 0 && activeHandle) {
			let { left, right, top, bottom } = dragStartBox;
			if (activeHandle.includes('w')) left = p.x;
			if (activeHandle.includes('e')) right = p.x;
			if (activeHandle.includes('n')) top = p.y;
			if (activeHandle.includes('s')) bottom = p.y;
			let nx = Math.min(left, right);
			let ny = Math.min(top, bottom);
			let nw = Math.abs(right - left);
			let nh = Math.abs(bottom - top);
			if (nw < MIN) nw = MIN;
			if (nh < MIN) nh = MIN;
			if (nx + nw > 100) nx = 100 - nw;
			if (ny + nh > 100) ny = 100 - nh;
			const rg = regions[selected];
			rg.x = r1(cl(nx));
			rg.y = r1(cl(ny));
			rg.w = r1(nw);
			rg.h = r1(nh);
		}
	}

	function onPointerUp(e: PointerEvent) {
		if (boxEl?.hasPointerCapture(e.pointerId)) boxEl.releasePointerCapture(e.pointerId);
		if (mode === 'draw' && drawPreview) {
			const d = drawPreview;
			if (d.w >= MIN && d.h >= MIN) {
				regions = [
					...regions,
					{ label: '', x: r1(d.x), y: r1(d.y), w: r1(Math.min(d.w, 100 - d.x)), h: r1(Math.min(d.h, 100 - d.y)) }
				];
				selected = regions.length - 1;
			}
			drawPreview = null;
		}
		mode = 'idle';
		activeHandle = null;
	}

	const zoomBy = (f: number) => {
		zoom = Math.max(1, Math.min(6, Math.round(zoom * f * 100) / 100));
	};
	const fitZoom = () => {
		zoom = 1;
	};

	const hasDrawing = $derived(!!src || !!svg);
	const pct = $derived(Math.round(zoom * 100));
</script>

<div class="re">
	<div class="re-toolbar">
		<span class="re-hint">Drag on the drawing to add a region. Drag a box to move it, or its handles to resize.</span>
		<span class="re-spacer"></span>
		<div class="re-zoom">
			<button type="button" class="re-zbtn" title="Zoom out" aria-label="Zoom out" onclick={() => zoomBy(1 / 1.4)}>&minus;</button>
			<span class="re-pct" aria-hidden="true">{pct}%</span>
			<button type="button" class="re-zbtn" title="Zoom in" aria-label="Zoom in" onclick={() => zoomBy(1.4)}>+</button>
			<button type="button" class="re-zbtn fit" title="Fit" aria-label="Fit to view" onclick={fitZoom}>Fit</button>
		</div>
	</div>

	<div class="re-canvas" bind:this={canvasEl}>
		{#if !hasDrawing}
			<div class="re-empty">
				<p class="dim">Add a drawing (PNG or inline SVG) above to place focus regions on it.</p>
			</div>
		{:else}
			<div class="re-pad">
				<div
					class="re-box"
					bind:this={boxEl}
					style="width:{boxW}px;height:{boxH}px;"
					onpointerdown={onPointerDown}
					onpointermove={onPointerMove}
					onpointerup={onPointerUp}
					onpointercancel={onPointerUp}
					role="application"
					aria-label="Draw focus regions on the drawing"
				>
					{#if src}
						<img class="re-media" {src} alt="Drawing" draggable="false" onload={onImgLoad} />
					{:else if svg}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<div class="re-media re-svg">{@html svg}</div>
					{/if}

					{#each regions as rg, i (i)}
						<div
							class="re-region"
							class:selected={selected === i}
							data-idx={i}
							style="left:{rg.x}%;top:{rg.y}%;width:{rg.w}%;height:{rg.h}%;"
						>
							<span class="re-label">{rg.label || `Detail ${i + 1}`}</span>
							{#if selected === i}
								{#each HANDLES as h (h)}
									<span class="re-handle re-h-{h}" data-handle={h}></span>
								{/each}
							{/if}
						</div>
					{/each}

					{#if drawPreview}
						<div
							class="re-region re-preview"
							style="left:{drawPreview.x}%;top:{drawPreview.y}%;width:{drawPreview.w}%;height:{drawPreview.h}%;"
						></div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.re {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.re-toolbar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.re-hint {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.68rem;
		color: var(--dim, #5f8a78);
		line-height: 1.4;
	}
	.re-spacer {
		flex: 1;
	}
	.re-zoom {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.re-zbtn {
		min-width: 26px;
		height: 26px;
		padding: 0 6px;
		border: 1px solid rgba(0, 240, 255, 0.3);
		border-radius: 6px;
		background: rgba(14, 22, 27, 0.9);
		color: var(--cyan, #00f0ff);
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.9rem;
		line-height: 1;
		cursor: pointer;
	}
	.re-zbtn.fit {
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.re-zbtn:hover {
		border-color: var(--cyan, #00f0ff);
		color: var(--white, #e8fff0);
	}
	.re-pct {
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.6rem;
		color: var(--dim, #5f8a78);
		min-width: 34px;
		text-align: center;
	}
	.re-canvas {
		position: relative;
		height: 380px;
		overflow: auto;
		border: 1px solid var(--line-strong, rgba(0, 255, 65, 0.4));
		border-radius: 4px;
		/* Blueprint field, matching the student DrawingViewer. */
		background-color: #04130c;
		background-image:
			linear-gradient(rgba(0, 255, 65, 0.07) 1px, transparent 1px),
			linear-gradient(90deg, rgba(0, 255, 65, 0.07) 1px, transparent 1px);
		background-size: 24px 24px;
	}
	.re-empty {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		text-align: center;
		padding: 1rem;
	}
	.re-pad {
		min-width: 100%;
		min-height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		box-sizing: border-box;
	}
	.re-box {
		position: relative;
		flex: none;
		touch-action: none;
		cursor: crosshair;
	}
	.re-media {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
		/* Drop the paper, keep the linework, same recolor as the student viewer. */
		filter: invert(1) drop-shadow(0 0 1px rgba(0, 255, 65, 0.5));
		mix-blend-mode: screen;
	}
	.re-svg :global(svg) {
		width: 100%;
		height: 100%;
	}
	.re-region {
		position: absolute;
		border: 1px solid rgba(0, 240, 255, 0.5);
		background: rgba(0, 240, 255, 0.06);
		box-sizing: border-box;
		cursor: move;
	}
	.re-region.selected {
		border-color: var(--cyan, #00f0ff);
		box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
		background: rgba(0, 240, 255, 0.1);
	}
	.re-region.re-preview {
		border-style: dashed;
		background: rgba(0, 240, 255, 0.12);
		pointer-events: none;
	}
	.re-label {
		position: absolute;
		top: 0;
		left: 0;
		transform: translateY(-100%);
		font-family: var(--font-data, 'Share Tech Mono', monospace);
		font-size: 0.56rem;
		letter-spacing: 0.04em;
		color: var(--cyan, #00f0ff);
		background: rgba(4, 7, 10, 0.85);
		border: 1px solid rgba(0, 240, 255, 0.3);
		border-radius: 3px 3px 0 0;
		padding: 0.05rem 0.3rem;
		white-space: nowrap;
		pointer-events: none;
		max-width: 200%;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.re-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background: var(--void, #04070a);
		border: 1.5px solid var(--cyan, #00f0ff);
		border-radius: 2px;
	}
	.re-h-nw {
		top: -5px;
		left: -5px;
		cursor: nwse-resize;
	}
	.re-h-n {
		top: -5px;
		left: calc(50% - 5px);
		cursor: ns-resize;
	}
	.re-h-ne {
		top: -5px;
		right: -5px;
		cursor: nesw-resize;
	}
	.re-h-e {
		top: calc(50% - 5px);
		right: -5px;
		cursor: ew-resize;
	}
	.re-h-se {
		bottom: -5px;
		right: -5px;
		cursor: nwse-resize;
	}
	.re-h-s {
		bottom: -5px;
		left: calc(50% - 5px);
		cursor: ns-resize;
	}
	.re-h-sw {
		bottom: -5px;
		left: -5px;
		cursor: nesw-resize;
	}
	.re-h-w {
		top: calc(50% - 5px);
		left: -5px;
		cursor: ew-resize;
	}
	/* Selection feedback may ease; geometry never transitions (drag stays instant). */
	.re-region {
		transition:
			border-color 0.15s ease,
			box-shadow 0.2s ease,
			background-color 0.15s ease;
	}
	@media (prefers-reduced-motion: reduce) {
		.re-region {
			transition: none;
		}
	}
</style>
