<script lang="ts">
	import AppSubNav from '$lib/shell/AppSubNav.svelte';
	/**
	 * THE REVIEW LANE'S TWO PLACES (ledger 0360, report 647d1201): the apps
	 * waiting for a decision, and the people (publisher applications and the
	 * trusted roster).
	 *
	 * WHY THEY ARE TWO PAGES. The trusted-publisher roster used to sit under
	 * the queue on the same full-height page, and that page is a 100dvh column
	 * that does not scroll: the roster kept its own height and the queue's
	 * split got whatever was left, about 145px at 1440x953 in the screenshot,
	 * with the rest of the roster clipped off the bottom. A list of people is
	 * an ordinary document; the queue is an application. Each now gets the
	 * shape it needs.
	 *
	 * KEYS, AND THE ONE THAT IS LIT IS THE PLACE YOU ARE. `class:on` beside
	 * `aria-current`, because `aria-current` is not one of the plate's seven
	 * state spellings and `.on` is. The counts are words beside numbers, and
	 * NULL renders nothing (not asked is not zero).
	 */
	let {
		active,
		pendingApps = null,
		pendingApplications = null
	}: {
		active: 'apps' | 'publishers' | 'gallery';
		/** Apps waiting for review, from the same arithmetic the queue renders. */
		pendingApps?: number | null;
		/** Publisher applications waiting. Null on a database without 0230. */
		pendingApplications?: number | null;
	} = $props();
</script>

<!-- THE REVIEW AREA'S PLACES ARE THE SITE'S ONE SUB-NAV (ledger 0468): pads,
     the current one lit, a count where something waits. They were three green
     keys side by side, three primary actions where there is no action at all. -->
<div class="fdy-rnav">
	<AppSubNav
		label="Review"
		testid="foundry-review-nav"
		items={[
			{ id: 'apps', label: 'Apps', href: '/foundry/review', current: active === 'apps', count: pendingApps, hot: (pendingApps ?? 0) > 0, testid: 'foundry-review-nav-apps' },
			{ id: 'publishers', label: 'Publishers', href: '/foundry/review/publishers', current: active === 'publishers', count: pendingApplications, hot: (pendingApplications ?? 0) > 0, testid: 'foundry-review-nav-publishers' },
			{ id: 'gallery', label: 'Curation', href: '/foundry/review/gallery', current: active === 'gallery', testid: 'foundry-review-nav-gallery' }
		]}
	/>
</div>

<style>
	.fdy-rnav :global(.app-subnav) {
		margin: 0;
	}
</style>
