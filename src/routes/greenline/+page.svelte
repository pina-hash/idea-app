<script lang="ts">
	import { onMount } from 'svelte';
	import { parseTrack } from '$lib/greenline/track-schema';
	import provingGroundJson from '$lib/greenline/tracks/proving-ground-07.json';
	import GreenlineRace, {
		GARAGE_BASELINE,
		type RaceOutcome
	} from '$lib/greenline/GreenlineRace.svelte';
	import GreenlineResults from '$lib/greenline/GreenlineResults.svelte';
	import Garage from '$lib/greenline/Garage.svelte';
	import {
		defaultLoadout,
		type ArchetypeId,
		type Loadout,
		type PartSlot
	} from '$lib/greenline/loadout';
	import {
		loadLeaderboard,
		loadUserLoadout,
		saveUserLoadout,
		submitRaceResult,
		type LeaderboardEntry
	} from '$lib/greenline/persistence';
	import type { PageData } from './$types';

	/**
	 * GREENLINE portal route: the real player loop over the shared game. RACE
	 * mode only for now (the mode flag lives under GreenlineRace; no selector is
	 * surfaced here). Sequence: title -> garage -> race -> results -> back to
	 * garage/title, all without a page reload.
	 *
	 * Everything data-backed goes through the persistence seam
	 * (src/lib/greenline/persistence.ts), which fails soft: if migration 0049 is
	 * unapplied, the garage and results still function, just without real
	 * persistence (saved build reads as the default, submit is a no-op, the board
	 * comes back empty). The tuning panel inside the race is teacher-only
	 * (data.isTeacher), gated server-side.
	 */
	const { data }: { data: PageData } = $props();

	const track = parseTrack(provingGroundJson);

	type Screen = 'title' | 'garage' | 'race' | 'results';
	let screen = $state<Screen>('title');

	// Player build: loaded from the account on mount, edited in the garage.
	let loadout = $state<Loadout>(defaultLoadout());
	let loadoutReady = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	// Results state.
	let outcome = $state<RaceOutcome | null>(null);
	let submitting = $state(false);
	let submitError = $state(false);
	let board = $state<LeaderboardEntry[]>([]);
	let boardLoading = $state(false);

	onMount(async () => {
		const saved = await loadUserLoadout(data.supabase, data.userId);
		if (saved) loadout = saved;
		loadoutReady = true;
	});

	async function persist() {
		saveStatus = 'saving';
		const { error } = await saveUserLoadout(data.supabase, data.userId, loadout);
		saveStatus = error ? 'error' : 'saved';
	}
	const selectArchetype = (id: ArchetypeId) => {
		loadout = { ...loadout, archetype: id };
		persist();
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		loadout = { ...loadout, parts: { ...loadout.parts, [slot]: partId } };
		persist();
	};

	const garageNote = $derived(
		saveStatus === 'saving'
			? 'saving build to your account…'
			: saveStatus === 'error'
				? 'offline — build not saved (playable, changes stay this session)'
				: saveStatus === 'saved'
					? 'build saved to your account'
					: 'choose your build · saved to your account'
	);

	async function handleFinish(o: RaceOutcome) {
		outcome = o;
		screen = 'results';
		submitting = true;
		submitError = false;
		board = [];
		const { error } = await submitRaceResult(data.supabase, {
			trackId: track.id,
			mode: 'race',
			finishPosition: o.finishPosition,
			totalTimeMs: o.totalTimeMs,
			bestLapMs: o.bestLapMs,
			laps: o.laps,
			archetype: loadout.archetype
		});
		submitError = error !== null;
		submitting = false;
		await refreshBoard();
	}

	async function refreshBoard() {
		boardLoading = true;
		board = await loadLeaderboard(data.supabase, track.id, { mode: 'race', limit: 20 });
		boardLoading = false;
	}
</script>

<svelte:head>
	<title>GREENLINE</title>
</svelte:head>

{#if screen === 'title'}
	<div class="gp-root gp-center">
		<div class="gp-title-card">
			<div class="gp-wordmark">GREENLINE</div>
			<div class="gp-tagline">combat racing · {track.name}</div>
			<button class="gp-btn gp-btn-primary" onclick={() => (screen = 'garage')}>START</button>
		</div>
	</div>
{:else if screen === 'garage'}
	<div class="gp-root">
		{#if loadoutReady}
			<Garage
				{loadout}
				baselineHealth={GARAGE_BASELINE.health}
				baselineMass={GARAGE_BASELINE.mass}
				baselineEngine={GARAGE_BASELINE.engine}
				baselineDrag={GARAGE_BASELINE.drag}
				onselect={selectArchetype}
				onequip={equipPart}
				note={garageNote}
				closeLabel="START RACE ▸"
				onclose={() => (screen = 'race')}
				onback={() => (screen = 'title')}
				backLabel="◂ TITLE"
			/>
		{:else}
			<div class="gp-center gp-fill"><div class="gp-loading">loading your build…</div></div>
		{/if}
	</div>
{:else if screen === 'race'}
	<GreenlineRace {loadout} showDebug={data.isTeacher} onFinish={handleFinish} />
{:else if screen === 'results'}
	<div class="gp-root gp-center">
		<GreenlineResults
			{outcome}
			trackName={track.name}
			{board}
			{boardLoading}
			{submitting}
			{submitError}
			myUserId={data.userId}
			onRaceAgain={() => (screen = 'race')}
			onGarage={() => (screen = 'garage')}
			onTitle={() => (screen = 'title')}
		/>
	</div>
{/if}

<style>
	.gp-root {
		position: fixed;
		inset: 0;
		background: #05090c;
		font-family: 'Share Tech Mono', monospace;
		color: #e8ffe8;
		z-index: 10;
		overflow-y: auto;
	}
	.gp-center {
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.gp-fill {
		position: absolute;
		inset: 0;
	}
	.gp-loading {
		color: #5f7f6a;
		font-size: 0.85rem;
	}
	.gp-title-card {
		text-align: center;
		padding: 2rem;
	}
	.gp-wordmark {
		font-size: 4rem;
		letter-spacing: 0.3em;
		color: #00ff41;
		text-shadow: 0 0 24px rgba(0, 255, 65, 0.4);
	}
	.gp-tagline {
		margin-top: 0.6rem;
		color: #7fbf8f;
		letter-spacing: 0.14em;
		font-size: 0.9rem;
	}
	.gp-btn {
		background: rgba(0, 255, 65, 0.1);
		border: 1px solid rgba(0, 255, 65, 0.4);
		color: #00ff41;
		font-family: inherit;
		font-size: 1.1rem;
		letter-spacing: 0.1em;
		padding: 0.6rem 2.4rem;
		margin-top: 2rem;
		cursor: pointer;
	}
	.gp-btn:hover {
		background: rgba(0, 255, 65, 0.2);
	}
	.gp-btn-primary {
		background: rgba(200, 255, 0, 0.12);
		border-color: rgba(200, 255, 0, 0.5);
		color: #c8ff00;
	}
	.gp-btn-primary:hover {
		background: rgba(200, 255, 0, 0.22);
	}
</style>
