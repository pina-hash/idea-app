<script lang="ts">
	import GreenlineRace, { type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { parseTrack } from '$lib/greenline/track-schema';
	import reliefProofJson from '$lib/greenline/tracks/relief-proof-01.json';
	import terminalNineJson from '$lib/greenline/tracks/terminal-nine.json';
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
	 * `?track=` picks the circuit, defaulting to Proving Ground 07:
	 *   relief        - the Phase 8a schema-v2 proof segment (elevation,
	 *                   banking, boost pad, oil hazard)
	 *   terminal-nine - the Phase 8b full-scale circuit (~2.5 km, elevated
	 *                   deck + jump, rail-yard chokepoint, banked sweeper, and
	 *                   the grouped-checkpoint shortcut branch)
	 * Read once at page init — switch tracks with a full page load, the
	 * component builds its world once on mount.
	 */
	const trackParam = page.url.searchParams.get('track');
	const track =
		trackParam === 'relief'
			? parseTrack(reliefProofJson)
			: trackParam === 'terminal-nine'
				? parseTrack(terminalNineJson)
				: undefined;

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
