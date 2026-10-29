<script lang="ts">
	/**
	 * A CALENDAR LAYER'S GLYPH (ledger 0467): its shape, filled with the
	 * layer's library fill and edged in its line, so a layer is told by shape
	 * as well as by colour. The fill carries the difference under colour-vision
	 * deficiency and the line carries the 3:1 a mark owes on every ground.
	 * `off` draws the glyph hollow, which is how a filter key that is switched
	 * off says so beside its word.
	 */
	import { LAYER_MARK_SHAPES, type CalendarLayerInfo } from './model';

	let { layer, size = 12, off = false }: { layer: CalendarLayerInfo; size?: number; off?: boolean } = $props();
</script>

<svg
	class="layer-mark"
	viewBox="0 0 12 12"
	width={size}
	height={size}
	aria-hidden="true"
	focusable="false"
	data-mark={layer.mark}
	data-layer={layer.id}
	style:--lm-fill={off ? 'transparent' : layer.fill}
	style:--lm-line={layer.color}
>
	<path d={LAYER_MARK_SHAPES[layer.mark]} />
</svg>

<style>
	.layer-mark {
		display: inline-block;
		flex-shrink: 0;
		vertical-align: middle;
		overflow: visible;
	}
	.layer-mark path {
		fill: var(--lm-fill);
		stroke: var(--lm-line);
		stroke-width: 1.3;
		stroke-linejoin: round;
	}
</style>
