<script lang="ts">
	/**
	 * THE GALLERY: every published, non-hidden app, and one of them open.
	 *
	 * A list of things and the contents of one of them is what
	 * `IDEA_INTERFACE_STANDARDS` 1 names master-detail as the default for, and
	 * `$lib/shell/ClassSplit` is the one two-pane shell in this repo -- so this
	 * is a caller of it rather than a second split.
	 *
	 * NOTHING OPEN IS ONE PANE. `hasDetail` false renders no detail pane at all
	 * and gives the list the whole measure; that is the arrangement at every
	 * width, not a placeholder state. And the list is then RESPONSIBLE FOR USING
	 * the room -- a fixed column centred in a measure it was just handed is the
	 * same defect one level in -- so the cards lay out in `auto-fit` columns and
	 * collapse to one when the pane narrows, with no breakpoint of their own.
	 *
	 * SELECTION LIVES IN THE URL, so an app is linkable, the back button works,
	 * and a reload lands where the viewer was. The route owns the read; this owns
	 * the arrangement and the intent.
	 */
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import '$lib/shell/split.css';

	import FoundryDetail from './FoundryDetail.svelte';
	import { foundryAuthorClass, foundryAuthorName } from './surface.ts';
	import type {
		FoundryApp,
		FoundryAppSummary,
		FoundryGalleryTransports
	} from './transports.ts';

	let {
		apps,
		selected = null,
		transports = {},
		coverUrl = (path: string) => path,
		onSelect,
		/**
		 * PASSED THROUGH TO `FoundryDetail` ONLY WHEN A CALLER SUPPLIES ONE.
		 * `FoundryDetail` reads the environment itself by default, which is what
		 * the real route wants; a harness has no environment to read, so this is
		 * how it drives the frame and the share link without one. Undefined
		 * means "use your own default" rather than "no origin", which is why it
		 * is spread rather than always bound.
		 */
		appsOrigin = undefined
	}: {
		apps: FoundryAppSummary[];
		selected?: FoundryApp | null;
		transports?: FoundryGalleryTransports;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string;
		onSelect: (slug: string | null) => void;
		appsOrigin?: string | undefined;
	} = $props();
</script>

<ClassSplit hasDetail={selected !== null} narrow="swap" scroll="page" detailWidth="roomy">
	{#snippet nav()}
		<div class="fdy-gal-pane">
			<!-- The shell's tabs are the way to My apps now; the header button
			     that stood in for navigation is gone rather than duplicated. -->
			<header class="fdy-gal-head">
				<h2>Published apps</h2>
				<!--
					PERMANENT, not only in the empty state below. The shell carries a
					Build contract tab of its own, but this is a second way in, right
					beside the list -- reachable whether the gallery is empty or full
					of apps, which the old link (inside the empty-state branch only)
					was not.
				-->
				<a class="fdy-gal-contract tap-44" href="/foundry/contract">Build contract</a>
			</header>

			{#if apps.length === 0}
				<div class="fdy-gal-empty">
					<p>Nothing has been published yet.</p>
					<p class="fdy-gal-hint">
						Build a self-contained web app and upload it. The
						<a href="/foundry/contract">build contract</a> says exactly what it has to look like.
					</p>
					<a class="btn tap-44" href="/foundry/submit">Publish something</a>
				</div>
			{:else}
				<ul class="fdy-gal-grid" data-testid="foundry-gallery-grid">
					{#each apps as app (app.id)}
						{@const author = foundryAuthorName(app)}
						{@const cls = foundryAuthorClass(app)}
						<li>
							<!--
								A LINK, not a button with a click handler. It carries a real
								href so the row can be middle-clicked, copied and opened in a
								tab; `onSelect` is what keeps the navigation client-side.
							-->
							<a
								class="fdy-card"
								class:selected={selected?.slug === app.slug}
								href="/foundry?app={app.slug}"
								data-app-slug={app.slug}
								onclick={(e) => {
									if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
									e.preventDefault();
									onSelect(app.slug);
								}}
							>
								<span class="fdy-card-cover">
									{#if app.cover_path}
										<img src={coverUrl(app.cover_path)} alt="" loading="lazy" />
									{:else}
										<!-- No cover is a normal state. A tile with the app's own
										     initial, never a stock "no image" graphic. -->
										<span class="fdy-card-blank" aria-hidden="true">
											{app.title.trim().slice(0, 1).toUpperCase()}
										</span>
									{/if}
								</span>
								<span class="fdy-card-body">
									<span class="fdy-card-title">{app.title}</span>
									{#if app.tagline}
										<span class="fdy-card-tagline">{app.tagline}</span>
									{/if}
									<!--
										The author line, each half conditional on its own. A null
										class renders NOTHING -- not an empty span, not a
										separator, not a label.
									-->
									{#if author || cls}
										<span class="fdy-card-by">
											{#if author}<span class="fdy-card-author">{author}</span>{/if}
											{#if cls}<span class="fdy-card-class">{cls}</span>{/if}
										</span>
									{/if}
								</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/snippet}

	{#if selected}
		<!--
			`{#key}` ON THE SLUG. Without it, moving between apps hands the previous
			app's stage a new set of ids and keeps its state -- which here would
			mean a running bundle surviving into the next app's page.
		-->
		{#key selected.slug}
			<div class="fdy-gal-detail">
				<FoundryDetail
					app={selected}
					{transports}
					{coverUrl}
					{...(appsOrigin === undefined ? {} : { appsOrigin })}
				/>
			</div>
		{/key}
	{/if}
</ClassSplit>

<style>
	.fdy-gal-pane {
		display: flex;
		flex-direction: column;
		gap: var(--space-4, 1rem);
		min-width: 0;
	}

	.fdy-gal-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
	}

	.fdy-gal-head h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.25rem;
	}

	.fdy-gal-contract {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	.fdy-gal-empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-5, 1.25rem);
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-gal-empty p,
	.fdy-gal-hint {
		margin: 0;
		color: var(--text-2, var(--dim));
	}

	/*
	   `auto-fit`, NOT `auto-fill`: a gallery with two apps in it gets two
	   columns rather than two and a void. `minmax(min(20rem, 100%), 1fr)` is
	   what makes the same rule the single narrow column when the pane is
	   narrow, with no breakpoint of its own -- the `min()` stops a 20rem track
	   from forcing the grid wider than the pane on a phone.

	   20rem is measured rather than round: below it a two-line tagline in this
	   type size starts ellipsising on the second line, and above it the card
	   stops gaining anything.
	*/
	.fdy-gal-grid {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(20rem, 100%), 1fr));
		gap: var(--space-3, 0.75rem);
	}

	/*
	   THE THUMBNAIL WAS A 4.5rem SQUARE ICON, AND THAT WAS THE DEFECT. A cover
	   is a screenshot of a running app, which is landscape by construction --
	   a browser or a phone frame is always wider than it is tall -- so
	   `object-fit: contain` inside a 72px square left most covers as a thin
	   letterboxed strip a few pixels tall, which reads as broken or missing
	   rather than as a deliberately small thumbnail. The box is not the wrong
	   FIT, it was the wrong SHAPE for what actually gets uploaded.
	*/
	.fdy-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		/* 44px floor as a MINIMUM, never a height: this card is far taller, and
		   a fixed height here would clip a wrapped title. */
		min-height: 44px;
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		background: var(--surface-1, var(--bg1));
		text-decoration: none;
		color: inherit;
	}

	.fdy-card:hover,
	.fdy-card:focus-visible {
		border-color: var(--green);
	}

	.fdy-card.selected {
		border-color: var(--green);
		background: var(--surface-2, var(--bg2));
	}

	/*
	   16:9 IS THE COVER'S OWN SHAPE, MEASURED FROM WHAT ACTUALLY GETS UPLOADED
	   RATHER THAN CHOSEN AS A ROUND NUMBER: a browser window, a phone screen in
	   either orientation and a desktop app window are all wider ranges that sit
	   close to it, and none of them are square. A cover in a box shaped like
	   its own aspect ratio needs no letterboxing to speak of, so `contain`
	   stops being the thing fighting the layout.
	*/
	.fdy-card-cover {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		background: var(--surface-2, var(--bg2));
		border: 1px solid var(--hairline);
	}

	.fdy-card-cover img {
		width: 100%;
		height: 100%;
		/*
		   `scale-down`, NOT `contain`: it behaves exactly like `contain` for
		   anything at or above the box size (never crops, never hides an edge --
		   the reasoning `contain` was chosen for stands), but it refuses to
		   enlarge an image SMALLER than the box. `contain` alone stretches a
		   small upload to fill the frame, which is the "upscaled and blurry"
		   failure mode: a screenshot saved small comes back soft and pixelated
		   at this size instead of rendering at its own native sharpness with
		   plain letterboxing around it.
		*/
		object-fit: scale-down;
	}

	.fdy-card-blank {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		font-family: var(--font-title, var(--font-display));
		/* Large enough to read as a deliberate placeholder mark rather than a
		   shrunken accident -- it fills a real fraction of a 16:9 box instead of
		   the single small glyph a 72px square could hold. */
		font-size: 2.75rem;
		color: var(--text-2, var(--dim));
	}

	/* min-width: 0 so a long unbroken title cannot force the whole grid wider
	   than the pane -- an item's automatic minimum is its min-content, and an
	   ellipsis does not reduce that. */
	.fdy-card-body {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}

	.fdy-card-title {
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1, var(--white));
		overflow-wrap: anywhere;
	}

	.fdy-card-tagline {
		font-size: 0.9rem;
		color: var(--text-2, var(--dim));
		overflow-wrap: anywhere;
	}

	.fdy-card-by {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.15rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	.fdy-card-author {
		color: var(--cyan);
	}

	.fdy-card-class {
		color: var(--text-2, var(--dim));
		padding-left: 0.4rem;
		border-left: 1px solid var(--boundary);
	}

	.fdy-gal-detail {
		min-width: 0;
	}
</style>
