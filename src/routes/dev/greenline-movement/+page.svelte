<script lang="ts">
	import GreenlineRace, { type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';

	/**
	 * GREENLINE movement + track + combat + AI prototype (dev-only harness).
	 *
	 * The whole game now lives in the reusable $lib/greenline/GreenlineRace.svelte
	 * component (extracted so the real portal route at /greenline can mount the
	 * identical movement / combat / AI / HUD / minimap systems). This page is the
	 * thin dev wrapper: `showDebug` turns on the live tuning panel and the G-key
	 * garage overlay, and with no `loadout` prop the component seeds and persists
	 * the player build from localStorage (`greenline_loadout`), exactly as this
	 * harness always did. Controls, tuning, and behavior are unchanged.
	 */
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

<GreenlineRace showDebug {onFinish} />
