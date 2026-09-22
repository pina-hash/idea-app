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

	import FoundryCard from './FoundryCard.svelte';
	import FoundryDetail from './FoundryDetail.svelte';
	import FoundryPlayStats from './FoundryPlayStats.svelte';
	import { foundryMosaicColumns } from './mosaic.ts';
	import { foundrySearch, foundrySearchEmptyNote } from './search.ts';
	import {
		FOUNDRY_GALLERY_DEFAULT_SORT,
		FOUNDRY_GALLERY_SORTS,
		FOUNDRY_PLAY_COVERAGE_NOTE,
		foundryBoards,
		playCountLabel,
		sortGallery,
		type FoundryGallerySort,
		type FoundryPlayCounts
	} from './telemetry.ts';
	import type {
		FoundryApp,
		FoundryAppSummary,
		FoundryGalleryTransports,
		FoundryMyPlayStatsTransport,
		FoundryPlayStatsTransport
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
		playCounts = {},
		/**
		 * THE STAFF ROUTE FOR THE APP THAT IS OPEN, OR NOTHING.
		 *
		 * WHAT IT CLOSES. Every admin control in this feature -- approve, reject,
		 * edit metadata, replace the cover, clear the metadata flag, hide,
		 * restore, delete, read the file tree, download, read play stats -- lives
		 * in `FoundryInspector`, and the only surface that mounts one is
		 * /foundry/review. That route's lists are built from SUBMITTED versions
		 * and from HIDDEN apps, so an app that is published, not hidden and has
		 * nothing pending is on neither of them -- while the route's own load
		 * will serve exactly that app the moment its slug is in the URL. So the
		 * controls all worked and the only way to reach them was to know the slug
		 * and type it.
		 *
		 * IT IS A STRING THE CALLER BUILDS, AND ABSENCE IS THE MECHANISM. This
		 * component holds no idea of who is admin and no idea of the review
		 * route's URL shape: a caller that has both hands one over, and a caller
		 * that has neither hands nothing and there is no control. That is the
		 * same arrangement every optional transport here has, and it means a
		 * student's page cannot render this by getting a boolean wrong.
		 *
		 * IT IS NOT A GATE. /foundry/review answers 404 to a non-admin and
		 * `is_admin()` inside the RPCs is the boundary; this only decides whether
		 * somebody is offered a door they can already open.
		 *
		 * AND IT IS RENDERED IN THIS COMPONENT'S OWN WRAPPER, NEVER INSIDE
		 * `FoundryDetail`. That component has no staff branch and must not gain
		 * one: the review queue mounts the IDENTICAL file, which is what makes
		 * "what does a student see" answerable by reading it straight through.
		 */
		staffHref = null,
		/**
		 * THE APP'S PUBLIC TOTALS, FOR THE APP THAT IS OPEN.
		 * `foundry_app_play_stats`, which since 0204 (decision 07, answered
		 * public) answers any signed-in caller who can see the app rather than
		 * the author and an admin alone.
		 *
		 * WHY IT ARRIVES AS ITS OWN PROP AND NOT INSIDE `transports`. The
		 * gallery's transport object is the PLAY RECORDER -- two calls `AppStage`
		 * makes while a bundle runs -- and it is handed straight down to
		 * `FoundryDetail`. These two reads belong to the pane and not to the
		 * stage, and the stage must not be able to see them.
		 *
		 * ABSENCE IS THE MECHANISM, as everywhere here: no transport, no figures
		 * and no empty panel. A harness or a degraded load renders the app page
		 * exactly as it did before these existed.
		 */
		playStats = undefined,
		/**
		 * THE VIEWER'S OWN TIME WITH THE APP THAT IS OPEN.
		 * `foundry_my_play_stats`, which takes no identity parameter, so there is
		 * no argument here or in the function behind it through which another
		 * student could be named.
		 */
		myPlayStats = undefined
	}: {
		apps: FoundryAppSummary[];
		selected?: FoundryApp | null;
		transports?: FoundryGalleryTransports;
		/** Turns a stored cover path into a URL. Injected, never built here. */
		coverUrl?: (path: string) => string | null;
		onSelect: (slug: string | null) => void;
		appsOrigin?: string | undefined;
		playCounts?: FoundryPlayCounts;
		staffHref?: string | null;
		playStats?: FoundryPlayStatsTransport | undefined;
		myPlayStats?: FoundryMyPlayStatsTransport | undefined;
	} = $props();

	/**
	 * THE ORDER THE GALLERY OPENS ON, READ FROM `telemetry.ts` RATHER THAN
	 * WRITTEN HERE.
	 *
	 * THIS LINE SAID `'recent'` AND THE COMMENT ABOVE IT ARGUED FOR IT: "opening
	 * the gallery on a popularity ranking would put the same handful of apps at
	 * the top of the page every day of the year, which is a decision about whose
	 * work gets seen and not a default." Every word of that is a reason it was
	 * HIS decision and not ours. Decision 04 was answered MOST PLAYED FIRST on
	 * 2026-09-12; ledger 0173 recorded the answer, and this line went on
	 * initialising to `'recent'` afterwards because nothing connected the two.
	 * Mr. Pina found it by opening the gallery.
	 *
	 * SO THE VALUE IS AN IMPORT. A decision recorded in a document and a literal
	 * typed into a component are two statements of one thing, and this is the
	 * pair that demonstrably stopped matching. `FOUNDRY_GALLERY_DEFAULT_SORT`
	 * carries the reasoning and a test asserts the component takes it rather
	 * than asserting the string, so changing the answer is one edit in one file.
	 *
	 * IT IS STILL A VIEW CONTROL AND STILL NOT IN THE URL. The default moved;
	 * where the choice is stored did not, and decision 04 says so in as many
	 * words -- reversing that rule would be its own decision.
	 */
	let sort = $state<FoundryGallerySort>(FOUNDRY_GALLERY_DEFAULT_SORT);

	/**
	 * THE SEARCH BOX, REPORT 32b. Local state, deliberately not in the URL, for
	 * exactly the reason decision 04 gives about the sort: a query is a thing
	 * you do while looking, and putting it in the query string would put a
	 * second parameter on every link a student pastes. SELECTION is still in
	 * the URL, so an app found by searching is still linkable by opening it.
	 *
	 * IT FILTERS AND DOES NOT FETCH. `foundrySearch` runs over the list the
	 * route already loaded, which today is every app in this caller's
	 * population, so there is no round trip, no debounce to get wrong and no
	 * pending state to render. `search.ts` states what makes that true and what
	 * would end it.
	 */
	let query = $state('');

	/**
	 * SEARCHING REPLACES THE BOARDS RATHER THAN SITTING UNDER THEM. A person
	 * who has typed something is looking for one app; four ranked sections
	 * above their results are four things in the way of it.
	 */
	const searching = $derived(query.trim().length > 0);

	/** Pure, stable, and it never mutates the list the route handed in. */
	const ordered = $derived(
		searching ? foundrySearch(apps, query) : sortGallery(apps, playCounts, sort)
	);

	/**
	 * THE RANKED SECTIONS, REPORTS 30 AND 32b, LIVE ON OPEN.
	 *
	 * `foundryBoards` decides which of them have anything to say -- see its own
	 * header for the flatness rule and the size floor -- so this is a render of
	 * whatever it returns and never a list of headings with empty rows under
	 * them. A gallery too small to rank, or one where nothing has been played,
	 * gets no boards and the list below is the whole page, which is the honest
	 * arrangement rather than a degraded one.
	 */
	const boards = $derived(searching ? [] : foundryBoards(apps, playCounts));

	/**
	 * THE COLUMN CEILING, CAPPED AT THE NUMBER OF CARDS.
	 *
	 * `CLAUDE.md`'s multicol rule: multicol has no `auto-fit`, so it cuts every
	 * column the width holds and leaves the spare ones EMPTY -- three apps in a
	 * five-column container is three narrow columns and two columns of void.
	 * The arithmetic is `mosaic.ts`'s and is asserted there without a browser.
	 *
	 * IT RIDES AN INLINE CUSTOM PROPERTY, which this repo is otherwise wary of
	 * (an inline property beats every class rule, which is what made the
	 * launcher's shared accent dead code). The distinction is that this is DATA
	 * -- how many apps there are, knowable only at render -- and not paint:
	 * nothing in a stylesheet could ever have set it, so nothing in a stylesheet
	 * is being overridden.
	 */
	const mosaicColumns = $derived(foundryMosaicColumns(ordered.length, 5));
</script>

<ClassSplit hasDetail={selected !== null} narrow="swap" scroll="fill" detailWidth="roomy">
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

			<!--
				THE SEARCH BOX, REPORT 32b. A real `<label>` with a real word in
				it rather than a placeholder: a placeholder disappears the moment
				anybody types, which is exactly when a reader who lost their place
				needs to know what the box is. `type="search"` so a phone offers
				the right keyboard and the browser its own clear control.

				IT RENDERS WHENEVER THERE IS MORE THAN ONE APP, on the same test
				the sort control uses, because searching a gallery of one is a
				control whose only possible outcome is the page you are on.
			-->
			{#if apps.length > 1}
				<div class="fdy-gal-find">
					<label class="fdy-gal-find-label" for="fdy-gal-q">Search apps</label>
					<input
						id="fdy-gal-q"
						class="fdy-gal-find-input tap-44"
						type="search"
						autocomplete="off"
						data-testid="foundry-gallery-search"
						bind:value={query}
					/>
					{#if searching}
						<!--
							THE COUNT IS A LIVE REGION, because the thing that changed
							when somebody typed is further down the page and off screen
							on a phone. `polite`, so it waits for a pause in typing
							rather than interrupting every keystroke.
						-->
						<p class="fdy-gal-find-count" role="status" data-testid="foundry-search-count">
							{ordered.length === 1 ? '1 app' : `${ordered.length} apps`} for "{query.trim()}"
						</p>
					{/if}
				</div>
			{/if}

			<!--
				THE RANKED SECTIONS, VISIBLE AND LIVE ON OPEN (report 32b), which
				is the whole of what makes them different from the sort control
				below: three or four orders at once rather than one at a time.

				EVERY BOARD IS `sortGallery`'s OWN RANKING. There is no second
				comparator here and no second idea of what "most played" means --
				a board is an order, a heading, five rows and the figure that
				order ranks on. `telemetry.ts` holds all of it.

				THE COVERAGE NOTE IS RENDERED ONCE FOR THE WHOLE REGION rather
				than under each board. `CLAUDE.md` requires it beside every play
				figure and decision 04 records that the ranked LIST carries none
				today; four copies of one sentence in one screen is noise that
				gets skipped, and one sentence introducing four ranked sections
				is read. It qualifies every number in the region it heads.
			-->
			{#if boards.length > 0}
				<section class="fdy-gal-boards" data-testid="foundry-gallery-boards">
					<p class="fdy-gal-boards-note">{FOUNDRY_PLAY_COVERAGE_NOTE}</p>
					{#each boards as board (board.sort)}
						<section class="fdy-gal-board" data-board={board.sort}>
							<header class="fdy-gal-board-head">
								<h3>{board.title}</h3>
								<p class="fdy-gal-board-rule">{board.rule}</p>
							</header>
							<ul class="fdy-gal-board-row">
								{#each board.apps as app, i (app.id)}
									<li>
										<FoundryCard
											{app}
											href="/foundry?app={app.slug}"
											selected={selected?.slug === app.slug}
											{coverUrl}
											plays={board.figures[i]}
											onselect={onSelect}
										/>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</section>
			{/if}

			{#if apps.length > 1 && !searching}
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
				<!--
					THE HEADING EXISTS SO THE LIST IS NOT MISTAKEN FOR A FIFTH
					BOARD. With ranked sections above it, an unlabelled mosaic
					reads as another one of them; this says it is everything.
				-->
				{#if boards.length > 0}
					<h3 class="fdy-gal-all">All {apps.length} apps</h3>
				{/if}
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
			{:else if searching && ordered.length === 0}
				<!--
					THE SEARCH EMPTY STATE, WHICH IS NOT THE GALLERY EMPTY STATE.
					"Nothing has been published yet" would be a lie on a gallery
					full of apps, and it is the sentence a single shared empty
					branch would have produced. `foundrySearchEmptyNote` names
					what was searched and what is deliberately not in the list, so
					a student does not conclude their own unapproved app has
					vanished.
				-->
				<div class="fdy-gal-empty" data-testid="foundry-search-empty">
					<p>{foundrySearchEmptyNote(query)}</p>
					<button type="button" class="btn tap-44" onclick={() => (query = '')}>
						Clear the search
					</button>
				</div>
			{:else}
				<ul
					class="fdy-gal-mosaic"
					data-testid="foundry-gallery-grid"
					style="--fdy-cols: {mosaicColumns}"
				>
					{#each ordered as app (app.id)}
						<!--
							THE COUNT IS THE CALLER'S DECISION, NOT THE CARD'S, and it is
							made here because this is what knows which ranking is in force.
							Nothing at all under `Recent`: a number on every card of a
							gallery nobody ordered by plays is noise, and it reads as a
							verdict on the work rather than as a measurement. Under a play
							ranking it follows the window being sorted on -- a card ranked
							by this week showing its all-time total would be a ranking the
							reader cannot check, and a ranked gallery showing no numbers at
							all would be one they cannot check either.
						-->
						{@const plays = playCountLabel(
							sort === 'played7d'
								? (playCounts[app.id]?.plays7d ?? 0)
								: (playCounts[app.id]?.plays ?? 0)
						)}
						<!--
							NOTHING WHILE SEARCHING. The list is ranked by relevance
							then, not by plays, so a play count beside each card
							would be a number that does not explain the order it is
							sitting in -- the same reason `recent` prints none.
						-->
						{@const playsLabel =
							searching || sort === 'recent' || !plays
								? ''
								: `${plays}${sort === 'played7d' ? ' this week' : ''}`}
						<li>
							<FoundryCard
								{app}
								href="/foundry?app={app.slug}"
								selected={selected?.slug === app.slug}
								{coverUrl}
								plays={playsLabel}
								onselect={onSelect}
							/>
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
				{#if staffHref}
					<!--
						THE STAFF DOOR, ABOVE THE STUDENT PAGE AND OUTSIDE IT. It is in
						this wrapper rather than in `FoundryDetail` because that component
						is the ONE render path the gallery and the review queue share and
						it has no staff branch in it.

						IT SAYS WHAT IS THROUGH IT. "Review" alone reads as a decision
						waiting to be made, and this app has none: what is on the other
						side is the inspector, which for a settled published app is the
						editing, hiding and deleting controls.
					-->
					<p class="fdy-gal-staff">
						<a class="btn tap-44" href={staffHref} data-testid="foundry-gallery-staff">
							Open review controls
						</a>
					</p>
				{/if}
				<FoundryDetail
					app={selected}
					{transports}
					{coverUrl}
					{...(appsOrigin === undefined ? {} : { appsOrigin })}
				/>
				<!--
					THE PLAY FIGURES, BELOW THE STUDENT PAGE AND IN THIS WRAPPER --
					the same arrangement `staffHref` above takes, and for the same
					reason: `FoundryDetail` is the ONE render path the gallery and the
					review queue share, and a block added inside it would appear a
					second time in the review console, where `FoundryInspector` is
					already mounting this component beside it.

					BELOW "How this was built", because that is the end of what the
					student wrote and these are what happened to it afterwards. A
					reader arriving from a card wants the app, then its author's
					account of it, then the numbers.

					IT IS MOUNTED ONLY WHEN A TRANSPORT WAS HANDED OVER, and the
					component's own gate is the same test -- so this condition is
					belt to that file's braces rather than a second rule: without it
					the component would mount, read nothing and render nothing, which
					is right but puts an empty element in the page for no reason.
				-->
				{#if playStats}
					<div class="fdy-gal-plays">
						<FoundryPlayStats
							appId={selected.id}
							load={playStats}
							{...(myPlayStats === undefined ? {} : { loadMine: myPlayStats })}
						/>
					</div>
				{/if}
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

	/* A row of its own above the student page, so nothing about the app's own
	   layout moves when it is there and when it is not. */
	.fdy-gal-staff {
		margin: 0 0 var(--space-3, 0.75rem);
	}

	/* The same idea below it: a row of its own, so the app page's own spacing is
	   unchanged whether or not this deployment has the figures. The rule above it
	   separates "what the student wrote" from "what happened to it", and it is
	   DECORATION under CLAUDE.md's two-token rule -- a rule between two blocks of
	   reading matter, not the edge of a control and not the only thing dividing
	   two interactive rows -- so it is `--hairline` and is deliberately not
	   measured. `--boundary` here would be the sweep `tests/boundary-token.test.ts`
	   exists to catch. */
	.fdy-gal-plays {
		margin: var(--space-4, 1rem) 0 0;
		padding: var(--space-4, 1rem) 0 0;
		border-top: 1px solid var(--hairline);
		min-width: 0;
	}

	/* -------------------------------------------------------------------
	   THE SEARCH BOX (report 32b).
	   ------------------------------------------------------------------- */

	.fdy-gal-find {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}

	/* A VISIBLE WORD, not a placeholder. A placeholder is gone the moment
	   anybody types, which is when a reader most needs to know what the box
	   is, and it is never a label to assistive tech. */
	.fdy-gal-find-label {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	/* `--boundary` and not `--hairline`: this is the outer edge of an
	   interactive control, which is the first of the three things CLAUDE.md
	   says the load-bearing token is taken by. */
	.fdy-gal-find-input {
		flex: 1 1 12rem;
		min-width: 0;
		padding: 0 var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		font-family: var(--font-display);
		font-size: 1rem;
	}

	.fdy-gal-find-input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	/* The live count takes the whole next line so it never squeezes the input
	   below a usable width on a phone. */
	.fdy-gal-find-count {
		flex: 1 0 100%;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2, var(--dim));
	}

	/* -------------------------------------------------------------------
	   THE RANKED SECTIONS (reports 30 and 32b).
	   ------------------------------------------------------------------- */

	.fdy-gal-boards {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		min-width: 0;
	}

	/* One coverage note for the whole region. See the markup for why it is not
	   repeated per board. */
	.fdy-gal-boards-note {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		line-height: 1.5;
		color: var(--text-2, var(--dim));
	}

	.fdy-gal-board {
		min-width: 0;
	}

	.fdy-gal-board-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2, 0.5rem);
		margin: 0 0 var(--space-2, 0.5rem);
	}

	.fdy-gal-board-head h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		letter-spacing: 0.02em;
	}

	/* WHAT THE BOARD COUNTS, beside the heading rather than hidden in a title
	   attribute: a tooltip is not discoverable and a phone cannot hover. */
	.fdy-gal-board-rule {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, var(--dim));
	}

	/*
	   A BOARD IS A ROW THAT SCROLLS SIDEWAYS, NOT A GRID AND NOT THE MOSAIC.
	   Five cards stacked vertically at 375px is five screens of one section
	   before the next heading, which is the opposite of "all of them visible
	   upon opening"; a horizontal row keeps each section one glance tall at
	   every width and lets the ranking be read left to right, which is the
	   direction a ranking is read in.

	   IT KEEPS ITS SCROLLBAR. No region on this site may hide one (CLAUDE.md),
	   and here it is the only thing saying there is more of the ranking than
	   fits.

	   `scroll-snap` ON THE CHILDREN so a swipe lands on a card rather than
	   halfway through one. `proximity` and not `mandatory`: mandatory fights a
	   deliberate small scroll and traps a keyboard user mid-row.
	*/
	.fdy-gal-board-row {
		display: flex;
		gap: var(--space-3, 0.75rem);
		margin: 0;
		padding: 0 0 var(--space-2, 0.5rem);
		list-style: none;
		overflow-x: auto;
		scroll-snap-type: x proximity;
		overscroll-behavior-x: contain;
	}

	.fdy-gal-board-row > li {
		flex: 0 0 min(16rem, 78%);
		min-width: 0;
		scroll-snap-align: start;
	}

	/* The full list's own heading, once there are sections above it. */
	.fdy-gal-all {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		letter-spacing: 0.02em;
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

	/* ======================================================================
	   THE MOSAIC

	   A MULTI-COLUMN CONTAINER AND NEVER A GRID, which is `CLAUDE.md`'s own
	   rule for panels of unequal height and is load-bearing here rather than
	   stylistic: a grid ROW is as tall as its tallest member, so in a mosaic
	   of arbitrary shapes a 2:1 card beside a 9:16 one leaves most of that
	   row dead -- the exact defect measured on the classroom stream at
	   713.3px of one column. Columns have no rows to lock: each card is
	   `break-inside: avoid`, they fill down one column and on into the next,
	   and `column-fill: balance` picks the shortest height that holds them.

	   WHAT IT COSTS, STATED RATHER THAN DISCOVERED: the reading order is
	   COLUMN-MAJOR. Under `Most played` the second-ranked app is BELOW the
	   first rather than beside it. That is the price of a gapless mosaic in
	   CSS today -- `grid-template-rows: masonry` is not shipped, and the
	   alternatives are a JS layout pass or `grid-auto-flow: dense`, which
	   reorders a ranked list outright to backfill its holes.

	   `column-width` AND A COUNT, never a count alone: the width is what
	   makes the same rule one column in a narrow pane with no breakpoint of
	   its own, and the count is the ceiling multicol needs because it has no
	   `auto-fit` -- it cuts every column the width holds and leaves the
	   spare ones empty. `--fdy-cols` is capped at the number of cards by
	   `foundryMosaicColumns`.

	   15rem is measured rather than round: it is the narrowest column in
	   which a 2:1 card -- the widest shape the clamp permits -- still holds
	   its name plate on one line at this type size.
	   ====================================================================== */
	.fdy-gal-mosaic {
		list-style: none;
		margin: 0;
		padding: 0;
		columns: 15rem var(--fdy-cols, 1);
		column-gap: var(--space-3, 0.75rem);
		column-fill: balance;
	}

	/* Multicol has no row gap, so the gap between two cards in one column is
	   the card's own bottom margin. */
	.fdy-gal-mosaic li {
		break-inside: avoid;
		margin: 0 0 var(--space-3, 0.75rem);
	}

	.fdy-gal-detail {
		min-width: 0;
	}
</style>
