<script lang="ts">
	import type { ZipSurvey } from '$lib/classroom/gallery-zip';
	import { pictureCount } from '$lib/classroom/gallery-zip';
	import { formatBytes } from '$lib/classroom/classroom';

	/**
	 * WHAT IS THIS ZIP? THE TEACHER SAYS (ledger 0297, package ITEM; report 23).
	 *
	 * "maybe when I upload something I should specify if it's a presentation or
	 * an image gallery." A zip is a presentation (a Claude Design export the deck
	 * viewer serves), a gallery (pictures that become ordinary attachments and
	 * open in the lightbox), or just a file to hand out -- and nothing in the
	 * bytes says which the teacher meant. So the answer is a choice between
	 * worded buttons, never a paragraph and never a guess.
	 *
	 * ONE COMPONENT, TWO DOORS: the composer (a zip dropped anywhere on the form,
	 * or picked in its presentation box) and the item page's deck panel (a zip
	 * for an item that already exists). Each door hands in only the choices it
	 * can carry out, and an ABSENT handler removes its button. A choice the zip
	 * itself rules out (no web page, no pictures) is absent too, with the reason
	 * in its place -- a control that is absent for a reason says the reason.
	 *
	 * THE SURVEY IS READ FROM THE ZIP'S DIRECTORY BEFORE ANYTHING IS ASKED, so
	 * the Gallery button can say how many pictures it will add. Nothing is
	 * unpacked or uploaded until a button is pressed.
	 */
	let {
		file,
		survey,
		issue = null,
		working = null,
		onpresentation = null,
		presentationUnavailable = null,
		ongallery = null,
		onattach = null,
		oncancel
	}: {
		file: File;
		/** null while the directory is still being read. */
		survey: ZipSurvey | null;
		/** Why the zip cannot be read at all (too large, not a zip). */
		issue?: string | null;
		/** A running action's progress line; the buttons stand down while set. */
		working?: string | null;
		onpresentation?: (() => void) | null;
		/** Why the door cannot take a presentation right now, when that is
		 *  about the door rather than the zip (a deck already staged). */
		presentationUnavailable?: string | null;
		ongallery?: (() => void) | null;
		onattach?: (() => void) | null;
		oncancel: () => void;
	} = $props();

	const pictures = $derived(survey?.pictures.length ?? 0);
	const canPresent = $derived(
		!!onpresentation && !presentationUnavailable && !!survey && survey.hasPage
	);
	const canGallery = $derived(!!ongallery && pictures > 0);
	/** The reasons, only for a choice this door offers and the zip rules out. */
	const reasons = $derived.by(() => {
		const out: string[] = [];
		if (!survey || issue) return out;
		if (onpresentation) {
			if (presentationUnavailable) out.push(presentationUnavailable);
			else if (!survey.hasPage) out.push('No web page inside, so it cannot be a presentation.');
		}
		if (ongallery && pictures === 0) out.push('No pictures inside, so it cannot be a gallery.');
		return out;
	});
</script>

<div class="zip-choice" role="group" aria-label={`What is ${file.name}?`} data-testid="zip-choice">
	<p class="zip-line">
		<span class="zip-name">{file.name}</span>
		<span class="zip-meta">
			{formatBytes(file.size)}{#if survey && !issue} &middot; {pictureCount(pictures)}{/if}
		</span>
	</p>
	{#if issue}
		<p class="feedback error" data-testid="zip-choice-issue">{issue}</p>
		<div class="zip-actions">
			<button type="button" class="btn secondary zip-btn quiet" data-testid="zip-choice-dismiss" onclick={oncancel}>
				Dismiss
			</button>
		</div>
	{:else if !survey}
		<p class="zip-reading" role="status">Reading the zip&hellip;</p>
	{:else if working}
		<p class="zip-reading" role="status" data-testid="zip-choice-working">{working}</p>
	{:else}
		<div class="zip-actions">
			{#if canPresent}
				<button type="button" class="btn secondary zip-btn" data-testid="zip-choice-presentation" onclick={() => onpresentation?.()}>
					Presentation
				</button>
			{/if}
			{#if canGallery}
				<button type="button" class="btn secondary zip-btn" data-testid="zip-choice-gallery" onclick={() => ongallery?.()}>
					Image gallery ({pictureCount(pictures)})
				</button>
			{/if}
			{#if onattach}
				<button type="button" class="btn secondary zip-btn" data-testid="zip-choice-attach" onclick={() => onattach?.()}>
					Attach the zip as a file
				</button>
			{/if}
			<button type="button" class="btn secondary zip-btn quiet" data-testid="zip-choice-cancel" onclick={oncancel}>
				Cancel
			</button>
		</div>
		{#each reasons as r (r)}
			<p class="zip-why" data-testid="zip-choice-why">{r}</p>
		{/each}
	{/if}
</div>

<style>
	.zip-choice {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2, var(--bg2));
		min-width: 0;
	}
	.zip-line {
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
		min-width: 0;
	}
	.zip-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.zip-meta {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.zip-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	/* 44px: a composer control, and the composer is held to the student floor
	   (it declares no instructor density). */
	.zip-btn {
		min-height: 44px;
	}
	.zip-btn.quiet {
		color: var(--text-2);
	}
	.zip-reading,
	.zip-why {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}
	.feedback {
		margin: 0;
	}
</style>
