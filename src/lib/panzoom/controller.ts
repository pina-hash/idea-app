/**
 * The DOM half of the pan/zoom engine: pointer-capture drag, two-finger pinch,
 * wheel zoom, and the ResizeObserver that re-frames on a stage resize. Every
 * number it produces comes from `./transform.ts`; this file owns only gesture
 * state and event plumbing.
 *
 * Extracted verbatim from `src/lib/gauntlet/DrawingViewer.svelte`. Three of its
 * decisions are load-bearing and must survive any edit here:
 *
 *  - LISTENERS ARE ATTACHED WITH addEventListener, never a framework's delegated
 *    binding. A delegated handler is registered on the main document's root,
 *    which a node MOVED into a Document Picture-in-Picture window can no longer
 *    reach -- so the viewer would go dead the moment it popped out.
 *  - THE WHEEL LISTENER IS `{ passive: false }`, because a passive listener
 *    cannot preventDefault, and without that the page scrolls behind the zoom.
 *  - THE HOST OWNS THE VIEW. This controller reads and writes it through
 *    accessors rather than holding it, so a reactive host keeps one source of
 *    truth and everything derived from the transform stays in step.
 *
 * The host keeps its own chrome: controls, minimap, overlays, tweens. This
 * carries none of them, and imports nothing from any feature area.
 */

import { clampScale, panBy, resizeView, scaleBounds, zoomAt, type Size, type View } from './transform';

export interface PanZoomHost {
	/** Current view transform. */
	getView(): View;
	/** Apply a new view transform. */
	setView(v: View): void;
	/** Current stage box in CSS px. */
	getStage(): Size;
	/** Record a re-measured stage box. Called before any re-framing. */
	setStage(sz: Size): void;
	/** Current intrinsic content box. */
	getContent(): Size;
	/**
	 * Whether the host has taken its first fit yet. Before that there is no view
	 * worth preserving, so a resize only re-measures.
	 */
	isFitted(): boolean;
	/**
	 * Called before any user-driven change, so a host-owned tween can stand down
	 * rather than fight the gesture.
	 */
	onInteract?(): void;
	/** Fit margin override; defaults to the transform module's. */
	margin?: number;
}

/**
 * Wire pan/zoom to a stage element. Returns a teardown that removes every
 * listener and disconnects the observer.
 *
 * The stage is measured ONCE synchronously before the observer is created, so a
 * host that already has content can fit on its first frame instead of waiting
 * for an observer callback.
 */
export function attachPanZoom(stage: HTMLElement, host: PanZoomHost): () => void {
	const margin = host.margin;

	function measure() {
		const r = stage.getBoundingClientRect();
		host.setStage({ w: r.width, h: r.height });
	}

	function zoom(factor: number, px: number, py: number) {
		host.onInteract?.();
		host.setView(zoomAt(host.getView(), factor, px, py, host.getStage(), host.getContent(), margin));
	}

	// --- pointer pan + two-finger pinch -------------------------------------
	// Tracked per pointer id, so a second finger arriving mid-drag becomes a
	// pinch and lifting one finger hands the drag back to the one still down --
	// without that handback the view would jump on the next move event.
	const pointers = new Map<number, { x: number; y: number }>();
	let dragging = false;
	let lastX = 0;
	let lastY = 0;
	let pinchDist = 0;

	function onPointerDown(e: PointerEvent) {
		host.onInteract?.();
		try {
			stage.setPointerCapture(e.pointerId);
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
			if (pinchDist > 0 && dist > 0) {
				const rect = stage.getBoundingClientRect();
				const midX = (p[0].x + p[1].x) / 2 - rect.left;
				const midY = (p[0].y + p[1].y) / 2 - rect.top;
				zoom(dist / pinchDist, midX, midY);
			}
			pinchDist = dist;
			return;
		}

		if (!dragging) return;
		host.setView(
			panBy(host.getView(), e.clientX - lastX, e.clientY - lastY, host.getStage(), host.getContent())
		);
		lastX = e.clientX;
		lastY = e.clientY;
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
		e.preventDefault();
		const rect = stage.getBoundingClientRect();
		zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
	}

	measure();

	// Preserve the framed content across a stage resize: same scale, same world
	// point under the stage centre. The re-measure happens whether or not the
	// host has fitted yet -- a host still waiting on its first fit needs the new
	// dimensions to fit WITH.
	const ro = new ResizeObserver(() => {
		const oldStage = host.getStage();
		const oldView = host.getView();
		measure();
		if (!host.isFitted()) return;
		host.setView(resizeView(oldView, oldStage, host.getStage(), host.getContent(), margin));
	});
	ro.observe(stage);

	const wheelOpts = { passive: false } as AddEventListenerOptions;
	stage.addEventListener('wheel', onWheel, wheelOpts);
	stage.addEventListener('pointerdown', onPointerDown);
	stage.addEventListener('pointermove', onPointerMove);
	stage.addEventListener('pointerup', endPointer);
	stage.addEventListener('pointercancel', endPointer);
	stage.addEventListener('lostpointercapture', endPointer);

	return () => {
		ro.disconnect();
		stage.removeEventListener('wheel', onWheel, wheelOpts);
		stage.removeEventListener('pointerdown', onPointerDown);
		stage.removeEventListener('pointermove', onPointerMove);
		stage.removeEventListener('pointerup', endPointer);
		stage.removeEventListener('pointercancel', endPointer);
		stage.removeEventListener('lostpointercapture', endPointer);
	};
}

/**
 * Zoom about the stage centre -- what a +/- control does. Exposed here so a host
 * button and a wheel notch cannot end up applying different arithmetic.
 */
export function zoomCentre(host: PanZoomHost, factor: number): View {
	const stage = host.getStage();
	return zoomAt(
		host.getView(),
		factor,
		stage.w / 2,
		stage.h / 2,
		stage,
		host.getContent(),
		host.margin
	);
}

/** Re-export so a consumer needs one import for the common case. */
export { clampScale, scaleBounds, type Size, type View };
