<script lang="ts">
	/**
	 * ONE CONTAINER'S PLAN DRAWING, read-only, with at most one thing marked.
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
	 * looking for" and it is never decoration.
	 */
	import type { MapsNode } from '../maps';
	import { mapsKindWord, type MapsPlanView } from './viewer';

	let {
		view,
		frameLabel,
		markId = null,
		hrefFor
	}: {
		view: MapsPlanView;
		/** The container being drawn, for the drawing's accessible name. */
		frameLabel: string;
		markId?: string | null;
		hrefFor: (node: MapsNode) => string;
	} = $props();

	const pad = $derived(Math.max((view.frame.maxX - view.frame.minX) * 0.02, 2));
	const vb = $derived(
		[
			view.frame.minX - pad,
			view.frame.minY - pad,
			view.frame.maxX - view.frame.minX + pad * 2,
			view.frame.maxY - view.frame.minY + pad * 2
		].join(' ')
	);
	const widthIn = $derived(Math.round(view.frame.maxX - view.frame.minX));
	const heightIn = $derived(Math.round(view.frame.maxY - view.frame.minY));
	const pathOf = (points: [number, number][]) =>
		points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + ' Z';
	/** The label anchor: the shape's own centre, so a rotated shape still reads. */
	const centre = (points: [number, number][]) => {
		let x = 0;
		let y = 0;
		for (const [px, py] of points) {
			x += px;
			y += py;
		}
		return [x / points.length, y / points.length];
	};
</script>

<figure class="mv-plan" data-testid="maps-viewer-drawing">
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
			{@const c = centre(shape.points)}
			<a href={hrefFor(shape.node)} class="mv-shape" class:is-marked={marked} data-marked={marked ? '' : undefined}>
				<title>{shape.node.name} ({mapsKindWord(shape.node)})</title>
				<path d={pathOf(shape.points)} />
				<text x={c[0]} y={c[1]} class="mv-shape-label">{shape.node.name}</text>
			</a>
		{/each}
	</svg>
	<figcaption>
		<!-- The dimension is the point of a dimensioned drawing: a plan that does
		     not say how big the room is is a diagram. -->
		{widthIn} x {heightIn} in
	</figcaption>
</figure>

<style>
	.mv-plan {
		margin: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
		max-height: 62vh;
		background: var(--surface-2, #161a18);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
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
	.mv-shape:focus-visible path {
		fill: var(--mv-shape-fill-hover);
		stroke: var(--mv-accent-strong);
		stroke-width: 2.5;
	}
	.mv-shape:focus-visible {
		outline: none;
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
		/* In USER UNITS, i.e. inches: the label scales with the drawing, which is
		   what keeps a 400in room's labels readable and a 30in chest's from
		   swamping it. The clamp is applied by the viewBox itself. */
		font-size: 10px;
		text-anchor: middle;
		dominant-baseline: middle;
		pointer-events: none;
		paint-order: stroke;
		stroke: var(--surface-2, #161a18);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.mv-shape.is-marked .mv-shape-label {
		fill: var(--mv-mark-ink);
	}
	figcaption {
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
	}
</style>
