<script lang="ts">
	import { driveOpenUrl, photoSrc, type NotebookPhoto } from '$lib/notebook';

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
	 * `label` is the entry's display title, used only to build the alt text
	 * (a multi-photo entry says which page). Ordering is a property of THIS
	 * component (orderedPhotos), not of how the caller happened to fetch the
	 * rows.
	 */
	let {
		photos,
		label,
		lazy = true
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
	} = $props();

	/** Upload order, so a multi-page entry reads page 1 first. */
	const ordered = $derived([...photos].sort((a, b) => a.sequence_order - b.sequence_order));

	let broken = $state<Record<string, true>>({});
	/** Bumped per photo by "Try again"; rides the src as a cache-buster. */
	let retryTick = $state<Record<string, number>>({});

	function retry(photoId: string) {
		retryTick = { ...retryTick, [photoId]: (retryTick[photoId] ?? 0) + 1 };
		const { [photoId]: _dropped, ...rest } = broken;
		broken = rest;
	}
</script>

{#if ordered.length}
	<div class="photos">
		{#each ordered as photo (photo.id)}
			<figure class="photo">
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
						alt={ordered.length > 1 ? `${label}, page ${photo.sequence_order}` : label}
						loading={lazy ? 'lazy' : 'eager'}
						onerror={() => (broken = { ...broken, [photo.id]: true })}
					/>
				{/if}
				<figcaption>
					{#if ordered.length > 1}Page {photo.sequence_order}{/if}
					{#if photo.variant === 'enhanced'}<span class="variant">enhanced</span>{/if}
					{#if photo.original_filename}
						<span class="filename">{photo.original_filename}</span>
					{/if}
				</figcaption>
			</figure>
		{/each}
	</div>
{/if}

<style>
	.photos {
		display: grid;
		gap: 0.9rem;
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
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 6px;
	}
	.photo-missing {
		display: grid;
		gap: 0.6rem;
		justify-items: start;
		padding: 1.2rem;
		border: 1px dashed var(--line);
		border-radius: 6px;
		background: var(--bg1);
		color: var(--dim);
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
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.drive-link:hover {
		color: var(--cyan);
	}
	figcaption {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--dim);
	}
	.variant {
		color: var(--cyan);
	}
	.filename {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		max-width: 22rem;
	}
</style>
