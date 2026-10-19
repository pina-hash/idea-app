<script lang="ts">
	import { MARKET_GLYPHS, type MarketGlyphName } from './glyphs';
	let { name, size = 18, fill = false }: { name: MarketGlyphName; size?: number; fill?: boolean } = $props();
</script>

<svg
	viewBox="0 0 24 24"
	width={size}
	height={size}
	aria-hidden="true"
	fill={fill ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"><path d={MARKET_GLYPHS[name]} /></svg
>
