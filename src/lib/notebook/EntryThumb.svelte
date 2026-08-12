<script lang="ts">
	import { orderedPhotos, photoPages, type NotebookEntry } from '$lib/notebook';
	import { entryThumb, photoThumbSrc } from '$lib/notebook-folders';

	/**
	 * The tile beside a collapsed entry: what this entry IS, at a glance.
	 *
	 * THREE KINDS, and the middle one is the point. A photo entry shows its
	 * first page. A note-only entry has no image and never will, so instead of
	 * a generic document icon it renders its own opening words as a tiny page
	 * -- genuinely representative, costing no storage and no request, and the
	 * only thing that tells one note apart from the note above it without
	 * expanding both. An entry with neither (a title and nothing else, which
	 * 0071/0075 both allow) gets a plain mark rather than an empty box.
	 *
	 * PHOTOS COME FROM THE THUMBNAIL VARIANT of the proxy, not the full-size
	 * route: a collapsed feed asks for one image per entry, and the whole
	 * reason this view exists is that pulling megabytes to paint a tile is
	 * what made a long notebook unusable. See photoThumbSrc.
	 *
	 * A FAILED IMAGE IS NOT A BROKEN TILE. The per-photo fallback the expanded
	 * view already uses applies here too, collapsed down to its smallest
	 * honest form: the tile degrades to the mark, and the Drive escape hatch
	 * stays on the expanded view where there is room to explain it.
	 */

	let {
		entry,
		size = 64,
		alt = ''
	}: {
		entry: NotebookEntry;
		/** Rendered edge length in px. The request size is fixed and larger. */
		size?: number;
		alt?: string;
	} = $props();

	const thumb = $derived(entryThumb(entry));
	const pages = $derived(photoPages(orderedPhotos(entry)));
	/** More pages than the one shown, worth saying on the tile itself. */
	const extra = $derived(Math.max(0, pages.length - 1));

	/** Reset when the entry (and so the src) changes, or a retry never shows. */
	let broken = $state(false);
	$effect(() => {
		void entry.id;
		broken = false;
	});

</script>

<div class="thumb" style="--thumb-size: {size}px" data-kind={broken ? 'empty' : thumb.kind}>
	{#if thumb.kind === 'photo' && !broken}
		<img
			src={photoThumbSrc(thumb.photoId)}
			{alt}
			loading="lazy"
			decoding="async"
			width={size}
			height={size}
			onerror={() => (broken = true)}
		/>
		{#if extra > 0}
			<span class="count" aria-hidden="true">+{extra}</span>
		{/if}
	{:else if thumb.kind === 'note'}
		<!-- The note's own opening words, set as a miniature page. aria-hidden
		     because the collapsed row already names the entry and previews the
		     same text in readable size; this is a picture of it. -->
		<span class="note-tile" aria-hidden="true">{thumb.text}</span>
	{:else}
		<span class="mark" aria-hidden="true">
			{#if broken}
				<!-- A photo we could not fetch, not an empty entry. The expanded
				     view carries the real explanation and the Drive escape
				     hatch; a tile only has room to not lie about it. -->
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
					<rect x="3" y="5" width="18" height="14" rx="2" />
					<path d="M3 16l4.5-4.5 3 3L15 10l6 6" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
					<path d="M6 3.5h8L18 8v12.5H6z" />
					<path d="M14 3.5V8h4" />
				</svg>
			{/if}
		</span>
	{/if}
</div>

<style>
	.thumb {
		position: relative;
		flex: 0 0 auto;
		width: var(--thumb-size);
		height: var(--thumb-size);
		border-radius: var(--nb-radius-control);
		border: 1px solid var(--nb-hairline);
		background: var(--nb-surface-dim);
		overflow: hidden;
		display: grid;
		place-items: center;
		color: var(--nb-ink-faint);
	}
	.thumb img {
		width: 100%;
		height: 100%;
		/* COVER, not contain: a tile is a glance, and letterboxing a page into
		   a 64px box wastes most of it. The expanded view is where the whole
		   page is read, and it uses contain. */
		object-fit: cover;
		display: block;
	}
	.count {
		position: absolute;
		right: 2px;
		bottom: 2px;
		font-size: 0.6rem;
		font-weight: 700;
		line-height: 1;
		padding: 0.15em 0.3em;
		border-radius: 4px;
		background: rgba(38, 34, 27, 0.72);
		color: #fff;
	}

	/* The note tile: a real miniature of the text, clipped rather than
	   ellipsized -- a page of writing runs off its own edge, and that reads
	   as "there is more" better than a full stop would. */
	.note-tile {
		width: 100%;
		height: 100%;
		padding: 0.3em 0.35em;
		font-size: calc(var(--thumb-size) * 0.088);
		line-height: 1.35;
		color: var(--nb-ink-soft);
		background: var(--nb-surface);
		overflow: hidden;
		word-break: break-word;
		/* Fades the last line out so the clip is deliberate, not truncated. */
		-webkit-mask-image: linear-gradient(180deg, #000 62%, transparent 100%);
		mask-image: linear-gradient(180deg, #000 62%, transparent 100%);
	}
	.mark svg {
		width: 45%;
		height: 45%;
	}
</style>
