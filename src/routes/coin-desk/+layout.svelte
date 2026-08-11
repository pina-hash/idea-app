<script lang="ts">
	import { page } from '$app/state';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import CoinDeskNav from '$lib/coin-desk/CoinDeskNav.svelte';
	import { areaForPath } from '$lib/coin-desk/nav';

	/**
	 * The persistent chrome for the /coin-desk route group: header, hero, and
	 * the sub-nav. Every area renders its own cards into {@render children()}
	 * below, so moving between them keeps this shell mounted and the active
	 * state is derived from the URL rather than tracked in state.
	 */
	let { children } = $props();

	const active = $derived(areaForPath(page.url.pathname));
</script>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/admin">Site Admins</a>
		<a class="btn secondary" href="/dashboard">Dashboard</a>
		<a class="btn secondary" href="/">&lsaquo; Home</a>
		<ProfileMenu />
	</div>
</div>

<main class="coin-desk-page">
	<section class="hero">
		<div class="eyebrow">IDEA // Coin Desk</div>
		<h1>Coin desk</h1>
		<p class="lead">
			The day-to-day tool for the real Supabase coin ledger (migration 0070). It does not touch
			<strong>/coin-entry</strong>, the Sheets-backed leaderboard, or any
			<strong>/api/coin-ledger/*</strong> route; those keep working exactly as they always have.
			Works identically for any admin -- there is no owner-only step here.
		</p>
	</section>

	<CoinDeskNav {active} />

	{@render children()}

	<footer class="page-footer">
		<VersionBadge app="coins" />
	</footer>
</main>

<style>
	.coin-desk-page {
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	/*
	 * The cards live in the child route's own component, so Svelte's scoping
	 * cannot reach them from here -- :global is the one way this shell can own
	 * the spacing between them rather than every area repeating it.
	 */
	.coin-desk-page > :global(.card) {
		margin-bottom: 1.1rem;
	}
	.lead strong {
		color: var(--white);
	}
	.page-footer {
		margin-top: 2rem;
		display: flex;
		justify-content: center;
	}
</style>
