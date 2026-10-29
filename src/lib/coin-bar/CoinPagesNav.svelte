<script lang="ts">
	import Glyph from '$lib/coin-market/Glyph.svelte';
	import AppSubNav from '$lib/shell/AppSubNav.svelte';
	import { COIN_SYMBOL } from '$lib/coin-format';
	import { coinPagesFor, type CoinPageId } from './pages';

	/**
	 * THE COIN PAGES, AS THE SITE'S ONE APP SUB-NAV (ledger 0468, feedback
	 * 38516c68). Every coin page on the site mounts this under the site
	 * header: the Plate's pads, one per coin page from the same list the
	 * Ledger's bar reads (`./pages`), every pad 44px, the current page lit.
	 *
	 * THE LEDGER KEEPS `CoinBar`. The Ledger is frozen legacy HTML with that
	 * component server-rendered into it (`$lib/server/coin-bar.ts`), and what
	 * the Ledger shows is Mr. Pina's call, so its strip is left byte for byte
	 * as it was (`tests/coin-bar.test.ts` holds the render). The two read one
	 * list, so they cannot disagree about which pages exist.
	 */
	let { current, desk = false }: { current: CoinPageId | null; desk?: boolean } = $props();

	const pages = $derived(coinPagesFor({ desk }));
	const glyphOf = (id: string) => pages.find((p) => p.id === id)?.glyph ?? 'coin';
</script>

<div class="cpn">
	<AppSubNav
		label="IDEA Coin pages"
		testid="coin-bar"
		items={pages.map((p) => ({
			id: p.id,
			label: p.id === 'home' ? 'IDEA Coin' : p.label,
			ariaLabel: p.id === 'home' ? 'Coin home' : undefined,
			href: p.href,
			current: current === p.id,
			testid: `coin-bar-${p.id}`
		}))}
	>
		{#snippet icon(item)}
			{#if item.id === 'home'}
				<span class="cpn-mark" aria-hidden="true">{COIN_SYMBOL}</span>
			{:else}
				<Glyph name={glyphOf(item.id)} size={16} />
			{/if}
		{/snippet}
	</AppSubNav>
</div>

<style>
	/* The pads sit on the page's own measure, under the site header. */
	.cpn {
		box-sizing: border-box;
		max-width: 92rem;
		margin: 0 auto;
		padding: 0.85rem 1rem 0;
	}
	.cpn :global(.app-subnav) {
		margin: 0;
	}
	.cpn-mark {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
	}
</style>
