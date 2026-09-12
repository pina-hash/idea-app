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
	 *
	 * AND TWO READS, WHICH ARE DECISION 07's TWO LAYERS ON THE ONE PAGE A
	 * STUDENT ACTUALLY LANDS ON. They are NOT in the transports object above:
	 * that object is the play recorder and is handed straight down to
	 * `AppStage`, and a running bundle's stage has no business holding a reader
	 * for figures about itself. They go to `FoundryGallery` as their own props
	 * and stop at the detail pane.
	 *
	 * WHY THEY WERE MISSING UNTIL NOW. `0204` opened all three of the previously
	 * owner-only metrics and added the caller-scoped read, and the two surfaces
	 * that already had a `playStats` transport -- `/foundry/mine` and
	 * `/foundry/review` -- carried on being the only ones. So the numbers were
	 * public in the database and reachable through the ADMIN controls alone,
	 * which is the opposite of what "public" was answered to mean.
	 */
	import { goto } from '$app/navigation';

	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import type {
		FoundryGalleryTransports,
		FoundryMyPlayStatsTransport,
		FoundryPlayStatsTransport
	} from '$lib/foundry/transports';
	import { foundryCoverUrl } from '$lib/foundry/covers';

	let { data } = $props();

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

	/**
	 * `foundry_app_play_stats`, THE APP'S PUBLIC TOTALS.
	 *
	 * THE GATE IS THE FUNCTION'S, NOT THIS ROUTE'S. Since 0204 it admits anybody
	 * who can SEE the app through `_foundry_app_in_population`, and answers NULL
	 * otherwise -- the same answer a nonexistent app gives, so nothing here can
	 * be used to probe an id. This route adds no check of its own and must not:
	 * a second idea of who may read a figure is the one that stops matching.
	 *
	 * NULL FOR EVERY FAILURE, INCLUDING A MISSING FUNCTION. A deployment that
	 * has not had 0204 applied yet is a real state -- migrations here go on by
	 * hand, one file at a time -- and on it this read answers null for anybody
	 * but the author, which the component renders as one quiet sentence rather
	 * than as a broken page. Erroring would take a working gallery down for a
	 * figure nobody came for, exactly as the count read in `+page.server.ts`
	 * already declines to do.
	 */
	const playStats: FoundryPlayStatsTransport = async (appId) => {
		try {
			const { data: r, error } = await data.supabase.rpc('foundry_app_play_stats', {
				p_app_id: appId
			});
			if (error || !r) return null;
			return r as never;
		} catch {
			return null;
		}
	};

	/**
	 * `foundry_my_play_stats`, THE VIEWER'S OWN TIME WITH THIS APP.
	 *
	 * IT PASSES ONE ARGUMENT AND THERE IS NO SECOND ONE TO PASS. The function
	 * takes the app and nothing else; the player is `auth.uid()` inside it. So
	 * this route cannot ask about another student even by mistake, which is a
	 * property of 0204's signature rather than a discipline observed here.
	 *
	 * A DEPLOYMENT WITHOUT 0204 ANSWERS `PGRST202` AND THIS RETURNS NULL, which
	 * the component renders as no personal block at all -- the same nothing it
	 * renders for a student who has never played the app. The two are
	 * deliberately indistinguishable: neither is a state worth a sentence, and
	 * telling them apart would need a capability probe for a figure whose whole
	 * absence is unremarkable.
	 */
	const myPlayStats: FoundryMyPlayStatsTransport = async (appId) => {
		try {
			const { data: r, error } = await data.supabase.rpc('foundry_my_play_stats', {
				p_app_id: appId
			});
			if (error || !r) return null;
			return r as never;
		} catch {
			return null;
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
		playCounts={data.playCounts}
		{transports}
		coverUrl={foundryCoverUrl}
		{staffHref}
		{playStats}
		{myPlayStats}
		onSelect={select}
	/>
</div>

<style>
	/* THE SPLIT IS WHAT GROWS, in app mode. `scroll="fill"` needs a bounded
	   parent with `min-height: 0` on this item, and without it `height: 100%`
	   resolves against an auto height, the panes grow to their content, and
	   the surface degrades to exactly `page-flow` -- the state it had before,
	   which is why getting this wrong is invisible rather than broken. */
	@media (min-width: 1024px) {
		:global(.cr-app) .fdy-page {
			min-height: 0;
			flex: 1 1 auto;
		}
		:global(.cr-app) .fdy-page > :global(.cr-split) {
			min-height: 0;
			flex: 1 1 auto;
		}
	}

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
