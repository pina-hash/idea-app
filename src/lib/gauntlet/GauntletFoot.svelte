<script lang="ts">
	import TrademarkFooter from '$lib/gauntlet/viewport/TrademarkFooter.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';

	/**
	 * THE FOOT OF EVERY GAUNTLET PAGE: the trademark disclaimer, then the build
	 * stamp. `src/routes/gauntlet/+layout.svelte` mounts it as the last thing in
	 * `.gt-content`, and `/dev/gauntlet-shell` mounts this same component in the
	 * same place, so the harness measures the foot the layout draws rather than
	 * a copy of it.
	 *
	 * THE VERSION LINE SCROLLS CLEAR OF THE FEEDBACK BUTTON (ledger 0396, review
	 * polish round). Since this bundle the site's own button floats in the
	 * bottom-right corner of every GAUNTLET page, and with only 1.5rem under the
	 * centred stamp, a phone scrolled to the end of a page drew the button over
	 * it (measured at 375: the line at [80,771,215,10], the button at
	 * [192,740,167,48], 1029 square px of overlap, only "GAUNTLET · FE8299A"
	 * showing). So its foot takes the button's own clearance,
	 * `--feedback-clear-block`, which `FeedbackTrigger` declares only while a
	 * button is on the page (its offset, its height and a gap, larger on a
	 * phone), the home footer's rule. Where no button floats the 1.5rem stands.
	 */
</script>

<TrademarkFooter />
<p class="gt-version"><VersionBadge app="gauntlet" /></p>

<style>
	.gt-version {
		text-align: center;
		padding: 0 1.5rem 1.5rem;
		padding-bottom: max(1.5rem, var(--feedback-clear-block, 0px));
		margin: 0;
	}
</style>
