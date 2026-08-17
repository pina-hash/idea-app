<script lang="ts">
	/**
	 * THE TWO-PANE CLASS SHELL, as geometry only.
	 *
	 * A navigation pane that stays put and a detail pane that changes. It knows
	 * nothing about classes, items, routing or data -- it takes two snippets and
	 * one boolean -- which is what lets /dev/classroom-split mount the IDENTICAL
	 * component the real layout mounts, with no router and no Supabase, and have
	 * the geometry it measures be the shipping geometry.
	 *
	 * WHAT IT DELIBERATELY DOES NOT DO is decide the breakpoint. Which pane is on
	 * screen below 1024px is a media query in classroom.css reading `has-detail`,
	 * not state and not a measured viewport -- so the two widths can never
	 * disagree about which pane is showing, and resizing the window is not an
	 * event anything has to handle.
	 *
	 * The state that survives a detail change survives because of WHERE this is
	 * mounted (a layout, whose component is not remounted when a child route
	 * changes), not because of anything here.
	 */
	let {
		hasDetail = false,
		nav,
		children
	}: {
		/** Something is open in the detail pane. Below 1024px this is what chooses
		 *  which single pane renders: the detail when true, the list when not. */
		hasDetail?: boolean;
		nav: import('svelte').Snippet;
		children: import('svelte').Snippet;
	} = $props();
</script>

<div class="cr-split" class:has-detail={hasDetail} data-testid="class-split">
	<div class="cr-nav" data-testid="class-nav-pane">{@render nav()}</div>
	<div class="cr-detail" data-testid="class-detail-pane">{@render children()}</div>
</div>
