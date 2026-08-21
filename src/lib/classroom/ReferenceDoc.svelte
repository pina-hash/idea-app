<script lang="ts">
	import ReferenceBlock from '$lib/classroom/ReferenceBlock.svelte';
	import type { ClassroomAttachment, LinkPreview } from '$lib/classroom/classroom';
	import { slugFromHash, type ReferenceSpec } from '$lib/classroom/reference-spec';
	import {
		canScrollEnd,
		canScrollStart,
		dragCanStart,
		dragPastSlop,
		dragScrollLeft,
		nudgeScrollTarget,
		stripOverflows,
		wheelStripScroll,
		type StripMetrics
	} from '$lib/classroom/tab-strip';

	/**
	 * A reference document rendered: sections as tabs (the default) or stacked.
	 *
	 * PRESENTATION-ONLY AND STATE-FREE. It takes a validated spec and renders it;
	 * there is no transport, no autosave, no submission, and nothing a reader can
	 * do here that another reader could see. The only thing it writes anywhere is
	 * the location HASH, so a tab is linkable.
	 *
	 * EVERY SECTION IS ALWAYS IN THE DOM. An inactive tab is hidden with CSS, not
	 * omitted with {#if}, for one load-bearing reason: the print stylesheet
	 * expands all of them into sequential sections, and a section that was never
	 * rendered cannot be printed. It also means a deep link never has to wait for
	 * a section to mount.
	 *
	 * DEEP LINKS ARE A PERMANENT CONTRACT (see reference-spec.ts): /209h#ai-policy
	 * must open that tab with the section in view from a COLD LOAD, not only from
	 * an in-page click, so the hash is read on mount as well as on every
	 * hashchange. A hash naming no section leaves the first tab active rather
	 * than showing nothing.
	 *
	 * A TAB CLICK MOVES THE CONTENT, NEVER THE READER. See holdRail() below: the
	 * rail's position on screen is what is held fixed, and the window is only
	 * ever scrolled UP to the point where the rail pins. Nothing here calls
	 * scrollIntoView on a click -- doing so scrolled the window to the top of the
	 * newly shown section, which (because every section starts at the same place,
	 * inactive ones being display:none) means the top of the document.
	 *
	 * THE STRIP SCROLLS, IT NEVER OVERFLOWS ITS CONTAINER. `.tabs` is its own
	 * overflow-x:auto box, and
	 * `active` is re-clamped to a real section of the CURRENT `spec` on every
	 * prop change (see the effect right after selectTab()) -- load-bearing since
	 * the classroom item page mounts this inside a persistent detail pane that
	 * is NOT remounted between materials, so `spec` can change under an
	 * already-mounted instance. Left unclamped, a stale `active` hides every
	 * section at once and leaves the strip's scroll position wherever the
	 * PREVIOUS document put it.
	 *
	 * THE STRIP IS OPERABLE WITHOUT SELECTING ANYTHING, and that is the whole
	 * point of the controls below. It shipped once with none: the scrollbar was
	 * hidden on the grounds that an edge fade replaced it, there were no scroll
	 * buttons, no wheel handling and no drag -- so the only thing that moved the
	 * strip was clicking a half-visible tab, which also changed what the reader
	 * was reading, and tabs past the last one you could reach that way were
	 * simply unreachable. A fade says "there is more"; it is not a control.
	 * Four ways to move it now, none of which change the section:
	 *
	 *   - the SCROLLBAR, thin and quiet but present, inherited from the module's
	 *     own treatment in $lib/shell/split.css rather than restyled here (the
	 *     documented exception that used to hide it is gone from that file);
	 *   - PREV/NEXT buttons at the strip's edges (nudge()), one strip-width less
	 *     a tab's lead-in per press, disabled and faded at their own end;
	 *   - the WHEEL over the strip (onRailWheel), vertical delta translated to
	 *     horizontal -- and deliberately NOT swallowed once the strip is at the
	 *     end in the wheel's direction, so the page keeps scrolling;
	 *   - POINTER DRAG past a slop threshold (onRailPointerDown and friends),
	 *     which cancels the click it would otherwise have fired so a drag never
	 *     also picks a section, while a press that never travelled still does.
	 *
	 * TOUCH IS LEFT TO THE BROWSER on purpose: the drag handlers ignore
	 * `pointerType === 'touch'`, because native touch scrolling is what gives
	 * the strip its momentum and a 1:1 JS drag would replace it with one that
	 * stops dead on release.
	 *
	 * KEYBOARD: roving tabindex, the standard tablist pattern (see
	 * onTablistKeydown below) -- only the active tab sits in the normal Tab
	 * order; arrow keys move focus and selection together, Home/End jump to the
	 * ends, and the newly focused tab is scrolled into view by the same
	 * keepActiveVisible() a click already runs. keepActiveVisible is still
	 * wired, but it is no longer the only thing that can move the strip, which
	 * is what it had become.
	 */
	let {
		spec,
		fetchPreview = null,
		/** False where the host page's own hero already carries the title (the
		 *  classroom item page), so it is not printed twice. */
		showHeader = true,
		/**
		 * PREVIEW MODE: this document is being shown INSIDE another page (the
		 * spec importer's live preview), not served as the page itself.
		 *
		 * It turns off the two things that are correct for a document that owns
		 * its page and wrong for one that does not: the location hash (a preview
		 * must not rewrite the URL of the page it is embedded in, nor answer the
		 * host's own back button) and the scroll management (holdRail and reveal
		 * both move the WINDOW, which from inside a panel means yanking the
		 * editor out from under whoever is typing in it). Tabs still switch;
		 * they just stop being addressable and stop scrolling anything.
		 */
		preview = false,
		/** Extra chrome the host wants under the title (attachments, a back link). */
		aside = null,
		attachments = [],
		publicAttachments = false
	}: {
		spec: ReferenceSpec;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		showHeader?: boolean;
		preview?: boolean;
		aside?: import('svelte').Snippet | null;
		/**
		 * The host ITEM's attachments, which `attachment:<filename>` figure
		 * references in this document's prose resolve against. Passed straight
		 * down to ReferenceBlock; this component neither reads nor fetches them.
		 *
		 * The spec importer's live preview passes NONE, deliberately: the item it
		 * would resolve against does not exist yet, and every figure there reads
		 * as unresolved. That is the honest preview of a document whose images
		 * cannot be checked until it is attached to something.
		 */
		attachments?: ClassroomAttachment[];
		/** The signed-out public viewer's `?public=1` resolution branch. */
		publicAttachments?: boolean;
	} = $props();

	const tabbed = $derived((spec.navigation ?? 'tabs') === 'tabs');
	const slugs = $derived(spec.sections.map((s) => s.slug));

	let active = $state(spec.sections[0]?.slug ?? '');
	let tabBar = $state<HTMLDivElement | null>(null);
	/** A zero-height sentinel immediately above the sticky rail. The rail itself
	 *  cannot be measured: while it is stuck its own rect reports the STUCK
	 *  position, not its place in the document. */
	let railAnchor = $state<HTMLDivElement | null>(null);
	let railEl = $state<HTMLDivElement | null>(null);
	/** Measured, not assumed: it sizes .ref-body's floor exactly (see the
	 *  stylesheet), and a guessed rail height leaves the rail a few pixels short
	 *  of pinning -- which reads as a small jump on every tab click. */
	let railHeight = $state(0);
	let scrollable = $state(false);
	/** Is there anything past this edge? One measurement, one meaning, and the
	 *  prev/next buttons are its only consumer -- each is rendered while the
	 *  strip overflows at all, and disabled (and faded out of the way) once its
	 *  own direction has nothing left to give. The two edge FADES this replaced
	 *  said the same thing and could not act on it. */
	let canStart = $state(false);
	let canEnd = $state(false);
	/** A pointer drag is in progress: the cursor changes, and it is what tells
	 *  the click handler to swallow the click this drag would otherwise fire. */
	let dragging = $state(false);

	function sectionEl(slug: string): HTMLElement | null {
		if (typeof document === 'undefined') return null;
		return document.getElementById(`ref-${slug}`);
	}

	/**
	 * Bring a section into view once it is actually displayed. COLD LOADS ONLY --
	 * an in-page tab change uses holdRail() instead.
	 *
	 * SCHEDULED ON rAF-OR-TIMEOUT, never rAF alone (the DrawingViewer rule): a
	 * backgrounded or throttled window never ticks requestAnimationFrame, so a
	 * deep link opened in a tab that is not in front would land on the right tab
	 * and then silently never scroll to it. Found in the browser -- the harness
	 * pane runs hidden, and the rAF-only version simply did nothing there.
	 */
	function reveal(slug: string) {
		if (typeof window === 'undefined' || preview) return;
		// The section may have been display:none a tick ago (tabs mode), so wait
		// for the layout that follows the state change before measuring it.
		let done = false;
		const run = () => {
			if (done) return;
			done = true;
			sectionEl(slug)?.scrollIntoView({ behavior: 'instant', block: 'start' });
		};
		requestAnimationFrame(run);
		setTimeout(run, 32);
	}

	/**
	 * SWITCH TABS WITHOUT MOVING THE READER, and without leaving them halfway
	 * down a section they have not read.
	 *
	 * The rail is sticky at top 0, so its position on screen is a step function
	 * of the scroll: pinned at 0 once the page is scrolled past its own document
	 * offset, and in natural flow before that. Scrolling to exactly that offset
	 * therefore moves the rail by ZERO pixels while putting the top of the newly
	 * shown section immediately below it. The rule is one clamp:
	 *
	 *     target = min(currentScroll, railOffset)
	 *
	 * -- never scroll down (that would move the rail up off the header), never
	 * scroll past the pin point (that would move it down). A reader already above
	 * the pin point is not moved at all, because the section already starts in
	 * view for them.
	 *
	 * `behavior: 'instant'` is not decoration: app.css sets a global
	 * `scroll-behavior: smooth`, which would otherwise animate this.
	 */
	function holdRail() {
		if (typeof window === 'undefined' || preview || !tabbed || !railAnchor) return;
		const anchorTop = Math.max(0, railAnchor.getBoundingClientRect().top + window.scrollY);
		const target = Math.min(window.scrollY, anchorTop);
		if (Math.abs(target - window.scrollY) < 0.5) return;
		window.scrollTo({ top: target, left: window.scrollX, behavior: 'instant' });
	}

	function setActive(slug: string) {
		if (active === slug) return;
		active = slug;
		// Synchronously, BEFORE Svelte swaps the sections: the document is still
		// at its old height here, so the scroll cannot be clamped. (.ref-body's
		// min-height is what keeps it un-clamped after a swap to a short section.)
		holdRail();
		let done = false;
		const settle = () => {
			if (done) return;
			done = true;
			holdRail();
		};
		requestAnimationFrame(settle);
		setTimeout(settle, 32);
	}

	/** Cold load: honour an explicit deep link, else open the first tab. */
	function applyInitialHash() {
		const slug = slugFromHash(typeof window === 'undefined' ? null : window.location.hash);
		if (!slug || !slugs.includes(slug)) return;
		active = slug;
		reveal(slug);
	}

	/**
	 * Back/forward. A hash that names no section is the document's own entry
	 * (the reader arrived at /209h with no fragment), which is the FIRST tab --
	 * so going back past the first tab click returns there rather than doing
	 * nothing.
	 */
	function applyHistoryHash() {
		const slug = slugFromHash(typeof window === 'undefined' ? null : window.location.hash);
		setActive(slug && slugs.includes(slug) ? slug : (spec.sections[0]?.slug ?? ''));
	}

	function selectTab(slug: string) {
		setActive(slug);
		if (typeof window !== 'undefined' && !preview) {
			// pushState, not replaceState and not a hash assignment: back and
			// forward must move between tabs rather than leaving the document, and
			// a hash assignment would make the browser jump to the section itself.
			// (The history API fires neither hashchange nor popstate, so this
			// cannot re-enter applyHistoryHash.)
			history.pushState(history.state, '', `#${slug}`);
		}
	}

	/**
	 * THE DOCUMENT CAN CHANGE UNDER US WITH NO REMOUNT. `active` is seeded once
	 * from the FIRST `spec` this component ever saw ($state initializers run
	 * only at construction), but the classroom item page mounts ReferenceDoc
	 * inside a persistent detail pane (see ItemDetail) -- opening a different
	 * material reuses the SAME component instance with a new `spec` prop rather
	 * than remounting it. Left alone, `active` would keep naming a slug from the
	 * PREVIOUS document: every section's `hidden` check compares against it, so
	 * a slug that matches nothing hides every section at once, and the tab bar's
	 * horizontal scroll position -- inherited from whatever the last document's
	 * layout put it at -- can leave the strip looking clipped with no active tab
	 * in it to scroll back to. (The importer's own preview avoids this by
	 * remounting on every edit via `{#key parsed}`; the item page does not, so
	 * the guard belongs here rather than at every call site.)
	 *
	 * Falls back to the first section, matching every other "no answer" default
	 * in this file (a hash naming nothing, a hash naming an unknown slug).
	 */
	$effect(() => {
		if (!slugs.includes(active)) active = slugs[0] ?? '';
	});

	$effect(() => {
		if (typeof window === 'undefined' || preview) return;
		// The COLD-LOAD half of the deep-link contract.
		applyInitialHash();
		// Both, because a same-document fragment traversal fires hashchange while
		// a pushed entry with no fragment change fires only popstate. The handler
		// is idempotent (setActive returns early when nothing changed).
		const onNav = () => applyHistoryHash();
		window.addEventListener('hashchange', onNav);
		window.addEventListener('popstate', onNav);
		return () => {
			window.removeEventListener('hashchange', onNav);
			window.removeEventListener('popstate', onNav);
		};
	});

	/**
	 * Does the bar actually overflow, and which way is there more of it? Drives
	 * both prev/next buttons. Also measures the rail, which
	 * .ref-body's min-height needs exactly.
	 *
	 * The 2px slack on the overflow test absorbs sub-pixel layout; the 1px slack
	 * on each edge test does the same for a fractional scrollLeft, which is what
	 * a trackpad and the active-tab scroll below both produce.
	 *
	 * A plain function, not an effect: reading `scrollWidth`/`clientWidth`/
	 * `scrollLeft` right after WE move the scroll position ourselves (a tab
	 * click, a keyboard move, a deep-link reveal) forces the browser to lay
	 * those out synchronously and answers accurately at once, so every caller
	 * that scrolls the bar on purpose calls this itself rather than waiting on
	 * the native 'scroll' event below -- which exists for the one case this
	 * component does NOT initiate: the reader's own trackpad/wheel/touch drag.
	 */
	/** The strip as the pure layer sees it. */
	function metrics(bar: HTMLElement): StripMetrics {
		return {
			scrollLeft: bar.scrollLeft,
			clientWidth: bar.clientWidth,
			scrollWidth: bar.scrollWidth
		};
	}

	function measureRail() {
		const bar = tabBar;
		const rail = railEl;
		if (!bar || !rail) return;
		const m = metrics(bar);
		scrollable = stripOverflows(m);
		canStart = canScrollStart(m);
		canEnd = canScrollEnd(m);
		railHeight = rail.offsetHeight;
	}

	/**
	 * PREV / NEXT. The rule -- and why it is a tab-aligned move rather than a
	 * fixed step, which left seven tabs unreachable when it was one -- lives in
	 * `nudgeScrollTarget` in $lib/classroom/tab-strip.ts, with the tabs handed
	 * to it in the content-space coordinates it works in.
	 *
	 * A plain scrollLeft write, not scrollBy(): always instant, so the global
	 * `scroll-behavior: smooth` in app.css cannot animate it and the measurement
	 * afterwards is reading the position it just set.
	 */
	function nudge(dir: -1 | 1) {
		const bar = tabBar;
		if (!bar) return;
		const view = bar.getBoundingClientRect();
		const spans = Array.from(bar.querySelectorAll<HTMLElement>('.tab')).map((t) => {
			const r = t.getBoundingClientRect();
			return { start: r.left - view.left + bar.scrollLeft, end: r.right - view.left + bar.scrollLeft };
		});
		bar.scrollLeft = nudgeScrollTarget(metrics(bar), spans, dir);
		measureRail();
	}

	/**
	 * WHEEL OVER THE STRIP SCROLLS THE STRIP -- and stops doing so the moment it
	 * has nothing left to give in that direction, which is what keeps it from
	 * eating the page scroll. A reader wheeling down the page over a strip that
	 * is already at its end must go on reading the page. Which axis is used and
	 * where the edges are is `wheelStripScroll`'s decision.
	 *
	 * The listener is attached with `{ passive: false }` (see the effect below),
	 * because a passive one cannot preventDefault and the page would scroll too.
	 */
	function onRailWheel(event: WheelEvent) {
		const bar = tabBar;
		if (!bar) return;
		const outcome = wheelStripScroll(metrics(bar), event.deltaX, event.deltaY);
		if (!outcome.consume) return;
		event.preventDefault();
		bar.scrollLeft = outcome.scrollLeft;
		measureRail();
	}

	/**
	 * POINTER DRAG, with a slop threshold, and MOUSE ONLY.
	 *
	 * Touch returns early: the browser's own touch scrolling (with
	 * -webkit-overflow-scrolling and the platform's momentum) is better than
	 * anything this could do by hand, and taking the pointer over would replace
	 * a flick that coasts with a drag that stops dead.
	 *
	 * The slop is what keeps a tap a tap. Under DRAG_SLOP_PX the press has not
	 * become a drag, nothing scrolls, and the click runs normally -- so tapping a
	 * tab still selects it. Past it the strip scrolls and the click that follows
	 * is cancelled in the capture phase, so a drag that happens to end over a tab
	 * never also changes what the reader is reading.
	 *
	 * Pointer capture is taken only ONCE THE DRAG HAS STARTED, deliberately: a
	 * capture set at pointerdown retargets the following click to the capturing
	 * element in Chrome, which would stop every tab click from reaching its own
	 * button. By then the click is one we are cancelling anyway.
	 *
	 * Both decisions -- may this press start a drag, and has it travelled far
	 * enough to be one -- are `dragCanStart` / `dragPastSlop` in
	 * $lib/classroom/tab-strip.ts.
	 */
	let dragId: number | null = null;
	let dragFromX = 0;
	let dragFromScroll = 0;
	let swallowClick = false;

	function onRailPointerDown(event: PointerEvent) {
		const bar = tabBar;
		// Cleared here as well as when a click consumes it: a drag released
		// outside the window fires no click at all, and a stale flag would
		// otherwise eat the next genuine tab click.
		swallowClick = false;
		if (!bar || !dragCanStart(event.pointerType, event.button, scrollable)) return;
		dragId = event.pointerId;
		dragFromX = event.clientX;
		dragFromScroll = bar.scrollLeft;
		dragging = false;
	}

	function onRailPointerMove(event: PointerEvent) {
		const bar = tabBar;
		if (!bar || dragId !== event.pointerId) return;
		const dx = event.clientX - dragFromX;
		if (!dragging) {
			if (!dragPastSlop(dx)) return;
			dragging = true;
			try {
				bar.setPointerCapture(event.pointerId);
			} catch {
				// A pointer that has already been released or cancelled: the drag
				// still works, it just stops tracking outside the strip.
			}
		}
		bar.scrollLeft = dragScrollLeft(metrics(bar), dragFromScroll, dx);
		measureRail();
	}

	function onRailPointerEnd(event: PointerEvent) {
		if (dragId !== event.pointerId) return;
		swallowClick = dragging;
		dragging = false;
		dragId = null;
	}

	function onRailClickCapture(event: MouseEvent) {
		if (!swallowClick) return;
		swallowClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	/**
	 * Keep the active tab visible in a horizontally scrolled bar. Scrolls the BAR
	 * by hand rather than calling scrollIntoView on the button, which scrolls
	 * every scrollable ancestor including the window. A direct `scrollLeft`
	 * write is always instant (scroll-behavior only governs scrollTo() /
	 * scrollIntoView() / anchor navigation), so this needs no reduced-motion
	 * gate of its own.
	 */
	function keepActiveVisible() {
		const bar = tabBar;
		if (!bar) return;
		const el = bar.querySelector<HTMLElement>(`[data-slug="${CSS.escape(active)}"]`);
		if (el) {
			const b = bar.getBoundingClientRect();
			const e = el.getBoundingClientRect();
			if (e.left < b.left) bar.scrollLeft += e.left - b.left - 8;
			else if (e.right > b.right) bar.scrollLeft += e.right - b.right + 8;
		}
		// The fades otherwise only catch up once the 'scroll' event this write
		// queues gets around to firing.
		measureRail();
	}

	$effect(() => {
		// Reads `active` (the dependency) before touching the DOM.
		void active;
		keepActiveVisible();
	});

	// Real container resizes (a window resize, the pane resizing) -- set up
	// once per pair of elements, since the elements themselves persist across a
	// `spec` change (only their CHILDREN are re-diffed by the {#each} below).
	// The 'scroll' listener is what catches scrolling WE did not initiate --
	// the reader dragging the strip by hand.
	$effect(() => {
		const bar = tabBar;
		const rail = railEl;
		if (!bar || !rail || typeof ResizeObserver === 'undefined') return;
		measureRail();
		const ro = new ResizeObserver(measureRail);
		ro.observe(bar);
		ro.observe(rail);
		bar.addEventListener('scroll', measureRail, { passive: true });
		// EVERY INTERACTION LISTENER IS ATTACHED BY HAND, not through Svelte's
		// event attributes (the DrawingViewer rule): the wheel one needs
		// `{ passive: false }` to be allowed to preventDefault at all, and the
		// click one needs the CAPTURE phase to get in front of a tab's own
		// onclick. Neither option is expressible as an attribute.
		bar.addEventListener('wheel', onRailWheel, { passive: false });
		bar.addEventListener('pointerdown', onRailPointerDown);
		bar.addEventListener('pointermove', onRailPointerMove);
		bar.addEventListener('pointerup', onRailPointerEnd);
		bar.addEventListener('pointercancel', onRailPointerEnd);
		bar.addEventListener('click', onRailClickCapture, { capture: true });
		return () => {
			ro.disconnect();
			bar.removeEventListener('scroll', measureRail);
			bar.removeEventListener('wheel', onRailWheel);
			bar.removeEventListener('pointerdown', onRailPointerDown);
			bar.removeEventListener('pointermove', onRailPointerMove);
			bar.removeEventListener('pointerup', onRailPointerEnd);
			bar.removeEventListener('pointercancel', onRailPointerEnd);
			bar.removeEventListener('click', onRailClickCapture, { capture: true });
		};
	});

	// A CONTENT change with no box-size change on the bar -- swapping to a
	// document with more or fewer sections -- is invisible to the
	// ResizeObserver above, because `.tabs` is overflow-x:auto and so its OWN
	// box never grows to fit its children. Re-measure explicitly whenever the
	// set of tabs changes.
	$effect(() => {
		void slugs.length;
		measureRail();
	});

	/**
	 * ROVING TABINDEX, the standard WAI-ARIA tablist keyboard pattern -- no
	 * existing tab-like control in this repo implements one (FeedbackConsole's
	 * filter tabs and the FSP presentation deck's slide tabs both stop at
	 * `role="tab"` with no keyboard handling), so this is the first and sets the
	 * convention for reuse: exactly one tab (the active one) sits in the normal
	 * Tab order at a time, and the arrow keys move both focus and the DOM
	 * "position" among the rest. Automatic activation -- moving focus selects
	 * the section immediately, matching a plain click -- since switching tabs
	 * here is cheap (everything is already in the DOM) and a reader arrowing
	 * through the strip expects to see each section as they go.
	 */
	function focusTab(slug: string) {
		tabBar?.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`)?.focus();
	}

	function goToTab(slug: string) {
		selectTab(slug);
		focusTab(slug);
	}

	function onTablistKeydown(event: KeyboardEvent) {
		if (!slugs.length) return;
		const i = slugs.indexOf(active);
		switch (event.key) {
			case 'ArrowRight':
				event.preventDefault();
				goToTab(slugs[(i + 1 + slugs.length) % slugs.length]);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				goToTab(slugs[(i - 1 + slugs.length) % slugs.length]);
				break;
			case 'Home':
				event.preventDefault();
				goToTab(slugs[0]);
				break;
			case 'End':
				event.preventDefault();
				goToTab(slugs[slugs.length - 1]);
				break;
		}
	}
</script>

<article
	class="ref-doc"
	class:tabbed
	style={railHeight ? `--rail-h:${railHeight}px` : undefined}
>
	{#if showHeader || aside}
		<header class="ref-head">
			{#if showHeader}
				<h1 class="ref-title">{spec.meta.title}</h1>
				{#if spec.meta.subtitle}<p class="ref-sub">{spec.meta.subtitle}</p>{/if}
				<p class="ref-meta">
					{#if spec.meta.course}{spec.meta.course}{/if}
					{#if spec.meta.course && spec.meta.updated}&nbsp;&middot;&nbsp;{/if}
					{#if spec.meta.updated}Updated {spec.meta.updated}{/if}
				</p>
			{/if}
			{#if aside}{@render aside()}{/if}
		</header>
	{/if}

	{#if tabbed}
		<div class="rail-anchor" bind:this={railAnchor} aria-hidden="true"></div>
		<!-- BELOW 40rem THIS IS A SELECT INSTEAD, and which one shows is decided
		     entirely by the media query at the bottom of the stylesheet -- both are
		     always in the DOM, so nothing here measures a viewport and the server
		     and the client cannot disagree about which control exists. The
		     measurement behind the breakpoint is in the picker's own comment. -->
		<label class="tab-picker">
			<span class="picker-label">Section</span>
			<select
				class="picker"
				value={active}
				onchange={(e) => selectTab((e.currentTarget as HTMLSelectElement).value)}
			>
				{#each spec.sections as section (section.slug)}
					<option value={section.slug}>{section.title}</option>
				{/each}
			</select>
		</label>
		<!-- Pinned to the top of the document and left-to-right, scrolling
		     horizontally rather than wrapping: a student has to be able to SEE
		     that more sections exist, and now to move the strip without picking
		     one.
		     BOTH BUTTONS ARE RENDERED WHENEVER THE STRIP OVERFLOWS, and the one
		     with nothing behind it is disabled and faded rather than removed --
		     dropping it out of the flow would resize the strip mid-scroll and
		     shift every tab sideways the first time the reader moved it. -->
		<div class="tab-rail" bind:this={railEl}>
			{#if scrollable}
				<button
					type="button"
					class="rail-nudge"
					class:spent={!canStart}
					disabled={!canStart}
					aria-label="Scroll sections left"
					data-nudge="prev"
					onclick={() => nudge(-1)}
				>
					<span aria-hidden="true">&lsaquo;</span>
				</button>
			{/if}
			<div
				class="tabs"
				class:dragging
				role="tablist"
				aria-label="Sections"
				bind:this={tabBar}
				onkeydown={onTablistKeydown}
				tabindex="-1"
			>
				{#each spec.sections as section (section.slug)}
					<button
						type="button"
						role="tab"
						class="tab"
						class:active={active === section.slug}
						data-slug={section.slug}
						aria-selected={active === section.slug}
						aria-controls={`ref-${section.slug}`}
						tabindex={active === section.slug ? 0 : -1}
						onclick={() => selectTab(section.slug)}
					>
						{section.title}
					</button>
				{/each}
			</div>
			{#if scrollable}
				<button
					type="button"
					class="rail-nudge"
					class:spent={!canEnd}
					disabled={!canEnd}
					aria-label="Scroll sections right"
					data-nudge="next"
					onclick={() => nudge(1)}
				>
					<span aria-hidden="true">&rsaquo;</span>
				</button>
			{/if}
		</div>
	{/if}

	<div class="ref-body">
		{#each spec.sections as section (section.slug)}
			<section
				id={`ref-${section.slug}`}
				class="ref-section"
				class:hidden={tabbed && active !== section.slug}
				role={tabbed ? 'tabpanel' : undefined}
				aria-label={section.title}
			>
				<div class="section-head">
					<h2 class="section-heading">{section.title}</h2>
					{#if section.blurb}<p class="section-blurb">{section.blurb}</p>{/if}
				</div>
				{#each section.blocks as block, bi (bi)}
					<ReferenceBlock {block} {fetchPreview} {attachments} {publicAttachments} />
				{/each}
			</section>
		{/each}
	</div>
</article>

<style>
	.ref-doc {
		display: block;
		/* The single prose measure, read by every block that carries body copy
		   (see ReferenceBlock). Full-column paragraphs on a desktop monitor are
		   the main reason a document like this reads as a slab; data objects opt
		   out and take the whole column.
		   MEASURED, not guessed: Rajdhani's "0" is much wider than its average
		   glyph, so 54ch renders at ~76 characters a line (64ch measured ~89).
		   Re-measure if the body face ever changes. */
		--rb-measure: 54ch;
	}
	.ref-head {
		margin-bottom: var(--space-4);
	}
	.ref-title {
		margin: 0;
		font-size: 1.6rem;
		line-height: 1.15;
	}
	.ref-sub {
		margin: var(--space-1) 0 0;
		font-size: 1rem;
		color: var(--text-2);
		max-width: var(--rb-measure);
	}
	.ref-meta {
		margin: 0.3rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--cyan);
	}
	.ref-meta:empty {
		display: none;
	}

	.rail-anchor {
		height: 0;
	}

	.tab-rail {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface-0);
		border-bottom: 1px solid var(--line-strong);
		margin: 0 0 var(--space-5);
		padding-top: 0.35rem;
		/* The two nudge buttons take their own columns beside the strip rather
		   than floating over it: a tab half under a button is a tab you cannot
		   fully see or reliably click, which is the state this whole change
		   exists to end. */
		display: flex;
		/* Aligned to the TAB ROW, not to the strip's whole box: the strip is now
		   44px of tabs plus a ~10px scrollbar band, and a stretched button
		   centres its chevron on the pair -- measured 5px below the tab labels
		   beside it. */
		align-items: flex-start;
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		overflow-x: auto;
		flex: 1 1 auto;
		min-width: 0;
		-webkit-overflow-scrolling: touch;
		/* THE SCROLLBAR IS THE MODULE'S OWN, inherited from $lib/shell/split.css
		   with nothing overridden here. It was hidden once (`scrollbar-width:
		   none` plus a zero-size ::-webkit-scrollbar) on the grounds that the
		   edge fades replaced the affordance; they did not -- a gradient cannot
		   be dragged -- and it left a strip that scrolled with no way to scroll
		   it. Thin and quiet, but present.
		   NO SCROLL SNAP, and that is a measured decision rather than a
		   simplification: with `scroll-snap-type: x proximity` any scroll
		   shorter than the gap to the next tab boundary was snapped back to
		   where it started, so small wheel deltas and short drags silently did
		   nothing. The buttons land on sensible positions on their own. */
		padding-bottom: 0;
		/* The labels are uppercase mono navigation, not prose anyone copies, and
		   a mouse drag that highlights them instead of scrolling reads as broken. */
		user-select: none;
		-webkit-user-select: none;
	}
	.tabs.dragging {
		cursor: grabbing;
	}
	/* PREV / NEXT. Quiet chrome in the rail's own register -- a mono chevron in
	   the muted text colour, the tabs' own 44px target height -- because they are
	   how you MOVE the strip, not what you pick from it; the green is spent on
	   the active tab. `.spent` is the end of the strip in that direction: the
	   button keeps its box (see the markup) and stops being an affordance. */
	.rail-nudge {
		appearance: none;
		flex: none;
		width: 2.75rem;
		/* The tabs' own target height, so the two line up and the target is the
		   full 44px in both directions. */
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-0);
		border: 1px solid transparent;
		border-radius: var(--radius-card);
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		transition: opacity 120ms ease;
	}
	.rail-nudge:hover:not(.spent) {
		color: var(--text-1);
		background: var(--surface-1);
	}
	.rail-nudge:focus-visible {
		outline: 2px solid var(--focus-ring, var(--cyan));
		outline-offset: -3px;
	}
	.rail-nudge.spent {
		opacity: 0;
		pointer-events: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.rail-nudge {
			transition: none;
		}
	}
	.tab {
		appearance: none;
		flex: none;
		position: relative;
		background: transparent;
		border: 1px solid transparent;
		border-bottom: none;
		border-radius: var(--radius-card) var(--radius-card) 0 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.6rem 0.85rem;
		min-height: 44px;
		cursor: pointer;
		white-space: nowrap;
	}
	.tab:hover {
		color: var(--text-1);
		background: var(--surface-1);
	}
	/* ACTIVE STATE: a filled tab joined to the body by a break in the rail's own
	   underline, plus a solid green cap. The old version differed only in text
	   colour, which is not findable at a glance across seven tabs. */
	.tab.active {
		color: var(--green);
		background: var(--surface-1);
		border-color: var(--line-strong);
		font-weight: 700;
	}
	.tab.active::before {
		content: '';
		position: absolute;
		left: -1px;
		right: -1px;
		top: -1px;
		height: 3px;
		background: var(--green);
		border-radius: var(--radius-card) var(--radius-card) 0 0;
	}
	/* THE ACTIVE TAB NO LONGER JOINS THE RAIL'S UNDERLINE, and it cannot: the
	   scrollbar now occupies a band between the bottom of the tabs and the
	   rail's bottom border, and a scrollbar gutter is not paintable by content,
	   so the 1px `--surface-1` cover this used to draw would sit in the middle
	   of the strip covering nothing. The filled surface and the green cap above
	   are what mark the active tab; they were always the findable part. */
	.tabs.dragging .tab {
		cursor: grabbing;
	}
	.tab:focus-visible {
		outline: 2px solid var(--focus-ring, var(--cyan));
		outline-offset: -3px;
	}

	.ref-body {
		display: block;
	}
	/* Enough room under a SHORT section for the rail to stay pinned. Without it
	   the browser clamps the scroll when a tall section is replaced by a short
	   one, which drags the rail back down the screen -- the exact reflow
	   holdRail() exists to prevent. Rail + body >= one viewport is the whole
	   condition, so the rail's MEASURED height is what is subtracted; the
	   fallback deliberately under-subtracts, which errs toward too much room
	   rather than too little. */
	.ref-doc.tabbed .ref-body {
		min-height: calc(100vh - var(--rail-h, 3rem));
	}
	.ref-section {
		/* The offset the sticky rail would otherwise hide the heading behind
		   when a deep link scrolls a section to the top. */
		scroll-margin-top: 4.2rem;
		display: flex;
		flex-direction: column;
		/* SPACING TIER 1 (widest): between whole blocks. */
		gap: var(--space-5);
	}
	.ref-section.hidden {
		display: none;
	}
	.ref-doc:not(.tabbed) .ref-section + .ref-section {
		margin-top: var(--space-6);
		padding-top: var(--space-5);
		border-top: 1px solid var(--hairline);
	}
	/* Heading and blurb are ONE group, so the block gap sits below the pair
	   rather than between them. */
	.section-head {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.section-heading {
		margin: 0;
		font-size: 1.25rem;
		line-height: 1.2;
	}
	.section-blurb {
		margin: 0;
		color: var(--text-2);
		font-size: 0.92rem;
		line-height: 1.55;
		max-width: var(--rb-measure);
	}

	/* --- The phone control -----------------------------------------------
	   BELOW 40rem THE STRIP BECOMES A LABELLED SELECT, and this is a measured
	   decision rather than a preference.

	   The prev/next buttons cost 88px of the strip -- MEASURED, both surfaces,
	   at a 375px viewport: the public /reference page's strip goes 337 -> 249px
	   and the classroom item page's (which pays for the page gutter AND the
	   card's own padding) goes 293 -> 205px. In whole tabs that is 4 -> 3 on
	   the public page and 3 -> 2 on the item page.

	   The bar: a strip has to show at least THREE whole tabs -- the one you are
	   on and a neighbour each side -- or it is a peephole rather than a strip,
	   and paging through fourteen sections two labels at a time is worse than a
	   native picker that shows all fourteen at once. The item page fails that at
	   375px, so the phone gets the select.

	   40rem, not 375px: at a 641px viewport the same item page shows 5 whole
	   tabs, so the strip appears with real room rather than at the edge of the
	   bar it just failed. This REVERSES the earlier "never collapse into a menu
	   on a phone" note -- which was written when the strip had no controls at
	   all, and a strip you cannot scroll is not a strip you can see more of.

	   The tab type rule that used to live in a 600px block went with it: the
	   strip does not render at that width any more, so it was dead. */
	.tab-picker {
		display: none;
	}

	@media (max-width: 40rem) {
		.ref-title {
			font-size: 1.35rem;
		}
		.tab-rail {
			display: none;
		}
		/* Sticky for the same reason the strip is: the reader has to be able to
		   change section from anywhere in a long document without scrolling back
		   to the top for the control. */
		.tab-picker {
			display: flex;
			align-items: center;
			gap: 0.5rem;
			position: sticky;
			top: 0;
			z-index: 5;
			background: var(--surface-0);
			border-bottom: 1px solid var(--line-strong);
			margin: 0 0 var(--space-5);
			padding: 0.45rem 0 0.5rem;
		}
		.picker-label {
			font-family: var(--font-mono);
			font-size: 0.68rem;
			letter-spacing: 0.06em;
			text-transform: uppercase;
			color: var(--text-2);
			flex: none;
		}
		.picker {
			flex: 1 1 auto;
			min-width: 0;
			min-height: 44px;
			background: var(--surface-1);
			border: 1px solid var(--line-strong);
			border-radius: var(--radius-card);
			color: var(--green);
			font-family: var(--font-mono);
			font-size: 0.78rem;
			font-weight: 700;
			padding: 0.4rem 0.5rem;
		}
		.picker:focus-visible {
			outline: 2px solid var(--focus-ring, var(--cyan));
			outline-offset: -3px;
		}
	}

	/* -------------------------------------------------------------------
	   PRINT. Not a second rendering pipeline and not a formal print standard:
	   a stylesheet so Ctrl+P on this page yields the whole document in order
	   rather than one tab. Every section expands, the tab bar and the sticky
	   chrome go, backgrounds drop out, and links show their target.
	   ------------------------------------------------------------------- */
	@media print {
		.tab-rail,
		.tab-picker,
		.rail-anchor {
			display: none;
		}
		.ref-section.hidden {
			display: flex;
		}
		/* The screen-only floor under a short section would otherwise push each
		   one onto its own sheet. */
		.ref-doc.tabbed .ref-body {
			min-height: 0;
		}
		.ref-section {
			break-inside: auto;
			page-break-inside: auto;
			margin-top: 1.2rem;
			padding-top: 0.8rem;
			border-top: 1px solid #bbb;
			gap: 0.9rem;
		}
		.ref-section:first-child {
			margin-top: 0;
			padding-top: 0;
			border-top: none;
		}
		.section-heading {
			break-after: avoid;
			page-break-after: avoid;
		}
		.ref-title,
		.section-heading,
		.section-blurb,
		.ref-sub,
		.ref-meta {
			color: #000;
		}
		/* Measure is a screen concern; a printed column is already narrow. */
		.ref-sub,
		.section-blurb {
			max-width: none;
		}
	}
</style>
