<script lang="ts">
	/**
	 * THE TWO-PANE MASTER-DETAIL SHELL, as geometry only.
	 *
	 * A navigation pane that stays put and a detail pane that changes. It knows
	 * nothing about classes, notebooks, items, routing or data -- it takes two
	 * snippets and three flags -- which is what lets /dev/classroom-split mount
	 * the IDENTICAL component the real layout mounts, with no router and no
	 * Supabase, and have the geometry it measures be the shipping geometry.
	 *
	 * IT IS SHARED, and lives under $lib/shell for that reason: the classroom
	 * mounts it, the notebook feed mounts it, and the notebook's review console
	 * mounts it. The geometry is in $lib/shell/split.css, which both rooms'
	 * stylesheets pull in, so there is exactly ONE split and ONE breakpoint in
	 * the codebase. A surface that needs a different arrangement gets a PROP
	 * here rather than a second component.
	 *
	 * WHAT IT DELIBERATELY DOES NOT DO is decide the breakpoint. Which pane is on
	 * screen below 1024px is a media query in split.css reading `has-detail`,
	 * not state and not a measured viewport -- so the two widths can never
	 * disagree about which pane is showing, and resizing the window is not an
	 * event anything has to handle.
	 *
	 * The state that survives a detail change survives because of WHERE this is
	 * mounted (a layout, whose component is not remounted when a child route
	 * changes; or one long-lived component that owns both snippets), not because
	 * of anything here.
	 */
	let {
		hasDetail = false,
		narrow = 'swap',
		navWidth = 'list',
		nav,
		overlay = null,
		children
	}: {
		/** Something is open in the detail pane. Below 1024px this is what chooses
		 *  which single pane renders: the detail when true, the list when not. */
		hasDetail?: boolean;
		/**
		 * WHAT HAPPENS BELOW THE BREAKPOINT, where there is only room for one
		 * column.
		 *
		 * `swap` (the default, and the classroom's) shows exactly one pane: the
		 * detail when something is open, the list when nothing is. A class page
		 * shows the list, an item page shows the item, and neither is ever a
		 * narrow column beside the other.
		 *
		 * `stack` shows BOTH, detail first. The notebook feed wants it because its
		 * detail pane holds the compose form, and a phone's notebook has always
		 * been "the compose card, then your entries" in one column -- swapping
		 * would hide the feed behind the form. The ordering is CSS (`order`), so
		 * the one instance of the form is not re-created at either width.
		 */
		narrow?: 'swap' | 'stack';
		/**
		 * HOW THE TWO COLUMNS DIVIDE above the breakpoint.
		 *
		 * `list` (the default) is a 26rem navigation beside a wide detail: a list
		 * of rows, and the one you picked.
		 *
		 * `wide` is the mirror -- a wide navigation beside a fixed-width detail
		 * panel -- for a navigation surface that is a TABLE you scan rather than a
		 * column of rows. The review console's compliance grid is one, and it
		 * brings its own card, so this variant also drops the pane frame the list
		 * variant supplies.
		 */
		navWidth?: 'list' | 'wide';
		nav: import('svelte').Snippet;
		/**
		 * SOMETHING THAT IS NOT A ROUTE, TAKING THE DETAIL PANE. In the classroom
		 * that is the composer, which is layout-owned state rather than a page: it
		 * holds staged Files, and a navigation would destroy them.
		 *
		 * The route's own page is kept MOUNTED underneath, hidden, rather than
		 * being swapped out -- closing the overlay puts you back on the item you
		 * were reading with its scroll and its open panels intact, and the item's
		 * route never changed while the overlay was up.
		 */
		overlay?: import('svelte').Snippet | null;
		children: import('svelte').Snippet;
	} = $props();
</script>

<div
	class="cr-split"
	class:has-detail={hasDetail}
	class:narrow-stack={narrow === 'stack'}
	class:nav-wide={navWidth === 'wide'}
	data-testid="class-split"
>
	<div class="cr-nav" data-testid="class-nav-pane">{@render nav()}</div>
	<div class="cr-detail" data-testid="class-detail-pane">
		{#if overlay}
			<div class="cr-detail-compose" data-testid="class-detail-overlay">{@render overlay()}</div>
		{/if}
		<div class="cr-detail-page" hidden={!!overlay}>{@render children()}</div>
	</div>
</div>
