<script lang="ts">
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import CoinPageBody from './CoinPageBody.svelte';
	import type { CoinMyPage } from '$lib/coin-balance';
	import type { CoinPageTransports } from './transports';
	import type { CoinPageExtras } from './extras';

	/**
	 * A STUDENT'S OWN IDEA COIN PAGE (V2, migration 0241): the site chrome
	 * around `CoinPageBody`. The route mounts it over `coin_my_page()` and four
	 * injected purchase transports; `/dev/coin-balance` mounts the identical
	 * component over an in-memory page.
	 */
	let {
		state: pageState,
		page = null,
		transports = {},
		extras = {},
		now,
		onsignin = null,
		onchanged = null,
		market = null
	}: {
		state: 'ready' | 'signed_out' | 'updating' | 'error';
		page?: CoinMyPage | null;
		transports?: CoinPageTransports;
		extras?: CoinPageExtras;
		now: number;
		onsignin?: (() => void) | null;
		onchanged?: (() => void) | null;
		/** Ledger 0402: the market, stocks, transfers and hall pass time, drawn under the hero by the route. */
		market?: import('svelte').Snippet | null;
	} = $props();
</script>

<svelte:head>
	<title>My IDEA Coins // IDEA</title>
</svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="cp-page">
	<section class="hero cp-hero">
		<div class="eyebrow">IDEA // Coins</div>
		<h1>My IDEA Coins</h1>
		<p class="lead">
			Your balance, your history, what you can buy, and every rule for earning and losing coins.
			<a href="/coins/index.html">See the class leaderboard</a>.
		</p>
	</section>

	{#if market}{@render market()}{/if}

	<CoinPageBody state={pageState} {page} {transports} {extras} {now} {onsignin} {onchanged} />

	<footer class="page-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.cp-page {
		max-width: 80rem;
		margin: 0 auto;
		padding: 0 1rem 3rem;
	}
	.cp-hero .lead a {
		color: var(--cyan);
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
