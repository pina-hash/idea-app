<script lang="ts">
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import ReferenceDoc from '$lib/classroom/ReferenceDoc.svelte';
	import { publicAttachmentSrc } from '$lib/classroom/classroom';
	import { fetchLinkPreviewClient } from '$lib/classroom/transports';
	import type { PageData } from './$types';

	/**
	 * The public reference document page: no session, no chrome that implies
	 * one, and nothing on it that a signed-out visitor may not see (the load's
	 * single RPC is the boundary).
	 *
	 * Ctrl+P here yields the whole document in order -- see the @media print
	 * block at the bottom, and ReferenceDoc's own, which expand every tab.
	 */
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.spec.meta.title}</title>
	<meta name="description" content={data.spec.meta.subtitle ?? data.title} />
</svelte:head>

<div class="app-header ref-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<span class="header-note">Reference document</span>
</div>

<main class="ref-page">
	<ReferenceDoc spec={data.spec} fetchPreview={fetchLinkPreviewClient}>
		{#snippet aside()}
			{#if data.attachments.length}
				<ul class="files">
					{#each data.attachments as file (file.id)}
						<li>
							<a href={publicAttachmentSrc(file.id)} target="_blank" rel="noopener noreferrer">
								{file.filename}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		{/snippet}
	</ReferenceDoc>

	<footer class="page-footer">
		<VersionBadge app="classroom" />
	</footer>
</main>

<style>
	.ref-page {
		max-width: var(--cr-measure, var(--measure-form));
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.header-note {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.files {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
	}
	.files a {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
	}
	.page-footer {
		margin-top: 1.6rem;
		display: flex;
		justify-content: center;
	}

	@media print {
		.ref-header,
		.page-footer {
			display: none;
		}
		.ref-page {
			max-width: none;
			padding: 0;
		}
		/* Links show their target -- a printed sheet with an unresolvable
		   "click here" is the thing this stylesheet exists to avoid. */
		.files a::after {
			content: ' (' attr(href) ')';
			font-size: 0.7em;
			color: #444;
		}
	}

	/* Page-wide print rules. :global because they have to reach the document
	   ReferenceDoc renders and the blocks inside it, which are scoped
	   elsewhere; the media query keeps them inert on screen. */
	@media print {
		:global(body),
		:global(.ref-page) {
			background: #fff !important;
			color: #000 !important;
		}
		:global(.bg-fx) {
			display: none !important;
		}
		:global(.ref-page a) {
			color: #000;
			text-decoration: underline;
		}
	}
</style>
