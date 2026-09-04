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
	 * viewer with no configured project renders no broken image rather than a
	 * wrong one -- `mapsPhotoUrl` answers empty and the element is not drawn.
	 */
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
		nodeHref
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
	} = $props();

	const shown = $derived(photos.map((p) => ({ photo: p, src: mapsPhotoUrl(supabaseUrl, p.storage_key) })).filter((p) => p.src));
</script>

<article class="mv-card" data-testid="maps-viewer-card">
	<header>
		<h2>{heading}</h2>
		{#if node}
			<p class="mv-card-where">
				In <a href={nodeHref}>{node.name}</a>
			</p>
		{/if}
	</header>

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

	{#if shown.length > 0}
		<ul class="mv-photos">
			{#each shown as entry (entry.photo.id)}
				<li>
					<img src={entry.src} alt={entry.photo.caption ?? heading} loading="lazy" />
					{#if entry.photo.caption}<span class="mv-photo-caption">{entry.photo.caption}</span>{/if}
				</li>
			{/each}
		</ul>
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
		margin: 0;
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
	.mv-photo-caption {
		display: block;
		margin-top: var(--space-1);
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
	}
</style>
