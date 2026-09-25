<script lang="ts">
	import { fileKindLabel, formatBytes } from '$lib/classroom/classroom';
	import {
		isSubmissionFileImage,
		submissionFileSrc,
		type SubmissionFileRow
	} from '$lib/classroom/assignment-spec';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import EnlargeCue from '$lib/media/EnlargeCue.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';

	/**
	 * The plain (non-block) hand-in files on a submission: image thumbnail with
	 * expand-to-full-view on click, a clear type badge for anything else. The
	 * AttachmentList convention applied to SubmissionFileRow -- ONE renderer, so
	 * a student's own "Extra files" list and a teacher's "Files handed in" list
	 * in the grading console can never drift into showing different things.
	 */
	let {
		files,
		onremove = null,
		removing = null,
		emptyText = 'Nothing attached yet.'
	}: {
		files: SubmissionFileRow[];
		/** Teacher/student-editable only; omitted entirely on read-only views. */
		onremove?: ((f: SubmissionFileRow) => void) | null;
		removing?: string | null;
		emptyText?: string;
	} = $props();

	// A broken fetch is an ordinary outcome (an expired session, a Drive
	// hiccup), so a failed image falls back to the file row rather than a
	// broken-image glyph.
	let broken = $state<Record<string, boolean>>({});

	/**
	 * THE PICTURES ON THIS LIST OPEN LARGE (ledger 0297, package ITEM). A
	 * thumbnail was a link to the proxy in a new tab, which answers
	 * `Content-Disposition: attachment`, so "look closer" downloaded the photo.
	 * The grading console mounts this same list for "Files handed in", so a
	 * teacher reading a photographed page gets the same zoom a student does.
	 */
	const pictures = $derived(files.filter((f) => isSubmissionFileImage(f) && !broken[f.id]));
	const lightboxImages = $derived<LightboxImage[]>(
		pictures.map((f) => ({
			key: f.id,
			src: submissionFileSrc(f.id),
			alt: f.caption ?? f.filename,
			caption: f.caption ? `${f.caption} (${f.filename})` : f.filename,
			downloadHref: submissionFileSrc(f.id),
			downloadName: f.filename
		}))
	);
	let openAt = $state<number | null>(null);
	function openPicture(f: SubmissionFileRow) {
		const at = pictures.findIndex((p) => p.id === f.id);
		if (at >= 0) openAt = at;
	}
</script>

{#if files.length}
	<ul class="file-list">
		{#each files as f (f.id)}
			<li class="file-row" class:image={isSubmissionFileImage(f) && !broken[f.id]}>
				{#if isSubmissionFileImage(f) && !broken[f.id]}
					<button
						type="button"
						class="file-preview"
						aria-label={`Open ${f.caption ?? f.filename} larger`}
						data-testid="submission-file-preview"
						onclick={() => openPicture(f)}
					>
						<img
							src={submissionFileSrc(f.id)}
							alt={f.caption ?? f.filename}
							loading="lazy"
							onerror={() => (broken = { ...broken, [f.id]: true })}
						/>
						<EnlargeCue />
					</button>
				{/if}
				<span class="file-meta">
					<a class="file-name" href={submissionFileSrc(f.id)} target="_blank" rel="noopener noreferrer">
						{#if !isSubmissionFileImage(f) || broken[f.id]}
							<span class="file-glyph" aria-hidden="true">{fileKindLabel(f.filename, f.mime_type)}</span>
						{/if}
						{f.filename}
					</a>
					{#if f.size_bytes}<span class="file-size">{formatBytes(f.size_bytes)}</span>{/if}
					{#if onremove}
						<button
							type="button"
							class="file-remove"
							disabled={removing === f.id}
							onclick={() => onremove?.(f)}
						>
							{removing === f.id ? 'Removing...' : 'Remove'}
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
{:else}
	<p class="note">{emptyText}</p>
{/if}

{#if lightboxImages.length}
	<Lightbox
		images={lightboxImages}
		index={openAt}
		label="Files handed in"
		onIndex={(n) => (openAt = n)}
		onClose={() => (openAt = null)}
		testId="submission-lightbox"
	/>
{/if}

<style>
	.file-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.file-row {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	/* `align-self: flex-start` IS WHAT STOPS THE FRAME STANDING WIDER THAN THE
	   PICTURE, and it is the fix MarkdownText's print block already found by
	   measuring (a 1202x1202 square in a stretched box: 846x384 before, 384x384
	   after). `.file-row` is a flex COLUMN, so the default stretch alignment sizes
	   this wrapper to the whole row while the img inside it -- `width: auto`,
	   `height: auto` -- shrinks to its own intrinsic size. The wrapper draws a
	   border and a `--surface-2` ground, so what is left over is a bordered
	   empty panel beside the hand-in. Measured at 1440 before the change: a
	   600x900 image sat 234.7px wide inside a 1406px frame, 1171.3px of panel;
	   a 200x150 one, 1206px.

	   The border and the background stay: they are what says where a picture
	   ends against the plate. They are drawn around the picture now. */
	.file-preview {
		display: block;
		align-self: flex-start;
		max-width: 100%;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface-2);
		line-height: 0;
		/* A <button> now (it opens the lightbox), so its own UA chrome goes. */
		appearance: none;
		position: relative;
		padding: 0;
		margin: 0;
		color: inherit;
		font: inherit;
		cursor: zoom-in;
	}
	.file-preview:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.file-preview img {
		display: block;
		max-width: 100%;
		max-height: 22rem;
		width: auto;
		height: auto;
		object-fit: contain;
	}
	.file-meta {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.file-name {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--text-1);
		text-decoration: none;
		font-size: 0.88rem;
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.file-name:hover {
		color: var(--hover-ink);
	}
	.file-glyph {
		flex: none;
		display: inline-flex;
		align-items: center;
		height: 1.3rem;
		padding: 0 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--gold);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
	}
	.file-size {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.file-remove {
		appearance: none;
		background: none;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		color: var(--crimson);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
	}
	.file-remove:disabled {
		color: var(--text-3);
		cursor: default;
	}
	.note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
</style>
