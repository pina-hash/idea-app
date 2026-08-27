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
	 *
	 * THE ORDER IS A VIEW CONTROL AND STAYS LOCAL, which is the one thing here
	 * that is deliberately NOT in the URL. Selection is a thing you send someone;
	 * a sort is a thing you do while looking. Putting it in the query string
	 * would put a second parameter on every link a student pastes and would make
	 * two people opening the same app disagree about what page they are on.
	 *
	 * POPULARITY IS A COUNT OVER APPS, ALWAYS. `playCounts` carries two numbers
	 * per app and nothing else -- there is no per-person figure in the payload,
	 * on this surface or in the function behind it, and there is nothing here
	 * that could be widened into one. A card says how many times a thing was
	 * played and never by whom.
	 *
	 * THE COUNTS ARE OPTIONAL AND DEFAULT TO NOTHING. A mounting without them (a
	 * harness, or a load that degraded) still orders -- every app ties at zero
	 * and the stable sort leaves the list exactly as Recent shows it -- rather
	 * than throwing or hiding the control.
	 */
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import '$lib/shell/split.css';

	import FoundryDetail from './FoundryDetail.svelte';
	import { foundryAuthorClass, foundryAuthorName } from './surface.ts';
	import {
		FOUNDRY_GALLERY_SORTS,
		playCountLabel,
		sortGallery,
		type FoundryGallerySort,
		type FoundryPlayCounts
	} from './telemetry.ts';
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
		appsOrigin = undefined,
		/**
		 * Plays per app, from `foundry_play_counts`. Keyed by app id, two numbers
		 * each, and there is no third field it could grow that would still be a
		 * count over an app.
		 */
		playCounts = {}
	}: {
		apps: FoundryAppSummary[];
		selected?: FoundryApp | null;
		transports?: FoundryGalleryTransports;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string;
		onSelect: (slug: string | null) => void;
		appsOrigin?: string | undefined;
		playCounts?: FoundryPlayCounts;
	} = $props();

	/**
	 * `recent` IS THE DEFAULT AND IS WHAT THE ROUTE ALREADY RETURNS. Opening the
	 * gallery on a popularity ranking would put the same handful of apps at the
	 * top of the page every day of the year, which is a decision about whose
	 * work gets seen and not a default.
	 */
	let sort = $state<FoundryGallerySort>('recent');

	/** Pure, stable, and it never mutates the list the route handed in. */
	const ordered = $derived(sortGallery(apps, playCounts, sort));
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

			{#if apps.length > 1}
				<!--
					REAL BUTTONS WITH WORDS ON THEM, in a labelled group, with
					`aria-pressed` saying which one is on. Not a <select>: three options
					that change what is already on screen is a segmented control, and a
					select hides two of the three behind a press.

					IT RENDERS WHENEVER THERE IS MORE THAN ONE APP TO ORDER, including
					before anything has been played. Every app ties at zero then and the
					order is unchanged, which is the honest answer -- hiding the control
					until somebody plays something would make it appear one day with no
					explanation.
				-->
				<div class="fdy-gal-sort" role="group" aria-label="Order the gallery">
					{#each FOUNDRY_GALLERY_SORTS as option (option.id)}
						<button
							type="button"
							class="btn fdy-gal-sort-btn tap-44"
							aria-pressed={sort === option.id}
							data-sort={option.id}
							onclick={() => (sort = option.id)}
						>
							{option.label}
						</button>
					{/each}
				</div>
			{/if}

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
					{#each ordered as app (app.id)}
						{@const author = foundryAuthorName(app)}
						{@const cls = foundryAuthorClass(app)}
						{@const plays = playCountLabel(
							sort === 'played7d'
								? (playCounts[app.id]?.plays7d ?? 0)
								: (playCounts[app.id]?.plays ?? 0)
						)}
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
									{#if author || cls || plays}
										<span class="fdy-card-by">
											{#if author}<span class="fdy-card-author">{author}</span>{/if}
											{#if cls}<span class="fdy-card-class">{cls}</span>{/if}
											<!--
												NOTHING AT ALL FOR ZERO. "0 plays" on every card of a
												gallery nobody has opened yet is noise on every card,
												and it reads as a verdict on the work rather than as
												the absence of a measurement. The count follows
												whichever window is being sorted on, so the number a
												card shows is the number it was ordered by -- a card
												ranked by this week showing its all-time total would
												be a ranking the reader cannot check.
											-->
											{#if plays}
												<span class="fdy-card-plays" data-testid="fdy-card-plays">
													{plays}{sort === 'played7d' ? ' this week' : ''}
												</span>
											{/if}
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

	/*
	   The three controls sit on one wrapping row. `flex-wrap` rather than a
	   breakpoint: at 375 the three labels do not fit one line and wrap to two,
	   which is the correct arrangement and needs no rule of its own.
	*/
	.fdy-gal-sort {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	/*
	   QUIET UNTIL CHOSEN, AND THAT IS NOT A PREFERENCE -- IT IS WHAT MAKES THE
	   ACTIVE ONE VISIBLE AT ALL.

	   `.btn` in the global sheet is ALREADY `color: var(--green)` on a green
	   border, so an active rule that set those two was a no-op: measured on the
	   harness at both widths, the pressed control and the two beside it came
	   back at the same 8.28:1 and the same rgb(120, 184, 112). The state was
	   carried by `aria-pressed` alone, which is invisible to somebody looking at
	   the screen. So the inactive members give the accent up -- `--text-2` for
	   the label (the token measured for secondary copy on all three portal
	   grounds) and `--boundary` for the edge, which is the load-bearing token a
	   control's own outline takes.
	*/
	.fdy-gal-sort-btn {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
		border-color: var(--boundary);
	}

	/*
	   THE ACCENT AND A RAISED GROUND, which is the room's own selected idiom
	   (`.fdy-card.selected`, two rules down). Colour is never the only signal:
	   the ground moves with the hue, the label is a word rather than a glyph,
	   and `aria-pressed` carries the same fact to a reader looking at none of
	   them. `--green` is correct here rather than decorative -- the register
	   gives it active navigation, and this is which view is in force.
	*/
	.fdy-gal-sort-btn[aria-pressed='true'] {
		color: var(--green);
		border-color: var(--green);
		background: var(--surface-2, var(--bg2));
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

	/*
	   Metadata, so `--text-2` for the weight -- the token measured for secondary
	   copy on all three portal grounds. NOT `--green`: a play count is a fact
	   about an app, not a success state, and the primary accent is reserved for
	   actions, active navigation and completion.
	*/
	.fdy-card-plays {
		color: var(--text-2, var(--dim));
		padding-left: 0.4rem;
		border-left: 1px solid var(--boundary);
	}

	.fdy-gal-detail {
		min-width: 0;
	}
</style>
