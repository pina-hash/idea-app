<script lang="ts">
	import { browser } from '$app/environment';
	import Garage from '$lib/greenline/Garage.svelte';
	import GreenlineResults from '$lib/greenline/GreenlineResults.svelte';
	import GreenlineTitle from '$lib/greenline/brand/GreenlineTitle.svelte';
	import GreenlineMusic from '$lib/greenline/GreenlineMusic.svelte';
	import { GARAGE_BASELINE, type RaceOutcome } from '$lib/greenline/GreenlineRace.svelte';
	import { defaultLoadout, type ArchetypeId, type PartSlot } from '$lib/greenline/loadout';
	import type { LeaderboardEntry } from '$lib/greenline/persistence';

	/**
	 * Dev harness for the /greenline portal-flow chrome (no auth / Supabase). It
	 * mounts the real GreenlineTitle (the code-rendered key-art scene), the real
	 * Garage with the route's own props (START RACE label, TITLE back button,
	 * custom note), and the real GreenlineResults with sample data, so all three
	 * presentational screens are browser-verifiable. The race itself lives in
	 * /dev/greenline-movement; the full data-backed loop is on /greenline.
	 */
	// ?view=garage|results preselects a view (headless screenshot support).
	const initView = browser ? new URLSearchParams(location.search).get('view') : null;
	let view = $state<'title' | 'garage' | 'race' | 'results'>(
		initView === 'garage' || initView === 'race' || initView === 'results' ? initView : 'title'
	);
	// Drives GreenlineMusic's winner-vs-loser branch on the results screen.
	let resultWin = $state(false);

	// --- Garage screen (real component, route props) ---
	let loadout = $state(defaultLoadout());
	let lastAction = $state('');
	const selectArchetype = (id: ArchetypeId) => {
		loadout = { ...loadout, archetype: id };
		lastAction = `archetype -> ${id}`;
	};
	const equipPart = (slot: PartSlot, partId: string) => {
		loadout = { ...loadout, parts: { ...loadout.parts, [slot]: partId } };
		lastAction = `equip ${slot} -> ${partId}`;
	};

	// --- Results screen (real component, sample data) ---
	const sampleOutcome: RaceOutcome = {
		finishPosition: 2,
		totalTimeMs: 92450,
		bestLapMs: 29380,
		laps: 3
	};
	const MY_ID = 'me-uid';
	const sampleBoard: LeaderboardEntry[] = [
		{
			user_id: 'a',
			display_name: 'NOVA',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'velocity',
			finish_position: 1,
			total_time_ms: 88120,
			best_lap_ms: 28010,
			laps: 3,
			rank: 1
		},
		{
			user_id: MY_ID,
			display_name: 'YOU',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'handling',
			finish_position: 2,
			total_time_ms: 92450,
			best_lap_ms: 29380,
			laps: 3,
			rank: 2
		},
		{
			user_id: 'c',
			display_name: 'IRONHIDE',
			full_name: null,
			avatar: null,
			avatar_url: null,
			archetype: 'armor',
			finish_position: 3,
			total_time_ms: 99870,
			best_lap_ms: 31450,
			laps: 3,
			rank: 3
		}
	];
	let boardMode = $state<'rows' | 'empty' | 'loading' | 'submitting' | 'error'>('rows');
</script>

<svelte:head>
	<title>GREENLINE portal flow (dev)</title>
</svelte:head>

<div class="dh-bar">
	<span>GREENLINE portal-flow harness (dev)</span>
	<button class:on={view === 'title'} onclick={() => (view = 'title')}>title</button>
	<button class:on={view === 'garage'} onclick={() => (view = 'garage')}>garage</button>
	<button class:on={view === 'race'} onclick={() => (view = 'race')}>race</button>
	<button class:on={view === 'results'} onclick={() => (view = 'results')}>results</button>
	{#if view !== 'results'}<span class="dh-note">last: {lastAction || '—'}</span>{/if}
	{#if view === 'results'}
		<span class="dh-note">music:</span>
		<button class:on={resultWin} onclick={() => (resultWin = true)}>win (winner)</button>
		<button class:on={!resultWin} onclick={() => (resultWin = false)}>lose (loser)</button>
	{/if}
	{#if view === 'results'}
		<span class="dh-note">board:</span>
		{#each ['rows', 'empty', 'loading', 'submitting', 'error'] as m}
			<button class:on={boardMode === m} onclick={() => (boardMode = m as typeof boardMode)}>{m}</button>
		{/each}
	{/if}
</div>

<div class="dh-stage">
	{#if view === 'title'}
		<GreenlineTitle trackName="Proving Ground 07" onStart={() => (lastAction = 'START')} />
	{:else if view === 'garage'}
		<Garage
			{loadout}
			baselineHealth={GARAGE_BASELINE.health}
			baselineMass={GARAGE_BASELINE.mass}
			baselineEngine={GARAGE_BASELINE.engine}
			baselineDrag={GARAGE_BASELINE.drag}
			onselect={selectArchetype}
			onequip={equipPart}
			note="choose your build · saved to your account"
			closeLabel="START RACE ▸"
			onclose={() => (lastAction = 'START RACE')}
			onback={() => (lastAction = 'back to TITLE')}
			backLabel="◂ TITLE"
		/>
	{:else if view === 'race'}
		<div class="dh-center">
			<div class="dh-racenote">
				RACE (music harness only — real race is /dev/greenline-movement)<br />
				a random race-N track plays here; re-select race to reroll
			</div>
		</div>
	{:else}
		<div class="dh-center">
			<GreenlineResults
				outcome={sampleOutcome}
				trackName="Proving Ground 07"
				board={boardMode === 'rows' ? sampleBoard : []}
				boardLoading={boardMode === 'loading'}
				submitting={boardMode === 'submitting'}
				submitError={boardMode === 'error'}
				myUserId={MY_ID}
				onRaceAgain={() => (lastAction = 'race again')}
				onGarage={() => (view = 'garage')}
				onTitle={() => (lastAction = 'title')}
			/>
		</div>
	{/if}
</div>

<GreenlineMusic screen={view} finishPosition={view === 'results' ? (resultWin ? 1 : 2) : null} />

<style>
	.dh-bar {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		background: #060c08;
		border-bottom: 1px solid rgba(0, 255, 65, 0.3);
		padding: 0.4rem 0.7rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: #7fbf8f;
	}
	.dh-bar button {
		background: rgba(0, 255, 65, 0.08);
		border: 1px solid rgba(0, 255, 65, 0.3);
		color: #00ff41;
		font-family: inherit;
		font-size: 0.7rem;
		padding: 0.15rem 0.5rem;
		cursor: pointer;
	}
	.dh-bar button.on {
		background: rgba(0, 255, 65, 0.22);
	}
	.dh-note {
		color: #5f7f6a;
	}
	.dh-stage {
		position: fixed;
		inset: 2.2rem 0 0;
		background: #05090c;
		overflow-y: auto;
	}
	.dh-center {
		min-height: 100%;
		display: flex;
		align-items: flex-start;
		justify-content: center;
	}
	.dh-racenote {
		margin-top: 25vh;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
		line-height: 1.8;
		color: #7fbf8f;
	}
</style>
