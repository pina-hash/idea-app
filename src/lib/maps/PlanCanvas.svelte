<script lang="ts">
	/**
	 * THE PLAN SHEET -- spec 7's "typed inch dimensions, drag placement,
	 * snapping, parent assignment", and its one governing sentence: ACCURACY
	 * COMES FROM THE TYPED NUMBERS, NOT THE MOUSE.
	 *
	 * THE TYPED FIELD IS THE ONLY STORE OF THE VALUE, WHICH IS WHY A DRAG
	 * CANNOT OVERWRITE A DIMENSION. This component holds no position state of
	 * its own: it RENDERS `x`/`y`/`outline`/`rotationDeg` handed down from the
	 * form's own typed inputs, and a drag calls `onplace(x, y)` which the form
	 * writes back into those same inputs. So typing 12 moves the shape, and
	 * dragging types a number into the field -- one value, one place, and the
	 * disagreement the spec warns about is unrepresentable rather than
	 * resolved. `onplace` carries an X and a Y and NOTHING ELSE: there is no
	 * width or height anywhere in what a drag can produce, so no reachable
	 * pointer path can change a dimension. Undo is the same write in the other
	 * direction: it hands the PREVIOUS position back through `onplace`, so it
	 * cannot restore anything a drag could not have moved.
	 *
	 * WHAT IS ON THE SHEET, by level. A node that has a parent is drawn INSIDE
	 * ITS PARENT'S FRAME with every sibling around it and its own children
	 * inside it, so a room is placed against the building and the units it
	 * already holds move with it. A ROOT (a building, a site) has no frame to
	 * be placed in, so the sheet IS its own outline, live from the typed
	 * fields, with its rooms drawn inside -- before this existed a new building
	 * drew nothing at all, which is the exact state Mr. Pina reported. A shape
	 * with a size and no position yet is drawn as a GHOST in the middle of the
	 * frame that a drag places, rather than nowhere.
	 *
	 * DIMENSIONS ARE ON THE DRAWING. The shape's width and depth, its X and Y
	 * offsets from the frame's origin and the frame's own size are drawn as
	 * dimension lines in the metadata hue, the way a sheet from SolidWorks
	 * carries them, so a person reads the number they typed where the shape
	 * is and never has to look back at the field to know what they made.
	 *
	 * SNAPPING SAYS WHAT IT SNAPPED TO, in words, every time. A shape that
	 * silently jumped 0.4in is a shape whose typed number somebody will later
	 * find wrong with no way to know why; `mapsPlaceShape` names the target and
	 * the edge, and this surface prints that sentence beside the value.
	 *
	 * PARENT ASSIGNMENT IS NOT INFERRED FROM OVERLAP, and this surface says so
	 * where the overlap happens. Two shapes on top of each other are two things
	 * in one room, which is an ordinary state of an ordinary room; making the
	 * lower one a CHILD of the upper one would re-home an object because
	 * somebody dragged past it. Reparenting is the Inside picker, deliberately,
	 * and it is the picker the schema's own kind ladder constrains. CLICKING a
	 * sibling or a child SELECTS it -- the sheet is a second way to the tree,
	 * never a way to move something between containers.
	 *
	 * EVERY DRAG HAS A KEYBOARD PATH. The shape is a real focusable button:
	 * arrow keys nudge it by the step chosen beside it (the same handler the
	 * nudge buttons call), the snap a drag applies continuously is reachable
	 * as its own control, and Ctrl+Z (or Cmd+Z) anywhere on the sheet outside
	 * a text field is the Undo control. Nothing here is mouse-only.
	 *
	 * THE DRAWN SHAPE IS SMALLER THAN 44px ON PURPOSE, AND IT IS NOT THE
	 * CONTROL. It is a SCALE DRAWING: a 30in chest in a 400in room is 30/400 of
	 * the pane whatever anybody would prefer, and inflating it to clear a tap
	 * floor would make the drawing lie about the dimension it exists to show.
	 * The controls that move it -- the nudge pad, the snap control, undo, zoom
	 * and the typed inputs -- all clear 44px, so the floor is met by the
	 * interface rather than by distorting the plan. Zooming in is the way to
	 * make a small shape a bigger target, and it changes nothing but pixels.
	 *
	 * NO `<canvas>` ELEMENT, deliberately: the shapes are real buttons and the
	 * dimension lines are SVG, so everything on the sheet is in the DOM, has a
	 * name, and can be measured by the harness and read by assistive tech.
	 */
	import {
		MAPS_KIND_LABELS,
		mapsEffectiveNodeContent,
		mapsFootprint,
		mapsGhostPosition,
		mapsGridStepIn,
		mapsPlaceShape,
		mapsShapeCorners,
		mapsSnapTargets,
		pendingFor,
		type MapsBox,
		type MapsEditorData,
		type MapsKind,
		type MapsNode,
		type MapsNodeContent,
		type MapsOutline
	} from './maps';

	let {
		selfId = null,
		selfName,
		selfKind = null,
		parent,
		outline,
		rotationDeg,
		x,
		y,
		data,
		onplace,
		onselect = undefined,
		readOnly = false,
		visibleIds = null
	}: {
		/** Null while the node is being created: it has no siblings to exclude yet. */
		selfId?: string | null;
		selfName: string;
		/** The kind being edited, for the sheet's own words. */
		selfKind?: MapsKind | null;
		/** The container this node is placed in. Null for a root, whose own outline is the frame. */
		parent: MapsNode | null;
		/** The outline as the TYPED fields currently read. Never written here. */
		outline: MapsOutline | null;
		rotationDeg: number | null;
		x: number | null;
		y: number | null;
		data: MapsEditorData;
		/** Hands the new position back to the typed fields, with what it snapped to. */
		onplace: (next: { x: number; y: number; note: string }) => void;
		/** Clicking a sibling or a child on the sheet selects it. Absent = the shapes are not links. */
		onselect?: (id: string) => void;
		/** The overview's sheets: drawn and selectable, with no placement controls at all. */
		readOnly?: boolean;
		/**
		 * What the viewer may see, as the editor resolved it (`MapsCaps.visibleNodeIds`).
		 * Null is NO LIMIT (an admin). The sheet draws nothing outside it, so a
		 * granted editor's plan and their tree agree about what exists -- RLS
		 * already answers this for the rows a real page loads; this is the same
		 * rule for a fixture that was not filtered.
		 */
		visibleIds?: ReadonlySet<string> | null;
	} = $props();

	/** The rows the sheet may draw from. */
	const nodes = $derived(visibleIds ? data.nodes.filter((n) => visibleIds.has(n.id)) : data.nodes);

	/** Nudge steps, in inches. A whole inch and a sixteenth: the two a person
	    working from SolidWorks numbers actually reaches for. */
	const STEPS = [1, 0.0625] as const;
	let step = $state<number>(1);

	/* A pane that has not been laid out yet draws at a nominal width rather
	   than dividing by zero; the real size arrives on the first layout. The
	   nominal figure is load-bearing for `tests/dom/`, where no layout ever
	   arrives and every pixel assertion is converted through it. */
	let paneWidth = $state(0);
	let paneHeight = $state(0);
	const NOMINAL_PX = 600;
	/** Room around the frame for the dimension lines drawn outside it. */
	const MARGIN_PX = 34;
	const ZOOM_MIN = 0.25;
	const ZOOM_MAX = 8;
	let zoom = $state(1);

	// --- The frame: the parent's outline, or a root's own -------------------

	const parentContent = $derived<MapsNodeContent | null>(
		parent ? mapsEffectiveNodeContent(parent, pendingFor(data.pending, 'maps_nodes', parent.id)) : null
	);
	const parentOutline = $derived(parentContent?.outline ?? null);
	/** Root mode: no parent, and the node being edited has a typed outline of its own. */
	const rootMode = $derived(parent === null && outline !== null);
	const frameOutline = $derived<MapsOutline | null>(parent ? parentOutline : outline);
	const frameName = $derived(parent ? parent.name : selfName);
	const frameKind = $derived<MapsKind | null>(parent ? parent.kind : selfKind);
	const frameBox = $derived<MapsBox | null>(frameOutline ? mapsFootprint(frameOutline, null) : null);
	/** The id whose children are drawn INSIDE THE FRAME (a root's own rooms). */
	const frameChildrenOf = $derived<string | null>(rootMode ? selfId : null);

	const footprint = $derived(outline && parent ? mapsFootprint(outline, rotationDeg) : null);

	const planW = $derived(frameBox ? frameBox.maxX - frameBox.minX : 0);
	const planH = $derived(frameBox ? frameBox.maxY - frameBox.minY : 0);

	const fitScale = $derived.by(() => {
		if (planW <= 0 || planH <= 0) return 1;
		if (paneWidth <= 0) return NOMINAL_PX / planW;
		const w = Math.max(paneWidth - 2 * MARGIN_PX, 120);
		const h = paneHeight > 0 ? Math.max(paneHeight - 2 * MARGIN_PX, 120) : Infinity;
		return Math.min(w / planW, h / planH);
	});
	const pxPerInch = $derived(fitScale * zoom);

	const targets = $derived(mapsSnapTargets({ ...data, nodes }, parent, selfId));

	type Drawn = {
		node: MapsNode;
		content: MapsNodeContent;
		box: MapsBox;
		children: Drawn[];
	};
	/** A placed node's drawing, with one level of its own placed children under it. */
	function drawnOf(node: MapsNode, depth: number): Drawn | null {
		const content = mapsEffectiveNodeContent(node, pendingFor(data.pending, 'maps_nodes', node.id));
		if (!content.outline || content.position_x_in === null || content.position_y_in === null) return null;
		const box = mapsFootprint(content.outline, content.rotation_deg);
		const children =
			depth > 0
				? nodes
						.filter((n) => n.parent_id === node.id)
						.map((n) => drawnOf(n, depth - 1))
						.filter((d): d is Drawn => d !== null)
				: [];
		return { node, content, box, children };
	}

	/* Siblings drawn as context: the same rows the snap targets come from,
	   minus the parent's own walls, so what is drawn and what is snapped to
	   cannot be two different sets. Each carries its own placed children, so a
	   neighbouring room shows its benches. */
	const siblings = $derived<Drawn[]>(
		parent
			? nodes
					.filter((n) => n.parent_id === parent.id && n.id !== selfId)
					.map((n) => drawnOf(n, 1))
					.filter((d): d is Drawn => d !== null)
			: []
	);
	/* The children of the node being edited, drawn INSIDE it at its live
	   position: they move with it, which is what containment means. */
	const ownChildren = $derived<Drawn[]>(
		selfId && parent
			? nodes
					.filter((n) => n.parent_id === selfId)
					.map((n) => drawnOf(n, 1))
					.filter((d): d is Drawn => d !== null)
			: []
	);
	/* A root's own contents, drawn in its frame. */
	const frameChildren = $derived<Drawn[]>(
		frameChildrenOf
			? nodes
					.filter((n) => n.parent_id === frameChildrenOf)
					.map((n) => drawnOf(n, 1))
					.filter((d): d is Drawn => d !== null)
			: []
	);
	/** Children of the frame that carry no plan geometry yet, named so they are not invisible. */
	const unplacedChildren = $derived(
		frameChildrenOf
			? nodes.filter(
					(n) =>
						n.parent_id === frameChildrenOf &&
						!frameChildren.some((d) => d.node.id === n.id) &&
						n.kind !== 'compartment'
				)
			: []
	);

	const placed = $derived(outline !== null && x !== null && y !== null);
	/** Where an unplaced shape is drawn: the middle of the frame, as a ghost. */
	const ghost = $derived(
		footprint && frameBox && !placed ? mapsGhostPosition(frameBox, footprint) : null
	);

	function pointsFor(o: MapsOutline, rot: number | null, box: MapsBox): string {
		return mapsShapeCorners(o, rot)
			.map(([px, py]) => `${(px - box.minX).toFixed(3)},${(py - box.minY).toFixed(3)}`)
			.join(' ');
	}
	const round2 = (v: number) => Math.round(v * 100) / 100;
	const inches = (v: number) => `${round2(v)}″`;

	// --- Pixels ---------------------------------------------------------------

	/** A drawn node's box in frame pixels (its parent's origin at 0,0). */
	function boxPx(d: Drawn, originX: number, originY: number) {
		const px = pxPerInch;
		return {
			left: (d.content.position_x_in! + d.box.minX - originX) * px,
			top: (d.content.position_y_in! + d.box.minY - originY) * px,
			width: (d.box.maxX - d.box.minX) * px,
			height: (d.box.maxY - d.box.minY) * px
		};
	}
	/** Whether a drawn box is big enough to carry its size beside its name. */
	const roomy = (b: { width: number; height: number }) => b.width >= 72 && b.height >= 30;
	/** Whether a drawn box is big enough to carry a name at all; a sliver keeps its aria-label only. */
	const labelled = (b: { width: number; height: number }) => b.width >= 44 && b.height >= 14;

	const selfPx = $derived.by(() => {
		if (!footprint || !frameBox) return null;
		const px = pxPerInch;
		const ox = placed ? (x ?? 0) : (ghost?.x ?? 0);
		const oy = placed ? (y ?? 0) : (ghost?.y ?? 0);
		return {
			left: (ox + footprint.minX - frameBox.minX) * px,
			top: (oy + footprint.minY - frameBox.minY) * px,
			width: (footprint.maxX - footprint.minX) * px,
			height: (footprint.maxY - footprint.minY) * px,
			originX: ox,
			originY: oy
		};
	});

	const sheetW = $derived(planW * pxPerInch + 2 * MARGIN_PX);
	const sheetH = $derived(planH * pxPerInch + 2 * MARGIN_PX);

	/** The grid, in inches, at this scale; null when even a 50ft pitch is too fine. */
	const gridStep = $derived(mapsGridStepIn(pxPerInch));
	const gridLines = $derived.by(() => {
		if (!frameBox || !gridStep) return { x: [] as number[], y: [] as number[] };
		const xs: number[] = [];
		const ys: number[] = [];
		for (let v = Math.ceil(frameBox.minX / gridStep) * gridStep; v <= frameBox.maxX; v += gridStep) {
			if (v > frameBox.minX && v < frameBox.maxX) xs.push((v - frameBox.minX) * pxPerInch);
		}
		for (let v = Math.ceil(frameBox.minY / gridStep) * gridStep; v <= frameBox.maxY; v += gridStep) {
			if (v > frameBox.minY && v < frameBox.maxY) ys.push((v - frameBox.minY) * pxPerInch);
		}
		return { x: xs, y: ys };
	});

	/* The dimension lines for the shape being edited, in sheet pixels. Drawn
	   only when there is a self shape (ghost included: a ghost's size is real,
	   only its position is provisional). */
	const dims = $derived.by(() => {
		if (!selfPx || !footprint || !frameBox) return null;
		const M = MARGIN_PX;
		const left = M + selfPx.left;
		const top = M + selfPx.top;
		const right = left + selfPx.width;
		const bottom = top + selfPx.height;
		const w = footprint.maxX - footprint.minX;
		const h = footprint.maxY - footprint.minY;
		const isRect = outline?.kind === 'rect' && !rotationDeg;
		return {
			left,
			top,
			right,
			bottom,
			/* Width above the shape, or below it when there is no room above. */
			wY: top - 9 >= M / 2 ? top - 9 : bottom + 9,
			wLabel: isRect ? inches(w) : `${inches(w)} footprint`,
			/* Depth beside the shape, on whichever side has room. */
			hX: left - 9 >= M / 2 ? left - 9 : right + 9,
			hLabel: isRect ? inches(h) : `${inches(h)} footprint`,
			/* Offsets from the frame's origin corner, drawn along its outer edges. */
			offX: placed ? selfPx.originX - frameBox.minX : null,
			offY: placed ? selfPx.originY - frameBox.minY : null,
			originPxX: M + (selfPx.originX - frameBox.minX) * pxPerInch,
			originPxY: M + (selfPx.originY - frameBox.minY) * pxPerInch
		};
	});

	// --- Placement ------------------------------------------------------------

	let pane = $state<HTMLDivElement | null>(null);
	let frameEl = $state<HTMLDivElement | null>(null);
	let dragging = $state(false);
	let lastNote = $state<string | null>(null);
	/** The position under the pointer, in the frame's inches, while it is over the sheet. */
	let cursor = $state<{ x: number; y: number } | null>(null);

	/**
	 * EVERY PLACEMENT IS UNDOABLE, and the history is a list of POSITIONS.
	 * A drag pushes one entry at its end (not one per pointer move), a nudge
	 * and a snap push one each, and undo hands the previous position back
	 * through the same `onplace` a drag uses -- so undo can move the shape and
	 * cannot touch a dimension, for the same reason a drag cannot.
	 */
	let history = $state<{ x: number; y: number; how: string }[]>([]);
	function remember(fromX: number, fromY: number, how: string) {
		history = [...history, { x: fromX, y: fromY, how }].slice(-50);
	}
	function undo() {
		const last = history[history.length - 1];
		if (!last) return;
		history = history.slice(0, -1);
		const note = `Undid the last ${last.how}: back to X ${last.x}in, Y ${last.y}in.`;
		lastNote = note;
		onplace({ x: last.x, y: last.y, note });
	}

	/**
	 * A NUDGE DOES NOT SNAP, AND A DRAG DOES. That is one rule about where the
	 * imprecision is, not two behaviours: a pointer lands somewhere
	 * approximate, so a snap is the correction that makes it exact; an arrow
	 * key IS an exact number already, and snapping it would mean that beside an
	 * aligned neighbour the step silently did nothing and the shape read as
	 * stuck (measured, before this split existed: nudging down from a position
	 * flush with a sibling's top edge came straight back to it). Snapping stays
	 * reachable from the keyboard as its own deliberate control.
	 */
	function place(desiredX: number, desiredY: number, how: string, snap: boolean) {
		if (!footprint) return;
		const result = snap
			? mapsPlaceShape({
					desiredX,
					desiredY,
					footprint,
					targets,
					// A tolerance in PIXELS converted to inches, so the snap
					// feels the same at any scale rather than grabbing half a
					// room on a plan drawn small.
					toleranceIn: 7 / pxPerInch
				})
			: mapsPlaceShape({ desiredX, desiredY, footprint, targets: [], toleranceIn: 0 });
		const snaps: string[] = [];
		if (result.snapX) snaps.push(`X: ${result.snapX}`);
		if (result.snapY) snaps.push(`Y: ${result.snapY}`);
		const note =
			snaps.length > 0
				? `${how} to X ${result.x}in, Y ${result.y}in. Snapped ${snaps.join('; ')}.`
				: snap
					? `${how} to X ${result.x}in, Y ${result.y}in. Nothing was near enough to snap to.`
					: `${how} to X ${result.x}in, Y ${result.y}in, exactly. A nudge is arithmetic, not a snap: press Snap to nearest edge to snap it.`;
		lastNote = note;
		onplace({ x: result.x, y: result.y, note });
	}

	let origin = { pointerX: 0, pointerY: 0, x: 0, y: 0, wasPlaced: false, moved: false };

	function onPointerDown(event: PointerEvent) {
		if (!footprint || readOnly || !selfPx) return;
		dragging = true;
		origin = {
			pointerX: event.clientX,
			pointerY: event.clientY,
			x: selfPx.originX,
			y: selfPx.originY,
			wasPlaced: placed,
			moved: false
		};
		/* Pointer capture is an ENHANCEMENT -- it keeps the drag alive when the
		   pointer leaves the small shape -- and it throws NotFoundError for a
		   pointer id the browser does not consider active, which is every
		   synthesized event a verification run dispatches. A failure to capture
		   must not be a failure to drag. */
		try {
			(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
		} catch {
			/* no capture: the drag still tracks while the pointer is over the shape */
		}
		event.preventDefault();
	}
	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const dx = (event.clientX - origin.pointerX) / pxPerInch;
		const dy = (event.clientY - origin.pointerY) / pxPerInch;
		if (dx === 0 && dy === 0) return;
		origin.moved = true;
		place(origin.x + dx, origin.y + dy, origin.wasPlaced ? 'Dragged' : 'Placed by dragging the ghost', true);
	}
	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		/* ONE history entry per drag, pushed at its end: undo takes the whole
		   drag back rather than the last pixel of it. A ghost drag records
		   where the ghost stood, so undoing it restores the ghost. */
		if (origin.moved) remember(origin.x, origin.y, origin.wasPlaced ? 'drag' : 'ghost placement');
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
		} catch {
			/* nothing was captured */
		}
	}

	/** The keyboard path, and the nudge buttons' own handler: one function. */
	function nudge(dx: number, dy: number) {
		if (!placed) return;
		remember(x ?? 0, y ?? 0, 'nudge');
		place((x ?? 0) + dx * step, (y ?? 0) + dy * step, 'Nudged', false);
	}
	function onShapeKeyDown(event: KeyboardEvent) {
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1]
		};
		const move = moves[event.key];
		if (!move) return;
		event.preventDefault();
		nudge(move[0], move[1]);
	}
	/** The snap a drag applies continuously, as a control a keyboard can press. */
	function snapNearest() {
		if (!placed) return;
		remember(x ?? 0, y ?? 0, 'snap');
		place(x ?? 0, y ?? 0, 'Snapped', true);
	}
	/** Accept the ghost where it stands: the typed fields take its centre position. */
	function acceptGhost() {
		if (!ghost || placed) return;
		remember(ghost.x, ghost.y, 'ghost placement');
		place(ghost.x, ghost.y, 'Placed at the middle of the frame', false);
	}

	/**
	 * UNDO IS A SHEET-WIDE KEY, NEVER A FIELD-WIDE ONE. Ctrl+Z inside a text
	 * field is the field's own undo and stays the browser's (interface
	 * standard 8: shortcuts never fire while a text input has focus); anywhere
	 * else on the sheet it is the placement undo.
	 */
	function onSheetKeyDown(event: KeyboardEvent) {
		if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
		const t = event.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
		if (history.length === 0) return;
		event.preventDefault();
		undo();
	}
	/** The sheet-wide undo key, attached as an action: the section is a region, not a control. */
	function undoKeys(node: HTMLElement) {
		node.addEventListener('keydown', onSheetKeyDown);
		return {
			destroy() {
				node.removeEventListener('keydown', onSheetKeyDown);
			}
		};
	}
	/** The cursor readout, attached as an action: the frame is a drawing, not a control. */
	function cursorTrack(node: HTMLElement) {
		const leave = () => (cursor = null);
		node.addEventListener('pointermove', onFramePointerMove);
		node.addEventListener('pointerleave', leave);
		return {
			destroy() {
				node.removeEventListener('pointermove', onFramePointerMove);
				node.removeEventListener('pointerleave', leave);
			}
		};
	}

	// --- Zoom -----------------------------------------------------------------

	function zoomBy(factor: number) {
		zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
	}
	function fit() {
		zoom = 1;
	}
	/**
	 * Ctrl+wheel zooms the sheet the way every CAD viewport does. A wheel
	 * listener that calls preventDefault must be NON-PASSIVE (CLAUDE.md), and
	 * a plain wheel with no modifier is left alone so the pane still scrolls.
	 */
	function wheelZoom(node: HTMLElement) {
		const handler = (event: WheelEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15);
		};
		node.addEventListener('wheel', handler, { passive: false });
		return {
			destroy() {
				node.removeEventListener('wheel', handler);
			}
		};
	}

	function onFramePointerMove(event: PointerEvent) {
		if (!frameEl || !frameBox) return;
		const r = frameEl.getBoundingClientRect();
		cursor = {
			x: round2((event.clientX - r.left) / pxPerInch + frameBox.minX),
			y: round2((event.clientY - r.top) / pxPerInch + frameBox.minY)
		};
	}

	const frameKindWord = $derived(frameKind ? MAPS_KIND_LABELS[frameKind].toLowerCase() : 'container');
	const canPlace = $derived(!readOnly && parent !== null && footprint !== null && frameBox !== null);
</script>

<section
	class="plan"
	class:read-only={readOnly}
	data-testid="maps-plan-canvas"
	use:undoKeys
	aria-label="Plan of {frameName}"
>
	<div class="plan-head">
		{#if !readOnly}
			<h3>
				{#if parent}
					Placement in {parent.name}
				{:else}
					{selfName || 'This container'}: its own plan
				{/if}
			</h3>
		{/if}
		{#if frameBox}
			<span class="frame-size" data-testid="maps-plan-frame-size">
				{frameKindWord} {inches(planW)} &times; {inches(planH)}
			</span>
		{/if}
	</div>

	{#if !parent}
		{#if !readOnly}
			<p class="hint" data-testid="maps-plan-reason">
				A top-level container has no frame to be placed in. Its outline is the frame everything
				else is placed against{#if rootMode}: what is inside it is drawn here, and clicking a
					shape opens it{:else}. Type an outline in the inspector and it appears here, drawn to
					scale{/if}.
			</p>
		{/if}
	{:else if !parentOutline}
		<p class="hint" data-testid="maps-plan-reason">
			{parent.name} has no outline yet, so there is nothing to place this against. Give the
			{MAPS_KIND_LABELS[parent.kind].toLowerCase()} a typed outline first.
		</p>
	{:else if !outline}
		<p class="hint" data-testid="maps-plan-reason">
			Type an outline in the inspector and this shape appears in {parent.name}'s plan, drawn to
			scale, the moment the width and depth are both numbers.
		</p>
	{:else if !placed}
		<p class="hint" data-testid="maps-plan-reason">
			This shape has a size and no position yet, so it is drawn as a ghost in the middle of
			{parent.name}. Drag the ghost where it goes, press Place here, or type a position X and Y
			in the inspector.
		</p>
	{/if}

	{#if frameBox && frameOutline}
		{#if canPlace}
			<p class="hint">
				Drawn to scale: 1 inch is {pxPerInch.toFixed(2)}px at this zoom. Dragging moves the
				shape and never resizes it. The width and depth come from the typed dimensions in the
				inspector, and typing one moves the drawing.
			</p>
		{/if}

		{#if !readOnly}
			<div class="tools" data-testid="maps-plan-tools">
				<div class="tool-group" role="group" aria-label="Zoom">
					<button type="button" class="btn secondary tool-btn" onclick={fit} aria-pressed={zoom === 1}>
						Fit
					</button>
					<button type="button" class="btn secondary tool-btn" onclick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
						&minus;
					</button>
					<button type="button" class="btn secondary tool-btn" onclick={() => zoomBy(1.25)} aria-label="Zoom in">
						+
					</button>
					<span class="zoom-readout" data-testid="maps-plan-zoom">{Math.round(zoom * 100)}%</span>
				</div>
				{#if canPlace}
					<div class="tool-group">
						<button
							type="button"
							class="btn secondary tool-btn"
							data-testid="maps-plan-undo"
							aria-disabled={history.length === 0}
							onclick={undo}
						>
							Undo{#if history.length > 0} ({history.length}){/if}
						</button>
						{#if !placed && ghost}
							<button type="button" class="btn tool-btn" data-testid="maps-plan-place-ghost" onclick={acceptGhost}>
								Place here
							</button>
						{/if}
					</div>
					{#if footprint}
						<p class="readout" data-testid="maps-plan-readout">
							<span class="readout-key">X</span> {placed ? x : '—'}&Prime;
							<span class="readout-key">Y</span> {placed ? y : '—'}&Prime;
							<span class="readout-key">footprint</span>
							{round2(footprint.maxX - footprint.minX)}&Prime; &times;
							{round2(footprint.maxY - footprint.minY)}&Prime;
							{#if rotationDeg}<span class="readout-key">rotated</span> {rotationDeg}&deg;{/if}
							{#if cursor}<span class="readout-key">cursor</span> {cursor.x}&Prime;, {cursor.y}&Prime;{/if}
						</p>
					{/if}
				{/if}
			</div>
		{/if}

		<div
			class="pane"
			bind:this={pane}
			bind:clientWidth={paneWidth}
			bind:clientHeight={paneHeight}
			use:wheelZoom
		>
			<div class="sheet" style="width: {sheetW}px; height: {sheetH}px">
				<svg class="dims" width={sheetW} height={sheetH} viewBox="0 0 {sheetW} {sheetH}" aria-hidden="true">
					<!-- The grid, in inches: a foot at a workable zoom. -->
					{#each gridLines.x as gx (gx)}
						<line class="grid" x1={MARGIN_PX + gx} y1={MARGIN_PX} x2={MARGIN_PX + gx} y2={MARGIN_PX + planH * pxPerInch} />
					{/each}
					{#each gridLines.y as gy (gy)}
						<line class="grid" x1={MARGIN_PX} y1={MARGIN_PX + gy} x2={MARGIN_PX + planW * pxPerInch} y2={MARGIN_PX + gy} />
					{/each}
					<!-- The frame's own size, below its bottom-right corner. -->
					<text class="dim-text frame-dim" x={MARGIN_PX + planW * pxPerInch} y={sheetH - 10} text-anchor="end">
						{frameKindWord} {inches(planW)} &times; {inches(planH)}{#if gridStep}
							&nbsp;&middot; grid {gridStep >= 12 && gridStep % 12 === 0 ? `${gridStep / 12}′` : inches(gridStep)}{/if}
					</text>
					{#if dims}
						<!-- Width -->
						<line class="dim" x1={dims.left} y1={dims.wY} x2={dims.right} y2={dims.wY} />
						<line class="dim tick" x1={dims.left} y1={dims.wY - 4} x2={dims.left} y2={dims.wY + 4} />
						<line class="dim tick" x1={dims.right} y1={dims.wY - 4} x2={dims.right} y2={dims.wY + 4} />
						<text class="dim-text" x={(dims.left + dims.right) / 2} y={dims.wY - 4} text-anchor="middle" data-testid="maps-plan-dim-w">
							{dims.wLabel}
						</text>
						<!-- Depth -->
						<line class="dim" x1={dims.hX} y1={dims.top} x2={dims.hX} y2={dims.bottom} />
						<line class="dim tick" x1={dims.hX - 4} y1={dims.top} x2={dims.hX + 4} y2={dims.top} />
						<line class="dim tick" x1={dims.hX - 4} y1={dims.bottom} x2={dims.hX + 4} y2={dims.bottom} />
						<text
							class="dim-text"
							x={dims.hX - 4}
							y={(dims.top + dims.bottom) / 2}
							text-anchor="middle"
							transform="rotate(-90 {dims.hX - 4} {(dims.top + dims.bottom) / 2})"
							data-testid="maps-plan-dim-h"
						>
							{dims.hLabel}
						</text>
						{#if dims.offX !== null && dims.offY !== null}
							<!-- Offsets from the frame's origin corner, along its outer edges. -->
							<line class="dim offset" x1={MARGIN_PX} y1={MARGIN_PX - 14} x2={dims.originPxX} y2={MARGIN_PX - 14} />
							<line class="dim tick" x1={dims.originPxX} y1={MARGIN_PX - 18} x2={dims.originPxX} y2={MARGIN_PX - 10} />
							<text class="dim-text offset-text" x={(MARGIN_PX + dims.originPxX) / 2} y={MARGIN_PX - 18} text-anchor="middle" data-testid="maps-plan-dim-x">
								X {inches(dims.offX)}
							</text>
							<line class="dim offset" x1={MARGIN_PX - 14} y1={MARGIN_PX} x2={MARGIN_PX - 14} y2={dims.originPxY} />
							<line class="dim tick" x1={MARGIN_PX - 18} y1={dims.originPxY} x2={MARGIN_PX - 10} y2={dims.originPxY} />
							<text
								class="dim-text offset-text"
								x={MARGIN_PX - 18}
								y={(MARGIN_PX + dims.originPxY) / 2}
								text-anchor="middle"
								transform="rotate(-90 {MARGIN_PX - 18} {(MARGIN_PX + dims.originPxY) / 2})"
								data-testid="maps-plan-dim-y"
							>
								Y {inches(dims.offY)}
							</text>
						{/if}
					{/if}
				</svg>

				<div
					class="plan-frame"
					bind:this={frameEl}
					style="left: {MARGIN_PX}px; top: {MARGIN_PX}px; width: {planW * pxPerInch}px; height: {planH * pxPerInch}px"
					data-testid="maps-plan-frame"
					use:cursorTrack
				>
					{#snippet drawnNode(d: Drawn, originX: number, originY: number, role: 'sibling' | 'child', depth: number)}
						{@const b = boxPx(d, originX, originY)}
						<button
							type="button"
							class="drawn {role}"
							class:deep={depth > 0}
							data-testid={depth > 0 ? 'maps-plan-grandchild' : role === 'sibling' ? 'maps-plan-sibling' : 'maps-plan-child'}
							style="left: {b.left}px; top: {b.top}px; width: {b.width}px; height: {b.height}px;"
							aria-label="{d.node.name}, {MAPS_KIND_LABELS[d.node.kind].toLowerCase()}, {inches(d.box.maxX - d.box.minX)} by {inches(d.box.maxY - d.box.minY)}. Open it."
							tabindex={depth > 0 ? -1 : 0}
							onclick={() => onselect?.(d.node.id)}
						>
							<svg viewBox="0 0 {d.box.maxX - d.box.minX} {d.box.maxY - d.box.minY}" preserveAspectRatio="none" aria-hidden="true">
								<polygon points={pointsFor(d.content.outline!, d.content.rotation_deg, d.box)} />
							</svg>
							{#if labelled(b)}
								<span class="drawn-label">
									<span class="drawn-name">{d.node.name}</span>
									{#if roomy(b)}<span class="drawn-size">{inches(d.box.maxX - d.box.minX)} &times; {inches(d.box.maxY - d.box.minY)}</span>{/if}
								</span>
							{/if}
						</button>
						{#if d.children.length > 0 && depth === 0}
							<div
								class="layer"
								style="left: {b.left - d.box.minX * pxPerInch}px; top: {b.top - d.box.minY * pxPerInch}px; transform: rotate({d.content.rotation_deg ?? 0}deg);"
							>
								{#each d.children as c (c.node.id)}
									{@render drawnNode(c, 0, 0, 'child', depth + 1)}
								{/each}
							</div>
						{/if}
					{/snippet}

					{#each siblings as s (s.node.id)}
						{@render drawnNode(s, frameBox.minX, frameBox.minY, 'sibling', 0)}
					{/each}
					{#each frameChildren as c (c.node.id)}
						{@render drawnNode(c, frameBox.minX, frameBox.minY, 'child', 0)}
					{/each}

					{#if selfPx && footprint && outline}
						<button
							type="button"
							class="shape"
							class:dragging
							class:ghost={!placed}
							data-testid={placed ? 'maps-plan-shape' : 'maps-plan-ghost'}
							aria-label="{selfName}: {placed ? 'drag to move, or use the arrow keys to nudge by ' + step + ' inch' : 'not placed yet. Drag it where it goes, or press Place here'}"
							style="left: {selfPx.left}px; top: {selfPx.top}px; width: {selfPx.width}px; height: {selfPx.height}px;"
							onpointerdown={onPointerDown}
							onpointermove={onPointerMove}
							onpointerup={onPointerUp}
							onpointercancel={onPointerUp}
							onkeydown={onShapeKeyDown}
						>
							<svg
								viewBox="0 0 {footprint.maxX - footprint.minX} {footprint.maxY - footprint.minY}"
								preserveAspectRatio="none"
								aria-hidden="true"
							>
								<polygon points={pointsFor(outline, rotationDeg, footprint)} />
							</svg>
							<span class="drawn-label self-label">
								<span class="drawn-name">{selfName}</span>
								{#if !placed}<span class="drawn-size">not placed</span>{/if}
							</span>
						</button>
						{#if ownChildren.length > 0}
							<div
								class="layer own"
								style="left: {(selfPx.originX - frameBox.minX) * pxPerInch}px; top: {(selfPx.originY - frameBox.minY) * pxPerInch}px; transform: rotate({rotationDeg ?? 0}deg);"
							>
								{#each ownChildren as c (c.node.id)}
									{@render drawnNode(c, 0, 0, 'child', 0)}
								{/each}
							</div>
						{/if}
					{/if}
				</div>
			</div>
		</div>

		{#if unplacedChildren.length > 0}
			<p class="hint" data-testid="maps-plan-unplaced">
				Not drawn yet, because {unplacedChildren.length === 1 ? 'it has' : 'they have'} no outline
				or no position: {#each unplacedChildren as n, i (n.id)}{#if i > 0}, {/if}<button
						type="button"
						class="link-btn"
						onclick={() => onselect?.(n.id)}>{n.name}</button>{/each}. Open one and type its
				numbers.
			</p>
		{/if}

		{#if canPlace && footprint && parent}
			<div class="nudge" data-testid="maps-plan-nudge">
				<fieldset class="steps">
					<legend>Nudge step</legend>
					{#each STEPS as s (s)}
						<label class="step-option">
							<input type="radio" name="maps-plan-step-{selfId ?? 'new'}" value={s} bind:group={step} />
							<span>{s}&Prime;</span>
						</label>
					{/each}
				</fieldset>
				<div class="pad">
					<button type="button" class="btn secondary pad-btn" onclick={() => nudge(0, -1)} aria-disabled={!placed}>
						Up
					</button>
					<button type="button" class="btn secondary pad-btn" onclick={() => nudge(-1, 0)} aria-disabled={!placed}>
						Left
					</button>
					<button type="button" class="btn secondary pad-btn" onclick={() => nudge(1, 0)} aria-disabled={!placed}>
						Right
					</button>
					<button type="button" class="btn secondary pad-btn" onclick={() => nudge(0, 1)} aria-disabled={!placed}>
						Down
					</button>
					<button type="button" class="btn secondary pad-btn" onclick={snapNearest} aria-disabled={!placed}>
						Snap to nearest edge
					</button>
				</div>
			</div>

			<p class="snap-note" role="status" data-testid="maps-plan-snap-note">
				{#if lastNote}{lastNote}{:else}
					Nothing moved yet. A drag, a nudge or a snap says here exactly what it landed on, and
					Undo (Ctrl+Z on the sheet) takes it back.
				{/if}
			</p>

			<p class="hint" data-testid="maps-plan-parent-note">
				Dragging this shape over another one does not put it inside it. Two shapes overlapping are
				two things in one {MAPS_KIND_LABELS[parent.kind].toLowerCase()}. What this shape is inside
				is the Inside picker in the inspector, which offers only containers whose kind may hold it.
				Clicking another shape here opens that one.
			</p>
		{/if}
	{/if}
</section>

<style>
	.plan {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		min-height: 0;
		/* Inside a bounded stage column the sheet takes whatever the controls
		   leave; in a page that bounds nothing this is inert. */
		flex: 1 1 auto;
	}
	.plan-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.frame-size {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.hint {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.link-btn {
		background: none;
		border: 0;
		padding: 0;
		margin: 0;
		font: inherit;
		color: var(--cyan);
		text-decoration: underline;
		cursor: pointer;
		min-height: 24px;
	}
	.tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		align-items: center;
	}
	.tool-group {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.tool-btn {
		min-height: 44px;
		min-width: 44px;
		padding: 0.5rem 0.8rem;
		justify-content: center;
	}
	.zoom-readout {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2, var(--dim));
		min-width: 3.2em;
	}
	/* THE PANE IS THE VIEWPORT: it scrolls in both directions when the sheet is
	   zoomed past it, and centres the sheet when the sheet is smaller. Its
	   height is bounded by the stage column that holds it (flex 1 above the
	   breakpoint) or by the explicit height below it, so the fit scale always
	   has a real box to fit to and can never chase its own content. */
	.pane {
		flex: 1 1 auto;
		min-width: 0;
		/* A floor with a real box in it wherever the stage is unbounded (a
		   phone, a harness page): 40% of the window, never under 240px, so a
		   plan is never a strip. Above that the pane grows to the column. */
		min-height: clamp(240px, 40vh, 480px);
		width: 100%;
		overflow: auto;
		display: grid;
		place-items: safe center;
		background: var(--blueprint-bg, var(--bg0));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 4px);
		box-shadow: var(--bevel-inset);
	}
	.sheet {
		position: relative;
		flex: 0 0 auto;
	}
	.dims {
		position: absolute;
		left: 0;
		top: 0;
		pointer-events: none;
		overflow: visible;
	}
	.grid {
		stroke: var(--line);
		stroke-width: 1;
	}
	.dim {
		stroke: var(--cyan);
		stroke-width: 1;
	}
	.dim.offset {
		stroke-dasharray: 4 3;
	}
	.dim-text {
		fill: var(--cyan);
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.04em;
		paint-order: stroke;
		stroke: var(--blueprint-bg, var(--bg0));
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.frame-dim {
		fill: var(--text-2, var(--dim));
	}
	.plan-frame {
		position: absolute;
		border: 1px solid var(--boundary);
		background: transparent;
		box-sizing: content-box;
	}
	.layer {
		position: absolute;
		width: 0;
		height: 0;
		transform-origin: 0 0;
		pointer-events: none;
	}
	.layer > .drawn {
		pointer-events: auto;
	}
	.drawn,
	.shape {
		position: absolute;
		padding: 0;
		margin: 0;
		border: 0;
		background: transparent;
		color: var(--white);
		font: inherit;
		text-align: left;
		box-sizing: border-box;
		overflow: visible;
	}
	.drawn {
		cursor: pointer;
	}
	.drawn svg,
	.shape svg {
		width: 100%;
		height: 100%;
		display: block;
		overflow: visible;
	}
	.drawn.sibling polygon {
		fill: var(--bg2);
		stroke: var(--boundary);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.drawn.child polygon {
		fill: color-mix(in srgb, var(--cyan) 12%, transparent);
		stroke: var(--cyan);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.drawn.deep polygon {
		fill: transparent;
		stroke: var(--line);
		stroke-dasharray: 3 2;
	}
	.drawn:hover polygon,
	.drawn:focus-visible polygon {
		stroke: var(--green);
		stroke-width: 2;
	}
	.drawn:focus-visible,
	.shape:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}
	.drawn-label {
		position: absolute;
		left: 3px;
		top: 2px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-width: calc(100% - 6px);
		pointer-events: none;
		line-height: 1.1;
	}
	.drawn-name {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		letter-spacing: 0.04em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: var(--white);
	}
	.drawn.deep .drawn-name {
		color: var(--text-2, var(--dim));
	}
	.drawn-size {
		font-family: var(--font-mono);
		font-size: 0.6rem;
		white-space: nowrap;
		color: var(--cyan);
	}
	.shape {
		cursor: grab;
		touch-action: none;
	}
	.shape.dragging {
		cursor: grabbing;
	}
	.shape polygon {
		fill: color-mix(in srgb, var(--maps-accent, var(--green)) 30%, transparent);
		stroke: var(--maps-accent, var(--green));
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.shape.ghost polygon {
		fill: color-mix(in srgb, var(--maps-accent, var(--green)) 12%, transparent);
		stroke-dasharray: 6 4;
	}
	.self-label .drawn-name {
		color: var(--white);
		font-weight: 700;
	}
	.readout {
		margin: 0 0 0 auto;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--white);
		line-height: 1.7;
	}
	.readout-key {
		color: var(--cyan);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-size: 0.68rem;
		margin-left: 0.5rem;
	}
	.readout-key:first-child {
		margin-left: 0;
	}
	.nudge {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: flex-start;
	}
	.steps {
		border: 1px solid var(--line);
		border-radius: var(--radius-control, 6px);
		padding: 0.3rem 0.6rem 0.5rem;
		margin: 0;
		min-width: 0;
	}
	legend {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
		padding: 0 0.2rem;
	}
	.step-option {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 44px;
		padding-right: 0.6rem;
		color: var(--white);
		font-size: 0.9rem;
		cursor: pointer;
	}
	.step-option input {
		width: 20px;
		height: 20px;
		accent-color: var(--maps-accent, var(--green));
	}
	.pad {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pad-btn {
		min-height: 44px;
		min-width: 44px;
		padding: 0.5rem 0.9rem;
	}
	.snap-note {
		margin: 0;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
		color: var(--white);
		font-size: 0.82rem;
	}
	.read-only .pane {
		min-height: clamp(200px, 32vh, 420px);
	}
</style>
