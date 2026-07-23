<script lang="ts">
	import PieceChainBuilder from '$lib/greenline/piece-builder/PieceChainBuilder.svelte';
	import { publishCommunityTrack } from '$lib/greenline/community';

	/**
	 * GREENLINE piece-chain builder (schema v3), the real portal route.
	 *
	 * Open to ANY signed-in user: `/greenline` is in hooks.server.ts's
	 * authedPrefixes, so this path inherits the same guard the rest of the game
	 * uses (anonymous visitors are redirected to `/`) and needs no load of its
	 * own — exactly like the sibling ribbon builder at /greenline/builder. There
	 * is no role gate; students are the intended authors.
	 * /dev/greenline-piece-builder remains as the dev harness.
	 *
	 * SUBMIT posts the validated export to /api/greenline-track-publish, which
	 * authenticates the session, re-runs the REAL validation server-side, and
	 * stores the track as `pending` (0059). A pending track is visible and
	 * playable to its author and to teachers ONLY; it reaches other students
	 * after a teacher approves it in /greenline/moderation.
	 */
</script>

<svelte:head>
	<title>GREENLINE piece-chain builder</title>
</svelte:head>

<div class="glpb-page">
	<a class="glpb-back" href="/greenline">◂ BACK TO GREENLINE</a>
	<PieceChainBuilder onPublish={publishCommunityTrack} playtestTarget="portal" />
</div>

<style>
	.glpb-page {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		background: #04060a;
	}
	.glpb-back {
		position: absolute;
		top: 0.85rem;
		right: 0.85rem;
		z-index: 5;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		color: #8fa3b0;
		text-decoration: none;
		border: 1px solid rgba(147, 163, 176, 0.4);
		padding: 0.3rem 0.6rem;
		background: rgba(4, 7, 11, 0.85);
	}
	.glpb-back:hover {
		color: #8fffc4;
		border-color: #2ae57e;
	}
</style>
