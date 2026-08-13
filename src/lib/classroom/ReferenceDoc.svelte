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
	 */
	let {
		spec,
		fetchPreview = null,
		/** False where the host page's own hero already carries the title (the
		 *  classroom item page), so it is not printed twice. */
		showHeader = true,
		/** Extra chrome the host wants under the title (attachments, a back link). */
		aside = null
	}: {
		spec: ReferenceSpec;
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		showHeader?: boolean;
		aside?: import('svelte').Snippet | null;
	} = $props();

	const tabbed = $derived((spec.navigation ?? 'tabs') === 'tabs');
	const slugs = $derived(spec.sections.map((s) => s.slug));

	let active = $state(spec.sections[0]?.slug ?? '');
	let tabBar = $state<HTMLDivElement | null>(null);
	let scrollable = $state(false);

	function sectionEl(slug: string): HTMLElement | null {
		if (typeof document === 'undefined') return null;
		return document.getElementById(`ref-${slug}`);
	}

	/**
	 * Bring a section into view once it is actually displayed.
	 *
	 * SCHEDULED ON rAF-OR-TIMEOUT, never rAF alone (the DrawingViewer rule): a
	 * backgrounded or throttled window never ticks requestAnimationFrame, so a
	 * deep link opened in a tab that is not in front would land on the right tab
	 * and then silently never scroll to it. Found in the browser -- the harness
	 * pane runs hidden, and the rAF-only version simply did nothing there.
	 */
	function reveal(slug: string, smooth: boolean) {
		if (typeof window === 'undefined') return;
		// The section may have been display:none a tick ago (tabs mode), so wait
		// for the layout that follows the state change before measuring it.
		let done = false;
		const run = () => {
			if (done) return;
			done = true;
			const el = sectionEl(slug);
			if (!el) return;
			el.scrollIntoView({
				behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches
					? 'smooth'
					: 'instant',
				block: 'start'
			});
		};
		requestAnimationFrame(run);
		setTimeout(run, 32);
	}

	function applyHash(smooth: boolean) {
		const slug = slugFromHash(typeof window === 'undefined' ? null : window.location.hash);
		if (!slug || !slugs.includes(slug)) return;
		active = slug;
		reveal(slug, smooth);
	}

	function selectTab(slug: string) {
		active = slug;
		if (typeof window !== 'undefined') {
			// replaceState, not a hash assignment: the browser's own hash jump would
			// fight the reveal below, and a tab click is not a navigation anyone
			// wants stacked in their back button.
			history.replaceState(history.state, '', `#${slug}`);
		}
		reveal(slug, false);
	}

	$effect(() => {
		if (typeof window === 'undefined') return;
		// The COLD-LOAD half of the deep-link contract.
		applyHash(false);
		const onHash = () => applyHash(true);
		window.addEventListener('hashchange', onHash);
		return () => window.removeEventListener('hashchange', onHash);
	});

	/** Keep the active tab visible in a horizontally scrolled bar. */
	$effect(() => {
		const bar = tabBar;
		const slug = active;
		if (!bar) return;
		const el = bar.querySelector<HTMLElement>(`[data-slug="${CSS.escape(slug)}"]`);
		el?.scrollIntoView({ behavior: 'instant', inline: 'nearest', block: 'nearest' });
	});

	/** Does the bar actually overflow? Drives the "more tabs that way" fade. */
	$effect(() => {
		const bar = tabBar;
		if (!bar || typeof ResizeObserver === 'undefined') return;
		const measure = () => {
			scrollable = bar.scrollWidth > bar.clientWidth + 2;
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(bar);
		bar.addEventListener('scroll', measure, { passive: true });
		return () => {
			ro.disconnect();
			bar.removeEventListener('scroll', measure);
		};
	});
</script>

<article class="ref-doc" class:tabbed>
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
		<!-- Pinned to the top of the document and left-to-right, scrolling
		     horizontally on a phone rather than wrapping or collapsing into a
		     menu: a student has to be able to SEE that more tabs exist. -->
		<div class="tab-rail" class:scrollable>
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
				<h2 class="section-heading">{section.title}</h2>
				{#if section.blurb}<p class="section-blurb">{section.blurb}</p>{/if}
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
	}
	.ref-head {
		margin-bottom: 0.8rem;
	}
	.ref-title {
		margin: 0;
		font-size: 1.6rem;
		line-height: 1.15;
	}
	.ref-sub {
		margin: 0.25rem 0 0;
		font-size: 1rem;
		color: var(--dim);
	}
	.ref-meta {
		margin: 0.3rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--cyan);
	}
	.ref-meta:empty {
		display: none;
	}

	.tab-rail {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--bg0);
		border-bottom: 1px solid var(--line);
		margin: 0 0 0.9rem;
		/* Break out of the page gutter so the rail spans edge to edge on a
		   phone, which is what makes the scroll obviously a scroll. */
		padding-top: 0.35rem;
	}
	.tabs {
		display: flex;
		gap: 0.25rem;
		overflow-x: auto;
		scrollbar-width: thin;
		-webkit-overflow-scrolling: touch;
		scroll-snap-type: x proximity;
		padding-bottom: 0.3rem;
	}
	.tab-rail.scrollable::after {
		content: '';
		position: absolute;
		right: 0;
		top: 0.35rem;
		bottom: 0.3rem;
		width: 2.2rem;
		pointer-events: none;
		background: linear-gradient(to right, transparent, var(--bg0) 78%);
	}
	.tab {
		appearance: none;
		flex: none;
		scroll-snap-align: start;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-bottom-color: transparent;
		border-radius: 6px 6px 0 0;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.55rem 0.8rem;
		min-height: 44px;
		cursor: pointer;
		white-space: nowrap;
	}
	.tab:hover {
		color: var(--white);
		border-color: var(--line-strong);
		border-bottom-color: transparent;
	}
	.tab.active {
		color: var(--green);
		border-color: var(--line-strong);
		border-bottom-color: transparent;
		background: var(--bg1);
	}
	.tab:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: -2px;
	}

	.ref-section {
		/* The offset the sticky rail would otherwise hide the heading behind
		   when a deep link scrolls a section to the top. */
		scroll-margin-top: 4.2rem;
	}
	.ref-section.hidden {
		display: none;
	}
	.ref-doc:not(.tabbed) .ref-section + .ref-section {
		margin-top: 1.6rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--line);
	}
	.section-heading {
		margin: 0 0 0.5rem;
		font-size: 1.2rem;
	}
	.section-blurb {
		margin: 0 0 0.9rem;
		color: var(--dim);
		font-size: 0.9rem;
		line-height: 1.5;
	}

	/* -------------------------------------------------------------------
	   PRINT. Not a second rendering pipeline and not a formal print standard:
	   a stylesheet so Ctrl+P on this page yields the whole document in order
	   rather than one tab. Every section expands, the tab bar and the sticky
	   chrome go, backgrounds drop out, and links show their target.
	   ------------------------------------------------------------------- */
	@media print {
		.tab-rail {
			display: none;
		}
		.ref-section.hidden {
			display: block;
		}
		.ref-section {
			break-inside: auto;
			page-break-inside: auto;
			margin-top: 1.2rem;
			padding-top: 0.8rem;
			border-top: 1px solid #bbb;
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
	}
</style>
