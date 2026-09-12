/**
 * `SolidWorksControls`: the DOM half of PART 4, over `controls-math.ts`.
 *
 * NOT OrbitControls, and the reason is behavioural rather than availability.
 * OrbitControls is a turntable -- azimuth and polar about a world up vector,
 * with clamps and damping. SolidWorks' default is a free arcball about the
 * rotation center with no world-up lock and no inertia, and a student feels
 * the difference in the first second. `rotateScreen` in `controls-math.ts` is
 * that arcball and is already tested; this file binds it to pointers and keys
 * and owns no arithmetic of its own beyond composing that module's helpers.
 *
 * EVERY MUTATION GOES THROUGH `write`, which hands back a NEW `CameraState`.
 * The viewport re-renders on demand from that callback and never polls, which
 * is what PART 4's 60 fps line asks for: an idle viewport issues no frames at
 * all, so a drag is measured against a renderer that was doing nothing a
 * moment before rather than one already spending its budget.
 */
import {
	axisAngle,
	arrowRotation,
	multiply,
	rotateScreen,
	zoomOrthoAboutCursor,
	PreviousViewStack,
	STANDARD_VIEWS,
	type CameraState
} from './controls-math';
import { fitted, panByPixels, wheelFactor } from './camera-rig';

export interface ControlsOptions {
	/** The current state. Read fresh on every event: the owner may replace it. */
	get: () => CameraState;
	/** The new state. The owner stores it and schedules a frame. */
	write: (next: CameraState) => void;
	/** The canvas box in CSS pixels. Read per event so a resize needs no re-bind. */
	size: () => { width: number; height: number };
	/** The model's bounding radius about the anchor, for Zoom to Fit. */
	radius: () => number;
	/** SolidWorks' own options, all defaulting the way SolidWorks defaults them. */
	mouseSpeed?: number;
	arrowDegrees?: number;
	zoomStep?: number;
	reverseWheel?: boolean;
}

/**
 * `setPointerCapture` throws `NotFoundError` for a pointer the element is not
 * currently tracking -- a pointer already released, and any pointer a script
 * constructed. Capture is an improvement on a drag (it keeps the moves coming
 * when the cursor leaves the pane), never a precondition for one, so a refusal
 * must not be allowed to abort the handler that arms the drag.
 */
function capture(el: HTMLElement, id: number) {
	try {
		el.setPointerCapture(id);
	} catch {
		/* the drag still works; it just ends at the pane's edge */
	}
}

/** SolidWorks' standard-view accelerators, Ctrl+1 through Ctrl+7. */
const VIEW_KEYS: Record<string, keyof typeof STANDARD_VIEWS> = {
	'1': 'Front',
	'2': 'Back',
	'3': 'Left',
	'4': 'Right',
	'5': 'Top',
	'6': 'Bottom',
	'7': 'Isometric'
};

/**
 * A shortcut never fires while somebody is typing (interface standard 8). The
 * check is on the ACTIVE ELEMENT rather than on the event target, because a
 * key handler bound to the document sees a keystroke aimed at a field
 * elsewhere on the page -- the PropertyManager's number inputs are the case
 * that matters, and `Z` is a perfectly ordinary character to type into one.
 */
export function typingInto(el: Element | null): boolean {
	if (!el) return false;
	const tag = el.tagName;
	return (
		tag === 'INPUT' ||
		tag === 'TEXTAREA' ||
		tag === 'SELECT' ||
		(el as HTMLElement).isContentEditable === true
	);
}

export class SolidWorksControls {
	readonly previous = new PreviousViewStack();
	private drag: { x: number; y: number; mode: 'rotate' | 'pan' | 'zoom' | 'roll'; id: number } | null = null;
	private touches = new Map<number, { x: number; y: number }>();
	private pinch = 0;
	private readonly onPointerDown: (e: PointerEvent) => void;
	private readonly onPointerMove: (e: PointerEvent) => void;
	private readonly onPointerUp: (e: PointerEvent) => void;
	private readonly onWheel: (e: WheelEvent) => void;
	private readonly onKeyDown: (e: KeyboardEvent) => void;
	private readonly onAuxClick: (e: MouseEvent) => void;

	constructor(
		private el: HTMLElement,
		private o: ControlsOptions
	) {
		const speed = o.mouseSpeed ?? Math.PI;
		const step = o.zoomStep ?? 1.25;

		this.onPointerDown = (e) => {
			if (e.pointerType === 'touch') {
				this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
				this.pinch = this.spread();
				capture(el, e.pointerId);
				return;
			}
			/* Middle only. Left is SolidWorks' selection button and right is its
			   context menu; binding rotate to either would have to be taken away
			   again the day selection lands. */
			if (e.button !== 1) return;
			e.preventDefault();
			this.pushPrevious();
			this.drag = {
				x: e.clientX,
				y: e.clientY,
				mode: e.ctrlKey ? 'pan' : e.shiftKey ? 'zoom' : e.altKey ? 'roll' : 'rotate',
				id: e.pointerId
			};
			capture(el, e.pointerId);
		};

		this.onPointerMove = (e) => {
			if (e.pointerType === 'touch') return this.touchMove(e, step);
			if (!this.drag || e.pointerId !== this.drag.id) return;
			const dx = e.clientX - this.drag.x;
			const dy = e.clientY - this.drag.y;
			this.drag.x = e.clientX;
			this.drag.y = e.clientY;
			if (!dx && !dy) return;
			const s = this.o.get();
			const box = this.o.size();
			if (this.drag.mode === 'rotate') {
				this.o.write({ ...s, quaternion: rotateScreen(s.quaternion, dx, dy, box.width, speed) });
			} else if (this.drag.mode === 'pan') {
				this.o.write(panByPixels(s, dx, dy));
			} else if (this.drag.mode === 'roll') {
				/* About the view axis. Composed from the module's own helpers so
				   there is still one definition of what a rotation is. */
				this.o.write({
					...s,
					quaternion: multiply(axisAngle({ x: 0, y: 0, z: 1 }, (-dx / box.width) * speed), s.quaternion)
				});
			} else {
				/* Drag UP zooms in, which is SolidWorks' direction. */
				this.o.write({ ...s, orthoZoom: Math.max(1e-3, s.orthoZoom * Math.exp(-dy / 200)) });
			}
		};

		this.onPointerUp = (e) => {
			this.touches.delete(e.pointerId);
			if (this.touches.size < 2) this.pinch = 0;
			if (this.drag && e.pointerId === this.drag.id) this.drag = null;
			if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
		};

		this.onWheel = (e) => {
			e.preventDefault();
			const box = this.o.size();
			const r = el.getBoundingClientRect();
			const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
			/* Outside the viewport SolidWorks zooms about the model centre, which
			   here is the middle of the pane -- the anchor's own screen position
			   whenever the pan offset is zero. */
			const cursor = inside
				? { x: e.clientX - r.left, y: e.clientY - r.top }
				: { x: box.width / 2, y: box.height / 2 };
			this.o.write(
				zoomOrthoAboutCursor(this.o.get(), wheelFactor(e.deltaY, step, o.reverseWheel ?? false), cursor, box)
			);
		};

		/* Middle-click on Windows opens the browser's autoscroll puck otherwise,
		   which lands a scrolling cursor over the model for the whole drag. */
		this.onAuxClick = (e) => {
			if (e.button === 1) e.preventDefault();
		};

		this.onKeyDown = (e) => {
			if (typingInto(document.activeElement)) return;
			const s = this.o.get();
			const box = this.o.size();
			if (e.ctrlKey && e.key in VIEW_KEYS) {
				e.preventDefault();
				this.pushPrevious();
				this.o.write({ ...s, quaternion: STANDARD_VIEWS[VIEW_KEYS[e.key]] });
				return;
			}
			if (e.key === 'f' || e.key === 'F') {
				e.preventDefault();
				this.pushPrevious();
				this.o.write(fitted(s, this.o.radius(), box));
				return;
			}
			if (e.key === 'z' || e.key === 'Z') {
				e.preventDefault();
				if (e.ctrlKey && e.shiftKey) return void this.restorePrevious();
				this.pushPrevious();
				const factor = e.shiftKey ? step : 1 / step;
				this.o.write({ ...s, orthoZoom: Math.max(1e-3, s.orthoZoom * factor) });
				return;
			}
			if (e.key.startsWith('Arrow')) {
				e.preventDefault();
				this.pushPrevious();
				const key = e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
				if (e.ctrlKey) {
					/* Ctrl + arrows pan, per the map. */
					const d = 40;
					const dx = key === 'ArrowLeft' ? -d : key === 'ArrowRight' ? d : 0;
					const dy = key === 'ArrowUp' ? -d : key === 'ArrowDown' ? d : 0;
					this.o.write(panByPixels(s, dx, dy));
					return;
				}
				if (e.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
					const sign = key === 'ArrowLeft' ? 1 : -1;
					const deg = (o.arrowDegrees ?? 15) * sign;
					this.o.write({
						...s,
						quaternion: multiply(axisAngle({ x: 0, y: 0, z: 1 }, (deg * Math.PI) / 180), s.quaternion)
					});
					return;
				}
				this.o.write({
					...s,
					quaternion: arrowRotation(s.quaternion, key, e.shiftKey ? 90 : (o.arrowDegrees ?? 15))
				});
			}
		};

		el.addEventListener('pointerdown', this.onPointerDown);
		el.addEventListener('pointermove', this.onPointerMove);
		el.addEventListener('pointerup', this.onPointerUp);
		el.addEventListener('pointercancel', this.onPointerUp);
		el.addEventListener('auxclick', this.onAuxClick);
		/* Non-passive: the handler calls `preventDefault` and a passive listener
		   cannot, so the page would scroll under the model on every notch. */
		el.addEventListener('wheel', this.onWheel, { passive: false });
		el.addEventListener('keydown', this.onKeyDown);
	}

	private spread(): number {
		const [a, b] = [...this.touches.values()];
		return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
	}

	private touchMove(e: PointerEvent, step: number) {
		const was = this.touches.get(e.pointerId);
		if (!was) return;
		const dx = e.clientX - was.x;
		const dy = e.clientY - was.y;
		this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
		const s = this.o.get();
		const box = this.o.size();
		if (this.touches.size === 1) {
			this.o.write({ ...s, quaternion: rotateScreen(s.quaternion, dx, dy, box.width, this.o.mouseSpeed ?? Math.PI) });
			return;
		}
		const now = this.spread();
		if (this.pinch && now) {
			const r = this.el.getBoundingClientRect();
			const centre = [...this.touches.values()].reduce(
				(acc, t) => ({ x: acc.x + t.x / this.touches.size, y: acc.y + t.y / this.touches.size }),
				{ x: 0, y: 0 }
			);
			const factor = now / this.pinch;
			this.pinch = now;
			if (Math.abs(factor - 1) > 0.01) {
				this.o.write(
					zoomOrthoAboutCursor(s, Math.min(step, Math.max(1 / step, factor)), { x: centre.x - r.left, y: centre.y - r.top }, box)
				);
				return;
			}
		}
		this.o.write(panByPixels(s, dx / this.touches.size, dy / this.touches.size));
	}

	/**
	 * A view worth going back to, recorded before whatever is about to change
	 * it -- and NEVER able to stop the thing it is recording.
	 *
	 * `PreviousViewStack.push` deep-copies with `structuredClone`, which refuses
	 * some perfectly ordinary objects (a reactive proxy among them). This is the
	 * FIRST statement of `pointerdown` and of every key that changes the view,
	 * so a throw here does not cost a Previous entry, it costs the whole control
	 * map: no rotation, no standard view, no zoom, and nothing on screen saying
	 * why. That is exactly what happened, and it reached a browser.
	 *
	 * The caller's contract is still to hand over a plain state, and
	 * `Viewport.svelte` does (`$state.snapshot`). This is the second layer:
	 * going back a view is a convenience, and a convenience must never be able
	 * to abort the feature it sits in front of.
	 */
	pushPrevious() {
		try {
			this.previous.push(this.o.get());
		} catch {
			/* No entry recorded. The view still changes, which is the part that
			   matters; Previous simply has one fewer place to go. */
		}
	}

	restorePrevious() {
		const v = this.previous.pop();
		if (v) this.o.write(v);
	}

	zoomToFit() {
		this.pushPrevious();
		this.o.write(fitted(this.o.get(), this.o.radius(), this.o.size()));
	}

	standardView(name: keyof typeof STANDARD_VIEWS) {
		this.pushPrevious();
		this.o.write({ ...this.o.get(), quaternion: STANDARD_VIEWS[name] });
	}

	destroy() {
		const el = this.el;
		el.removeEventListener('pointerdown', this.onPointerDown);
		el.removeEventListener('pointermove', this.onPointerMove);
		el.removeEventListener('pointerup', this.onPointerUp);
		el.removeEventListener('pointercancel', this.onPointerUp);
		el.removeEventListener('auxclick', this.onAuxClick);
		el.removeEventListener('wheel', this.onWheel);
		el.removeEventListener('keydown', this.onKeyDown);
	}
}
