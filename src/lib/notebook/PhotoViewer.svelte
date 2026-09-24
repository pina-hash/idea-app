<script lang="ts">
	/**
	 * Full-screen photo viewer, mounted by NotebookPhotos so it appears wherever
	 * that component does -- the student feed, the instructor review panel, the
	 * per-student staff page, and the view-as preview alike. There is exactly one
	 * of these per NotebookPhotos instance; NotebookPhotos owns which page (if
	 * any) is open and hands it down as `index`.
	 *
	 * IT IS A THIN WRAPPER OVER THE CLASSROOM LIGHTBOX NOW (ledger 0297, package
	 * ITEM). This file was the first lightbox in the app and carried the whole
	 * viewer: the native <dialog>, the panzoom wiring gated on the dialog being
	 * laid out, the fit, the paging and the error card. Every classroom picture
	 * needed the same thing, and a second copy would have been a second set of
	 * zoom arithmetic and a second keyboard map, so the viewer moved to
	 * `$lib/media/Lightbox.svelte` and this file keeps only what is the
	 * notebook's: which photo a PAGE shows, the Corrected / Original switch for
	 * a page that has both, and the Drive link as the fallback when a photo will
	 * not load. Its props are unchanged, so NotebookPhotos did not move.
	 *
	 * What it gained in the move: a Download control (the same proxy URL the
	 * picture came from), worded controls instead of bare glyphs, and a
	 * single-pointer way to pan a zoomed page.
	 *
	 * THE NOTEBOOK'S BRASS reaches the lightbox through its `--lb-accent` room
	 * hook, declared on this wrapper rather than inside the lightbox, so the
	 * classroom's callers keep their own accent.
	 */
	import Lightbox from '$lib/media/Lightbox.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import {
		displayPhotoName,
		driveOpenUrl,
		pageKey,
		pagePhoto,
		photoSrc,
		type PhotoPage
	} from '$lib/notebook';

	let {
		pages,
		index,
		label,
		onIndex,
		onClose
	}: {
		pages: PhotoPage[];
		/** null = closed. A valid index into `pages` opens the dialog on that page. */
		index: number | null;
		/** The entry's display title, used for the alt text and the caption. */
		label: string;
		onIndex: (i: number) => void;
		onClose: () => void;
	} = $props();

	let showOriginal = $state<Record<string, boolean>>({});

	const currentPage = $derived<PhotoPage | null>(index !== null ? (pages[index] ?? null) : null);
	const currentKey = $derived(currentPage ? pageKey(currentPage) : null);
	const viewingOriginal = $derived(currentKey ? showOriginal[currentKey] === true : false);
	const paired = $derived(
		currentPage ? currentPage.original !== null && currentPage.enhanced !== null : false
	);

	function setVariant(original: boolean) {
		if (!currentKey) return;
		showOriginal = { ...showOriginal, [currentKey]: original };
	}

	/**
	 * EVERY PAGE AS A PICTURE, each showing the variant its own switch is on.
	 * The key is the PAGE (`pageKey`), so paging keeps a page's choice; the src
	 * changing under the same key is what makes the lightbox refit on a swap.
	 */
	const images = $derived<LightboxImage[]>(
		pages.map((p) => {
			const key = pageKey(p);
			const photo = pagePhoto(p, showOriginal[key] === true);
			const alt = pages.length > 1 ? `${label}, page ${p.page}` : label;
			const name = photo.original_filename?.trim();
			return {
				key,
				src: photoSrc(photo.id),
				alt,
				caption: pages.length > 1 ? `${label}, page ${p.page}` : label,
				downloadHref: photoSrc(photo.id),
				downloadName: name ? displayPhotoName(name) : `${label} page ${p.page}.jpg`,
				openHref: driveOpenUrl(photo.drive_file_id),
				openLabel: 'Open in Drive'
			};
		})
	);
</script>

<div class="pv-room">
	<Lightbox {images} {index} {label} {onIndex} {onClose} testId="photo-viewer">
		{#snippet controls()}
			{#if paired}
				<span class="pv-variant-toggle" role="group" aria-label="Photo version">
					<button
						type="button"
						class:on={!viewingOriginal}
						aria-pressed={!viewingOriginal}
						onclick={() => setVariant(false)}>Corrected</button
					>
					<button
						type="button"
						class:on={viewingOriginal}
						aria-pressed={viewingOriginal}
						onclick={() => setVariant(true)}>Original</button
					>
				</span>
			{/if}
		{/snippet}
	</Lightbox>
</div>

<style>
	/* `display: contents` takes no box; it exists to carry the room hook down
	   to the dialog by inheritance. */
	.pv-room {
		display: contents;
		--lb-accent: var(--nb-accent-ink);
	}
	.pv-variant-toggle {
		display: inline-flex;
		align-items: stretch;
		min-height: 2.75rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		overflow: hidden;
		background: var(--surface-2);
	}
	.pv-variant-toggle button {
		display: inline-flex;
		align-items: center;
		min-height: 2.75rem;
		background: none;
		border: none;
		padding: 0 var(--space-4);
		font: inherit;
		font-size: 0.8rem;
		color: var(--text-2);
		cursor: pointer;
	}
	.pv-variant-toggle button.on {
		color: var(--nb-accent-ink);
		background: var(--nb-accent-wash);
		font-weight: 600;
	}
</style>
