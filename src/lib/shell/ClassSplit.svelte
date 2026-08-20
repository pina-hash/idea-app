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
		detailWidth = 'panel',
		scroll = 'panes',
		detailEl = $bindable(null),
		nav,
		overlay = null,
		children
	}: {
		/**
		 * Something is open in the detail pane.
		 *
		 * IT IS THE WHOLE ARRANGEMENT, at every width. False renders no detail
		 * pane at all and gives the navigation the full measure; true is the two
		 * panes. Below 1024px it additionally chooses which single pane is on
		 * screen: the detail when true, the list when not.
		 *
		 * A surface whose detail pane always holds something -- the notebook
		 * feed's compose form, the coin desk's logging form -- passes true and
		 * simply never collapses, which is correct: there is no empty column to
		 * reclaim.
		 */
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
		 *
		 * `stack-nav-first` is the same stack the other way up, for a surface
		 * whose detail pane ALWAYS holds something but whose NAVIGATION is the
		 * point of the screen. The review console is one: its grid is what an
		 * instructor came for, and its detail pane always renders -- an entry, or
		 * a line saying the cell the cursor is on is empty. Under `swap` that
		 * always-true `hasDetail` would hide the grid behind a placeholder the
		 * moment the page loaded on a phone; under `stack` it would put the
		 * placeholder above it. Nav first is the only one of the three that shows
		 * a phone the thing it opened the page for.
		 */
		narrow?: 'swap' | 'stack' | 'stack-nav-first';
		/**
		 * HOW THE TWO COLUMNS DIVIDE above the breakpoint.
		 *
		 * `list` (the default) is a 26rem navigation beside a wide detail: a list
		 * of rows, and the one you picked. With nothing picked the list takes the
		 * whole measure, and what it does with the room is the list's own
		 * business (ClassView lays its unit groups out in columns).
		 *
		 * `wide` is the mirror -- a wide navigation beside a fixed-width detail
		 * panel -- for a navigation surface that is a TABLE you scan rather than a
		 * column of rows. The review console's compliance grid is one, and it
		 * brings its own card, so this variant also drops the pane frame the list
		 * variant supplies.
		 */
		navWidth?: 'list' | 'wide';
		/**
		 * HOW MUCH ROOM THE DETAIL PANEL GETS in the `wide` orientation.
		 *
		 * `panel` (the default) is 21-27rem: a form beside a roster, which is
		 * what the coin desk's logging surface is.
		 *
		 * `roomy` is 28-34rem, for a detail pane somebody READS rather than
		 * fills in. The review console's entry panel is one: at 21rem its status
		 * line wrapped to three rows and its page thumbnails fell to one per row,
		 * so an instructor deciding whether to open a photograph was scrolling a
		 * panel to find out. The nav is still the wide half; this only moves
		 * where the two meet.
		 */
		detailWidth?: 'panel' | 'roomy';
		/**
		 * WHO OWNS THE SCROLL above the breakpoint.
		 *
		 * `panes` (the default, and the classroom's) makes each pane its own
		 * scroll container at viewport height less the chrome above it. It is
		 * right when the split IS the page: a breadcrumb and a tab bar above,
		 * nothing below.
		 *
		 * `page` leaves the scroll to the document and sticks the detail pane
		 * beside a flowing list. It is right when the split is one thing on a
		 * page that has its own chrome above and below it, or when the whole
		 * surface is mounted inside somebody else's shell -- both of which are
		 * true of the notebook, and neither of which any viewport arithmetic in
		 * the stylesheet could know about. Getting this wrong is not subtle: a
		 * viewport-height pane under 355px of chrome gives the page a second
		 * scrollbar wrapped around the pane's own.
		 *
		 * `fill` is `panes` with the arithmetic taken out: each pane is its own
		 * scroll container at the height of WHATEVER BOX THE CALLER PUT THE
		 * SPLIT IN, rather than at `100vh` less a constant. It is what a surface
		 * that genuinely is a full-height application uses -- the review console,
		 * which has to hold a grid and an open entry on screen together -- and it
		 * is the only one of the three that cannot be wrong about somebody else's
		 * chrome, because it never names a height. Below the breakpoint it is
		 * `page`: a phone gets the document's own single scroll, not a 100dvh app
		 * shell with two scrollers inside it.
		 */
		scroll?: 'panes' | 'page' | 'fill';
		/**
		 * The detail pane's own element, for a surface that needs to bring it
		 * into view (see $lib/shell/reveal.ts). Bound rather than found by
		 * selector so a page holding more than one split cannot pick the wrong
		 * one, and so the reference is typed.
		 */
		detailEl?: HTMLElement | null;
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
	class:narrow-stack={narrow === 'stack' || narrow === 'stack-nav-first'}
	class:nav-first={narrow === 'stack-nav-first'}
	class:nav-wide={navWidth === 'wide'}
	class:detail-roomy={detailWidth === 'roomy'}
	class:page-flow={scroll === 'page'}
	class:fill-height={scroll === 'fill'}
	data-testid="class-split"
>
	<div class="cr-nav" data-testid="class-nav-pane">{@render nav()}</div>
	<div class="cr-detail" data-testid="class-detail-pane" bind:this={detailEl}>
		{#if overlay}
			<div class="cr-detail-compose" data-testid="class-detail-overlay">{@render overlay()}</div>
		{/if}
		<div class="cr-detail-page" hidden={!!overlay}>{@render children()}</div>
	</div>
</div>
