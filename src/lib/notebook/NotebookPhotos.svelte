<script lang="ts">
	import {
		driveOpenUrl,
		pageKey,
		pagePhoto,
		photoPages,
		photoSrc,
		type EntryActionResult,
		type NotebookPhoto
	} from '$lib/notebook';
	import { photoThumbSrc } from '$lib/notebook-folders';
	import PhotoViewer from '$lib/notebook/PhotoViewer.svelte';

	/**
	 * The one way a notebook entry's photos are rendered anywhere in this app.
	 *
	 * Lifted VERBATIM out of NotebookView.svelte (markup, behaviour and CSS)
	 * when the instructor review grid needed the same thing, so the student
	 * feed and the review panel cannot drift apart: same proxy route, same
	 * reserved height, same per-photo broken/retry fallback with the Drive
	 * link demoted to a staff escape hatch, same caption. NotebookView now
	 * mounts this rather than keeping its own copy.
	 *
	 * Photos are the point of every screen that shows them: one per row at
	 * full column width, never a thumbnail grid. `layout="strip"` is the ONE
	 * exception and it is not a contradiction of that -- see the prop.
	 *
	 * Since the pre-upload correction step, rows are grouped into LOGICAL
	 * PAGES (photoPages in notebook.ts): an original plus its adjacent
	 * 'enhanced' variant render as ONE page showing the corrected version by
	 * default, with a small toggle back to the original -- never as two
	 * separate pages. A page with only an original (every photo uploaded
	 * before correction existed) renders exactly as it always has.
	 *
	 * `label` is the entry's display title, used only to build the alt text
	 * (a multi-photo entry says which page). Ordering and grouping are
	 * properties of THIS component, not of how the caller fetched the rows.
	 */
	let {
		photos,
		label,
		lazy = true,
		layout = 'rows',
		viewerIndex = $bindable(null),
		onRemove
	}: {
		photos: NotebookPhoto[];
		label: string;
		/**
		 * `rows` (the default, and everywhere a page is READ): one page per row
		 * at full column width.
		 *
		 * `strip` is a row of page thumbnails, each opening the SAME full-screen
		 * viewer at that page. It is for a surface whose job is deciding whether
		 * to open a photograph rather than reading it -- the review console's
		 * entry panel, where the instructor is looking at a grid at the same
		 * time and the full-screen viewer is how handwriting actually gets read.
		 * Rendering pages full width there costs a scroll per student for a
		 * picture too small to read anyway.
		 *
		 * It is NOT a second renderer: same `photoPages` grouping, same viewer,
		 * same proxy. What it drops is the per-page chrome that only makes sense
		 * beside a full-size page (the corrected/original toggle, the filename,
		 * the remove control) -- the viewer carries the first two, and `strip` is
		 * never handed an `onRemove`.
		 */
		layout?: 'rows' | 'strip';
		/**
		 * WHICH PAGE THE FULL-SCREEN VIEWER IS ON; null is closed. Bindable so a
		 * KEYBOARD can open it: the review console's "Enter opens the pages" key
		 * has to reach the viewer from outside this component, and setting a
		 * number is a contract, where reaching in to click a thumbnail would be a
		 * DOM query across a component boundary.
		 */
		viewerIndex?: number | null;
		/**
		 * `loading="lazy"` is right in the student's long scrolling feed and
		 * wrong in the review panel, which mounts on demand and is expected to
		 * paint at once. (It is also why the dev harness's photos never
		 * request at all -- a non-compositing preview pane never fires the
		 * intersection observer.)
		 */
		lazy?: boolean;
		/**
		 * The one write this component makes (0116, notebook_remove_photo).
		 * OMITTED = no control at all -- the read-only-preview and instructor
		 * doctrine every other notebook transport follows: a control's presence
		 * is the presence of something to call it with, never a separate flag.
		 * The caller hands this in only when the viewer owns the entry and the
		 * surface is writable, so EntryReview (read-only, someone else's entry)
		 * simply never passes it.
		 */
		onRemove?: (photoId: string) => Promise<EntryActionResult>;
	} = $props();

	const pages = $derived(photoPages(photos));

	/*
	 * The full-screen viewer is opened by clicking a page's image, and `null` =
	 * closed. It used to be private state here; it is a bindable PROP now (see
	 * above) so a keyboard outside this component can open it. The default is
	 * still null, so every existing caller is unchanged and still owns nothing.
	 */

	/** Per-page "show me the original" choice, keyed by pageKey. */
	let showOriginal = $state<Record<string, boolean>>({});

	let broken = $state<Record<string, true>>({});
	/** Bumped per photo by "Try again"; rides the src as a cache-buster. */
	let retryTick = $state<Record<string, number>>({});

	function retry(photoId: string) {
		retryTick = { ...retryTick, [photoId]: (retryTick[photoId] ?? 0) + 1 };
		const { [photoId]: _dropped, ...rest } = broken;
		broken = rest;
	}

	function setVariant(key: string, original: boolean) {
		showOriginal = { ...showOriginal, [key]: original };
	}

	/** Which photo's remove is armed (two-step, the FolderManager convention). */
	let armed = $state<string | null>(null);
	let removing = $state<string | null>(null);
	let removeError = $state<Record<string, string>>({});

	async function remove(photoId: string) {
		if (!onRemove || removing) return;
		if (armed !== photoId) {
			armed = photoId;
			return;
		}
		removing = photoId;
		const { [photoId]: _dropped, ...rest } = removeError;
		removeError = rest;
		const result = await onRemove(photoId);
		removing = null;
		armed = null;
		if (!result.ok) removeError = { ...removeError, [photoId]: result.error };
	}
</script>

{#if pages.length && layout === 'strip'}
	<!--
		THE DECISION SURFACE. One thumbnail per logical page, each opening the
		same viewer at that page. It uses the proxy's THUMBNAIL variant
		(photoThumbSrc, the collapsed-feed route), so a panel that repaints on
		every arrow key press asks for kilobytes rather than for the megabytes a
		full page costs -- which is the same reason the collapsed feed exists.
	-->
	<ul class="page-strip" data-testid="photo-strip">
		{#each pages as page, pageIndex (pageKey(page))}
			{@const photo = pagePhoto(page, false)}
			<li>
				<button
					type="button"
					class="strip-page"
					data-testid="photo-open"
					onclick={() => (viewerIndex = pageIndex)}
					aria-label={pages.length > 1
						? `Open ${label}, page ${page.page}, full screen`
						: `Open ${label} full screen`}
				>
					{#if broken[photo.id]}
						<!-- Not a broken tile: the page is still openable, and the
						     viewer carries the retry and the Drive escape hatch. -->
						<span class="strip-fallback" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
								<rect x="3" y="5" width="18" height="14" rx="2" />
								<path d="M3 16l4.5-4.5 3 3L15 10l6 6" />
							</svg>
						</span>
					{:else}
						<img
							src={photoThumbSrc(photo.id)}
							alt=""
							loading={lazy ? 'lazy' : 'eager'}
							decoding="async"
							onerror={() => (broken = { ...broken, [photo.id]: true })}
						/>
					{/if}
					{#if pages.length > 1}<span class="strip-num" aria-hidden="true">{page.page}</span>{/if}
				</button>
			</li>
		{/each}
	</ul>
{:else if pages.length}
	<div class="photos">
		{#each pages as page, pageIndex (pageKey(page))}
			{@const key = pageKey(page)}
			{@const viewingOriginal = showOriginal[key] === true}
			{@const photo = pagePhoto(page, viewingOriginal)}
			{@const paired = page.original !== null && page.enhanced !== null}
			<figure class="photo" data-testid="photo-page">
				{#if broken[photo.id]}
					<!-- A proxied fetch can still fail for ordinary reasons (Drive
					     hiccup, revoked token), so the per-photo fallback stays --
					     it is just no longer the default outcome for every viewer. -->
					<div class="photo-missing">
						<p>This photo could not be loaded.</p>
						<div class="photo-missing-actions">
							<button type="button" class="btn secondary" onclick={() => retry(photo.id)}>
								Try again
							</button>
							<a
								class="drive-link"
								href={driveOpenUrl(photo.drive_file_id)}
								target="_blank"
								rel="noopener noreferrer">Open in Drive</a
							>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="photo-open"
						data-testid="photo-open"
						onclick={() => (viewerIndex = pageIndex)}
						aria-label={pages.length > 1
							? `Open ${label}, page ${page.page}, full screen`
							: `Open ${label} full screen`}
					>
						<img
							src={`${photoSrc(photo.id)}${retryTick[photo.id] ? `?r=${retryTick[photo.id]}` : ''}`}
							alt={pages.length > 1 ? `${label}, page ${page.page}` : label}
							loading={lazy ? 'lazy' : 'eager'}
							onerror={() => (broken = { ...broken, [photo.id]: true })}
						/>
					</button>
				{/if}
				<figcaption>
					{#if pages.length > 1}Page {page.page}{/if}
					{#if paired}
						<span class="variant-toggle" role="group" aria-label="Photo version">
							<button
								type="button"
								class:on={!viewingOriginal}
								aria-pressed={!viewingOriginal}
								onclick={() => setVariant(key, false)}>Corrected</button
							>
							<button
								type="button"
								class:on={viewingOriginal}
								aria-pressed={viewingOriginal}
								onclick={() => setVariant(key, true)}>Original</button
							>
						</span>
					{:else if photo.variant === 'enhanced'}
						<span class="variant">corrected</span>
					{/if}
					{#if photo.original_filename}
						<span class="filename">{photo.original_filename}</span>
					{/if}
					{#if onRemove}
						<button
							type="button"
							class="photo-remove"
							data-testid="photo-remove"
							disabled={removing === photo.id}
							onclick={() => remove(photo.id)}
						>
							{removing === photo.id
								? 'Removing...'
								: armed === photo.id
									? 'Confirm remove'
									: 'Remove'}
						</button>
						{#if armed === photo.id}
							<button type="button" class="photo-remove-cancel" onclick={() => (armed = null)}>
								Cancel
							</button>
						{/if}
					{/if}
					{#if onRemove && removeError[photo.id]}
						<span class="photo-remove-error" role="alert" data-testid="photo-remove-error">
							{removeError[photo.id]}
						</span>
					{/if}
				</figcaption>
			</figure>
		{/each}
	</div>
{/if}

<PhotoViewer
	{pages}
	index={viewerIndex}
	{label}
	onIndex={(i) => (viewerIndex = i)}
	onClose={() => (viewerIndex = null)}
/>

<style>
	/* --- layout="strip" ----------------------------------------------------
	   A row of page thumbnails that WRAPS rather than scrolling sideways: a
	   horizontal scroller inside a panel inside a pane is a third bar in one
	   corner of the screen, and an entry has single-figure pages, so wrapping
	   costs at most a second row.

	   4.5rem is a real measurement, not a round number: below it the page
	   number stops being legible against a photograph of a page, and a
	   handwritten sketch stops being distinguishable from a block of text --
	   which is the only judgement this tile has to support.
	   ---------------------------------------------------------------------- */
	.page-strip {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
	}
	.strip-page {
		position: relative;
		display: block;
		width: 4.5rem;
		height: 4.5rem;
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
		overflow: hidden;
		cursor: pointer;
		color: var(--text-3);
	}
	.strip-page:hover,
	.strip-page:focus-visible {
		outline: none;
		border-color: var(--nb-accent);
		box-shadow: 0 0 0 2px var(--nb-accent-wash);
	}
	.strip-page img {
		width: 100%;
		height: 100%;
		/* COVER, like the feed's tile and for the tile's reason: letterboxing a
		   page into 72px spends most of it on nothing. The viewer is where a
		   page is read, and it uses contain. */
		object-fit: cover;
		display: block;
	}
	.strip-fallback {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
	}
	.strip-fallback svg {
		width: 42%;
		height: 42%;
	}
	.strip-num {
		position: absolute;
		right: 2px;
		bottom: 2px;
		min-width: 1rem;
		padding: 0.1em 0.3em;
		border-radius: var(--radius-card);
		background: rgba(38, 34, 27, 0.72);
		color: #fff;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		line-height: 1.1;
	}

	/* Editorial framing: the photo floats on paper with a hairline frame and
	   a wider gap between pages; captions are quiet gray sans. */
	.photos {
		display: grid;
		gap: var(--space-5);
	}
	.photo {
		margin: 0;
	}
	.photo-open {
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		text-align: left;
		cursor: zoom-in;
		border-radius: var(--radius-card);
	}
	.photo-open:focus-visible {
		outline: 2px solid var(--nb-accent-ink);
		outline-offset: 2px;
	}
	.photo img {
		display: block;
		width: 100%;
		height: auto;
		/* Reserved height: Drive can be slow, and an image still in flight has
		   no intrinsic size, so without this the frame collapses to a hairline
		   and the feed jumps as each photo lands. */
		min-height: 12rem;
		max-height: 40rem;
		object-fit: contain;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.photo-missing {
		display: grid;
		gap: var(--space-2);
		justify-items: start;
		padding: var(--space-4);
		border: 1px dashed var(--nb-hairline-strong);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		color: var(--text-2);
		font-size: 0.87rem;
	}
	.photo-missing p {
		margin: 0;
	}
	.photo-missing-actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		flex-wrap: wrap;
	}
	.drive-link {
		font-size: 0.76rem;
		color: var(--text-3);
	}
	.drive-link:hover {
		color: var(--nb-accent-ink);
	}
	figcaption {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: center;
		margin-top: var(--space-2);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-3);
	}
	.variant {
		color: var(--nb-accent-ink);
	}
	.variant-toggle {
		display: inline-flex;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		overflow: hidden;
		background: var(--surface-1);
	}
	.variant-toggle button {
		background: none;
		border: none;
		padding: var(--space-1) var(--space-2);
		font: inherit;
		color: var(--text-3);
		cursor: pointer;
	}
	/* Gold marks the active segment, the platform's one accent thread. */
	.variant-toggle button.on {
		color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		font-weight: 600;
	}
	.filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22rem;
	}
	.photo-remove {
		margin-left: auto;
		min-height: 2.75rem;
		min-width: 2.75rem;
		padding: 0 var(--space-3);
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		color: var(--nb-error);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		cursor: pointer;
	}
	.photo-remove:hover:not(:disabled) {
		border-color: var(--nb-error);
	}
	.photo-remove:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.photo-remove-cancel {
		min-height: 2.75rem;
		min-width: 2.75rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 var(--space-2);
		border: none;
		background: none;
		color: var(--nb-accent-ink);
		font: inherit;
		font-size: 0.74rem;
		font-weight: 600;
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.photo-remove-error {
		flex-basis: 100%;
		font-size: 0.78rem;
		color: var(--nb-error);
	}
</style>
