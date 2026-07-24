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
	 *
	 * The back link is handed to the builder rather than floated over it: the
	 * builder owns a fixed-viewport layout whose top-right corner already holds
	 * the chain status flag and the PLAYTEST button, and an absolutely
	 * positioned overlay there covered the status flag and took its clicks.
	 */
</script>

<svelte:head>
	<title>GREENLINE piece-chain builder</title>
</svelte:head>

<div class="glpb-page">
	<PieceChainBuilder
		onPublish={publishCommunityTrack}
		playtestTarget="portal"
		backHref="/greenline"
	/>
</div>

<style>
	.glpb-page {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		background: #04060a;
	}
</style>
