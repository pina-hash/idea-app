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
	 * full column width, never a thumbnail grid.
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
		onRemove
	}: {
		photos: NotebookPhoto[];
		label: string;
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

{#if pages.length}
	<div class="photos">
		{#each pages as page (pageKey(page))}
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
					<img
						src={`${photoSrc(photo.id)}${retryTick[photo.id] ? `?r=${retryTick[photo.id]}` : ''}`}
						alt={pages.length > 1 ? `${label}, page ${page.page}` : label}
						loading={lazy ? 'lazy' : 'eager'}
						onerror={() => (broken = { ...broken, [photo.id]: true })}
					/>
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

<style>
	/* Editorial framing: the photo floats on paper with a hairline frame and
	   a wider gap between pages; captions are quiet gray sans. */
	.photos {
		display: grid;
		gap: 1.4rem;
	}
	.photo {
		margin: 0;
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
		background: var(--nb-surface-dim);
		border: 1px solid var(--nb-hairline);
		border-radius: 8px;
	}
	.photo-missing {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		padding: 1.2rem;
		border: 1px dashed var(--nb-hairline-strong);
		border-radius: 8px;
		background: var(--nb-surface-dim);
		color: var(--nb-ink-soft);
		font-size: 0.87rem;
	}
	.photo-missing p {
		margin: 0;
	}
	.photo-missing-actions {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		flex-wrap: wrap;
	}
	.drive-link {
		font-size: 0.76rem;
		color: var(--nb-ink-faint);
	}
	.drive-link:hover {
		color: var(--nb-accent-ink);
	}
	figcaption {
		display: flex;
		gap: 0.55rem;
		flex-wrap: wrap;
		align-items: center;
		margin-top: 0.4rem;
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums;
		color: var(--nb-ink-faint);
	}
	.variant {
		color: var(--nb-accent-ink);
	}
	.variant-toggle {
		display: inline-flex;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: 999px;
		overflow: hidden;
		background: var(--nb-surface);
	}
	.variant-toggle button {
		background: none;
		border: none;
		padding: 0.12rem 0.6rem;
		font: inherit;
		color: var(--nb-ink-faint);
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
		padding: 0 0.7rem;
		border: 1px solid var(--nb-hairline-strong);
		border-radius: var(--nb-radius-control);
		background: var(--nb-surface);
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
		padding: 0 0.5rem;
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
