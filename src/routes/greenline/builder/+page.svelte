<script lang="ts">
	import TrackBuilder from '$lib/greenline/builder/TrackBuilder.svelte';
	import { publishCommunityTrack } from '$lib/greenline/community';

	/**
	 * GREENLINE track builder, the real portal route (Bundle 4a). Open to ANY
	 * signed-in user — `/greenline` is in hooks.server.ts's authedPrefixes, so
	 * anonymous visitors are redirected to `/` exactly like the rest of the
	 * game; there is no role gate (this supersedes the teacher-only guard the
	 * builder carried while it lived only at /dev/greenline-track-builder,
	 * which remains as the dev harness). Reached from the GREENLINE title
	 * screen's TRACK EDITOR entry.
	 *
	 * Publish posts the builder's validated export to
	 * /api/greenline-track-publish, which authenticates the session, re-runs
	 * the REAL validation server-side, and stores the track for everyone.
	 */
</script>

<svelte:head>
	<title>GREENLINE track builder</title>
</svelte:head>

<div class="glbuilder-page">
	<a class="glbuilder-back" href="/greenline">◂ BACK TO GREENLINE</a>
	<TrackBuilder onPublish={publishCommunityTrack} />
</div>

<style>
	.glbuilder-page {
		position: relative;
		z-index: 1;
		min-height: 100vh;
		background: #04060a;
	}
	.glbuilder-back {
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
	.glbuilder-back:hover {
		color: #8fffc4;
		border-color: #2ae57e;
	}
</style>
