<script lang="ts">
	/**
	 * IDEA // GAUNTLET drawing viewer, rebuilt around a full-sheet PDF contract.
	 *
	 * Content kinds: a PDF URL (`src`, sniffed by isPdfRef or forced with `pdf`),
	 * rendered with pdf.js one sheet per page (multi-page supported); a raster URL
	 * (legacy PNG drawings); or inline SVG markup (`svg`). Whatever the kind, the
	 * drawing and the focus-region hotspots live inside ONE wrapper (`.dv-world`)
	 * laid out at intrinsic size, and every pan/zoom is a single
	 * `translate(tx,ty) scale(s)` transform on that wrapper (transform-origin
	 * 0 0). Regions are normalized page coordinates (0..1 + page index), so they
	 * are positioned in the drawing's own page space and can never drift from it
	 * at any zoom level.
	 *
	 * Intrinsic dimensions come from the pdf.js page viewport (true content
	 * dimensions), the raster's naturalWidth/Height, or the SVG viewBox. The fit
	 * is computed ONLY after the stage has real, non-zero layout dimensions (a
	 * ResizeObserver feeds the stage size) AND the content dimensions are known;
	 * it recomputes on content-ready and preserves the framed view on container
	 * resize. The world stays hidden until that first fit, and the reveal
	 * animation is triggered off the same gate, so it can never race the fit calc.
	 *
	 * PDF crispness: each page renders into a canvas whose backing store is sized
	 * to the CURRENT display scale (device-pixel-ratio aware, re-rendered on zoom
	 * settle into an offscreen canvas and blitted, so the sheet never blanks), but
	 * whose CSS box stays at intrinsic page units inside the shared transform, so
	 * a re-render never moves anything. Pages render with a TRANSPARENT background
	 * onto the component's own off-white paper, which seats the sheet into the
	 * dark frame without tinting the linework.
	 *
	 * Reveal (`reveal` prop): a deterministic CRT plotter scan-in, under 1s total:
	 * power-up line expands, a phosphor scan bar sweeps top to bottom revealing
	 * the composited sheet through a stage-space clip mask that follows the bar,
	 * settling on one edge-glow pulse. Purely presentational (the run clock lives
	 * outside this component and nothing here gates it). prefers-reduced-motion
	 * falls back to an instant fade with no sweep.
	 *
	 * Layout: `.dv-controls` / `.dv-minimap` are SIBLINGS of `.dv-stage` (not its
	 * children), so a click on a control never trips the stage's pointer-capture
	 * pan. Interaction listeners are attached with addEventListener (NOT Svelte's
	 * delegated `on:`), and styles are scoped with hardcoded token fallbacks, so
	 * the live node keeps working after being moved into a Document PiP window.
	 */
	import type { FocusRegion } from '$lib/gauntlet';
	import { loadPdfjs, isPdfRef } from '$lib/gauntlet/pdf';
	import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

	let {
		src = null,
		svg = null,
		pdf = null,
		regions = [],
		alt = 'Drawing',
		blueprint = true,
		reveal = false
	}: {
		src?: string | null;
		svg?: string | null;
		/** Force PDF handling for a `src` with no sniffable extension; null = sniff. */
		pdf?: boolean | null;
		regions?: FocusRegion[];
		alt?: string;
		/** Faint grid on the graphite stage (purely decorative). */
		blueprint?: boolean;
		/** Play the CRT plotter scan-in once, when the content is ready and fitted. */
		reveal?: boolean;
	} = $props();

	const kind = $derived<'pdf' | 'raster' | 'svg' | 'none'>(
		src ? ((pdf ?? isPdfRef(src)) ? 'pdf' : 'raster') : svg ? 'svg' : 'none'
	);

	let dvEl = $state<HTMLDivElement | null>(null);
	let stageEl = $state<HTMLDivElement | null>(null);

	// Intrinsic page boxes (pdf.js viewport units / raster px / SVG viewBox units).
	// `pad` is a thin paper border for legacy cropped raster/SVG exports; PDF pages
	// are full sheets carrying their own margins, so their pad is 0.
	interface PageBox {
		w: number; // media width, intrinsic units
		h: number;
		pad: number;
	}
	let pages = $state<PageBox[]>([]);
	let loading = $state(false);
	let loadError = $state('');

	// pdf.js handles live OUTSIDE reactive state (proxies must not be wrapped).
	let pdfDoc: PDFDocumentProxy | null = null;
	let pdfPages: PDFPageProxy[] = [];
	let canvasEls: (HTMLCanvasElement | null)[] = $state([]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let renderTasks: (any | null)[] = [];
	let renderedScale = 0;
	let renderSeq = 0;

	// Stage size in CSS px (ResizeObserver-fed; fit only runs when both are > 0).
	let W = $state(0);
	let H = $state(0);
	// The one shared view transform.
	let s = $state(1);
	let tx = $state(0);
	let ty = $state(0);
	let fitted = $state(false);

	let highlightIdx = $state(-1);
	let highlightTimer: ReturnType<typeof setTimeout> | null = null;

	// Monotonic guard: a slow load for a previous drawing can never apply late.
	let loadSeq = 0;

	const reducedMotion = () =>
		typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	// --- Intrinsic layout (pages stacked vertically inside one world box) ------
	const layout = $derived.by(() => {
		if (!pages.length) return { pages: [] as { x: number; y: number; w: number; h: number; pad: number }[], W: 0, H: 0 };
		const outerW = (p: PageBox) => p.w + 2 * p.pad;
		const outerH = (p: PageBox) => p.h + 2 * p.pad;
		const CW = Math.max(...pages.map(outerW));
		const gap = pages.length > 1 ? Math.max(...pages.map(outerH)) * 0.035 : 0;
		let y = 0;
		const boxes = pages.map((p) => {
			const b = { x: (CW - outerW(p)) / 2, y, w: outerW(p), h: outerH(p), pad: p.pad };
			y += outerH(p) + gap;
			return b;
		});
		return { pages: boxes, W: CW, H: y - gap };
	});
	const ready = $derived(layout.W > 0 && layout.H > 0);

	// Fit-all scale: the whole content (every sheet) inside the stage, with a dark
	// margin so the sheets read as framed, never full-bleed.
	const FIT = 0.92;
	const sFit = $derived(W && H && ready ? Math.min(W / layout.W, H / layout.H) * FIT : 1);
	const maxS = $derived(Math.max(sFit * 8, 3));
	const clampScale = (v: number) => Math.min(maxS, Math.max(sFit, v));

	// Keep the world pinned: centered on an axis it fits, edge-locked on overflow.
	function clampPan() {
		const ow = layout.W * s;
		const oh = layout.H * s;
		tx = ow <= W ? (W - ow) / 2 : Math.min(0, Math.max(W - ow, tx));
		ty = oh <= H ? (H - oh) / 2 : Math.min(0, Math.max(H - oh, ty));
	}

	// --- Animated transform (chips / FIT animate the SAME shared transform) ----
	// The tween ticks on requestAnimationFrame OR a timeout, whichever fires
	// first: a backgrounded/throttled tab (or a starved PiP window) never ticks
	// rAF, and a pure-rAF tween would freeze the view mid-jump there.
	let animToken = 0;
	function cancelAnim() {
		animToken++;
	}
	function animateTo(ns: number, ntx: number, nty: number) {
		cancelAnim();
		if (reducedMotion()) {
			s = ns;
			tx = ntx;
			ty = nty;
			clampPan();
			return;
		}
		const token = animToken;
		const s0 = s;
		const x0 = tx;
		const y0 = ty;
		const T = 280;
		const start = performance.now();
		const tick = (cb: () => void) => {
			let fired = false;
			const once = () => {
				if (fired || token !== animToken) return;
				fired = true;
				cb();
			};
			requestAnimationFrame(once);
			setTimeout(once, 40);
		};
		const step = () => {
			if (token !== animToken) return;
			const t = Math.min(1, (performance.now() - start) / T);
			const e = 1 - Math.pow(1 - t, 3);
			s = s0 + (ns - s0) * e;
			tx = x0 + (ntx - x0) * e;
			ty = y0 + (nty - y0) * e;
			if (t < 1) tick(step);
			else clampPan();
		};
		tick(step);
	}

	function fitTransform() {
		const ns = sFit;
		return {
			s: ns,
			tx: (W - layout.W * ns) / 2,
			ty: (H - layout.H * ns) / 2
		};
	}

	function fitView(animated = false) {
		const f = fitTransform();
		if (animated) animateTo(f.s, f.tx, f.ty);
		else {
			s = f.s;
			tx = f.tx;
			ty = f.ty;
			clampPan();
		}
	}

	function zoomAt(factor: number, px: number, py: number) {
		cancelAnim();
		const ns = clampScale(s * factor);
		if (ns === s) return;
		tx = px - (px - tx) * (ns / s);
		ty = py - (py - ty) * (ns / s);
		s = ns;
		clampPan();
	}

	const zoomButton = (factor: number) => zoomAt(factor, W / 2, H / 2);

	function jumpTo(r: FocusRegion, i: number) {
		const pageIdx = Math.max(0, Math.round(r.page ?? 0));
		const box = layout.pages[pageIdx];
		if (!box || r.w <= 0 || r.h <= 0) return;
		const mediaW = box.w - 2 * box.pad;
		const mediaH = box.h - 2 * box.pad;
		const cx = box.x + box.pad + (r.x + r.w / 2) * mediaW;
		const cy = box.y + box.pad + (r.y + r.h / 2) * mediaH;
		const ns = clampScale(Math.min(W / (r.w * mediaW), H / (r.h * mediaH)) * 0.8);
		animateTo(ns, W / 2 - cx * ns, H / 2 - cy * ns);
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
		cancelAnim();
		try {
			stageEl.setPointerCapture(e.pointerId);
		} catch {
			/* no capture available; pan still works via the pointer events */
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
	// with addEventListener, so it fires even after the node is moved into a PiP
	// window (Svelte delegates events to the main-document root, unreachable there).
	function onClick(e: MouseEvent) {
		const btn = (e.target as HTMLElement).closest?.('[data-act]');
		if (!btn) return;
		const act = btn.getAttribute('data-act');
		if (act === 'in') zoomButton(1.4);
		else if (act === 'out') zoomButton(1 / 1.4);
		else if (act === 'fit') fitView(true);
		else if (act === 'jump') {
			const i = Number(btn.getAttribute('data-idx'));
			if (regions[i]) jumpTo(regions[i], i);
		}
	}

	// --- Content loading -------------------------------------------------------
	function resetContent() {
		loadSeq++;
		renderSeq++;
		for (const t of renderTasks) t?.cancel?.();
		renderTasks = [];
		if (pdfDoc) {
			pdfDoc.loadingTask.destroy().catch(() => {});
			pdfDoc = null;
		}
		pdfPages = [];
		pages = [];
		canvasEls = [];
		renderedScale = 0;
		fitted = false;
		loadError = '';
	}

	async function loadPdf(ref: string) {
		const seq = loadSeq;
		loading = true;
		try {
			const pdfjs = await loadPdfjs();
			const doc = await pdfjs.getDocument({ url: ref }).promise;
			if (seq !== loadSeq) {
				doc.loadingTask.destroy().catch(() => {});
				return;
			}
			pdfDoc = doc;
			const metas: PDFPageProxy[] = [];
			const boxes: PageBox[] = [];
			for (let i = 1; i <= doc.numPages; i++) {
				const page = await doc.getPage(i);
				if (seq !== loadSeq) return;
				const vp = page.getViewport({ scale: 1 });
				metas.push(page);
				boxes.push({ w: vp.width, h: vp.height, pad: 0 });
			}
			pdfPages = metas;
			pages = boxes;
		} catch (e) {
			if (seq === loadSeq) loadError = e instanceof Error ? e.message : 'Could not load the drawing.';
		} finally {
			if (seq === loadSeq) loading = false;
		}
	}

	function onImgLoad(e: Event) {
		const img = e.currentTarget as HTMLImageElement;
		if (img.naturalWidth && img.naturalHeight) {
			const pad = Math.max(Math.round(Math.max(img.naturalWidth, img.naturalHeight) * 0.025), 8);
			pages = [{ w: img.naturalWidth, h: img.naturalHeight, pad }];
		}
	}

	function measureSvg() {
		const el = dvEl?.querySelector('.dv-measure svg') ?? dvEl?.querySelector('.dv-media svg');
		if (!el) return;
		let w = 0;
		let h = 0;
		const vb = el.getAttribute('viewBox');
		if (vb) {
			const p = vb.split(/[ ,]+/).map(Number);
			if (p.length === 4 && p[2] > 0 && p[3] > 0) {
				w = p[2];
				h = p[3];
			}
		}
		if (!w || !h) {
			const r = el.getBoundingClientRect();
			w = r.width || 1000;
			h = r.height || 750;
		}
		const pad = Math.max(Math.round(Math.max(w, h) * 0.025), 8);
		pages = [{ w, h, pad }];
	}

	// New drawing: forget everything, re-measure, load. A swap mid-reveal also
	// retires the old reveal timers so they can never advance the new run's state.
	$effect(() => {
		const currentSrc = src;
		const currentKind = kind;
		void svg;
		resetContent();
		for (const t of revealTimers) clearTimeout(t);
		revealTimers = [];
		revealState = reveal ? 'pending' : 'done';
		if (currentKind === 'pdf' && currentSrc) loadPdf(currentSrc);
		else if (currentKind === 'svg') tryMeasureSvg();
		// raster: the hidden measure <img>'s onload supplies the dimensions
	});

	// The hidden measure node mounts in the flush AFTER the reset effect wrote
	// pages = [], so measuring retries briefly instead of racing that render.
	function tryMeasureSvg(attempt = 0) {
		queueMicrotask(() => {
			measureSvg();
			if (!pages.length && attempt < 5) setTimeout(() => tryMeasureSvg(attempt + 1), 30);
		});
	}

	// --- PDF page rendering (offscreen render + blit, never blanks) ------------
	const dpr = () => dvEl?.ownerDocument?.defaultView?.devicePixelRatio ?? window.devicePixelRatio ?? 1;
	const MAX_DIM = 8192;
	const MAX_AREA = 16_000_000;

	async function renderPages(scale: number) {
		if (!pdfPages.length) return;
		const seq = ++renderSeq;
		renderedScale = scale;
		for (let i = 0; i < pdfPages.length; i++) {
			const page = pdfPages[i];
			const target = canvasEls[i];
			if (!target) continue;
			const base = page.getViewport({ scale: 1 });
			let k = scale;
			k = Math.min(k, MAX_DIM / base.width, MAX_DIM / base.height);
			k = Math.min(k, Math.sqrt(MAX_AREA / (base.width * base.height)));
			k = Math.max(k, 0.25);
			const vp = page.getViewport({ scale: k });
			const off = document.createElement('canvas');
			off.width = Math.ceil(vp.width);
			off.height = Math.ceil(vp.height);
			try {
				renderTasks[i]?.cancel?.();
				// intent 'print': pdf.js paces display-intent rendering on
				// requestAnimationFrame, which a backgrounded tab (student alt-tabbed
				// into SolidWorks) or a throttled window never ticks, hanging the
				// render forever. Print intent paints without rAF scheduling; the
				// vector output is identical for a drawing sheet. Background stays
				// the default white (a transparent background is normalized through
				// pdf.js's alpha-dropping color parser and comes out opaque black);
				// the paper knock-down overlay seats the sheet instead.
				const task = page.render({ canvas: off, viewport: vp, intent: 'print' });
				renderTasks[i] = task;
				await task.promise;
			} catch {
				continue; // cancelled or failed; a newer pass owns the canvas
			}
			if (seq !== renderSeq) return;
			target.width = off.width;
			target.height = off.height;
			target.getContext('2d')?.drawImage(off, 0, 0);
		}
	}

	// First render at the fit scale; re-render on zoom settle when the display
	// scale has meaningfully outgrown (or shrunk far below) the backing store.
	let settleTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const zoom = s;
		if (kind !== 'pdf' || !fitted || !pdfPages.length) return;
		if (settleTimer) clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			const want = zoom * dpr();
			if (renderedScale === 0 || want > renderedScale * 1.3 || want < renderedScale / 2.5) {
				renderPages(want);
			}
		}, 180);
		return () => {
			if (settleTimer) clearTimeout(settleTimer);
		};
	});

	// --- Fit-after-measure gate -------------------------------------------------
	// First good fit strictly once BOTH the stage has settled non-zero dimensions
	// AND the intrinsic content dimensions are known. This also arms the reveal.
	$effect(() => {
		if (ready && W > 0 && H > 0 && !fitted) {
			fitView(false);
			fitted = true;
			if (kind === 'pdf') renderPages(sFit * dpr());
			startReveal();
		}
	});

	// Preserve the framed content across a stage resize (or a move into PiP):
	// same scale, same world-point under the stage center.
	function measureStage() {
		if (!stageEl) return;
		const r = stageEl.getBoundingClientRect();
		W = r.width;
		H = r.height;
	}

	$effect(() => {
		if (!stageEl) return;
		measureStage();
		const ro = new ResizeObserver(() => {
			const oldW = W;
			const oldH = H;
			const cx = oldW && s ? (oldW / 2 - tx) / s : layout.W / 2;
			const cy = oldH && s ? (oldH / 2 - ty) / s : layout.H / 2;
			measureStage();
			if (!fitted) return;
			s = clampScale(s);
			tx = W / 2 - cx * s;
			ty = H / 2 - cy * s;
			clampPan();
		});
		ro.observe(stageEl);
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
			cancelAnim();
		};
	});

	// Full teardown on unmount (pdf.js worker resources are real memory).
	$effect(() => {
		return () => {
			resetContent();
			for (const t of revealTimers) clearTimeout(t);
		};
	});

	// --- Reveal: CRT plotter scan-in (presentation only, ~0.95s total) ----------
	// pending -> power (150ms line expand) -> sweep (550ms phosphor bar + mask)
	// -> settle (250ms edge-glow pulse) -> done. Reduced motion: instant fade.
	type RevealState = 'pending' | 'power' | 'sweep' | 'settle' | 'fade' | 'done';
	let revealState = $state<RevealState>('done');
	let revealTimers: ReturnType<typeof setTimeout>[] = [];

	function startReveal() {
		if (revealState !== 'pending') return;
		if (reducedMotion()) {
			revealState = 'fade';
			revealTimers.push(setTimeout(() => (revealState = 'done'), 180));
			return;
		}
		revealState = 'power';
		revealTimers.push(setTimeout(() => (revealState = 'sweep'), 150));
		revealTimers.push(setTimeout(() => (revealState = 'settle'), 700));
		revealTimers.push(setTimeout(() => (revealState = 'done'), 950));
	}

	const revealing = $derived(revealState !== 'done' && revealState !== 'fade');

	// --- Readouts ----------------------------------------------------------------
	const zoomed = $derived(s > sFit * 1.04);
	const pct = $derived(fitted ? Math.round((s / (sFit || 1)) * 100) : 100);

	// Minimap: abstract sheet outlines with the visible window marked (position
	// indicator; no thumbnail bitmap, so it costs nothing and survives PiP moves).
	const mini = $derived.by(() => {
		if (!ready || !W || !H || !fitted) return null;
		const MW = 96;
		const k = MW / layout.W;
		const MH = Math.max(30, Math.min(130, Math.round(layout.H * k)));
		const kk = Math.min(k, MH / layout.H);
		const x = Math.max(0, -tx / s);
		const y = Math.max(0, -ty / s);
		const x2 = Math.min(layout.W, (W - tx) / s);
		const y2 = Math.min(layout.H, (H - ty) / s);
		return {
			MW,
			MH,
			pages: layout.pages.map((p) => ({ x: p.x * kk, y: p.y * kk, w: p.w * kk, h: p.h * kk })),
			x: x * kk,
			y: y * kk,
			w: Math.max(4, (x2 - x) * kk),
			h: Math.max(4, (y2 - y) * kk)
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
			<!-- Reveal mask: clipped in STAGE space during the sweep, so the shared
			     drawing/region transform inside is never touched by the animation. -->
			<div
				class="dv-mask"
				class:pending={revealState === 'pending' || revealState === 'power'}
				class:sweep={revealState === 'sweep'}
				class:fade={revealState === 'fade'}
			>
				<div
					class="dv-world"
					class:hidden={!fitted}
					style="width:{layout.W}px;height:{layout.H}px;transform:translate({tx}px,{ty}px) scale({s});"
				>
					{#each layout.pages as p, pi (pi)}
						<div
							class="dv-page"
							style="left:{p.x}px;top:{p.y}px;width:{p.w}px;height:{p.h}px;padding:{p.pad}px;"
						>
							<div class="dv-media">
								{#if kind === 'pdf'}
									<canvas class="dv-canvas" bind:this={canvasEls[pi]} aria-label="{alt}, sheet {pi + 1}"></canvas>
								{:else if kind === 'raster'}
									<img class="dv-img" {src} {alt} draggable="false" onload={onImgLoad} />
								{:else if kind === 'svg'}
									<!-- Teacher/seed authored (trusted), same as the play pages. -->
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html svg}
								{/if}
								<!-- The sheet renders/bakes stark white; knock the paper down to a
								     neutral off-white without touching linework legibility (a 5%
								     dark veil on near-black lines is imperceptible). -->
								<div class="dv-tone" aria-hidden="true"></div>
								{#each regions as r, i (i)}
									{#if Math.max(0, Math.round(r.page ?? 0)) === pi}
										<div
											class="dv-region"
											class:active={highlightIdx === i}
											style="left:{r.x * 100}%;top:{r.y * 100}%;width:{r.w * 100}%;height:{r.h * 100}%;"
										></div>
									{/if}
								{/each}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Measurement bootstrap for raster/SVG: the display media lives inside
			     .dv-page, which only exists once the intrinsic size is known, so a
			     hidden copy loads first and reports the dimensions. -->
			{#if kind === 'raster' && !pages.length && src}
				<img class="dv-measure" {src} alt="" aria-hidden="true" onload={onImgLoad} />
			{:else if kind === 'svg' && !pages.length && svg}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				<div class="dv-measure" aria-hidden="true">{@html svg}</div>
			{/if}

			<!-- Frame-fixed CRT composite: scanlines, grain, vignette. Never
			     transformed, so it cannot distort drawing-to-region alignment. -->
			<div class="dv-crt" aria-hidden="true"></div>

			{#if revealState === 'power' || revealState === 'sweep'}
				<div class="dv-powerline" class:expand={revealState === 'power'} aria-hidden="true"></div>
			{/if}
			{#if revealState === 'sweep'}
				<div class="dv-scanbar" aria-hidden="true"></div>
			{/if}
			{#if revealState === 'settle'}
				<div class="dv-settle" aria-hidden="true"></div>
			{/if}

			{#if loading && !loadError}
				<p class="dv-status" aria-live="polite">LOADING DRAWING&hellip;</p>
			{:else if loadError}
				<p class="dv-status err" role="alert">DRAWING FAILED TO LOAD &middot; {loadError}</p>
			{/if}
		</div>

		<div class="dv-controls" class:revealing>
			<button type="button" class="dv-btn" title="Zoom in" aria-label="Zoom in" data-act="in">+</button>
			<span class="dv-pct" aria-hidden="true">{pct}%</span>
			<button type="button" class="dv-btn" title="Zoom out" aria-label="Zoom out" data-act="out">&minus;</button>
			<button type="button" class="dv-btn fit" title="Fit whole drawing" aria-label="Fit whole drawing" data-act="fit">Fit</button>
		</div>

		{#if mini && zoomed}
			<div class="dv-minimap" style="width:{mini.MW}px;height:{mini.MH}px;" aria-hidden="true">
				{#each mini.pages as mp, i (i)}
					<div class="dv-mini-page" style="left:{mp.x}px;top:{mp.y}px;width:{mp.w}px;height:{mp.h}px;"></div>
				{/each}
				<div class="dv-mini-view" style="left:{mini.x}px;top:{mini.y}px;width:{mini.w}px;height:{mini.h}px;"></div>
			</div>
		{/if}
	</div>

	<div class="dv-regions">
		<span class="dv-regions-label">Jump to</span>
		{#each regions as r, i (i)}
			<button type="button" class="dv-region-btn" data-act="jump" data-idx={i}>{r.label || `Detail ${i + 1}`}</button>
		{/each}
		<button type="button" class="dv-region-btn reset" data-act="fit">Whole drawing</button>
	</div>
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
		background: radial-gradient(130% 120% at 50% 38%, #0c1310, #05080a 80%);
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

	/* Reveal mask (stage space). Hidden until power-up; the sweep animates a
	   clip-path from fully-covered to open, top to bottom, in lockstep with the
	   scan bar (same duration, same linear timing). */
	.dv-mask {
		position: absolute;
		inset: 0;
	}
	.dv-mask.pending {
		visibility: hidden;
	}
	.dv-mask.sweep {
		animation: dv-mask-sweep 550ms linear forwards;
	}
	.dv-mask.fade {
		animation: dv-mask-fade 160ms ease-out;
	}
	@keyframes dv-mask-sweep {
		from {
			clip-path: inset(0 0 100% 0);
		}
		to {
			clip-path: inset(0 0 0% 0);
		}
	}
	@keyframes dv-mask-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* The one transformed wrapper: drawing sheets AND region hotspots. */
	.dv-world {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: 0 0;
		will-change: transform;
	}
	.dv-world.hidden {
		visibility: hidden;
	}

	/* A drawing sheet, seated into the frame: off-white paper (never stark
	   white), an inset bezel + inner shadow so it sits INSIDE the dark frame,
	   a drop shadow for depth, and a phosphor edge glow in the program accent. */
	.dv-page {
		position: absolute;
		box-sizing: border-box;
		background: #eceae1;
		border-radius: 2px;
		box-shadow:
			inset 0 0 0 1px rgba(0, 0, 0, 0.3),
			inset 0 2px 14px rgba(0, 0, 0, 0.16),
			inset 0 -1px 8px rgba(0, 0, 0, 0.1),
			0 10px 34px rgba(0, 0, 0, 0.62),
			0 0 0 1px rgba(0, 255, 65, 0.16),
			0 0 26px rgba(0, 255, 65, 0.07);
	}
	.dv-media {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.dv-canvas,
	.dv-img,
	.dv-media :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		user-select: none;
		-webkit-user-drag: none;
	}
	/* Paper knock-down for baked-white legacy rasters / SVG sheets: a whisper of
	   the graphite ambient over the media. Low enough to leave black linework at
	   full contrast (a 5% dark veil on near-black is imperceptible). */
	.dv-tone {
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: rgba(10, 16, 13, 0.05);
	}
	/* Hidden measurement copy (keeps layout so an SVG viewBox fallback can be
	   rect-measured; visibility, not display, for that reason). */
	.dv-measure {
		position: absolute;
		top: 0;
		left: 0;
		width: 600px;
		visibility: hidden;
		pointer-events: none;
	}
	.dv-measure :global(svg) {
		width: 100%;
		height: auto;
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
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.5),
			0 0 12px rgba(0, 160, 200, 0.7);
		animation: dv-pulse 1.3s ease-out;
	}
	@keyframes dv-pulse {
		0% {
			box-shadow:
				0 0 0 1px rgba(255, 255, 255, 0.5),
				0 0 0 rgba(0, 160, 200, 0.9);
		}
		100% {
			box-shadow:
				0 0 0 1px rgba(255, 255, 255, 0.5),
				0 0 14px rgba(0, 160, 200, 0.4);
		}
	}

	/* Frame-fixed CRT composite: faint scanlines, grain, vignette. Sits above the
	   sheets, below the controls; opacity kept low so linework stays legible. */
	.dv-crt {
		position: absolute;
		inset: 0;
		pointer-events: none;
		z-index: 2;
		background-image:
			radial-gradient(120% 100% at 50% 45%, transparent 55%, rgba(0, 0, 0, 0.32) 100%),
			repeating-linear-gradient(
				180deg,
				rgba(4, 10, 8, 0.055) 0px,
				rgba(4, 10, 8, 0.055) 1px,
				transparent 1px,
				transparent 4px
			),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='120' height='120' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
	}

	/* Reveal, phase 1: a bright accent line expanding to full width. */
	.dv-powerline {
		position: absolute;
		left: 4%;
		right: 4%;
		top: 50%;
		height: 2px;
		z-index: 3;
		pointer-events: none;
		background: var(--green, #00ff41);
		box-shadow:
			0 0 10px rgba(0, 255, 65, 0.9),
			0 0 34px rgba(0, 255, 65, 0.5);
		transform: scaleX(0);
	}
	.dv-powerline.expand {
		animation: dv-power 150ms ease-out forwards;
	}
	@keyframes dv-power {
		from {
			transform: scaleX(0);
			opacity: 0.4;
		}
		to {
			transform: scaleX(1);
			opacity: 1;
		}
	}

	/* Reveal, phase 2: the phosphor scan bar sweeping top to bottom, glow trail
	   above it, with a light flicker. Locked to the mask sweep (same 550ms
	   linear), so the sheet appears exactly behind the bar. */
	.dv-scanbar {
		position: absolute;
		left: 0;
		right: 0;
		top: -90px;
		height: 90px;
		z-index: 3;
		pointer-events: none;
		background: linear-gradient(
			180deg,
			transparent 0%,
			rgba(0, 255, 65, 0.05) 35%,
			rgba(0, 255, 65, 0.22) 72%,
			rgba(232, 255, 232, 0.85) 97%,
			rgba(0, 255, 65, 0.35) 100%
		);
		animation:
			dv-scan 550ms linear forwards,
			dv-flicker 550ms steps(12) forwards;
	}
	/* The bar's bright bottom edge travels 0 -> stage bottom, exactly the mask's
	   reveal front (same 550ms linear), so the sheet materializes behind the bar. */
	@keyframes dv-scan {
		from {
			top: -90px;
		}
		to {
			top: calc(100% - 90px);
		}
	}
	@keyframes dv-flicker {
		0%,
		38%,
		74% {
			opacity: 1;
		}
		22%,
		56%,
		88% {
			opacity: 0.82;
		}
		100% {
			opacity: 1;
		}
	}

	/* Reveal, phase 3: one edge-glow settle pulse. */
	.dv-settle {
		position: absolute;
		inset: 0;
		z-index: 3;
		pointer-events: none;
		box-shadow: inset 0 0 42px rgba(0, 255, 65, 0.16);
		animation: dv-settle 250ms ease-out forwards;
	}
	@keyframes dv-settle {
		0% {
			opacity: 0;
		}
		35% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	.dv-status {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		z-index: 1;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.16em;
		color: var(--dim, #5f8a78);
		pointer-events: none;
	}
	.dv-status.err {
		color: var(--amber, #ffb000);
		padding: 0 1.5rem;
		text-align: center;
	}

	.dv-controls {
		position: absolute;
		top: 8px;
		right: 8px;
		z-index: 4;
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
	.dv-controls.revealing {
		opacity: 0.35;
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
		z-index: 4;
		border: 1px solid rgba(0, 240, 255, 0.35);
		border-radius: 3px;
		overflow: hidden;
		background: rgba(4, 7, 10, 0.85);
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
	}
	.dv-mini-page {
		position: absolute;
		background: rgba(236, 234, 225, 0.8);
		border-radius: 1px;
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
		.dv-region.active,
		.dv-mask.sweep,
		.dv-powerline.expand,
		.dv-scanbar,
		.dv-settle {
			animation: none;
		}
		.dv-mask.sweep {
			clip-path: none;
		}
	}
</style>
