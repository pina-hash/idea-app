<script lang="ts">
	/**
	 * THE WHOLE PUBLIC MAP, as one component the route mounts and the dev
	 * harness mounts identically. Anonymous, published only, no sign-in
	 * anywhere in the flow -- there is not a single control on this surface
	 * that asks who you are.
	 *
	 * THE POSITION COMES FROM THE URL AND NOTHING ELSE. `position` is derived
	 * from the query string on every render, so every level of the descent is
	 * an address a student can send to somebody else, the browser's own Back
	 * button walks the staged route backwards for free, and a phone that loses
	 * the tab comes back to the same drawer. There is no navigation state in
	 * this component at all; the only `$state` here is the search box, which is
	 * a control rather than a place.
	 *
	 * ONE LEVEL, THREE POSSIBLE DRAWINGS, AND THE LIST IS ALWAYS THERE. A
	 * container with plan geometry gets a plan; a unit gets its elevation; a
	 * compartment gets neither. Every one of them ALSO gets the list, which is
	 * the half that is reachable with a keyboard, hittable with a thumb and
	 * readable by a screen reader -- the drawing is a second, faster way to the
	 * same links and is never the only way. That is also what puts the 44px
	 * floor on this surface without distorting a scale drawing to reach it.
	 *
	 * THE STAGED ROUTE IS A TRAIL, NOT AN ANIMATION (spec 6). A result opens
	 * the building plan with the room marked, and a control advances one link
	 * at a time to the room, the unit, the elevation and finally the card. Each
	 * stage is a real navigation to a real address, so a person in a hurry
	 * takes the last crumb of the trail (or the result row's own "Skip to it")
	 * and lands on the card immediately, and a person who wants to learn the
	 * building steps through it. The trail stays on screen the whole way, which
	 * is what makes the stages a route rather than four unrelated screens.
	 */
	import MapsBreadcrumb from './MapsBreadcrumb.svelte';
	import MapsElevation from './MapsElevation.svelte';
	import MapsItemCard from './MapsItemCard.svelte';
	import MapsPlan from './MapsPlan.svelte';
	import MapsSearch from './MapsSearch.svelte';
	import type { MapsNode, MapsElevationSlot } from '../maps';
	import type { MapsSearchRow, MapsViewerTransports } from '../transports';
	import {
		EMPTY_VIEWER_DATA,
		mapsChain,
		mapsContents,
		mapsHasPlan,
		mapsHref,
		mapsKindWord,
		mapsPhotosFor,
		mapsPlanView,
		mapsPositionFrom,
		mapsPublicItemLabel,
		mapsStageHref,
		mapsStageIndex,
		mapsStagedRoute,
		mapsTypeName,
		mapsViewerElevation,
		type MapsTarget,
		type MapsViewerData
	} from './viewer';

	let {
		data = EMPTY_VIEWER_DATA,
		search: searchParams,
		supabaseUrl = '',
		transports = null,
		initialResults = []
	}: {
		data?: MapsViewerData;
		/** The page's own query string. The route hands `page.url.searchParams`. */
		search: URLSearchParams;
		supabaseUrl?: string;
		/** Omitted removes the LIVE search; the form still submits and SSRs. */
		transports?: MapsViewerTransports | null;
		/** Server-rendered results for `?q=`, so the no-JS path works. */
		initialResults?: MapsSearchRow[];
	} = $props();

	const position = $derived(mapsPositionFrom(searchParams));

	/* The search box is a CONTROL, so it holds state; the query in the URL is
	   the seed. Keyed on the URL's own value so a navigation that changes `q`
	   (a submitted form, a shared link) reseeds the box rather than leaving the
	   previous typing in it. */
	let typed = $state<string | null>(null);
	let liveResults = $state<MapsSearchRow[]>([]);
	let searchState = $state<'idle' | 'running' | 'failed'>('idle');
	let searchMessage = $state<string | null>(null);
	let seededFor = $state<string | null>(null);
	$effect(() => {
		const fromUrl = position.q;
		if (seededFor !== fromUrl) {
			seededFor = fromUrl;
			typed = fromUrl;
		}
	});
	const q = $derived(typed ?? position.q);
	/* Server-rendered rows are shown until the live path has answered for the
	   query actually in the box -- otherwise the first keystroke blanks a list
	   the server already rendered. */
	const results = $derived(
		q.trim() === position.q.trim() && liveResults.length === 0 && searchState === 'idle'
			? initialResults
			: liveResults
	);

	const chain = $derived(mapsChain(data.nodes, position.at));
	const here = $derived(chain.length > 0 ? chain[chain.length - 1] : null);
	const contents = $derived(mapsContents(data, position.at));
	const plan = $derived(mapsPlanView(data, position.at));
	const elevation = $derived<MapsElevationSlot[]>(
		here?.kind === 'unit' ? mapsViewerElevation(data, here.id) : []
	);

	const stages = $derived(mapsStagedRoute(data, position.to));
	const stageIndex = $derived(mapsStageIndex(stages, position));
	const nextStage = $derived(
		stageIndex >= 0 && stageIndex < stages.length - 1 ? stages[stageIndex + 1] : null
	);

	/** What this level marks in gold: the staged route's next link, if we are on it. */
	const markId = $derived(stageIndex >= 0 ? stages[stageIndex].mark : null);

	const openItem = $derived(
		position.item ? (data.items.find((i) => i.id === position.item) ?? null) : null
	);
	const openItemType = $derived(
		openItem?.item_type_id
			? (data.itemTypes.find((t) => t.id === openItem.item_type_id) ?? null)
			: null
	);

	/* EVERY DESCENT CARRIES `q`, THE BOX'S OWN VALUE, AND NOT `position.q`.
	   A query typed live is not in the URL yet -- nobody submitted anything --
	   so hrefs built from the URL would drop it at the first tap, which is the
	   one navigation this feature is built around. Measured on the harness
	   before the fix: the box still held "caliper" and the row beneath it
	   linked to a page with no query at all. */
	const nodeHref = (node: MapsNode) => mapsHref({ at: node.id, to: position.to, q });
	const itemHref = (id: string) => mapsHref({ at: position.at, item: id, to: position.to, q });
	const slotHref = (slot: MapsElevationSlot) => nodeHref(slot.node);

	/** A search result's staged route: its first stage, and its last. */
	const targetOf = (row: MapsSearchRow): MapsTarget => ({ kind: row.result_kind, id: row.result_id });
	const routeStartHref = (row: MapsSearchRow) => {
		const walk = mapsStagedRoute(data, targetOf(row));
		if (walk.length === 0) return mapsHref({ q });
		return mapsStageHref(walk[0], targetOf(row), q);
	};
	const routeEndHref = (row: MapsSearchRow) => {
		const walk = mapsStagedRoute(data, targetOf(row));
		if (walk.length === 0) return mapsHref({ q });
		return mapsStageHref(walk[walk.length - 1], targetOf(row), q);
	};

	const rootHref = $derived(mapsHref({ q }));
	const roots = $derived(contents.children);
	const heading = $derived(here ? here.name : 'IDEA Maps');
	const isEmpty = $derived(data.nodes.length === 0);
</script>

<div class="mv-root" data-testid="maps-viewer">
	<MapsBreadcrumb
		{chain}
		leafLabel={openItem ? mapsPublicItemLabel(openItem, data.itemTypes) : null}
		{rootHref}
		hrefFor={nodeHref}
	/>

	<MapsSearch
		{q}
		{results}
		state={searchState}
		message={searchMessage}
		{transports}
		onquery={(value) => (typed = value)}
		onresults={(payload) => {
			liveResults = payload.results;
			searchState = payload.state;
			searchMessage = payload.message;
		}}
		hrefFor={routeStartHref}
		routeHrefFor={routeEndHref}
	/>

	{#if stages.length > 0 && stageIndex >= 0}
		<nav class="mv-trail" aria-label="The way there" data-testid="maps-viewer-trail">
			<p class="mv-trail-now">
				<span class="mv-trail-step">Step {stageIndex + 1} of {stages.length}</span>
				{stages[stageIndex].label}
			</p>
			<!-- THE DOTS ARE A PROGRESS INDICATOR AND NOT A CONTROL, and that is
			     two of this repo's rules agreeing rather than a tap-target
			     dodge. A 10px dot with only a `title` fails "every control
			     carries a visible word, not only a glyph" outright -- a tooltip
			     is not discoverable and a phone cannot hover -- and making five
			     of them into real 44px targets would put 220px of unlabelled
			     circles on a 375px screen. What they would navigate to is
			     ALREADY reachable by name: for any route, the stages ARE the
			     containment chain, so the breadcrumb above is the same set of
			     jumps with words on them. Two controls for one navigation is
			     the pair that stops agreeing. So: aria-hidden, and the sentence
			     beside them ("Step 3 of 5") is what a screen reader gets. -->
			<ol aria-hidden="true">
				{#each stages as stage, i ((stage.at ?? 'root') + ':' + (stage.item ?? ''))}
					<li>
						<span
							class="mv-trail-dot"
							class:is-done={i < stageIndex}
							class:is-now={i === stageIndex}
						></span>
					</li>
				{/each}
			</ol>
			{#if nextStage}
				<a class="mv-next tap-44" data-testid="maps-viewer-next" href={mapsStageHref(nextStage, position.to, q)}>
					Next: {nextStage.label}
				</a>
				<a
					class="mv-skip tap-44"
					data-testid="maps-viewer-skip"
					href={mapsStageHref(stages[stages.length - 1], position.to, q)}
				>
					Skip to the end
				</a>
			{:else}
				<p class="mv-arrived">You are there.</p>
			{/if}
		</nav>
	{/if}

	{#if openItem}
		<MapsItemCard
			heading={mapsPublicItemLabel(openItem, data.itemTypes)}
			node={here}
			item={openItem}
			itemType={openItemType}
			photos={[
				...mapsPhotosFor(data.photos, 'item', openItem.id),
				...(openItemType ? mapsPhotosFor(data.photos, 'item_type', openItemType.id) : [])
			]}
			{supabaseUrl}
			nodeHref={mapsHref({ at: position.at, to: position.to, q })}
		/>
	{:else}
		<header class="mv-head" data-testid="maps-viewer-head">
			<h1>{heading}</h1>
			{#if here}
				<p class="mv-kind">{mapsKindWord(here)}</p>
				{#if here.description}<p class="mv-desc">{here.description}</p>{/if}
			{:else}
				<p class="mv-desc">
					Every building, room, toolbox and drawer the IDEA shop has catalogued. Open one, or
					search for the thing you need.
				</p>
			{/if}
		</header>

		{#if isEmpty}
			<p class="mv-empty">
				Nothing has been published to the map yet. Once a room is catalogued it will show up
				here.
			</p>
		{:else}
			<div class="mv-level">
				{#if here?.kind === 'unit' && elevation.length > 0}
					<section class="mv-drawing" aria-label="Front elevation" data-testid="maps-viewer-elevation">
						<h2 class="mv-sub">Front of {here.name}</h2>
						<MapsElevation
							slots={elevation}
							unitName={here.name}
							{markId}
							hrefFor={slotHref}
						/>
					</section>
				{:else if mapsHasPlan(plan)}
					<section class="mv-drawing" aria-label="Plan" data-testid="maps-viewer-plan">
						<h2 class="mv-sub">{here ? `Plan of ${here.name}` : 'The site'}</h2>
						<MapsPlan view={plan} frameLabel={here?.name ?? 'the site'} {markId} hrefFor={nodeHref} />
					</section>
				{/if}

				<section class="mv-list" aria-label="What is here" data-testid="maps-viewer-list">
					<h2 class="mv-sub">
						{#if here}Inside {here.name}{:else}Buildings and sites{/if}
					</h2>
					{#if roots.length === 0 && contents.items.length === 0 && contents.stock.length === 0}
						<p class="mv-empty">Nothing has been catalogued in here yet.</p>
					{:else}
						<ul class="mv-rows" data-testid="maps-viewer-rows">
							{#each roots as child (child.id)}
								<li>
									<a
										class="mv-row"
										class:is-marked={child.id === markId}
										href={nodeHref(child)}
										data-marked={child.id === markId ? '' : undefined}
									>
										<span class="mv-row-name">{child.name}</span>
										<span class="mv-row-meta">
											<span class="mv-row-kind">{mapsKindWord(child)}</span>
											{#if child.id === markId}<span class="mv-found">found here</span>{/if}
										</span>
									</a>
								</li>
							{/each}
							{#each contents.items as item (item.id)}
								<li>
									<a
										class="mv-row"
										class:is-marked={item.id === markId}
										href={itemHref(item.id)}
										data-marked={item.id === markId ? '' : undefined}
									>
										<span class="mv-row-name">{mapsPublicItemLabel(item, data.itemTypes)}</span>
										<span class="mv-row-meta">
											<span class="mv-row-kind">item</span>
											{#if item.serial}<span class="mv-row-serial">{item.serial}</span>{/if}
											{#if item.id === markId}<span class="mv-found">found here</span>{/if}
										</span>
									</a>
								</li>
							{/each}
							{#each contents.stock as row (row.id)}
								{@const typeName = mapsTypeName(row.item_type_id, data.itemTypes)}
								<li>
									<span class="mv-row is-static" class:is-marked={row.id === markId}>
										<span class="mv-row-name">{typeName}</span>
										<span class="mv-row-meta">
											<span class="mv-row-kind">{row.qty} here</span>
											{#if row.id === markId}<span class="mv-found">found here</span>{/if}
										</span>
									</span>
								</li>
							{/each}
						</ul>
					{/if}

					{#if plan.unplaced.length > 0 && mapsHasPlan(plan)}
						<p class="mv-unplaced">
							{plan.unplaced.length}
							{plan.unplaced.length === 1 ? 'container is' : 'containers are'} in here but not
							drawn on the plan yet. They are in the list above.
						</p>
					{/if}
				</section>
			</div>
		{/if}
	{/if}
</div>

<style>
	/* THE ROOM. Maps' identity is JADE (#40e3b1) and its HIGHLIGHT is the
	   portal's gold -- two different jobs, which is the whole colour decision
	   on this surface. Green is the chrome: headings, links, the plan's
	   linework, the active crumb. Gold is a STATE, exactly the way crimson is
	   reserved for live and error: it means "this is the thing you were looking
	   for" and it is never spent on decoration. A plan drawn in the accent
	   would leave the found thing nowhere to go.

	   The room ALIASES the shared vocabulary onto its own plate the .nb-root
	   way -- source and target on this element itself, never on a descendant --
	   so the components below read --surface-*, --text-* and --boundary exactly
	   as the classroom does and nothing here needs to know which room it is in. */
	.mv-root {
		--mv-accent: #40e3b1;
		/* The ink is the identity: jade measures 10.86 / 9.24 / 8.66 as text on
		   --bg0 / --bg1 / --bg2, so unlike FRC's brand red it carries text
		   itself and nothing has to move. */
		--mv-accent-ink: var(--mv-accent);
		--mv-accent-strong: var(--mv-accent);
		--mv-mark: var(--gold);
		--mv-mark-ink: var(--gold);
		--mv-mark-fill: color-mix(in srgb, var(--gold) 22%, transparent);
		--mv-shape-fill: color-mix(in srgb, var(--mv-accent) 10%, transparent);
		--mv-shape-fill-hover: color-mix(in srgb, var(--mv-accent) 20%, transparent);
		--mv-line: color-mix(in srgb, var(--mv-accent) 45%, transparent);
		--mv-ink: var(--text-1, #e7eae8);
		--mv-boundary: var(--boundary, #6f7b73);

		max-width: 78rem;
		margin: 0 auto;
		padding: var(--space-3) var(--space-4) var(--space-8);
		color: var(--text-1, #e7eae8);
		font-family: var(--font-display);
	}
	.mv-head {
		margin-bottom: var(--space-4);
	}
	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.75rem;
		color: var(--mv-accent-ink);
	}
	.mv-kind {
		margin: 0.1rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
	}
	.mv-desc {
		margin: var(--space-2) 0 0;
		max-width: 62ch;
		color: var(--text-1, #e7eae8);
	}
	.mv-sub {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
	}
	.mv-empty {
		color: var(--text-2, #9aa49d);
		max-width: 62ch;
	}

	/* THE STAGED ROUTE'S TRAIL. */
	.mv-trail {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-4);
		padding: var(--space-3);
		background: var(--surface-1, #101312);
		border: 1px solid var(--mv-mark);
		border-radius: var(--radius-card);
	}
	.mv-trail-now {
		flex: 1 1 14rem;
		margin: 0;
		min-width: 0;
	}
	.mv-trail-step {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--mv-mark);
	}
	.mv-trail ol {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.mv-trail-dot {
		display: block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 1px solid var(--mv-boundary);
		background: transparent;
		/* Each dot is a link back to a stage, so it takes the reach rather than
		   the size: dots sit 4px apart and a 44px box on each would hand the tap
		   to the wrong step. Growing in HEIGHT only is the same call the
		   breadcrumb makes. */
		--tap-reach-w: 0px;
	}
	.mv-trail-dot.is-done {
		background: var(--mv-mark);
		border-color: var(--mv-mark);
	}
	.mv-trail-dot.is-now {
		background: var(--mv-mark);
		border-color: var(--mv-mark);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 30%, transparent);
	}
	.mv-next,
	.mv-skip {
		display: inline-flex;
		align-items: center;
		padding: 0 var(--space-3);
		border-radius: var(--radius-control);
		text-decoration: none;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}
	.mv-next {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		border: 1px solid var(--mv-mark);
		color: var(--mv-mark);
	}
	.mv-skip {
		border: 1px solid var(--mv-boundary);
		color: var(--text-2, #9aa49d);
	}
	.mv-next:hover,
	.mv-next:focus-visible,
	.mv-skip:hover,
	.mv-skip:focus-visible {
		border-color: var(--mv-mark);
		color: var(--mv-mark);
	}
	.mv-arrived {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--mv-mark);
	}

	/* THE LEVEL. One column at 375px, drawing beside list above 60rem -- the
	   plan is the thing that gains most from the room and the list is the thing
	   a thumb uses, so on a phone the list comes FIRST in the source order and
	   the drawing sits under it. */
	.mv-level {
		display: grid;
		gap: var(--space-5);
	}
	@media (min-width: 60rem) {
		.mv-level {
			grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
			align-items: start;
		}
	}
	.mv-drawing {
		min-width: 0;
	}
	.mv-list {
		min-width: 0;
	}
	.mv-rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.mv-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1, #101312);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		color: var(--text-1, #e7eae8);
		text-decoration: none;
	}
	a.mv-row:hover,
	a.mv-row:focus-visible {
		border-color: var(--mv-accent);
		background: var(--mv-shape-fill);
	}
	.mv-row.is-marked {
		border-color: var(--mv-mark);
		border-width: 2px;
		background: var(--mv-mark-fill);
	}
	.mv-row.is-static {
		/* A stocked type is a COUNT in a place, not a thing with a page of its
		   own -- there is nothing to open, so it is not a link. */
		cursor: default;
	}
	.mv-row-name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.mv-row-meta {
		flex: none;
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-row-kind {
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mv-row-serial {
		overflow-wrap: anywhere;
	}
	/* THE WORD BESIDE THE COLOUR. The gold fill says "found"; this says it in
	   letters, because colour is never the only signal. */
	.mv-found {
		color: var(--mv-mark);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.mv-unplaced {
		margin: var(--space-3) 0 0;
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
	}
</style>
