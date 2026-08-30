<script lang="ts">
	import { page } from '$app/state';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import CoinDeskNav from '$lib/coin-desk/CoinDeskNav.svelte';
	import { areaForPath } from '$lib/coin-desk/nav';
	/**
	 * THE SHARED TWO-PANE SHELL'S GEOMETRY, imported directly rather than
	 * through a room stylesheet. The classroom and the notebook each have one
	 * (classroom.css / notebook-theme.css) because each repaints its whole
	 * surface; the coin desk does not -- it sits on the portal's own dark plate
	 * and its only need from that file is the split, the gutter and the
	 * scrollbar treatment, which `.cd-root` (registered there beside the other
	 * two rooms) supplies.
	 */
	import '$lib/shell/split.css';
	/**
	 * THE ROOM'S OWN GEOMETRY, in one file both this layout and the dev harness
	 * import. It used to be a scoped style block here and a byte-identical copy
	 * in `/dev/coin-desk` -- two copies of a page measure, which is exactly the
	 * arrangement where a harness measures a width the real page does not have
	 * and nothing says so.
	 */
	import '$lib/coin-desk/coin-desk.css';

	/**
	 * The persistent chrome for the /coin-desk route group: header, hero, and
	 * the sub-nav. Every area renders its own cards into {@render children()}
	 * below, so moving between them keeps this shell mounted and the active
	 * state is derived from the URL rather than tracked in state.
	 *
	 * THE HERO IS ONE LINE, and that is a consequence of the Log area's
	 * no-scroll rule rather than a taste call. Chrome above the split is height
	 * the entry form does not get, and three sentences of migration history
	 * were being paid for on every area, every load, by an operator who has
	 * read them. What a desk tool's masthead owes the reader is which tool this
	 * is; the history is in the docs.
	 */
	let { children } = $props();

	const active = $derived(areaForPath(page.url.pathname));
</script>

<div class="cd-root">
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
		</section>

		<CoinDeskNav {active} />

		{@render children()}

		<footer class="page-footer">
			<VersionBadge app="coins" />
		</footer>
	</main>
</div>

<style>
	/*
	 * EVERY RULE THIS BLOCK USED TO HOLD IS NOW IN `$lib/coin-desk/coin-desk.css`
	 * -- the page measure, the masthead line and the card rhythm -- because the
	 * dev harness needs the identical geometry and a scoped block cannot be
	 * shared. What is left here is what belongs to this layout alone.
	 */
	.page-footer {
		margin-top: 1.2rem;
		display: flex;
		justify-content: center;
	}
</style>
