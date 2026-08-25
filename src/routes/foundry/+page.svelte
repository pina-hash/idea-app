<script lang="ts">
	/**
	 * THE ROUTE OWNS THE TRANSPORTS; the component owns the arrangement.
	 *
	 * The one transport here is the MINT, and it is an API route rather than a
	 * direct client call because it is the one place a session decides "may this
	 * person open this app" and then signs that decision into a token. That is
	 * exactly the case the repo says needs a server: a credential is involved.
	 */
	import { goto } from '$app/navigation';

	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import type { FoundryGalleryTransports } from '$lib/foundry/transports';

	let { data } = $props();

	function coverUrl(path: string): string {
		return data.supabase.storage.from('foundry-covers').getPublicUrl(path).data.publicUrl;
	}

	const transports: FoundryGalleryTransports = {
		async launch({ appId, versionId }) {
			try {
				const res = await fetch('/api/foundry/token', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ appId, versionId })
				});
				const body = await res.json().catch(() => null);
				if (!res.ok || !body?.ok) {
					/**
					 * THE MINT'S REFUSALS ARE DELIBERATELY INDISTINGUISHABLE FROM EACH
					 * OTHER on the wire -- an app that does not exist, one that is
					 * hidden, and one with nothing published all answer 404 -- so this
					 * does not try to explain which happened. `not_configured` IS worth
					 * telling apart, because it is the one a viewer cannot fix by
					 * reloading and staff can fix by setting a variable.
					 */
					if (body?.reason === 'not_configured') {
						return { ok: false, message: 'Apps cannot be opened right now. Tell a teacher.' };
					}
					if (body?.reason === 'signed_out') {
						return { ok: false, message: 'Sign in to open an app.' };
					}
					return { ok: false, message: 'That app is not available.' };
				}
				return {
					ok: true,
					src: body.src as string,
					versionId: body.versionId as string,
					expiresInSeconds: body.expiresInSeconds as number
				};
			} catch {
				return { ok: false, message: 'That app could not be started. Check your connection.' };
			}
		}
	};

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
