<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import TrackModerationPanel from '$lib/greenline/TrackModerationPanel.svelte';
	import DecalReviewQueue from '$lib/greenline/DecalReviewQueue.svelte';
	import {
		loadCommunityTracks,
		removeCommunityTrack,
		reviewCommunityTrack,
		setTrackFeatured,
		type CommunityTrackSummary
	} from '$lib/greenline/community';
	import { reviewDecal } from '$lib/greenline/decals';
	import type { PageData } from './$types';

	/**
	 * GREENLINE moderation route (admin-only; see +page.server.ts). Thin wiring
	 * over two presentation-only panels.
	 *
	 * TRACKS: the list comes from the same greenline_track_list RPC the garage
	 * browse uses (so the numbers a teacher moderates by are exactly what
	 * players see), approve/send-back is greenline_track_review,
	 * feature/unfeature is greenline_track_set_featured, and remove is the SAME
	 * greenline_track_remove path an author's self-remove takes — just
	 * exercised by a teacher on any track.
	 *
	 * DECALS: the SAME DecalReviewQueue component the dashboard mounts, wired to
	 * the SAME greenline_decal_review RPC. It is here because GREENLINE has two
	 * things a student submits and waits on, and a page called "GREENLINE
	 * moderation" that showed only one of them left the other queue reachable
	 * from exactly one link on a different subsystem's page. The dashboard's
	 * copy of this queue is untouched: two doors onto one queue, not two queues.
	 *
	 * The rows arrive from the SERVER load (signed image URLs need the private
	 * bucket's read policy), so a decision refreshes them with `invalidateAll`
	 * rather than a second client-side read — one source for the list, exactly
	 * as the tracks half has one.
	 */
	const { data }: { data: PageData } = $props();
	const supabase = $derived(data.supabase);

	let tracks = $state<CommunityTrackSummary[]>([]);
	let ready = $state(false);
	let loaded = $state(false);
	let busyUuid = $state<string | null>(null);
	let actionError = $state('');

	/** Tracks still waiting on a decision — the number the heading leads with. */
	const pendingTracks = $derived(tracks.filter((t) => t.status === 'pending').length);
	const pendingDecals = $derived(data.decalQueue.length);
	const pendingTotal = $derived(pendingTracks + pendingDecals);

	async function refresh() {
		const res = await loadCommunityTracks(supabase);
		ready = res.ready;
		tracks = res.tracks;
		loaded = true;
	}
	onMount(refresh);

	// ---- Decals. Both decisions route through greenline_decal_review, the only
	// write path onto another user's decal row; this page never touches the
	// table directly, exactly as the dashboard never does.
	let decalBusy = $state('');
	let decalError = $state('');

	async function decide(userId: string, action: 'approve' | 'needs_revision', feedback = '') {
		decalBusy = userId;
		decalError = '';
		const { error } = await reviewDecal(supabase, userId, action, feedback);
		if (error) decalError = error;
		else await invalidateAll();
		decalBusy = '';
	}

	async function handleFeature(uuid: string, featured: boolean) {
		busyUuid = uuid;
		actionError = '';
		const res = await setTrackFeatured(supabase, uuid, featured);
		if (!res.ok) actionError = res.error ?? 'Could not update featuring.';
		await refresh();
		busyUuid = null;
	}

	async function handleReview(uuid: string, action: 'approve' | 'reject', feedback?: string) {
		busyUuid = uuid;
		actionError = '';
		const res = await reviewCommunityTrack(supabase, uuid, action, feedback);
		if (!res.ok) actionError = res.error ?? 'Could not record the review.';
		await refresh();
		busyUuid = null;
	}

	async function handleRemove(uuid: string) {
		busyUuid = uuid;
		actionError = '';
		const res = await removeCommunityTrack(supabase, uuid);
		if (!res.ok) actionError = res.error ?? 'Could not remove the track.';
		await refresh();
		busyUuid = null;
	}
</script>

<svelte:head>
	<title>GREENLINE moderation</title>
</svelte:head>

<div class="mod-page">
	<header class="mod-head">
		<div>
			<h1>GREENLINE <span>// MODERATION</span></h1>
			<!-- The count reads FIRST and reads at zero too. A heading that shows a
			     number only when there is one is indistinguishable from a heading
			     whose count broke, which is exactly the state this page existed in
			     while nothing anywhere said a queue had anything in it. -->
			<p class="mod-count" data-testid="mod-pending-total">
				{#if !loaded}
					Counting what is waiting…
				{:else if pendingTotal === 0}
					<b>Nothing is waiting on you.</b> Every submitted track and decal has had a
					decision.
				{:else}
					<b>{pendingTotal} waiting on you</b>
					· {pendingTracks} track{pendingTracks === 1 ? '' : 's'}
					· {pendingDecals} decal{pendingDecals === 1 ? '' : 's'}
				{/if}
			</p>
			<p>
				Both things a GREENLINE student submits and then waits on. A submitted track or decal
				is <b>AWAITING REVIEW</b>: only its author and staff can see it until you approve it.
				Sending something back always carries a note, and never deletes anything.
			</p>
		</div>
		<a class="mod-back" href="/greenline">◂ GREENLINE</a>
	</header>

	<section class="mod-section" aria-labelledby="mod-tracks-h">
		<h2 class="mod-sec-h" id="mod-tracks-h">
			Community tracks
			<span class="mod-sec-n">{loaded && ready ? `${pendingTracks} awaiting review` : ''}</span>
		</h2>
		<p class="mod-sec-note">
			APPROVE publishes a track to every signed-in player. REQUEST CHANGES sends it back with a
			note (and revokes approval and featuring). FEATURE additionally makes an approved track
			ranked (real leaderboard + IC payout, same terms as the official circuits); UN-FEATURE
			demotes it back to unranked without touching its history. REMOVE delists it (soft;
			ratings, telemetry, and board history are kept).
		</p>
		{#if !loaded}
			<div class="mod-note">loading…</div>
		{:else if !ready}
			<div class="mod-note">
				Community tracks are not available yet. Apply migrations 0057, 0058 and 0059 in the
				Supabase SQL editor.
			</div>
		{:else}
			<TrackModerationPanel
				{tracks}
				{busyUuid}
				error={actionError}
				onFeature={handleFeature}
				onRemove={handleRemove}
				onReview={handleReview}
			/>
		{/if}
	</section>

	<section class="mod-section" aria-labelledby="mod-decals-h">
		<h2 class="mod-sec-h" id="mod-decals-h">
			Custom decals
			<span class="mod-sec-n">{data.decalsReady ? `${pendingDecals} awaiting review` : ''}</span>
		</h2>
		<p class="mod-sec-note">
			One custom livery image per student. A student can already use their own decal in their own
			garage at any status, so approving is what makes the image readable by anybody else.
			Requesting a revision sends your words back to them and they upload a new image to
			resubmit. This is the same queue as the one on the dashboard.
		</p>
		{#if !data.decalsReady}
			<div class="mod-note">
				Decal submissions are not available yet. Apply migration 0051_greenline_decals.sql in the
				Supabase SQL editor.
			</div>
		{:else}
			<DecalReviewQueue
				items={data.decalQueue}
				busyKey={decalBusy}
				onApprove={(id) => decide(id, 'approve')}
				onRequestRevision={(id, feedback) => decide(id, 'needs_revision', feedback)}
			/>
			{#if decalError}<p class="mod-err">{decalError}</p>{/if}
		{/if}
	</section>
</div>

<style>
	.mod-page {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		background: #04060a;
		padding: 1.2rem clamp(0.8rem, 3vw, 2.4rem) 2.5rem;
		color: #dfe8ee;
		font-family: 'Saira Condensed', sans-serif;
	}
	.mod-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.mod-head h1 {
		margin: 0 0 0.3rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 1rem;
		letter-spacing: 0.1em;
		color: #eaf4ff;
	}
	.mod-head h1 span {
		color: #2ae57e;
	}
	.mod-head p {
		margin: 0;
		max-width: 52rem;
		color: rgba(147, 163, 176, 0.85);
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.mod-back {
		flex: none;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		color: #8fa3b0;
		text-decoration: none;
		border: 1px solid rgba(147, 163, 176, 0.4);
		padding: 0.3rem 0.6rem;
		background: rgba(4, 7, 11, 0.85);
	}
	.mod-back:hover {
		color: #8fffc4;
		border-color: #2ae57e;
	}
	.mod-note {
		color: #8fa3b0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		padding: 1rem 0;
	}
	/* The count line. #b8c6d0 on #04060a measures 10.4:1; the bold half is
	   #eaf4ff, 16.7:1. Both well clear of the 4.5 floor for copy that carries
	   the one number a teacher came here for. */
	.mod-count {
		margin: 0 0 0.45rem;
		color: #b8c6d0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.06em;
	}
	.mod-count b {
		color: #eaf4ff;
	}
	.mod-section {
		margin-top: 1.6rem;
	}
	.mod-sec-h {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin: 0 0 0.25rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.82rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: #eaf4ff;
	}
	.mod-sec-n {
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		color: #8fffc4;
	}
	.mod-sec-note {
		margin: 0 0 0.7rem;
		max-width: 52rem;
		color: rgba(184, 198, 208, 0.92);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.mod-err {
		margin: 0.5rem 0 0;
		color: #ffb35c;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
	}
	/* The moderation page declares no instructor-only density class, so every
	   control on it clears 44px at every width (IDEA_INTERFACE_STANDARDS 10:
	   the 24px floor is a property a surface DECLARES, and one that declares
	   nothing is student-facing for the purpose of the rule). The back link
	   owns its row, so it takes the floor as a min-height rather than a reach. */
	.mod-back {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		padding: 0.3rem 0.85rem;
	}
</style>
