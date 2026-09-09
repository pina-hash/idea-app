<script lang="ts">
	/**
	 * ONE THING, WITH ITS PHOTOS -- the end of the descent and the end of the
	 * staged route.
	 *
	 * WHAT IT SHOWS IS WHAT THE DATABASE HANDED IT, and every field is
	 * conditional because a null is an ORDINARY answer here rather than an
	 * error: a unique item may have no type, a type may have no brand, and a
	 * photo may have no caption. Nothing renders a placeholder for an absent
	 * field, the way a Foundry card renders nothing for a null class.
	 *
	 * THE VOCABULARY IS SHOWN, NOT HIDDEN. Aliases and tags are what let
	 * somebody find this thing when they knew the wrong word for it (spec 5.1),
	 * so the card prints them: the next person who calls a hex key an Allen
	 * wrench learns that this map knows both, which is the only way the
	 * vocabulary teaches anybody anything.
	 *
	 * THE PHOTOS ARE PLAIN `<img>` OFF THE PUBLIC BUCKET. `maps-media` is public
	 * by 0163's own decision (spec 4.4), so the URL is a pure function of the
	 * project URL and the key, needs no round trip and no signature, and a
	 * viewer with no configured project builds no URL at all rather than a
	 * wrong one -- `mapsPhotoUrl` answers empty.
	 *
	 * THAT CASE USED TO RENDER NOTHING, AND NOW RENDERS A TILE. The empty src
	 * was FILTERED OUT of the list, so a misconfigured deployment showed a card
	 * with no photo region and nothing anywhere saying a photo existed. The
	 * repo's own rule for an image it will not resolve is the opposite: the
	 * caption plus a visible marker, "never a broken img and never silence".
	 *
	 * FOUR OUTCOMES, AND THEY ARE FOUR DIFFERENT THINGS ON SCREEN.
	 *   PRESENT       the photo drew.
	 *   ABSENT        the thing has no photos: no list, no placeholder, no gap.
	 *                 A card with nothing to show says nothing.
	 *   REFUSED       `mapsPhotoUrl` answered empty, which is the local
	 *                 judgement (no configured project). Judged without asking
	 *                 anybody, so it is a state of its own rather than a
	 *                 request that failed.
	 *   FAILED        the request was made and the bytes did not arrive or did
	 *                 not decode -- a swept object, a row naming bytes that are
	 *                 gone, or (after 0186, if the public endpoint turns out to
	 *                 consult RLS) a photo this caller may not read.
	 *
	 * THE LAST TWO USED TO BE A BROKEN IMAGE ICON UNDER A CAPTION, which reads
	 * as a bad upload rather than as a state, and on a public map is the one
	 * thing a visitor cannot report usefully. The shelf editor's own thumbnail
	 * has had this fallback since it shipped; this is the public half of the
	 * same rule.
	 *
	 * THE TILE KEEPS THE ROW'S GEOMETRY. It is the same grid cell with the same
	 * caption beneath it, so a photo failing does not reflow the card around
	 * it -- what moves is what the cell says, never where anything sits.
	 */
	import { SvelteSet } from 'svelte/reactivity';
	import { mapsPhotoUrl, type MapsPhoto } from '../media';
	import type { MapsItem, MapsItemType, MapsNode, MapsStock } from '../maps';

	let {
		heading,
		node,
		item = null,
		stock = null,
		itemType = null,
		photos = [],
		supabaseUrl = '',
		nodeHref,
		wayHref = null
	}: {
		heading: string;
		/** The container it is in: the card always says where. */
		node: MapsNode | null;
		item?: MapsItem | null;
		stock?: MapsStock | null;
		itemType?: MapsItemType | null;
		photos?: MapsPhoto[];
		supabaseUrl?: string;
		nodeHref: string;
		/**
		 * The start of a staged route to THIS thing, offered when the card was
		 * reached by browsing rather than by a route -- the "Directions" of a
		 * place card. Null when the walk is already the one in the URL, because
		 * a control whose outcome is where you already are is not offered.
		 */
		wayHref?: string | null;
	} = $props();

	/* COPY LINK: the position IS the URL, so sharing a thing is copying the
	   address. The clipboard is asked once and the answer is said in words;
	   where it refuses (an insecure origin, a browser that will not) the
	   address is shown selectable instead, which is the Foundry share
	   control's own fallback and never a control that does nothing. */
	let copied = $state<'idle' | 'done' | 'shown'>('idle');
	let shownUrl = $state('');
	async function copyLink() {
		const url = typeof location === 'undefined' ? '' : location.href;
		try {
			await navigator.clipboard.writeText(url);
			copied = 'done';
		} catch {
			shownUrl = url;
			copied = 'shown';
		}
	}

	const shown = $derived(
		photos.map((p) => ({ photo: p, src: mapsPhotoUrl(supabaseUrl, p.storage_key) }))
	);

	/* Photo ids whose object did not arrive in THIS browser. A SvelteSet so
	   adding one repaints, and keyed by the photo's own id so a list that
	   reloads cannot carry one card's failure onto another's. */
	const broken = new SvelteSet<string>();
</script>

<article class="mv-card" data-testid="maps-viewer-card">
	<header>
		<h2>{heading}</h2>
		{#if node}
			<p class="mv-card-where">
				In <a href={nodeHref}>{node.name}</a>
			</p>
		{/if}
		<p class="mv-card-actions">
			{#if wayHref}
				<a class="mv-card-way tap-44" href={wayHref} data-testid="maps-card-way">Show me the way</a>
			{/if}
			<button type="button" class="mv-card-copy tap-44" onclick={copyLink} data-testid="maps-card-copy">
				{copied === 'done' ? 'Link copied' : 'Copy link'}
			</button>
		</p>
		{#if copied === 'shown'}
			<p class="mv-card-url" role="status">
				Copy this address: <span class="mv-mono">{shownUrl}</span>
			</p>
		{:else if copied === 'done'}
			<p class="mv-card-url" role="status">The link to this card is on your clipboard.</p>
		{/if}
	</header>

	<!-- PHOTOS FIRST, the way a place card leads with its picture: on a phone
	     in a shop the photograph is what says "yes, that one" before any fact
	     does (prompt 0112). -->
	{#if shown.length > 0}
		<ul class="mv-photos" data-testid="maps-card-photos">
			{#each shown as entry (entry.photo.id)}
				<li>
					{#if !entry.src}
						<span class="mv-photo-out is-refused" data-testid="maps-photo-refused"
							>Photo not available here</span
						>
					{:else if broken.has(entry.photo.id)}
						<span class="mv-photo-out is-failed" data-testid="maps-photo-failed"
							>Photo could not be loaded</span
						>
					{:else}
						<img
							src={entry.src}
							alt={entry.photo.caption ?? heading}
							loading="lazy"
							data-testid="maps-photo"
							onerror={() => broken.add(entry.photo.id)}
						/>
					{/if}
					{#if entry.photo.caption}<span class="mv-photo-caption">{entry.photo.caption}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<dl class="mv-facts">
		{#if stock}
			<div><dt>How many</dt><dd>{stock.qty}</dd></div>
		{/if}
		{#if item?.serial}
			<div><dt>Serial</dt><dd class="mv-mono">{item.serial}</dd></div>
		{/if}
		{#if itemType?.category}
			<div><dt>Category</dt><dd>{itemType.category}</dd></div>
		{/if}
		{#if itemType?.brand}
			<div><dt>Brand</dt><dd>{itemType.brand}</dd></div>
		{/if}
		{#if itemType?.model}
			<div><dt>Model</dt><dd class="mv-mono">{itemType.model}</dd></div>
		{/if}
		{#if itemType?.part_number}
			<div><dt>Part number</dt><dd class="mv-mono">{itemType.part_number}</dd></div>
		{/if}
	</dl>

	{#if itemType?.aliases?.length}
		<p class="mv-vocab">
			<span class="mv-vocab-label">Also called</span>
			{#each itemType.aliases as alias (alias)}<span class="mv-chip">{alias}</span>{/each}
		</p>
	{/if}
	{#if itemType?.tags?.length}
		<p class="mv-vocab">
			<span class="mv-vocab-label">What it is for</span>
			{#each itemType.tags as tag (tag)}<span class="mv-chip">{tag}</span>{/each}
		</p>
	{/if}

	{#if itemType?.description}
		<p class="mv-desc">{itemType.description}</p>
	{/if}
	{#if item?.notes}
		<p class="mv-desc">{item.notes}</p>
	{/if}

</article>

<style>
	.mv-card {
		background: var(--surface-1, #101312);
		border: 1px solid var(--mv-mark);
		border-radius: var(--radius-card);
		padding: var(--space-4);
	}
	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		color: var(--mv-mark);
	}
	.mv-card-where {
		margin: var(--space-1) 0 var(--space-3);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-card-where a {
		color: var(--mv-accent-ink);
	}
	.mv-card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
	}
	.mv-card-way,
	.mv-card-copy {
		padding: 0 var(--space-3);
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
		text-decoration: none;
		cursor: pointer;
	}
	.mv-card-way {
		background: color-mix(in srgb, var(--gold) 18%, transparent);
		border: 1px solid var(--mv-mark);
		color: var(--mv-mark);
	}
	.mv-card-copy {
		background: var(--surface-2, #161a18);
		border: 1px solid var(--mv-accent);
		color: var(--mv-accent-ink);
	}
	.mv-card-way:hover,
	.mv-card-way:focus-visible,
	.mv-card-copy:hover,
	.mv-card-copy:focus-visible {
		background: var(--mv-shape-fill-hover);
	}
	.mv-card-url {
		margin: 0 0 var(--space-3);
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
		overflow-wrap: anywhere;
	}
	.mv-facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr));
		gap: var(--space-2) var(--space-4);
		margin: 0 0 var(--space-3);
	}
	.mv-facts div {
		min-width: 0;
	}
	dt {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
	}
	dd {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1, #e7eae8);
		overflow-wrap: anywhere;
	}
	.mv-mono {
		font-family: var(--font-mono);
	}
	.mv-vocab {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0 0 var(--space-2);
	}
	.mv-vocab-label {
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
	}
	.mv-chip {
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-chip);
		font-size: 0.8125rem;
		color: var(--text-1, #e7eae8);
	}
	.mv-desc {
		margin: 0 0 var(--space-3);
		color: var(--text-1, #e7eae8);
		max-width: 62ch;
	}
	.mv-photos {
		list-style: none;
		margin: 0 0 var(--space-3);
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
		gap: var(--space-3);
	}
	.mv-photos li {
		min-width: 0;
	}
	img {
		display: block;
		width: 100%;
		height: auto;
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2, #161a18);
	}
	/*
	 * THE TWO OUT-STATES SHARE A BOX WITH THE PHOTO, which is what keeps a
	 * failure from moving the row: same `width: 100%` in the same grid cell,
	 * same border radius, same caption underneath. The 4/3 ratio is a stated
	 * guess and cannot be anything else -- a placeholder does not know the
	 * height of the photo that did not arrive -- so the WIDTH and the column
	 * positions are what hold, and the height is the one thing that moves.
	 *
	 * NEITHER IS SOLID, so both read as absence at a glance against a real
	 * photo's solid edge -- and the two are DOTTED and DASHED rather than both
	 * dashed, which is the half a first pass got wrong. The browser probe on
	 * `/dev/maps-media/photos` compares what the four states PAINT, and it
	 * reported the two out-tiles as one appearance: identical ground, identical
	 * border, differing only in their words. Colour is never the only signal
	 * here and neither is wording, so the fill STYLE carries the difference the
	 * way the notebook grid's states do -- refused DOTTED, failed DASHED, on a
	 * phone held at arm's length in a workshop.
	 */
	.mv-photo-out {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		aspect-ratio: 4 / 3;
		padding: var(--space-2);
		box-sizing: border-box;
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2, #161a18);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-align: center;
		color: var(--text-2, #9aa49d);
	}
	/* Judged here, nothing asked. */
	.mv-photo-out.is-refused {
		border-style: dotted;
	}
	/* Asked, and nothing came back. */
	.mv-photo-out.is-failed {
		border-style: dashed;
	}
	.mv-photo-caption {
		display: block;
		margin-top: var(--space-1);
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
	}
</style>
