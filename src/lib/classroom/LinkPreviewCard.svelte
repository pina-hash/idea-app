<script lang="ts">
	import { linkHost, type ItemLink, type LinkPreview } from '$lib/classroom/classroom';

	/**
	 * One attached link, as a preview card when the page offered metadata and as
	 * a plain link when it did not.
	 *
	 * THE FETCH NEVER LEAVES OUR ORIGIN. The metadata comes from
	 * /api/classroom/link-preview, which fetches the target server-side (a
	 * browser cannot read another origin's <head> anyway, and routing it through
	 * the app keeps every student's reading list out of a third-party unfurler).
	 * It runs AFTER render, so a slow host delays a card and never the page.
	 *
	 * A FAILURE IS NOT AN ERROR STATE. No metadata, a timeout, a dead host and a
	 * blocked address all land in exactly the same place a link with no preview
	 * does: the label, the host, and a working link.
	 */
	let {
		link,
		fetchPreview = null,
		fallbackLabel = null,
		note = null
	}: {
		link: ItemLink;
		/**
		 * Injected so /dev/classroom can answer from a fixture with no network
		 * (the transports convention). Null disables previews entirely, which is
		 * also the honest server-rendered state before hydration.
		 */
		fetchPreview?: ((url: string) => Promise<LinkPreview | null>) | null;
		/**
		 * ALWAYS DISPLAYED when set, whether or not metadata fetched -- reference
		 * documents' linkCard blocks require one. The syllabus links to specific
		 * purchasable parts, and when a retailer listing dies the part number has
		 * to still be readable on the page.
		 */
		fallbackLabel?: string | null;
		note?: string | null;
	} = $props();

	let preview = $state<LinkPreview | null>(null);
	let imageBroken = $state(false);

	const host = $derived(linkHost(link.url));
	/** Never let a preview's own title replace a label the teacher typed. */
	const heading = $derived(link.label?.trim() || preview?.title || link.url);
	const subtitle = $derived(preview?.site_name?.trim() || host);
	const showImage = $derived(Boolean(preview?.ok && preview.image_url && !imageBroken));

	$effect(() => {
		const url = link.url;
		const load = fetchPreview;
		if (!load || !url) return;
		let cancelled = false;
		// DEFERRED OUT OF THE EFFECT BODY ON PURPOSE. An async function runs its
		// body synchronously up to the first await, so calling the loader here
		// would run whatever it does first -- in the dev harness, a state write --
		// while Svelte is still settling this render, which is exactly the
		// `state_unsafe_mutation` it refuses. Found in the browser: it froze the
		// whole page's interactivity with no visible error.
		queueMicrotask(() => {
			if (cancelled) return;
			void load(url)
				.then((p) => {
					if (!cancelled && p?.ok) preview = p;
				})
				.catch(() => {
					// Degrading to a plain link IS the failure handling; there is
					// nothing for a student to do about a site that would not answer.
				});
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<a class="lp" class:rich={preview?.ok} href={link.url} target="_blank" rel="noopener noreferrer">
	{#if showImage}
		<span class="lp-thumb">
			<img src={preview!.image_url} alt="" loading="lazy" onerror={() => (imageBroken = true)} />
		</span>
	{/if}
	<span class="lp-body">
		<span class="lp-title">{heading}</span>
		{#if fallbackLabel}<span class="lp-fallback">{fallbackLabel}</span>{/if}
		<span class="lp-host">{subtitle}</span>
		{#if note}<span class="lp-note">{note}</span>{/if}
		{#if preview?.ok && preview.description}
			<span class="lp-desc">{preview.description}</span>
		{/if}
	</span>
</a>

<style>
	.lp {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		background: var(--surface-2);
		text-decoration: none;
		color: var(--text-1);
		min-width: 0;
	}
	.lp:hover {
		border-color: var(--line-strong);
	}
	.lp:hover .lp-title {
		color: var(--gold);
	}
	.lp-thumb {
		flex: none;
		width: 4.6rem;
		height: 3.2rem;
		border-radius: var(--radius-card);
		overflow: hidden;
		background: var(--surface-1);
		border: 1px solid var(--hairline);
		line-height: 0;
	}
	.lp-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.lp-body {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.lp-title {
		font-size: 0.9rem;
		font-weight: 700;
		overflow-wrap: anywhere;
	}
	.lp-host {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--cyan);
		overflow-wrap: anywhere;
	}
	.lp-fallback {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--gold);
		overflow-wrap: anywhere;
	}
	.lp-note {
		font-size: 0.76rem;
		color: var(--text-2);
		line-height: 1.4;
	}
	.lp-desc {
		font-size: 0.78rem;
		color: var(--text-2);
		line-height: 1.4;
		/* Two lines is a summary; more is the article, which they can open. */
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	@media (max-width: 480px) {
		.lp-thumb {
			width: 3.4rem;
			height: 2.6rem;
		}
	}
</style>
