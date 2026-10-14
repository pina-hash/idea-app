<script lang="ts">
	/**
	 * A DRAWING OVER A PICTURE (0238, decision 60). Absolutely placed over its
	 * parent, which holds the picture at `object-fit: contain`: the SVG's
	 * `viewBox` is the picture's own natural size and `xMidYMid meet` is
	 * `contain`'s own arithmetic, so a mark lands on the same spot of the
	 * picture at any size, in a thumbnail, over a worksheet box or full screen
	 * in the Lightbox.
	 *
	 * STROKES NEVER SCALE (`vector-effect: non-scaling-stroke`): a 4px arrow is
	 * a 4px arrow on a phone and on a projector. Every mark is drawn twice, a
	 * halo of the opposite lightness under the ink, so it is legible over any
	 * photograph (`MARK_PAINT`).
	 *
	 * DECORATION FOR THE EYE, WORDS FOR EVERYBODY ELSE: the layer is
	 * `aria-hidden`, and a caller always puts the note's own words beside it.
	 * `pointer-events: none`, so the picture under it still takes the click.
	 */
	import { MARK_PAINT, MARK_SCALE, MARK_WIDTH_PX, type MarkShape, type Marks } from './notes';

	let {
		marks,
		width,
		height,
		/** A shape being drawn right now, not yet in `marks` (the annotator's live stroke). */
		draft = null
	}: {
		marks: Marks | null;
		/** The picture's natural size, in its own pixels. */
		width: number;
		height: number;
		draft?: MarkShape | null;
	} = $props();

	const W = $derived(width > 0 ? width : MARK_SCALE);
	const H = $derived(height > 0 ? height : MARK_SCALE);
	const shapes = $derived([...(marks?.shapes ?? []), ...(draft ? [draft] : [])]);
	const x = (n: number) => (n / MARK_SCALE) * W;
	const y = (n: number) => (n / MARK_SCALE) * H;
	/** Arrowheads and text are sized to the picture, so they read at any size. */
	const unit = $derived(Math.min(W, H) / 100);

	function penPath(p: number[]): string {
		let d = `M${x(p[0])} ${y(p[1])}`;
		for (let i = 2; i < p.length; i += 2) d += `L${x(p[i])} ${y(p[i + 1])}`;
		return d;
	}
	function arrowPath(p: number[], w: number): string {
		const [x0, y0, x1, y1] = [x(p[0]), y(p[1]), x(p[2]), y(p[3])];
		const ang = Math.atan2(y1 - y0, x1 - x0);
		const head = unit * (3.2 + w * 0.8);
		const a1 = ang + Math.PI - 0.45;
		const a2 = ang + Math.PI + 0.45;
		return (
			`M${x0} ${y0}L${x1} ${y1}` +
			`M${x1 + head * Math.cos(a1)} ${y1 + head * Math.sin(a1)}L${x1} ${y1}L${x1 + head * Math.cos(a2)} ${y1 + head * Math.sin(a2)}`
		);
	}
	function box(p: number[]) {
		const [x0, y0, x1, y1] = [x(p[0]), y(p[1]), x(p[2]), y(p[3])];
		return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
	}
</script>

<svg
	class="mark-layer"
	viewBox="0 0 {W} {H}"
	preserveAspectRatio="xMidYMid meet"
	aria-hidden="true"
	data-testid="mark-layer"
	data-shapes={shapes.length}
>
	{#each shapes as s, i (i)}
		{@const ink = MARK_PAINT[s.c]}
		{@const px = MARK_WIDTH_PX[s.w]}
		{#each [{ stroke: ink.halo, width: px + 3 }, { stroke: ink.ink, width: px }] as pass (pass.stroke + pass.width)}
			{#if s.t === 'pen'}
				<path d={penPath(s.p)} fill="none" stroke={pass.stroke} stroke-width={pass.width} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
			{:else if s.t === 'arrow'}
				<path d={arrowPath(s.p, s.w)} fill="none" stroke={pass.stroke} stroke-width={pass.width} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
			{:else if s.t === 'box'}
				{@const b = box(s.p)}
				<rect x={b.x} y={b.y} width={b.w} height={b.h} rx={unit * 0.6} fill="none" stroke={pass.stroke} stroke-width={pass.width} vector-effect="non-scaling-stroke" />
			{:else if s.t === 'ellipse'}
				{@const b = box(s.p)}
				<ellipse cx={b.x + b.w / 2} cy={b.y + b.h / 2} rx={b.w / 2} ry={b.h / 2} fill="none" stroke={pass.stroke} stroke-width={pass.width} vector-effect="non-scaling-stroke" />
			{/if}
		{/each}
		{#if s.t === 'text' && s.s}
			<text
				x={x(s.p[0])}
				y={y(s.p[1])}
				font-size={unit * (3.6 + s.w * 0.9)}
				fill={ink.ink}
				stroke={ink.halo}
				stroke-width={unit * 0.7}
				paint-order="stroke"
				font-family="var(--font-display, sans-serif)"
				font-weight="700"
				dominant-baseline="middle">{s.s}</text
			>
		{/if}
	{/each}
</svg>

<style>
	.mark-layer {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		overflow: visible;
	}
</style>
