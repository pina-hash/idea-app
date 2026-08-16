<script lang="ts">
	import ReferenceBlock from '$lib/classroom/ReferenceBlock.svelte';
	import type { LinkPreview } from '$lib/classroom/classroom';
	import { slugFromHash, type ReferenceSpec } from '$lib/classroom/reference-spec';

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
		aside = null
	}: {
		spec: ReferenceSpec;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		showHeader?: boolean;
		preview?: boolean;
		aside?: import('svelte').Snippet | null;
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
	/** Fades, one per edge, each shown only when there is actually something that
	 *  way: left once the strip is scrolled off its start, right until it reaches
	 *  the end. Both derive from the same scroll measurement below. */
	let fadeStart = $state(false);
	let fadeEnd = $state(false);

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
	 * Keep the active tab visible in a horizontally scrolled bar. Scrolls the BAR
	 * by hand rather than calling scrollIntoView on the button, which scrolls
	 * every scrollable ancestor including the window.
	 */
	$effect(() => {
		const bar = tabBar;
		const slug = active;
		if (!bar) return;
		const el = bar.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
		if (!el) return;
		const b = bar.getBoundingClientRect();
		const e = el.getBoundingClientRect();
		if (e.left < b.left) bar.scrollLeft += e.left - b.left - 8;
		else if (e.right > b.right) bar.scrollLeft += e.right - b.right + 8;
	});

	/**
	 * Does the bar actually overflow, and which way is there more of it? Drives
	 * both "more tabs that way" fades. Also measures the rail, which
	 * .ref-body's min-height needs exactly.
	 *
	 * The 2px slack on the overflow test absorbs sub-pixel layout; the 1px slack
	 * on each edge test does the same for a fractional scrollLeft, which is what
	 * a trackpad and the active-tab scroll above both produce.
	 */
	$effect(() => {
		const bar = tabBar;
		const rail = railEl;
		if (!bar || !rail || typeof ResizeObserver === 'undefined') return;
		const measure = () => {
			const overflow = bar.scrollWidth - bar.clientWidth;
			scrollable = overflow > 2;
			fadeStart = scrollable && bar.scrollLeft > 1;
			fadeEnd = scrollable && bar.scrollLeft < overflow - 1;
			railHeight = rail.offsetHeight;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(bar);
		ro.observe(rail);
		bar.addEventListener('scroll', measure, { passive: true });
		return () => {
			ro.disconnect();
			bar.removeEventListener('scroll', measure);
		};
	});
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
		<!-- Pinned to the top of the document and left-to-right, scrolling
		     horizontally on a phone rather than wrapping or collapsing into a
		     menu: a student has to be able to SEE that more tabs exist. -->
		<div class="tab-rail" class:fade-start={fadeStart} class:fade-end={fadeEnd} bind:this={railEl}>
			<div class="tabs" role="tablist" aria-label="Sections" bind:this={tabBar}>
				{#each spec.sections as section (section.slug)}
					<button
						type="button"
						role="tab"
						class="tab"
						class:active={active === section.slug}
						data-slug={section.slug}
						aria-selected={active === section.slug}
						aria-controls={`ref-${section.slug}`}
						onclick={() => selectTab(section.slug)}
					>
						{section.title}
					</button>
				{/each}
			</div>
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
					<ReferenceBlock {block} {fetchPreview} />
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
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		overflow-x: auto;
		/* The bar still scrolls -- by drag, wheel, touch, and by the effect above
		   when the active tab is off-screen -- but its scrollbar is hidden. On
		   Windows it renders as a permanent full-width trough under the rail,
		   which is louder than the tabs it sits beneath; the edge fades
		   (.tab-rail.fade-start / .fade-end) are what say there are more tabs. */
		scrollbar-width: none;
		-ms-overflow-style: none;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x proximity;
		padding-bottom: 0;
	}
	.tabs::-webkit-scrollbar {
		display: none;
	}
	/* One fade per edge, each gated on its own end actually having more tabs
	   behind it -- so scrolling to the end drops the right fade instead of
	   pointing at nothing, and the left one only appears once there is something
	   back that way. */
	.tab-rail.fade-start::before,
	.tab-rail.fade-end::after {
		content: '';
		position: absolute;
		top: 0.35rem;
		bottom: 1px;
		width: 2.2rem;
		pointer-events: none;
	}
	.tab-rail.fade-start::before {
		left: 0;
		background: linear-gradient(to left, transparent, var(--surface-0) 78%);
	}
	.tab-rail.fade-end::after {
		right: 0;
		background: linear-gradient(to right, transparent, var(--surface-0) 78%);
	}
	.tab {
		appearance: none;
		flex: none;
		scroll-snap-align: start;
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
	/* Cover the rail's underline under the active tab so it reads as one
	   surface with the section below it. */
	.tab.active::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 1px;
		background: var(--surface-1);
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

	@media (max-width: 600px) {
		.ref-title {
			font-size: 1.35rem;
		}
		.tab {
			font-size: 0.68rem;
			padding: 0.6rem 0.7rem;
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
