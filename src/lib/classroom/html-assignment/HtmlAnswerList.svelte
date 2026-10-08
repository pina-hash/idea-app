<script lang="ts">
	/**
	 * ONE STUDENT'S WORKSHEET ANSWERS, READ STRAIGHT FROM THEIR SAVED WORK, grouped
	 * the way the manifest groups its blocks.
	 *
	 * ONE RENDERER, TWO MOUNTS (ledger 0360). It was the inline markup of
	 * `HtmlGradingWork`'s not-published branch (ledger 0278), where it stood in for
	 * a document `/hx/` will not serve. Report 41c7fcd5 asked for exactly this
	 * view on a LIVE worksheet too -- "just the questions and answers ... in a
	 * more compact area" -- so the markup moved here and both the not-published
	 * branch and the console's Answers view mount it. A second copy would be two
	 * ideas of what a skipped question looks like.
	 *
	 * IT READS NO DOCUMENT. `hxFrameSeed` builds the same map the document would
	 * have been seeded with, from the stored rows and the stored manifest, and
	 * `htmlAnswerSheet` groups it. Nothing here asks `/hx/` for anything, which is
	 * what lets the Answers view switch students without a document request.
	 *
	 * A block's `prompt` display key is the question when the author declared
	 * one, with the field in small type under it; otherwise the field is the
	 * label, exactly as before. Links in an answer get an Open key.
	 *
	 * A HANDED-IN FILE OPENS AND DOWNLOADS HERE TOO (ledger 0368). The line
	 * naming it stays, word for word; beside it a picture gets an Enlarge
	 * thumbnail into the classroom Lightbox, and every file a worded Download to
	 * the same proxy URL. Picture or file is `isImageFilename`, the one rule, and
	 * a thumbnail that will not decode falls back to the Download alone.
	 */
	import { hxFrameSeed } from './answers';
	import { htmlAnswerSheet, htmlAnswerText } from './mount';
	import type { HtmlAssignmentManifest } from './manifest';
	import type { StudentWork } from '$lib/classroom/assignment-spec';
	import AnswerLinks from '$lib/classroom/AnswerLinks.svelte';
	import { cellLinks } from '$lib/classroom/answer-links';
	import { tableRowsText, worksheetTableRows } from '$lib/classroom/grading-export';
	import { isImageFilename } from '$lib/classroom/classroom';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import EnlargeCue from '$lib/media/EnlargeCue.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import type { HxImageState } from './bridge';

	let {
		manifest,
		student,
		label = null,
		testId = 'answers-without-document'
	}: {
		manifest: HtmlAssignmentManifest | null;
		student: StudentWork;
		/** The line over the list; null prints the default sentence. */
		label?: string | null;
		testId?: string;
	} = $props();

	const seed = $derived(hxFrameSeed(manifest, student.responses, student.files));
	const sheet = $derived(manifest ? htmlAnswerSheet(manifest, seed.values, seed.images) : []);

	/** Keyed on the URL, as the frame keys it: a replaced file is tried afresh. */
	let broken = $state<Record<string, true>>({});
	function isPicture(image: HxImageState): boolean {
		return isImageFilename(image.name) && !broken[image.url];
	}
	/** Every decodable picture on the sheet, in the sheet's own order. */
	const pictures = $derived(
		sheet.flatMap((g) => g.cells.map((c) => c.image)).filter((im): im is HxImageState => !!im && isPicture(im))
	);
	const lightboxImages = $derived<LightboxImage[]>(
		pictures.map((im) => ({
			key: im.url,
			src: im.url,
			alt: im.caption || im.name,
			caption: im.caption ? `${im.caption} (${im.name})` : im.name,
			downloadHref: im.url,
			downloadName: im.name
		}))
	);
	let openAt = $state<number | null>(null);
	/* The viewer is mounted only while there is a picture, so an open index
	   left behind when the last one goes would reopen it unbidden on the next. */
	$effect(() => {
		if (!lightboxImages.length) openAt = null;
	});
	function openPicture(image: HxImageState) {
		const at = pictures.findIndex((p) => p.url === image.url);
		if (at >= 0) openAt = at;
	}

	/** A table answer as rows of words, the CSV's own reading, never raw JSON. */
	function answerOf(type: string, value: string | boolean | null): string | null {
		if (type === 'table' && typeof value === 'string' && value !== '') {
			const table = worksheetTableRows(value);
			if (table.raw !== null) return table.raw;
			return tableRowsText(table.columns, table.rows).replace(/; Row /g, '\nRow ');
		}
		return htmlAnswerText(value);
	}
</script>

{#if sheet.length}
	<div class="answers card" data-testid={testId}>
		<p class="answers-label">
			{label ?? `What ${student.displayName} has written, read straight from their saved work`}
		</p>
		{#each sheet as group (group.moduleId ?? 'header')}
			<section class="answers-group">
				<h3 class="answers-group-head">{group.title}</h3>
				<dl class="answers-list">
					{#each group.cells as cell (cell.blockId)}
						{@const text = answerOf(cell.type, cell.value)}
						{@const links = cellLinks(cell, group.title)}
						<dt class="answers-field" class:prompted={!!cell.prompt}>
							{#if cell.prompt}
								<span class="answers-prompt">{cell.prompt}</span>
								<span class="answers-field-name">{cell.field}</span>
							{:else}
								{cell.field}
							{/if}
						</dt>
						<dd class="answers-value" class:empty={text === null || text === ''}>
							<!-- A BLOCK THE STUDENT LEFT ALONE SAYS SO, and it is a
							     different sentence from one they opened and cleared:
							     "skipped question 4" and "question 4 is not on this
							     worksheet" are what a grader is telling apart here, so
							     an empty block is reported rather than dropped. -->
							{#if text === null}
								<span class="answers-none">No answer saved</span>
							{:else if text === ''}
								<span class="answers-none">Left blank</span>
							{:else}
								{text}
							{/if}
							{#if cell.image}
								{@const image = cell.image}
								<span class="answers-image" data-testid="answers-image">
									Photo: {image.name}{image.caption ? `, ${image.caption}` : ''}
								</span>
								<span class="answers-image-actions">
									{#if isPicture(image)}
										<button
											type="button"
											class="answers-image-open"
											aria-label="Open {image.caption || image.name} larger"
											data-testid="answers-image-open"
											onclick={() => openPicture(image)}
										>
											<img
												src={image.url}
												alt={image.caption || image.name}
												loading="eager"
												onerror={() => (broken = { ...broken, [image.url]: true })}
											/>
											<EnlargeCue />
										</button>
									{/if}
									<a
										class="answers-image-download"
										href={image.url}
										download={image.name}
										data-testid="answers-image-download">Download</a
									>
								</span>
							{/if}
							{#if links.length}
								<span class="answers-links">
									<AnswerLinks {links} showLabel={false} testId="answers-cell-links" />
								</span>
							{/if}
						</dd>
					{/each}
				</dl>
			</section>
		{/each}
	</div>
	{#if lightboxImages.length}
		<Lightbox
			images={lightboxImages}
			index={openAt}
			label="Photos in these answers"
			onIndex={(n) => (openAt = n)}
			onClose={() => (openAt = null)}
			testId="answers-lightbox"
		/>
	{/if}
{/if}

<style>
	.answers {
		margin: var(--space-2) 0 0;
	}
	.answers-label {
		margin: 0 0 var(--space-2);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.answers-group + .answers-group {
		margin-top: var(--space-3);
	}
	.answers-group-head {
		margin: 0 0 var(--space-2);
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	/* TWO COLUMNS ABOVE A NARROW PANE AND ONE BELOW IT, from the content rather
	   than from a round number: a `field` is one hyphenated token and the answer
	   beside it is a sentence or a paragraph, so the label column is sized to the
	   longest token and the value takes the rest. `minmax(0, 1fr)` on the value so
	   a long unbroken string cannot push the pane wider than the column. A
	   PROMPT is a sentence, so the label column is capped at a third of the row
	   and a prompted label wraps inside it. */
	.answers-list {
		display: grid;
		grid-template-columns: minmax(0, min(max-content, 33%)) minmax(0, 1fr);
		gap: var(--space-1) var(--space-2);
		margin: 0;
	}
	@media (max-width: 40rem) {
		.answers-list {
			grid-template-columns: minmax(0, 1fr);
			gap: 0 0;
		}
		.answers-field {
			margin-top: var(--space-2);
		}
	}
	.answers-field {
		margin: 0;
		min-width: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.answers-field.prompted {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.answers-prompt {
		font-family: var(--font-display);
		font-size: 0.82rem;
		line-height: 1.35;
		color: var(--text-1);
	}
	.answers-field-name {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.answers-value {
		margin: 0;
		min-width: 0;
		/* THE STUDENT'S OWN LINE BREAKS SURVIVE. A long-answer block is stored as
		   typed, and collapsing it to one paragraph is a grader reading something
		   the student did not write. */
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-1);
	}
	/* NOT COLOUR ALONE and not below the text threshold: an unanswered block is a
	   WORD ("No answer saved"), and this only tilts the tier it is read at. */
	.answers-none {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.answers-image {
		display: block;
		margin-top: var(--space-1);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	/* `white-space: normal` because the answer cell above is `pre-wrap`, and
	   the markup's own spacing between these keys is not the student's. */
	.answers-image-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-2);
		margin-top: var(--space-1);
		white-space: normal;
	}
	.answers-image-open {
		position: relative;
		width: 6rem;
		height: 6rem;
		margin: 0;
		padding: 0;
		border: 1px solid var(--hairline, var(--boundary));
		border-radius: var(--radius-sm, 4px);
		overflow: hidden;
		background: var(--surface-2);
		color: inherit;
		font: inherit;
		line-height: 0;
		cursor: zoom-in;
	}
	.answers-image-open img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.answers-image-open:focus-visible,
	.answers-image-download:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	/* 44px in every density, as the frame's own Download is: the Answers view
	   and the not-published notice are a grader's, but the rule is one rule. */
	.answers-image-download {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0 0.9rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: 999px;
		text-decoration: none;
	}
	.answers-image-download:hover {
		color: var(--hover-ink, var(--text-1));
		text-decoration: none;
	}
	.answers-links {
		display: block;
		margin-top: var(--space-1);
		white-space: normal;
	}
</style>
