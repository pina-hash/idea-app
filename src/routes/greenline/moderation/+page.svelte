<script lang="ts">
	import { onMount } from 'svelte';
	import TrackModerationPanel from '$lib/greenline/TrackModerationPanel.svelte';
	import {
		loadCommunityTracks,
		removeCommunityTrack,
		setTrackFeatured,
		type CommunityTrackSummary
	} from '$lib/greenline/community';
	import type { PageData } from './$types';

	/**
	 * GREENLINE community-track moderation route (teacher-only; see
	 * +page.server.ts). Thin wiring over the presentation-only panel: the list
	 * comes from the same greenline_track_list RPC the garage browse uses (so
	 * the numbers a teacher moderates by are exactly what players see),
	 * feature/unfeature is the greenline_track_set_featured RPC, and remove is
	 * the SAME greenline_track_remove path an author's self-remove takes —
	 * just exercised by a teacher on any track.
	 */
	const { data }: { data: PageData } = $props();
	const supabase = $derived(data.supabase);

	let tracks = $state<CommunityTrackSummary[]>([]);
	let ready = $state(false);
	let loaded = $state(false);
	let busyUuid = $state<string | null>(null);
	let actionError = $state('');

	async function refresh() {
		const res = await loadCommunityTracks(supabase);
		ready = res.ready;
		tracks = res.tracks;
		loaded = true;
	}
	onMount(refresh);

	async function handleFeature(uuid: string, featured: boolean) {
		busyUuid = uuid;
		actionError = '';
		const res = await setTrackFeatured(supabase, uuid, featured);
		if (!res.ok) actionError = res.error ?? 'Could not update featuring.';
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
	<title>GREENLINE track moderation</title>
</svelte:head>

<div class="mod-page">
	<header class="mod-head">
		<div>
			<h1>GREENLINE <span>// TRACK MODERATION</span></h1>
			<p>
				Published community tracks with their reports, ratings, and race telemetry. FEATURE
				makes a track ranked (real leaderboard + IC payout, same terms as the official
				circuits); UN-FEATURE demotes it back to unranked without touching its history.
				REMOVE delists it (soft; ratings, telemetry, and board history are kept).
			</p>
		</div>
		<a class="mod-back" href="/greenline">◂ GREENLINE</a>
	</header>

	{#if !loaded}
		<div class="mod-note">loading…</div>
	{:else if !ready}
		<div class="mod-note">
			Community tracks are not available yet. Apply migrations 0057 and 0058 in the Supabase
			SQL editor.
		</div>
	{:else}
		<TrackModerationPanel
			{tracks}
			{busyUuid}
			error={actionError}
			onFeature={handleFeature}
			onRemove={handleRemove}
		/>
	{/if}
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
</style>
