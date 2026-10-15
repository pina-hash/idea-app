<script lang="ts">
	/**
	 * What a student handed in, drawn for a certifier: the text, every link
	 * (opening in a new tab with the word Open, because an external link in
	 * the same tab loses the review), the YouTube video EMBEDDED (never a new
	 * tab) with the continuous-take note on a checkout, every picture as a
	 * tile opening `$lib/media/Lightbox.svelte`, every other file as a 44px
	 * download row through the evidence route (an attachment, never inline),
	 * and the self-inspection answers.
	 *
	 * Picture or file is `isImageFilename`, the classroom's one rule, read off
	 * the stored name; a picture that will not decode falls back to its
	 * download row through the img's own onerror.
	 */
	import Lightbox from '$lib/media/Lightbox.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import { isImageFilename } from '$lib/classroom/classroom';
	import type { CertEvidence, CertEvidenceFile, SelfInspectionAnswer } from '$lib/certifications/types';
	import { evidenceHref, youtubeEmbedUrl } from './desk';

	let {
		evidence,
		selfInspection = [],
		checkout = false,
		label = 'Evidence',
		inPerson = false,
		srcOf = (f) => evidenceHref(f.path, f.name)
	}: {
		evidence: CertEvidence | null;
		selfInspection?: SelfInspectionAnswer[];
		/** A checkout video: the certifier confirms it is one continuous take showing the student. */
		checkout?: boolean;
		label?: string;
		inPerson?: boolean;
		/** Where a stored file's bytes come from; the evidence route by default, a static picture in a harness. */
		srcOf?: (file: CertEvidenceFile) => string;
	} = $props();

	let broken = $state<Record<string, true>>({});
	let open = $state<number | null>(null);

	const files = $derived(evidence?.files ?? []);
	const pictures = $derived(files.filter((f) => isImageFilename(f.name) && !broken[f.path]));
	const others = $derived(files.filter((f) => !isImageFilename(f.name) || broken[f.path]));
	const images = $derived<LightboxImage[]>(
		pictures.map((f) => ({
			key: f.path,
			src: srcOf(f),
			alt: f.name,
			caption: f.name,
			downloadHref: evidenceHref(f.path, f.name),
			downloadName: f.name
		}))
	);
	const links = $derived((evidence?.links ?? []).filter((l) => /^https?:\/\//i.test(l)));
</script>

<div class="dk-evidence" data-testid="cert-evidence">
	{#if inPerson}
		<p class="dk-empty" data-testid="cert-evidence-in-person">Recorded in person by the certifier; nothing was uploaded.</p>
	{:else if !evidence || (!evidence.text && !links.length && !evidence.youtube_id && !files.length)}
		<p class="dk-empty" data-testid="cert-evidence-empty">Nothing was attached.</p>
	{/if}

	{#if evidence?.youtube_id}
		<h3 class="cert-section-h">Video</h3>
		{#if checkout}
			<p class="cert-notice cert-notice-quiet" data-testid="cert-checkout-note">
				<span class="cert-notice-glyph" aria-hidden="true">i</span>
				<span>A checkout is one continuous, unedited take that shows the student. Confirm both before you pass it.</span>
			</p>
		{/if}
		<div class="dk-video" data-testid="cert-evidence-video">
			<iframe
				src={youtubeEmbedUrl(evidence.youtube_id)}
				title="{label}: the submitted video"
				referrerpolicy="strict-origin-when-cross-origin"
				allow="fullscreen"
				allowfullscreen
				loading="lazy"
			></iframe>
		</div>
	{/if}

	{#if evidence?.text}
		<h3 class="cert-section-h">Written answer</h3>
		<p class="dk-text cert-prose" data-testid="cert-evidence-text">{evidence.text}</p>
	{/if}

	{#if links.length}
		<h3 class="cert-section-h">Links</h3>
		<ul class="cert-well" data-testid="cert-evidence-links">
			{#each links as href (href)}
				<li class="dk-file-row">
					<span class="dk-link-text">{href}</span>
					<a class="btn cert-btn secondary" {href} target="_blank" rel="noopener noreferrer">Open</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if pictures.length}
		<h3 class="cert-section-h">Pictures</h3>
		<div class="dk-gallery" data-testid="cert-evidence-pictures">
			{#each pictures as f, i (f.path)}
				<button type="button" class="dk-thumb" onclick={() => (open = i)} aria-label="Open {f.name} large">
					<img src={srcOf(f)} alt={f.name} loading="lazy" onerror={() => (broken = { ...broken, [f.path]: true })} />
				</button>
			{/each}
		</div>
		<Lightbox {images} index={open} label="{label} pictures" onIndex={(i) => (open = i)} onClose={() => (open = null)} />
	{/if}

	{#if others.length}
		<h3 class="cert-section-h">Files</h3>
		<ul class="cert-well" data-testid="cert-evidence-files">
			{#each others as f (f.path)}
				<li class="dk-file-row">
					<span class="dk-link-text">{f.name} <span class="dk-row-meta">{Math.max(1, Math.round(f.size / 1024))} KB</span></span>
					<a class="btn cert-btn secondary" href={evidenceHref(f.path, f.name)} download={f.name}>Download</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if selfInspection.length}
		<h3 class="cert-section-h">Self-inspection</h3>
		<ul class="cert-checklist" data-testid="cert-self-inspection">
			{#each selfInspection as item, i (i)}
				<li class="cert-check-row {item.checked ? 'is-done' : ''}">
					<span class="cert-check-glyph" aria-hidden="true">{item.checked ? '✓' : 'o'}</span>
					<div>{item.item}</div>
					<span class="cert-check-meta">{item.checked ? 'Checked' : 'Not checked'}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.dk-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.dk-link-text {
		overflow-wrap: anywhere;
		min-width: 0;
	}
	.dk-evidence h3 {
		margin-top: 1rem;
	}
</style>
