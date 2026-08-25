<script lang="ts">
	/**
	 * THE ROUTE OWNS THE TRANSPORTS; the component owns the arrangement.
	 *
	 * THERE ARE NONE LEFT ON THIS SURFACE. The gallery's only server call was
	 * the token mint, which existed because a proxy of ours served the bundle
	 * and a signed decision had to reach it. Bundles come straight off public
	 * Storage now and `AppStage` derives the frame src from the two ids, so the
	 * object below is empty and is passed only so the component's contract does
	 * not change shape between here and the review queue.
	 */
	import { goto } from '$app/navigation';

	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import type { FoundryGalleryTransports } from '$lib/foundry/transports';

	let { data } = $props();

	function coverUrl(path: string): string {
		return data.supabase.storage.from('foundry-covers').getPublicUrl(path).data.publicUrl;
	}

	const transports: FoundryGalleryTransports = {};

	function select(slug: string | null) {
		const target = slug ? `/foundry?app=${encodeURIComponent(slug)}` : '/foundry';
		// `keepFocus` so picking a card with the keyboard does not throw focus
		// back to the top of the document on every selection.
		goto(target, { keepFocus: true, noScroll: true });
	}
</script>

<svelte:head>
	<title>IDEA Foundry</title>
	<meta
		name="description"
		content="Web apps built and published by Bosco Tech students."
	/>
</svelte:head>

<!-- The room wrapper (.fg-root) and the masthead live in +layout.svelte now,
     so this page is only its own content. The h1 stopped saying "IDEA
     Foundry" because the shell's wordmark already does, one line above. -->
<div class="fdy-page">
	<header class="fdy-page-head">
		<h1>Gallery</h1>
		<p>
			Web apps built and published by students. Everything here runs in a sandbox on a separate
			address, so nothing it does can reach your account.
		</p>
	</header>

	<FoundryGallery
		apps={data.apps}
		selected={data.selected}
		{transports}
		{coverUrl}
		onSelect={select}
	/>
</div>

<style>
	.fdy-page {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		/* `--measure-split` (92rem), NOT `--measure-wide` (62rem): the wide
		   measure is the widest SINGLE column, and this page is a two-pane
		   master-detail shell. Measured at 1440px on the harness with the wrong
		   one, the split's detail pane came out 873px and the review surface's
		   side-by-side never engaged at all. `--measure-split` is the token that
		   exists for exactly this shape. */
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: var(--space-5, 1.25rem) var(--cr-gutter, 1rem);
		min-width: 0;
	}

	.fdy-page-head h1 {
		margin: 0 0 0.25rem;
		font-family: var(--font-title, var(--font-display));
	}

	.fdy-page-head p {
		margin: 0;
		max-width: var(--measure-prose, 42rem);
		color: var(--text-2, var(--dim));
	}
</style>
