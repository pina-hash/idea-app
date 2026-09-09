<script lang="ts">
	/**
	 * ONE CONTAINER'S PLAN DRAWING, read-only, with at most one thing marked in
	 * gold and at most one marked "here".
	 *
	 * IT IS AN SVG WITH A viewBox IN INCHES, which is what makes it correct at
	 * both widths with no arithmetic in the component: the drawing scales, the
	 * dimensions do not change, and 375px and 1440px are the same drawing at
	 * two sizes rather than two layouts. Stroke widths are given in
	 * `vector-effect: non-scaling-stroke` for the same reason -- a hairline is
	 * one device pixel at every scale, so a small room does not draw with fat
	 * walls.
	 *
	 * THE SHAPES ARE LINKS, NOT `<g>` ELEMENTS WITH CLICK HANDLERS. A room on a
	 * plan is a place you can go, so it is an `<a>` with an href: it works with
	 * a keyboard, it works with the middle mouse button, it can be copied, and
	 * it needs no JavaScript at all. THE 44px FLOOR IS NOT MET BY THE SHAPE and
	 * cannot be -- a 30in chest in a 400in room is 30/400 of the pane whatever
	 * anybody would prefer, and inflating it would make the drawing lie about
	 * the dimension it exists to show (the editor's own PlanCanvas says the
	 * same). The floor is met by the LIST beside the drawing, where every shape
	 * on the plan has a full-width row: the drawing is a second, faster way to
	 * the same links, never the only way.
	 *
	 * THE MARK IS GOLD AND THE CHROME IS GREEN, and that is the surface's one
	 * colour rule. A map's whole job is to make one found thing leap out of a
	 * plan; if the linework were already in the accent there would be nowhere
	 * for the found thing to go. Gold is a STATE here, the way crimson is
	 * reserved for live and error -- it means "this is the thing you were
	 * looking for" and it is never decoration. "HERE" is a second state with a
	 * second word: the thing that is OPEN, drawn heavier in the accent, for the
	 * levels the map pane shows on their parent's drawing (see `mapsDrawing`).
	 *
	 * ZOOM AND PAN ARE AN UPGRADE, NOT THE MECHANISM (prompt 0112). Server-
	 * rendered, the drawing is the whole frame at fit and every shape is a
	 * link; hydrated, in the application layout, the wheel zooms about the
	 * pointer, a drag pans, a pinch zooms, `+` `-` `0` and the arrow keys do
	 * the same from the keyboard, and three worded controls sit where every
	 * map puts them. Below the application breakpoint the map is a block in a
	 * scrolling document, so a wheel over it must scroll the page and a drag
	 * must scroll the page: no gesture is taken there, and the controls are
	 * not offered, because a zoomed drawing with no way to pan it is worse
	 * than a fitted one. The list carries the floor at every width regardless.
	 *
	 * LABELS ARE SIZED IN SCREEN PIXELS, NOT IN INCHES, once the drawing has
	 * been measured. A label in user units is 8px on a phone and 60px on a
	 * 2844px monitor -- the same room, unreadable at one end and swamping its
	 * shapes at the other -- so the font size is `LABEL_PX` divided by the
	 * rendered scale, which holds it at 13px whatever the pane and whatever
	 * the zoom. A label that does not fit its shape at the current scale is
	 * withheld (the `<title>` and the list row still name it) and comes back
	 * on hover, on the mark and on "here": the way every map hides the labels
	 * that would overlap and shows the one you point at. Before the first
	 * measurement, and with no JavaScript, the fallback is a sixtieth of the
	 * frame, which is the old behaviour.
	 */
	import type { MapsNode } from '../maps';
	import {
		MAPS_ZOOM_MAX,
		MAPS_ZOOM_STEP,
		mapsClampZoom,
		mapsKindWord,
		mapsScaleBar,
		mapsZoomAbout,
		mapsZoomedBox,
		type MapsPlanShape,
		type MapsPlanView,
		type MapsViewBox
	} from './viewer';

	let {
		view,
		frameLabel,
		markId = null,
		hereId = null,
		hotId = null,
		onhot = null,
		hrefFor,
		fill = false,
		synthetic = false
	}: {
		view: MapsPlanView;
		/** The container being drawn, for the drawing's accessible name and caption. */
		frameLabel: string;
		/** The staged route's next link: gold. */
		markId?: string | null;
		/** The level that is open, when this is its parent's drawing: "here". */
		hereId?: string | null;
		/** The shape the pointer (or focus) is on, in the drawing or in the list. */
		hotId?: string | null;
		onhot?: ((id: string | null) => void) | null;
		hrefFor: (node: MapsNode) => string;
		/** True in the application layout's map pane: the drawing takes the pane. */
		fill?: boolean;
		/** True when the shapes were laid out by the viewer, not by an author. */
		synthetic?: boolean;
	} = $props();

	/** Label size on screen, once the scale is known. */
	const LABEL_PX = 13;
	/** A drag shorter than this is a click on whatever was under the pointer. */
	const DRAG_PX = 4;

	const pad = $derived(Math.max((view.frame.maxX - view.frame.minX) * 0.02, 2));
	const base = $derived<MapsViewBox>({
		x: view.frame.minX - pad,
		y: view.frame.minY - pad,
		w: view.frame.maxX - view.frame.minX + pad * 2,
		h: view.frame.maxY - view.frame.minY + pad * 2
	});
	const widthIn = $derived(Math.round(view.frame.maxX - view.frame.minX));
	const heightIn = $derived(Math.round(view.frame.maxY - view.frame.minY));

	/* THE VIEW STATE: a zoom and an OFFSET from the frame's centre, so that
	   "fit" is zoom 1 with no offset and needs no knowledge of the frame. The
	   viewBox is derived from them through the clamped arithmetic in viewer.ts,
	   which is what stops a drag from carrying the drawing out of the pane. */
	let zoom = $state(1);
	let dx = $state(0);
	let dy = $state(0);
	const centre = $derived({ x: base.x + base.w / 2 + dx, y: base.y + base.h / 2 + dy });
	const box = $derived(mapsZoomedBox(base, zoom, centre.x, centre.y));
	const vb = $derived([box.x, box.y, box.w, box.h].join(' '));

	/* THE RENDERED SCALE, from the wrapper's own measured box. Zero until the
	   first measurement (and forever on the server), which every reader below
	   treats as "not known yet" rather than as a size. */
	let clientW = $state(0);
	let clientH = $state(0);
	const scale = $derived(
		clientW > 0 && clientH > 0 ? Math.min(clientW / box.w, clientH / box.h) : 0
	);
	const labelFont = $derived(scale > 0 ? LABEL_PX / scale : base.w / 60);
	const bar = $derived(scale > 0 ? mapsScaleBar(scale) : null);

	/* GESTURES ONLY IN THE APPLICATION LAYOUT. Read from the same media query
	   the stylesheet uses for the pane, so the controls, the gestures and the
	   pane they act on can never disagree about which layout this is. */
	let gestures = $state(false);
	$effect(() => {
		if (!fill || typeof window === 'undefined' || !('matchMedia' in window)) return;
		const mq = window.matchMedia('(min-width: 1024px)');
		const read = () => (gestures = mq.matches);
		read();
		mq.addEventListener('change', read);
		return () => mq.removeEventListener('change', read);
	});

	const pathOf = (points: [number, number][]) =>
		points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';
	/** The label anchor: the shape's own centre, so a rotated shape still reads. */
	const centreOf = (points: [number, number][]) => {
		let x = 0;
		let y = 0;
		for (const [px, py] of points) {
			x += px;
			y += py;
		}
		return [x / points.length, y / points.length];
	};
	/**
	 * Whether a shape's label fits inside it at the current scale. An estimate
	 * from the character count rather than a measurement of the glyphs: it
	 * runs on every render and the cost of being a little wrong is a label
	 * shown a beat early or late, never one drawn over its neighbour.
	 */
	const labelFits = (shape: MapsPlanShape) => {
		if (scale === 0) return true;
		const wPx = (shape.box.maxX - shape.box.minX) * scale;
		const hPx = (shape.box.maxY - shape.box.minY) * scale;
		const needPx = shape.node.name.length * LABEL_PX * 0.62;
		return needPx <= wPx * 1.1 && hPx >= LABEL_PX * 1.4;
	};
	const labelShown = (shape: MapsPlanShape) =>
		labelFits(shape) ||
		shape.node.id === hotId ||
		shape.node.id === markId ||
		shape.node.id === hereId;
	/**
	 * WHERE A LABEL THAT DOES NOT FIT ITS SHAPE GOES: beside it, like the
	 * label on a map pin, on whichever side has the room -- a shape in the
	 * left half of the frame is labelled to its right and vice versa, so the
	 * text never runs off the drawing's edge. A label that fits stays centred.
	 */
	const labelPlace = (shape: MapsPlanShape, c: number[]) => {
		if (labelFits(shape)) return { x: c[0], y: c[1], anchor: 'middle' };
		const gap = scale > 0 ? 6 / scale : 2;
		const mid = (view.frame.minX + view.frame.maxX) / 2;
		return c[0] <= mid
			? { x: shape.box.maxX + gap, y: c[1], anchor: 'start' }
			: { x: shape.box.minX - gap, y: c[1], anchor: 'end' };
	};

	// ---- pointer, wheel and keyboard ---------------------------------------
	let wrap = $state<HTMLDivElement | null>(null);
	const pointers = new Map<number, { x: number; y: number }>();
	let drag: { x: number; y: number; dx0: number; dy0: number; moved: boolean } | null = null;
	/** The template's view of `drag.moved`: the only part of it the cursor needs. */
	let dragging = $state(false);
	let pinch: { dist: number; zoom0: number } | null = null;
	let suppressClick = false;

	/** Pointer position, in the drawing's inches, allowing for `meet` centring. */
	function toInches(clientX: number, clientY: number): [number, number] {
		if (!wrap || scale === 0) return [centre.x, centre.y];
		const r = wrap.getBoundingClientRect();
		const ox = (r.width - box.w * scale) / 2;
		const oy = (r.height - box.h * scale) / 2;
		return [box.x + (clientX - r.left - ox) / scale, box.y + (clientY - r.top - oy) / scale];
	}
	function applyZoomAbout(factor: number, px: number, py: number) {
		const next = mapsZoomAbout({ zoom, cx: centre.x, cy: centre.y }, factor, px, py);
		zoom = next.zoom;
		dx = next.cx - (base.x + base.w / 2);
		dy = next.cy - (base.y + base.h / 2);
	}
	function zoomBy(factor: number) {
		applyZoomAbout(factor, centre.x, centre.y);
	}
	function fit() {
		zoom = 1;
		dx = 0;
		dy = 0;
	}
	function panBy(fx: number, fy: number) {
		dx += box.w * fx;
		dy += box.h * fy;
	}

	function onPointerDown(event: PointerEvent) {
		if (!gestures || event.button !== 0) return;
		/* A new gesture starts clean. A drag that ends OFF the link it started
		   on fires no click at all, so a flag armed for it would otherwise
		   swallow the next real click, on a shape nobody dragged. */
		suppressClick = false;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		wrap?.setPointerCapture(event.pointerId);
		if (pointers.size === 1) {
			drag = { x: event.clientX, y: event.clientY, dx0: dx, dy0: dy, moved: false };
			pinch = null;
		} else if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom0: zoom };
			drag = null;
		}
	}
	function onPointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pinch && pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			const dist = Math.hypot(a.x - b.x, a.y - b.y);
			if (pinch.dist > 0) zoom = mapsClampZoom(pinch.zoom0 * (dist / pinch.dist));
			return;
		}
		if (drag && scale > 0) {
			const mx = event.clientX - drag.x;
			const my = event.clientY - drag.y;
			if (Math.abs(mx) > DRAG_PX || Math.abs(my) > DRAG_PX) {
				drag.moved = true;
				dragging = true;
			}
			if (drag.moved) {
				dx = drag.dx0 - mx / scale;
				dy = drag.dy0 - my / scale;
			}
		}
	}
	function onPointerUp(event: PointerEvent) {
		pointers.delete(event.pointerId);
		if (drag?.moved) suppressClick = true;
		if (pointers.size === 0) {
			drag = null;
			pinch = null;
			dragging = false;
		}
	}
	/* A DRAG THAT STARTED ON A LINK MUST NOT NAVIGATE WHEN IT ENDS. The click
	   fires after pointerup regardless, so it is swallowed once, in the
	   capture phase, and only when the pointer actually moved. */
	function onClickCapture(event: MouseEvent) {
		if (!suppressClick) return;
		suppressClick = false;
		event.preventDefault();
		event.stopPropagation();
	}
	function onWheel(event: WheelEvent) {
		if (!gestures) return;
		event.preventDefault();
		const [px, py] = toInches(event.clientX, event.clientY);
		applyZoomAbout(Math.exp(-event.deltaY * 0.0015), px, py);
	}
	/* A wheel listener that calls preventDefault must be non-passive, and it
	   is attached by hand for exactly that reason (CLAUDE.md, DOM). */
	$effect(() => {
		const el = wrap;
		if (!el) return;
		el.addEventListener('wheel', onWheel, { passive: false });
		return () => el.removeEventListener('wheel', onWheel);
	});
	function onKey(event: KeyboardEvent) {
		if (!gestures || event.target !== wrap) return;
		const step = 0.1;
		switch (event.key) {
			case '+':
			case '=':
				zoomBy(MAPS_ZOOM_STEP);
				break;
			case '-':
			case '_':
				zoomBy(1 / MAPS_ZOOM_STEP);
				break;
			case '0':
				fit();
				break;
			case 'ArrowLeft':
				panBy(-step, 0);
				break;
			case 'ArrowRight':
				panBy(step, 0);
				break;
			case 'ArrowUp':
				panBy(0, -step);
				break;
			case 'ArrowDown':
				panBy(0, step);
				break;
			default:
				return;
		}
		event.preventDefault();
	}
	const zoomLabel = $derived(zoom === 1 ? 'Fitted' : `${zoom.toFixed(1)}x`);
</script>

<figure class="mv-plan" class:is-fill={fill} data-testid="maps-viewer-drawing">
	<!-- THE PAN-AND-ZOOM SURFACE. A non-interactive role with pointer and key
	     handlers on it is exactly what a map canvas is: the links inside it
	     are the interactive things, and this wrapper is the sheet they sit on,
	     which the keyboard reaches by its own tabindex and its own name. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="mv-plan-canvas"
		class:is-live={gestures}
		class:is-dragging={dragging}
		bind:this={wrap}
		bind:clientWidth={clientW}
		bind:clientHeight={clientH}
		role="group"
		aria-label={gestures
			? `Plan of ${frameLabel}. Plus and minus zoom, arrow keys pan, zero fits.`
			: `Plan of ${frameLabel}`}
		tabindex={gestures ? 0 : undefined}
		data-zoom={zoom.toFixed(2)}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onclickcapture={onClickCapture}
		onkeydown={onKey}
	>
		<svg
			viewBox={vb}
			role="img"
			aria-label={`Plan of ${frameLabel}, ${widthIn} by ${heightIn} inches`}
			preserveAspectRatio="xMidYMid meet"
		>
			<rect
				class="mv-frame"
				x={view.frame.minX}
				y={view.frame.minY}
				width={view.frame.maxX - view.frame.minX}
				height={view.frame.maxY - view.frame.minY}
			/>
			{#each view.shapes as shape (shape.node.id)}
				{@const marked = shape.node.id === markId}
				{@const here = shape.node.id === hereId}
				{@const c = centreOf(shape.points)}
				<a
					href={hrefFor(shape.node)}
					class="mv-shape"
					class:is-marked={marked}
					class:is-here={here}
					class:is-hot={shape.node.id === hotId}
					data-marked={marked ? '' : undefined}
					data-here={here ? '' : undefined}
					data-node={shape.node.id}
					onpointerenter={() => onhot?.(shape.node.id)}
					onpointerleave={() => onhot?.(null)}
					onfocus={() => onhot?.(shape.node.id)}
					onblur={() => onhot?.(null)}
				>
					<title>{shape.node.name} ({mapsKindWord(shape.node)}){here ? ', open' : ''}</title>
					<path d={pathOf(shape.points)} />
					{#if labelShown(shape)}
						{@const at = labelPlace(shape, c)}
						<text
							x={at.x}
							y={at.y}
							class="mv-shape-label"
							style={`font-size:${labelFont}px;text-anchor:${at.anchor}`}
						>
							{shape.node.name}
						</text>
						{#if here}
							<text
								x={at.x}
								y={at.y + labelFont * 1.3}
								class="mv-shape-label mv-shape-here"
								style={`font-size:${labelFont * 0.8}px;text-anchor:${at.anchor}`}>you are here</text
							>
						{/if}
					{/if}
				</a>
			{/each}
		</svg>
	</div>
	{#if gestures}
		<!-- THE THREE CONTROLS EVERY MAP HAS, WITH WORDS ON THEM. In the map
		     pane's top right corner (the bottom one belongs to the shell's
		     report control, see the stylesheet); words because a `+` alone fails "every control carries a visible
		     word" and a phone cannot hover a tooltip. Not rendered below the
		     application breakpoint, where there is no pan to go with them. -->
		<div class="mv-zoom" data-testid="maps-viewer-zoom">
			<button
				type="button"
				class="tap-44"
				onclick={() => zoomBy(MAPS_ZOOM_STEP)}
				disabled={zoom >= MAPS_ZOOM_MAX}
				aria-label="Zoom in"><span aria-hidden="true">+</span> In</button
			>
			<button
				type="button"
				class="tap-44"
				onclick={() => zoomBy(1 / MAPS_ZOOM_STEP)}
				disabled={zoom <= 1}
				aria-label="Zoom out"><span aria-hidden="true">&minus;</span> Out</button
			>
			<button type="button" class="tap-44" onclick={fit} disabled={zoom === 1}>Fit</button>
			<span class="mv-zoom-level" role="status">{zoomLabel}</span>
		</div>
	{/if}
	<figcaption>
		<!-- The dimension is the point of a dimensioned drawing: a plan that does
		     not say how big the room is is a diagram. -->
		<span class="mv-plan-name">{frameLabel}</span>
		<span class="mv-plan-dim">{widthIn} x {heightIn} in</span>
		{#if synthetic}
			<span class="mv-plan-note"
				>Drawn to size. Where these sit on the site is not recorded yet.</span
			>
		{/if}
		{#if bar}
			<span class="mv-scale" aria-label={`Scale bar: ${bar.label}`} data-testid="maps-viewer-scale">
				<span class="mv-scale-bar" style={`width:${bar.px}px`}></span>
				<span class="mv-scale-label">{bar.label}</span>
			</span>
		{/if}
	</figcaption>
</figure>

<style>
	.mv-plan {
		margin: 0;
		position: relative;
		min-width: 0;
	}
	.mv-plan-canvas {
		display: block;
	}
	.mv-plan-canvas:focus-visible {
		outline: 2px solid var(--mv-accent);
		outline-offset: -2px;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 46vh;
		background: var(--blueprint-bg, var(--surface-2, #161a18));
		background-image: var(--blueprint-grid);
		background-size: var(--blueprint-grid-size);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
	}
	/* THE MAP PANE. Above the application breakpoint the drawing takes the
	   whole pane, edge to edge and no frame, the way a map fills its window;
	   the caption and the controls float over it. Below the breakpoint the
	   drawing is a block in a scrolling document and `fill` changes nothing:
	   the caption sits under it and there are no controls. */
	@media (min-width: 1024px) {
		.mv-plan.is-fill,
		.mv-plan.is-fill .mv-plan-canvas {
			height: 100%;
			min-height: 0;
		}
		.mv-plan.is-fill svg {
			height: 100%;
			max-height: none;
			border: none;
			border-radius: 0;
		}
		.mv-plan.is-fill figcaption {
			position: absolute;
			left: var(--space-3);
			bottom: var(--space-3);
			margin: 0;
			max-width: min(32rem, calc(100% - 12rem));
			padding: var(--space-2) var(--space-3);
			background: color-mix(in srgb, var(--surface-0, #0a0c0b) 86%, transparent);
			border: 1px solid var(--mv-boundary);
			border-radius: var(--radius-card);
			pointer-events: none;
		}
	}
	.mv-plan-canvas.is-live {
		cursor: grab;
		/* The pane owns every gesture on it: nothing here scrolls, so there is
		   nothing for the browser to take. Only set where gestures are live,
		   which is only ever the application layout. */
		touch-action: none;
	}
	.mv-plan-canvas.is-dragging {
		cursor: grabbing;
	}
	.mv-frame {
		fill: none;
		stroke: var(--mv-line);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}
	.mv-shape path {
		fill: var(--mv-shape-fill);
		stroke: var(--mv-accent);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}
	.mv-shape {
		/* An SVG <a> is not focusable by default in every engine unless it is a
		   real link with an href, which it is; the outline is drawn here rather
		   than left to the UA because the UA's default is a rectangle around the
		   whole shape group and can be invisible on a dark plate. */
		cursor: pointer;
	}
	.mv-shape:hover path,
	.mv-shape:focus-visible path,
	.mv-shape.is-hot path {
		fill: var(--mv-shape-fill-hover);
		stroke: var(--mv-accent-strong);
		stroke-width: 2.5;
	}
	.mv-shape:focus-visible {
		outline: none;
	}
	/* THE OPEN THING: heavier, in the accent, with its own word under the
	   name. A second state and a second word, never a second gold. */
	.mv-shape.is-here path {
		fill: var(--mv-shape-fill-hover);
		stroke: var(--mv-accent-strong);
		stroke-width: 3;
	}
	.mv-shape.is-marked path {
		/* THE FOUND THING. Gold fill, gold stroke, and a heavier weight -- three
		   signals, because colour is never the only one. The row in the list
		   beside the drawing carries the WORD ("found here"), which is the
		   fourth and the one a colour-blind reader gets. */
		fill: var(--mv-mark-fill);
		stroke: var(--mv-mark);
		stroke-width: 3;
	}
	.mv-shape-label {
		fill: var(--mv-ink);
		font-family: var(--font-mono);
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
		paint-order: stroke;
		stroke: var(--blueprint-bg, var(--surface-2, #161a18));
		stroke-width: 0.25em;
		stroke-linejoin: round;
	}
	.mv-shape.is-marked .mv-shape-label {
		fill: var(--mv-mark-ink);
	}
	.mv-shape-here {
		fill: var(--mv-accent-ink);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	figcaption {
		margin-top: var(--space-1);
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-plan-name {
		color: var(--text-1, #e7eae8);
		font-weight: 600;
	}
	.mv-plan-note {
		flex-basis: 100%;
	}
	.mv-scale {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}
	.mv-scale-bar {
		display: inline-block;
		height: 6px;
		border: 1px solid var(--text-1, #e7eae8);
		border-top: none;
		box-sizing: border-box;
	}
	/* TOP RIGHT, NOT BOTTOM RIGHT. Every map puts these bottom right, and so
	   did the first draft, where the shell's own fixed "Report a problem"
	   control sat on top of "Fit" at both widths measured. The corner that is
	   nobody else's is the top one. */
	.mv-zoom {
		position: absolute;
		right: var(--space-3);
		top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: stretch;
	}
	.mv-zoom button {
		min-width: 5.5rem;
		justify-content: center;
		padding: 0 var(--space-3);
		background: color-mix(in srgb, var(--surface-0, #0a0c0b) 86%, transparent);
		border: 1px solid var(--mv-accent);
		border-radius: var(--radius-control);
		color: var(--mv-accent-ink);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		cursor: pointer;
	}
	.mv-zoom button:hover:not(:disabled),
	.mv-zoom button:focus-visible {
		background: var(--mv-shape-fill-hover);
	}
	.mv-zoom button:disabled {
		border-color: var(--mv-boundary);
		color: var(--text-2, #9aa49d);
		cursor: default;
	}
	.mv-zoom-level {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
	}
</style>
