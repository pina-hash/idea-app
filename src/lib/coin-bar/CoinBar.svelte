<script lang="ts">
	import './coin-bar.css';
	import Glyph from '$lib/coin-market/Glyph.svelte';
	import { COIN_SYMBOL } from '$lib/coin-format';
	import { coinPagesFor, type CoinPageId } from './pages';

	/**
	 * THE IDEA COIN BAR (ledger 0422, feedback 7e4a2a15, d299d864). Every coin
	 * page mounts it directly under the site header; the Ledger has this same
	 * component server-rendered into its served HTML (`$lib/server/coin-bar.ts`).
	 *
	 * Props, never `$app/state`: the Ledger's copy is rendered by
	 * `svelte/server` outside a SvelteKit request, where there is no page store.
	 * `desk` is the caller's coin staff answer, so the Coin Desk tab is offered
	 * only to the people it opens for.
	 *
	 * A `div role="navigation"`, not a `<nav>`: the Ledger styles every `nav a`
	 * as one of its raised keys, and its rules would land on these tabs.
	 */
	let { current, desk = false }: { current: CoinPageId | null; desk?: boolean } = $props();

	const pages = $derived(coinPagesFor({ desk }));
	const home = $derived(pages.find((p) => p.id === 'home')!);
	const rest = $derived(pages.filter((p) => p.id !== 'home'));
</script>

<div class="coin-bar" role="navigation" aria-label="IDEA Coin pages" data-testid="coin-bar" data-current={current ?? ''}>
	<div class="cb-inner">
		<a
			class="cb-tab cb-home"
			href={home.href}
			aria-current={current === 'home' ? 'page' : undefined}
			data-testid="coin-bar-home"
			aria-label="Coin home"
		>
			<span class="cb-mark" aria-hidden="true">{COIN_SYMBOL}</span>
			<span class="cb-word">IDEA Coin</span>
		</a>
		<ul class="cb-tabs">
			{#each rest as p (p.id)}
				<li>
					<a
						class="cb-tab"
						href={p.href}
						aria-current={current === p.id ? 'page' : undefined}
						data-testid="coin-bar-{p.id}"
					>
						<Glyph name={p.glyph} size={16} />
						<span>{p.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
</div>
