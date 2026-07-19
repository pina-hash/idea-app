<script lang="ts">
	import GreenlineRace, { type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { parseTrack } from '$lib/greenline/track-schema';
	import reliefProofJson from '$lib/greenline/tracks/relief-proof-01.json';
	import { page } from '$app/state';

	/**
	 * GREENLINE movement + track + combat + AI prototype (dev-only harness).
	 *
	 * The whole game now lives in the reusable $lib/greenline/GreenlineRace.svelte
	 * component (extracted so the real portal route at /greenline can mount the
	 * identical movement / combat / AI / HUD / minimap systems). This page is the
	 * thin dev wrapper: with no `loadout` prop the component seeds and persists
	 * the player build from localStorage (`greenline_loadout`), exactly as this
	 * harness always did. The build is edited via the __greenline console API
	 * (setArchetype / equip) here; there is no in-race garage.
	 *
	 * `?track=relief` mounts the Phase 8a schema-v2 proof segment
	 * (relief-proof-01: elevation, banking, boost pad, oil hazard) instead of
	 * the default Proving Ground 07. Read once at page init — switch tracks
	 * with a full page load, the component builds its world once on mount.
	 */
	const track =
		page.url.searchParams.get('track') === 'relief' ? parseTrack(reliefProofJson) : undefined;

	const onFinish = (o: RaceOutcome) => {
		// The in-game "YOU FINISHED" banner already shows the result; log the
		// structured outcome for tuning. The /greenline route turns this same
		// callback into a results screen + leaderboard submit.
		// eslint-disable-next-line no-console
		console.log('[greenline] race finished', o);
	};
</script>

<svelte:head>
	<title>GREENLINE movement prototype (dev)</title>
</svelte:head>

<GreenlineRace {onFinish} {track} />
