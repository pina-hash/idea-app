<script lang="ts">
	import {
		ITEM_LIST_MAX_DEPTH,
		itemBodyDoc,
		safeHref,
		type ItemDoc,
		type ItemImage,
		type ItemInline,
		type ItemItem,
		type ItemList
	} from '$lib/classroom/classroom-doc';
	import { resolveFigureSrc, type ClassroomAttachment } from '$lib/classroom/classroom';
	import { itemParts } from '$lib/rich-text-doc';

	/**
	 * The ONE way a classroom item's body is rendered anywhere in this app.
	 *
	 * The class stream, the item page, the student view and the composer's own
	 * preview all mount this, so what a student reads is what the teacher wrote
	 * -- identically, on every surface. A second renderer per surface is exactly
	 * how two of them end up disagreeing about what a bulleted list looks like.
	 *
	 * IT WALKS THE DOCUMENT INTO REAL ELEMENTS. There is deliberately no
	 * `{@html}` here or anywhere else in the item-body path: a body is written by
	 * a teacher and rendered into every student's browser in the class, and
	 * rendering it as markup would make the server-side normalizer the only thing
	 * between the two. Svelte escapes every `{run.text}` below by construction,
	 * and `safeHref` runs AGAIN here -- the normalizer already checked it and
	 * 0108's SQL gate refuses it a second time, but a document that reached the
	 * database by some other door must still be safe to display.
	 *
	 * A link whose target does not survive that third check renders as plain text
	 * rather than vanishing: the teacher's words are theirs either way.
	 *
	 * IT RECURSES, AND IT CARRIES THE CAP DOWN (0122). A list item may hold a
	 * sublist, so `list` and `listItem` below call each other; the depth is
	 * passed rather than read from the document, and a level past
	 * ITEM_LIST_MAX_DEPTH is not rendered. The gate refuses a deeper body, but
	 * a renderer that trusts the gate is a renderer that hangs the day
	 * something reaches the table another way.
	 *
	 * TAKES THE ITEM, NOT THE DOC, on purpose. `itemBodyDoc` is what falls back
	 * to the plain-text body when `body_doc` is absent -- an item authored before
	 * 0108, or any read on a deployment where that migration has not been applied
	 * yet -- so every caller gets that fallback for free instead of each one
	 * remembering to ask for it.
	 */
	let {
		item,
		compact = false,
		publicAttachments = false
	}: {
		item: {
			body: string;
			body_doc?: ItemDoc | null;
			attachments?: ClassroomAttachment[];
		};
		/** The stream's denser type scale; the item page uses the roomy one. */
		compact?: boolean;
		/**
		 * Resolve an `attachment:` image through the proxy's `?public=1` branch,
		 * for the signed-out reference viewer. Passed down rather than sniffed,
		 * exactly as MarkdownText takes it.
		 */
		publicAttachments?: boolean;
	} = $props();

	const doc = $derived(itemBodyDoc(item));

	function href(run: ItemInline): string | null {
		return safeHref(run.href);
	}

	/**
	 * AN IMAGE IS RESOLVED THROUGH `resolveFigureSrc`, THE SAME ONE PREDICATE
	 * the spec and reference renderers use, against THIS ITEM'S OWN attachments
	 * (0176). It is never `safeHref`: a reader CHOOSES to follow a link, and a
	 * browser fetches an `img` automatically, carrying their IP and Referer,
	 * before anybody has decided anything. So the source is same-origin only --
	 * an alias resolved through the existing proxy, or a path under
	 * FIGURE_STATIC_PREFIXES -- and SVG is refused from every source.
	 *
	 * NO ATTACHMENTS IS NOT AN ERROR AND IS THE ORDINARY CASE HERE: a surface
	 * that renders a body without loading its files (a preview, a harness)
	 * resolves every alias to `unresolved`, which renders as the description
	 * plus a visible marker -- the same degradation a typo produces, and the
	 * same one MarkdownText already gives. Never a broken `img`, never silence,
	 * and the refused reference never reaches an attribute at all.
	 */
	function figure(block: ItemImage) {
		return resolveFigureSrc(block.src, item.attachments ?? [], {
			public: publicAttachments
		});
	}
</script>

{#snippet runs(list: ItemInline[])}
	{#each list as run, i (i)}
		{@const url = href(run)}
		{#if url}
			<a class="item-link" href={url} target="_blank" rel="noopener noreferrer">
				{#if run.bold && run.italic}<strong><em>{run.text}</em></strong>
				{:else if run.bold}<strong>{run.text}</strong>
				{:else if run.italic}<em>{run.text}</em>
				{:else}{run.text}{/if}
			</a>
		{:else if run.bold && run.italic}
			<strong><em>{run.text}</em></strong>
		{:else if run.bold}
			<strong>{run.text}</strong>
		{:else if run.italic}
			<em>{run.text}</em>
		{:else}{run.text}{/if}
	{/each}
{/snippet}

{#snippet listItem(entry: ItemItem, depth: number)}
	{@const parts = itemParts(entry)}
	{@render runs(parts.runs)}
	{#each parts.lists as sub, k (k)}
		{#if depth < ITEM_LIST_MAX_DEPTH}{@render list(sub, depth + 1)}{/if}
	{/each}
{/snippet}

{#snippet list(block: ItemList, depth: number)}
	{#if block.type === 'ul'}
		<ul>
			{#each block.items as entry, j (j)}
				<li>{@render listItem(entry, depth)}</li>
			{/each}
		</ul>
	{:else}
		<ol>
			{#each block.items as entry, j (j)}
				<li>{@render listItem(entry, depth)}</li>
			{/each}
		</ol>
	{/if}
{/snippet}

<div class="item-body" class:compact>
	{#each doc as block, i (i)}
		{#if block.type === 'p'}
			<p>{@render runs(block.runs)}</p>
		{:else if block.type === 'h3'}
			<h3>{@render runs(block.runs)}</h3>
		{:else if block.type === 'h4'}
			<h4>{@render runs(block.runs)}</h4>
		{:else if block.type === 'img'}
			{@const src = figure(block)}
			<figure class="item-figure">
				{#if src.ok}
					<img src={src.src} alt={block.alt} loading="lazy" />
				{:else}
					<div class="item-figure-missing">Image unavailable</div>
				{/if}
				<figcaption>{block.alt}</figcaption>
			</figure>
		{:else}
			{@render list(block, 1)}
		{/if}
	{/each}
</div>

<style>
	.item-body {
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--text-1);
		/* A pasted URL with no spaces must not widen the column it sits in. */
		overflow-wrap: anywhere;
	}
	.item-body.compact {
		font-size: 0.95rem;
		line-height: 1.55;
	}
	.item-body p,
	.item-body ul,
	.item-body ol {
		margin: 0 0 0.7rem;
	}
	.item-body ul,
	.item-body ol {
		padding-left: 1.4rem;
	}
	/* A sublist sits INSIDE its item, so it takes the item's own leading rather
	   than a block's trailing gap -- the 0.7rem bottom margin above would open
	   a hole between the sublist and the next bullet of the list it is inside. */
	.item-body li > ul,
	.item-body li > ol {
		margin: 0.15rem 0 0;
	}
	.item-body li {
		margin: 0.15rem 0;
	}
	/* A FIGURE IS A BLOCK LIKE ANY OTHER, and it is capped so one photograph
	   off a phone cannot own the whole column. `contain` rather than `cover`,
	   the same call the composer's pre-save preview makes: cropping to fill
	   hides the cut-off edge, and on a picture of a part the cut-off edge is
	   routinely the measurement somebody needs to read. */
	.item-body .item-figure {
		margin: 0 0 0.7rem;
	}
	.item-body .item-figure img {
		display: block;
		max-width: 100%;
		max-height: 22rem;
		object-fit: contain;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		background: var(--surface-2, var(--bg2));
	}
	/* The marker for a reference nothing could load: a word, never a broken
	   image and never an empty box. Colour is not the only signal -- the
	   sentence is the signal and the tone only agrees with it. */
	.item-body .item-figure-missing {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--body-figure-missing, var(--amber));
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-card);
		padding: 0.85rem 1rem;
	}
	.item-body .item-figure figcaption {
		font-size: 0.82rem;
		color: var(--text-2);
		margin-top: 0.35rem;
	}
	/* h1 is the item's title and h2 its section label, so a body starts at h3
	   and is styled to read as subordinate to both -- the same rule, for the
	   same reason, the reference-document renderer applies. */
	.item-body h3,
	.item-body h4 {
		font-family: var(--font-mono);
		letter-spacing: 0.04em;
		color: var(--text-1);
		margin: 1.1rem 0 0.4rem;
	}
	.item-body h4 {
		color: var(--text-2);
		margin-top: 0.9rem;
	}
	.item-body h3 {
		font-size: 0.82rem;
		text-transform: uppercase;
	}
	.item-body h4 {
		font-size: 0.74rem;
	}
	.item-body > :global(:first-child) {
		margin-top: 0;
	}
	.item-body > :last-child {
		margin-bottom: 0;
	}
	/* A ROOM HOOK WITH A FALLBACK, read at the point of use -- the mechanism
	   Disclosure uses for `--disc-accent`, and for the same measured reason.

	   `--cyan` is the portal's metadata colour, tuned for a dark plate. When
	   0123 put this renderer inside `.nb-root` it landed on the notebook's PAPER
	   plate, where the same link measures 2.00:1 against #F2F1EA -- unreadable,
	   and the exact defect class the `--nb-cell-*` tokens already exist to
	   correct. Written this way the classroom keeps `--cyan` byte for byte and
	   the notebook points the token at its own corrected accent. */
	.item-link {
		color: var(--body-link, var(--cyan));
		text-decoration: underline;
		text-underline-offset: 2px;
	}
</style>
