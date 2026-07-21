<script lang="ts">
	import GreenlineRace, { type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { loadTrack, TRACKS } from '$lib/greenline/tracks';
	import { gridSelection } from '$lib/greenline/grid-selection.svelte';
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
	 * `?track=` picks the circuit by its registry id (see $lib/greenline/tracks),
	 * defaulting to Proving Ground 07. `relief` stays accepted as a shorthand
	 * for `relief-proof-01`, since scripted drives and the 8a notes use it.
	 * Read once at page init — switch tracks with a full page load, the
	 * component builds its world once on mount.
	 *
	 * No `onQuit` is passed: the pause menu still opens (resume / restart /
	 * feedback), it just offers no way out, because this harness has no screen
	 * to quit to. That optionality is the reason the prop exists.
	 *
	 * `aiCount` comes from the SAME grid-selection store the garage's grid-size
	 * picker writes (Phase 9-fix-b), mirroring how the real /greenline route
	 * feeds the prop. That makes the whole picker -> store -> field path
	 * verifiable here (choose a size in /dev/greenline-portal, count the cars
	 * that launch here) without a signed-in session.
	 */
	const raw = page.url.searchParams.get('track');
	const trackParam = raw === 'relief' ? 'relief-proof-01' : raw;
	// An unknown id resolves to the default rather than throwing, so a typo in a
	// scripted drive lands on a playable track instead of a blank screen.
	const track = trackParam && TRACKS.some((t) => t.id === trackParam)
		? loadTrack(trackParam)
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

<GreenlineRace {onFinish} {track} aiCount={gridSelection.aiCount} />
