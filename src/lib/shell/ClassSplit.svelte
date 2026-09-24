<script lang="ts">
	import {
		NAV_WIDTH_DEFAULT_REM,
		NAV_WIDTH_MAX_REM,
		NAV_WIDTH_MIN_REM,
		NAV_WIDTH_STEP_REM,
		navWidthRem,
		navWidthWords
	} from '$lib/preferences/classroom';
	import { classroomPreferences, reactivePreferences } from '$lib/preferences/context';

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
		resizable = true,
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
		 * `panes` (the default) makes each pane its own scroll container at
		 * viewport height less the chrome above it. It is right when the split
		 * IS the page AND that chrome measures the constant `split.css` names.
		 * THIS USED TO SAY "and the classroom's" AND IT NO LONGER IS: the
		 * classroom's chrome measured 157.9px on an item, 184.3px on an item
		 * whose breadcrumb trail wraps and 201.3px on a class page against a
		 * 168px constant, so the room bounds the split itself now and the
		 * stylesheet gives it `fill`'s geometry structurally. No mount in the
		 * tree passes this value or takes it and means it; it is the safe
		 * default for one that forgets.
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
		 *
		 * A ROOM MAY CLAIM `fill` FOR ITS OWN SPLIT WITHOUT THIS PROP, and the
		 * classroom does -- `.cr-root > .cr-split` in `split.css` takes the same
		 * geometry, because the bounded parent there is the ROOM and a prop on
		 * the split alone could not have supplied one. Read that rule before
		 * concluding a classroom mount has forgotten something.
		 */
		scroll?: 'panes' | 'page' | 'fill';
		/**
		 * The detail pane's own element, for a surface that needs to bring it
		 * into view (see $lib/shell/reveal.ts). Bound rather than found by
		 * selector so a page holding more than one split cannot pick the wrong
		 * one, and so the reference is typed.
		 */
		detailEl?: HTMLElement | null;
		/**
		 * THE LIST'S WIDTH IS ADJUSTABLE, as a knob on this one split (ledger
		 * 0297, LEARN) rather than a second split: a keyboard-operable separator
		 * between the panes, remembered per device in the classroom's `display`
		 * preference group, reset from Settings. It exists only where all four
		 * hold: this prop is not false, the classroom's preference store is in
		 * context (`$lib/preferences/context` -- so the coin desk, Foundry and
		 * Maps, which mount this split outside the classroom, never get it), the
		 * orientation is `list`, and something is open. EVERY SURFACE'S DEFAULT
		 * WIDTH IS UNCHANGED: with no stored width no style is written and the
		 * column is `--measure-nav`, exactly as before.
		 */
		resizable?: boolean;
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

	/*
	 * THE WIDTH KNOB. The store is read from context ONCE, at construction, like
	 * any context; the width is read reactively off it. A drag previews locally
	 * and writes on release, so a drag is one write and not one per pixel.
	 */
	const store = classroomPreferences();
	const prefs = store ? reactivePreferences(store) : null;
	const stored = $derived(prefs ? prefs.current.display.navWidth : null);
	const canResize = $derived(resizable && !!store && navWidth === 'list');
	let dragRem = $state<number | null>(null);
	const shownRem = $derived(dragRem ?? navWidthRem(stored));
	/** A width is written only once somebody chose one, so the default path is byte-for-byte the old one. */
	const sized = $derived(canResize && (dragRem !== null || stored !== null));
	const navId = $props.id();
	let splitEl = $state<HTMLElement | null>(null);

	/** The widest the list may be in THIS window: the stored clamp, and the item beside it kept at 32rem. */
	function maxRemNow(): number {
		if (!splitEl) return NAV_WIDTH_MAX_REM;
		const cs = getComputedStyle(splitEl);
		const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		const inner = splitEl.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
		const gap = parseFloat(cs.columnGap) || 0;
		const fit = Math.floor((inner - gap) / root) - 32;
		return Math.max(NAV_WIDTH_MIN_REM, Math.min(NAV_WIDTH_MAX_REM, fit));
	}

	function commit(rem: number | null) {
		if (!store) return;
		const current = store.current.display;
		store.set('display', { ...current, navWidth: rem });
	}

	function clampRem(rem: number): number {
		return Math.max(NAV_WIDTH_MIN_REM, Math.min(maxRemNow(), Math.round(rem)));
	}

	function onSeparatorKey(e: KeyboardEvent) {
		const now = shownRem;
		let next: number | null = null;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = now - NAV_WIDTH_STEP_REM;
		else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = now + NAV_WIDTH_STEP_REM;
		else if (e.key === 'PageDown') next = now - 4 * NAV_WIDTH_STEP_REM;
		else if (e.key === 'PageUp') next = now + 4 * NAV_WIDTH_STEP_REM;
		else if (e.key === 'Home') next = NAV_WIDTH_MIN_REM;
		else if (e.key === 'End') next = NAV_WIDTH_MAX_REM;
		else if (e.key === 'Enter') {
			e.preventDefault();
			commit(null);
			return;
		}
		if (next === null) return;
		e.preventDefault();
		commit(clampRem(next));
	}

	/* A drag: the pointer's distance from the list's left edge, in whole rem. */
	let dragFrom: { left: number; root: number } | null = null;
	function onSeparatorDown(e: PointerEvent) {
		if (e.button !== 0) return;
		const nav = splitEl?.querySelector<HTMLElement>(':scope > .cr-nav');
		if (!nav) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		dragFrom = {
			left: nav.getBoundingClientRect().left,
			root: parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
		};
		dragRem = shownRem;
	}
	function onSeparatorMove(e: PointerEvent) {
		if (!dragFrom) return;
		dragRem = clampRem((e.clientX - dragFrom.left) / dragFrom.root);
	}
	function onSeparatorUp() {
		if (!dragFrom) return;
		const rem = dragRem;
		dragFrom = null;
		dragRem = null;
		if (rem !== null) commit(rem);
	}
</script>

<div
	bind:this={splitEl}
	class="cr-split"
	class:has-detail={hasDetail}
	class:narrow-stack={narrow === 'stack' || narrow === 'stack-nav-first'}
	class:nav-first={narrow === 'stack-nav-first'}
	class:nav-wide={navWidth === 'wide'}
	class:detail-roomy={detailWidth === 'roomy'}
	class:page-flow={scroll === 'page'}
	class:fill-height={scroll === 'fill'}
	class:nav-resizable={canResize && hasDetail}
	class:nav-sized={sized}
	class:nav-dragging={dragRem !== null}
	style:--cr-nav-size={sized ? `${shownRem}rem` : undefined}
	data-testid="class-split"
>
	<div class="cr-nav" id={navId} data-testid="class-nav-pane">{@render nav()}</div>
	{#if canResize && hasDetail}
		<!-- THE SEPARATOR (WAI-ARIA window splitter): the arrow keys step it, Page
		     Up and Page Down step it four at a time, Home and End go to the ends,
		     Enter and a double-click put it back to standard, and a drag moves it.
		     Its single-pointer twin is Narrower and Wider in Settings. It takes no
		     grid track (it is positioned into the gap between the panes), so the
		     split's own easing still interpolates. -->
		<!-- A FOCUSABLE SEPARATOR IS A WIDGET in WAI-ARIA (the window splitter
		     pattern: it takes focus and a value), which Svelte's static list of
		     non-interactive roles does not know, so these two notices are about
		     the list, not the element. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="cr-split-sep"
			role="separator"
			aria-orientation="vertical"
			aria-controls={navId}
			aria-label="List width"
			aria-valuemin={NAV_WIDTH_MIN_REM}
			aria-valuemax={NAV_WIDTH_MAX_REM}
			aria-valuenow={shownRem}
			aria-valuetext={navWidthWords(shownRem === NAV_WIDTH_DEFAULT_REM ? null : shownRem)}
			tabindex="0"
			data-testid="split-separator"
			onkeydown={onSeparatorKey}
			onpointerdown={onSeparatorDown}
			onpointermove={onSeparatorMove}
			onpointerup={onSeparatorUp}
			onpointercancel={onSeparatorUp}
			ondblclick={() => commit(null)}
		>
			<span class="cr-split-grip" aria-hidden="true"></span>
		</div>
	{/if}
	<div class="cr-detail" data-testid="class-detail-pane" bind:this={detailEl}>
		{#if overlay}
			<div class="cr-detail-compose" data-testid="class-detail-overlay">{@render overlay()}</div>
		{/if}
		<div class="cr-detail-page" hidden={!!overlay}>{@render children()}</div>
	</div>
</div>
