<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import '$lib/classroom/classroom.css';
	import '$lib/coin-market/market.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import CoinHeaderBanner from '$lib/coin-market/CoinHeaderBanner.svelte';
	import HallPassMinutes from '$lib/coin-market/HallPassMinutes.svelte';
	import { BANNER_STYLES, DEFAULT_BANNER_STYLE } from '$lib/coin-market/banner';
	import type { HallPassMinutesQuote } from '$lib/classroom/hall-pass';

	/**
	 * Dev harness for the IDEA Classroom header banner and the hall pass time
	 * purchase (ledger 0402), inside the classroom's own room. Each of the
	 * three looks is the REAL banner over the same four pins, the default
	 * first (marked), then the hall pass card's time purchase. `?only=spotlight|ticker|cards`
	 * shows one look as a class page would; `?theme=space-white|matrix` forces
	 * the site theme the way the certification harnesses do. Nothing is
	 * dismissed here (Hide for today writes only this browser's storage,
	 * keyed by `?day`). 404s in production.
	 */
	let hydrated = $state(false);
	onMount(() => (hydrated = true));

	const q = page.url.searchParams;
	const themeParam = q.get('theme');
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	const only = BANNER_STYLES.find((b) => b.id === q.get('only'))?.id ?? null;
	const looks = only ? BANNER_STYLES.filter((b) => b.id === only) : [...BANNER_STYLES].sort((a, b) => Number(b.id === DEFAULT_BANNER_STYLE) - Number(a.id === DEFAULT_BANNER_STYLE));
	const day = q.get('day') ?? 'harness';

	const pins = {
		style: DEFAULT_BANNER_STYLE,
		pins: [
			{ id: 'p1', kind: 'official', title: 'Tissue boxes wanted', subtitle: 'Bring one in, earn coins', href: '/market', price: 1, sort_order: 0 },
			{ id: 'p2', kind: 'listing', title: 'Laser-cut name tags', subtitle: 'From a classmate in Block 1', href: '/market', price: 3.5, sort_order: 1 },
			{ id: 'p3', kind: 'contract', title: 'Organize the filament shelf', subtitle: 'A job, pays on completion', href: '/market', price: 3, sort_order: 2 },
			{ id: 'p4', kind: 'shop', title: 'Extra Credit', subtitle: 'Points on returned work', href: '/market', price: 2, sort_order: 3 }
		]
	};
	const load = async () => pins;

	let quote = $state<HallPassMinutesQuote>({
		available: true,
		block_minutes: 5,
		price_per_block: 1,
		cap_minutes: 15,
		bought_today_minutes: q.get('bought') === '15' ? 15 : 0,
		bought_here_minutes: q.get('bought') === '15' ? 15 : 0,
		room_minutes: q.get('bought') === '15' ? 0 : 15,
		room_blocks: q.get('bought') === '15' ? 0 : 3,
		balance: q.get('debt') === '1' ? -2 : 23.5
	});
	const loadQuote = async () => ({ ...quote });
	const buy = async (_s: string, blocks: number) => {
		const m = blocks * quote.block_minutes;
		quote = {
			...quote,
			bought_today_minutes: quote.bought_today_minutes + m,
			bought_here_minutes: quote.bought_here_minutes + m,
			room_minutes: quote.room_minutes - m,
			room_blocks: quote.room_blocks - blocks,
			balance: quote.balance - blocks * (quote.price_per_block ?? 1)
		};
		return { ok: true as const, minutes: m, cost: blocks * (quote.price_per_block ?? 1) };
	};
</script>

<div class="cr-root {CLASSROOM_PLATE} harness-page" data-testid="banner-harness" data-banner-hydrated={hydrated ? 'yes' : 'no'} style="--cr-measure-route: var(--measure-split)">
	<main class="harness-main">
		<h1 class="harness-h">Classroom banner</h1>
		{#each looks as b (b.id)}
			<section class="harness-look" data-testid="harness-look-{b.id}">
				<h2 class="harness-k">{b.label}{b.id === DEFAULT_BANNER_STYLE ? ' (the default)' : ''}</h2>
				<CoinHeaderBanner {load} day="{day}-{b.id}" styleOverride={b.id} />
			</section>
		{/each}
		{#if !only}
			<section class="card harness-pass" data-testid="harness-hall-pass">
				<h2 class="harness-k">Hall pass, student</h2>
				<HallPassMinutes sectionId="s-a" quote={loadQuote} {buy} />
			</section>
		{/if}
	</main>
</div>

<style>
	.harness-main {
		max-width: var(--measure-split, 92rem);
		margin: 0 auto;
		padding: 1rem var(--cr-gutter, 1rem) 6rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.25rem;
	}
	.harness-h {
		margin: 0;
		font-size: 1.4rem;
	}
	.harness-k {
		margin: 0 0 0.25rem;
		font-size: 1rem;
		color: var(--text-2);
	}
	.harness-pass {
		max-width: 34rem;
		padding: 1rem;
	}
</style>
