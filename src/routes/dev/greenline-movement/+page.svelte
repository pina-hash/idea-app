<script lang="ts">
	import GreenlineRace, { type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { allTracks, loadTrack } from '$lib/greenline/tracks';
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
	// `allTracks()` rather than the static catalog, so `?track=custom-builder`
	// mounts a track parked by the builder's Test Drive. That makes the real
	// race path drivable here without a signed-in session, which is the only way
	// to verify an authored track actually races without live OAuth.
	const track =
		trackParam && allTracks().some((t) => t.id === trackParam) ? loadTrack(trackParam) : undefined;

	/**
	 * `?from=` closes the playtest round trip: an author who drove here from a
	 * builder gets one click back to the chain they were editing (still exactly
	 * as they left it — the document lives in localStorage). Absent otherwise,
	 * so a plain scripted drive is unchanged.
	 */
	const RETURN_TO: Record<string, { href: string; label: string }> = {
		'piece-builder': { href: '/dev/greenline-piece-builder', label: '◂ BACK TO CHAIN BUILDER' },
		builder: { href: '/dev/greenline-track-builder', label: '◂ BACK TO TRACK BUILDER' }
	};
	const backTo = RETURN_TO[page.url.searchParams.get('from') ?? ''];

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

{#if backTo}
	<a class="gl-back" href={backTo.href} data-testid="back-to-builder">{backTo.label}</a>
{/if}

<GreenlineRace {onFinish} {track} aiCount={gridSelection.aiCount} />

<style>
	/* Bottom-right: the one HUD corner the race leaves free (speed top-left,
	   timing top-center, standings top-right, minimap bottom-left, controls
	   bottom-center) — the same reasoning the music mute button uses. */
	.gl-back {
		position: fixed;
		right: 0.7rem;
		bottom: 0.7rem;
		z-index: 40;
		background: rgba(4, 6, 10, 0.86);
		border: 1px solid #24333f;
		color: #cfe2ef;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		padding: 0.3rem 0.6rem;
		text-decoration: none;
	}
	.gl-back:hover {
		border-color: #2ae57e;
		color: #8fffc4;
	}
</style>
