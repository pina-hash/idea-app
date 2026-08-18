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
	 * `--cr-measure` is the shell's page-measure property. split.css sets it to
	 * --measure-split on a room that CONTAINS a split (the `:has()` rule), so
	 * the Log area widens to both panes and every other area keeps the 52rem
	 * reading column -- one declaration, no per-route width.
	 */
	.coin-desk-page {
		max-width: var(--cr-measure, 52rem);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 2rem;
	}
	/*
	 * A MASTHEAD LINE, not a landing-page hero. The shared `.hero` is
	 * `padding: 4rem 1rem 2.5rem` with a centred stack under it, which measured
	 * 191px -- a fifth of a 900px viewport, above the split, on every load, on
	 * a tool whose whole constraint is that the form fits without scrolling.
	 * The eyebrow and the title say which tool this is on one row instead.
	 */
	.hero {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		text-align: left;
		padding: 0.9rem 0 0.5rem;
	}
	.hero :global(.eyebrow) {
		display: inline-block;
		margin-bottom: 0;
	}
	.hero h1 {
		font-size: 1.15rem;
		margin: 0;
		letter-spacing: 0.04em;
	}
	/*
	 * The cards live in the child route's own component, so Svelte's scoping
	 * cannot reach them from here -- :global is the one way this shell can own
	 * the spacing between them rather than every area repeating it.
	 */
	.coin-desk-page > :global(.card) {
		margin-bottom: 1.1rem;
	}
	/* A split IS the area's whole surface, so it owns its own internal spacing
	   and the shell's card rhythm would only add a gap under it. */
	.coin-desk-page > :global(.cr-split) {
		margin-bottom: 0;
	}
	.page-footer {
		margin-top: 1.2rem;
		display: flex;
		justify-content: center;
	}
</style>
