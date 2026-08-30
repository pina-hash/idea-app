<script lang="ts">
	import { COIN_TYPE_GLYPHS } from './transaction-types';
	import type { CoinTxnType } from '$lib/coin-format';

	/**
	 * ONE TYPE'S GLYPH, and the only place a `<svg>` is built for one.
	 *
	 * PURELY DECORATIVE, ALWAYS. It is `aria-hidden` with no title and no
	 * label, because it never appears without the type's WORD beside it -- the
	 * picker row prints the type name and the category name, the history chip
	 * prints the type name. A glyph that had to announce itself would be a
	 * glyph carrying meaning alone, which is the thing this component exists to
	 * avoid rather than to create: an assistive reader gets the word, a
	 * colour-blind reader gets the word and the shape, everyone else gets all
	 * three.
	 *
	 * `stroke="currentColor"` and no fill, so the ink comes from whatever the
	 * caller painted the surrounding text -- there is no colour in this file
	 * and there must not be, or a glyph could drift from the word next to it.
	 */
	let { type, size = 14 }: { type: CoinTxnType; size?: number } = $props();

	const glyph = $derived(COIN_TYPE_GLYPHS[type]);
</script>

<svg
	class="coin-glyph"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
	data-glyph={glyph.name}
>
	{#each glyph.paths as d (d)}
		<path {d} />
	{/each}
</svg>

<style>
	.coin-glyph {
		flex: 0 0 auto;
		/* The glyph sits on the text baseline of the word beside it rather than
		   on the line box, so a 14px mark against a 0.55rem chip does not push
		   the row taller than the type name it belongs to. */
		vertical-align: -0.15em;
	}
</style>
