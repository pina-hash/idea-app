<script lang="ts">
	/**
	 * THE ROUTE OWNS THE TRANSPORTS; the component owns the arrangement.
	 *
	 * THE TWO HERE ARE THE PLAY RECORDER, AND THEY EXIST BECAUSE THE APP CANNOT
	 * REPORT. A bundle runs in a sandboxed cross-origin frame with no session,
	 * so nothing inside it can record anything and it is never asked to. The
	 * portal knows when Launch was pressed and when the frame came down, so the
	 * portal writes -- `AppStage` calls these, and they go straight to the RPCs
	 * because each is one call with two ids and there is nothing a server would
	 * add.
	 *
	 * THE REVIEW QUEUE SUPPLIES NEITHER, ON PURPOSE. A reviewer running a
	 * submitted build to decide about it is not a play, and the way that is
	 * guaranteed is that the surface has nothing to call. `foundry_play_start`
	 * refuses any version that is not the app's PUBLISHED one as well, so
	 * opening one of those layers leaves the other closed.
	 *
	 * NEITHER OF THEM CAN AFFECT THE PAGE. Every outcome is a value, a refusal
	 * is silent, and nothing here is awaited before the frame goes up: telemetry
	 * must never be able to break the thing it measures, and the thing being
	 * measured is a student's app starting.
	 */
	import { goto } from '$app/navigation';

	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import type { FoundryGalleryTransports } from '$lib/foundry/transports';
	import { FOUNDRY_COVER_BUCKET } from '$lib/foundry/bundle-url';

	let { data } = $props();

	function coverUrl(path: string): string {
		return data.supabase.storage.from(FOUNDRY_COVER_BUCKET).getPublicUrl(path).data.publicUrl;
	}

	const transports: FoundryGalleryTransports = {
		async recordPlay(appId, versionId) {
			try {
				const { data: r, error } = await data.supabase.rpc('foundry_play_start', {
					p_app_id: appId,
					p_version_id: versionId
				});
				const out = r as { ok?: boolean; play_id?: string } | null;
				// A missing RPC (a deployment between 0138 and 0139), a refusal, or
				// anything else: the same silent nothing. There is no branch here
				// that can put a sentence in front of the viewer.
				if (error || !out?.ok || !out.play_id) return { ok: false };
				return { ok: true, playId: out.play_id };
			} catch {
				return { ok: false };
			}
		},

		async pingPlay(playId) {
			try {
				const { data: r, error } = await data.supabase.rpc('foundry_play_ping', {
					p_play_id: playId
				});
				const out = r as { ok?: boolean; reason?: string } | null;
				if (error) return { ok: false, stale: false };
				if (out?.ok) return { ok: true };
				// `stale` IS THE ONE OUTCOME THE CALLER ACTS ON: the session aged out
				// while the tab was hidden, so the right answer is a NEW session
				// rather than extending the old one across the gap.
				return { ok: false, stale: out?.reason === 'stale' };
			} catch {
				return { ok: false, stale: false };
			}
		}
	};

	/**
	 * THE ADMIN'S WAY INTO THE CONTROLS FOR THE APP THAT IS OPEN.
	 *
	 * WHY THIS AND NOT A THIRD LIST ON /foundry/review. The review route already
	 * loads every app, so a "published" list there is free -- and it would be a
	 * second gallery inside the review console, which is the one thing that
	 * surface is written not to be ("deliberately NOT a second gallery with
	 * extra columns"). The gallery is ALREADY the enumeration of published apps,
	 * with the covers, the sort and the author lines, and an admin who wants to
	 * act on one is by definition looking at it. So the missing piece was a
	 * door, not a directory.
	 *
	 * The queue's two lists also mean something precise -- what is waiting, and
	 * what is shelved -- and a third list of everything settled would be the
	 * longest of the three and the only one with nothing to do in it, which is
	 * how the two that DO need reading stop being read.
	 *
	 * NULL FOR EVERYONE ELSE, AND NULL WITH NOTHING OPEN. `isAdmin` rides on
	 * `page.data` from the root layout, so this resolves it a second time
	 * nowhere. No gate is added: /foundry/review answers 404 to a non-admin and
	 * `is_admin()` inside the RPCs is the boundary. This decides only whether a
	 * door somebody can already open is visible.
	 */
	const staffHref = $derived(
		data.isAdmin && data.selected
			? `/foundry/review?app=${encodeURIComponent(data.selected.slug)}`
			: null
	);

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
		playCounts={data.playCounts}
		{transports}
		{coverUrl}
		{staffHref}
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
