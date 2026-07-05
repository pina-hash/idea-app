<script lang="ts">
	import FrcShell from '$lib/frc/FrcShell.svelte';
	import TrackHome from '$lib/frc/TrackHome.svelte';
	import DomainLanding from '$lib/frc/DomainLanding.svelte';
	import ReferenceShelf from '$lib/frc/ReferenceShelf.svelte';
	import UnitPage from '$lib/frc/UnitPage.svelte';
	import FrcRankBadge from '$lib/frc/FrcRankBadge.svelte';
	import FrcUnitOverride from '$lib/frc/FrcUnitOverride.svelte';
	import { domainById, completedCadCount, rankForCount, FRC_RANKS } from '$lib/frc/track';
	import { MDM_UNITS, mdmUnitByNumber } from '$lib/frc/mdm-content';

	/**
	 * Manual verification harness for the FRC Training shell + progression
	 * (dev-only). The Progression view simulates a student completing units
	 * (in-memory, no DB): toggling a unit updates the completed set, so the
	 * domain landing's unlock states and the rank badge update live. This also
	 * exercises the teacher-override component (FrcUnitOverride) mark/unmark.
	 */

	type View = 'progression' | 'home' | 'cad' | 'unit' | 'placeholder' | 'refs';
	let view: View = $state('progression');

	const cad = domainById('cad-mechanical')!;
	const foundation = domainById('foundation')!;
	const unit1 = mdmUnitByNumber(1)!;
	const cadUnits = cad.units.filter((u) => mdmUnitByNumber(u.n));

	// The simulated completion set.
	let completed = $state<string[]>([]);
	const count = $derived(completedCadCount(new Set(completed)));

	const toggle = (unitId: string, next: boolean) => {
		completed = next ? [...completed, unitId] : completed.filter((id) => id !== unitId);
	};
	const completeThrough = (n: number) => {
		completed = cad.units.filter((u) => u.n <= n && mdmUnitByNumber(u.n)).map((u) => u.id);
	};
	const reset = () => (completed = []);

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'progression', label: 'Progression (interactive)' },
		{ id: 'home', label: 'Track home' },
		{ id: 'cad', label: 'CAD domain' },
		{ id: 'unit', label: 'Unit page (MDM-1)' },
		{ id: 'placeholder', label: 'Placeholder domain' },
		{ id: 'refs', label: 'Reference shelf' }
	];
</script>

<svelte:head><title>FRC shell harness</title></svelte:head>

<div class="harness-bar">
	<span class="harness-label">FRC harness (dev-only)</span>
	{#each VIEWS as v (v.id)}
		<button type="button" class:active={view === v.id} onclick={() => (view = v.id)}>
			{v.label}
		</button>
	{/each}
</div>

{#if view === 'progression'}
	<div class="sim-panel">
		<div class="sim-row">
			<strong>Simulate completion:</strong>
			<button type="button" onclick={reset}>Reset</button>
			{#each FRC_RANKS as r (r.name)}
				<button type="button" onclick={() => completeThrough(r.minComplete)}>
					{r.minComplete} &rarr; {r.name}
				</button>
			{/each}
			<span class="sim-count">count={count} &middot; rank={rankForCount(count).name}</span>
		</div>
		<FrcUnitOverride units={cadUnits} {completed} onToggle={toggle} />
	</div>
{/if}

<FrcShell rankCount={count}>
	{#if view === 'progression'}
		<TrackHome {count} />
		<DomainLanding domain={cad} {completed} />
	{:else if view === 'home'}
		<TrackHome {count} />
	{:else if view === 'cad'}
		<DomainLanding domain={cad} {completed} />
	{:else if view === 'unit'}
		<UnitPage domain={cad} unit={unit1} prev={null} next={MDM_UNITS[1] ?? null} />
	{:else if view === 'placeholder'}
		<DomainLanding domain={foundation} />
	{:else}
		<ReferenceShelf />
	{/if}
</FrcShell>

<style>
	.harness-bar {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		padding: 0.6rem 1rem;
		background: var(--bg1, #050f07);
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.2));
	}
	.harness-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
		margin-right: 0.5rem;
	}
	.harness-bar button,
	.sim-row button {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--green, #00ff41);
		background: none;
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 3px;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
	}
	.harness-bar button.active {
		border-color: var(--green, #00ff41);
		box-shadow: 0 0 8px rgba(0, 255, 65, 0.35);
	}
	.sim-panel {
		position: relative;
		z-index: 2;
		padding: 0.8rem 1rem;
		background: var(--bg0, #020a04);
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.15));
	}
	.sim-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-bottom: 0.3rem;
	}
	.sim-row strong {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--white, #e8ffe8);
	}
	.sim-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--cyan, #00f0ff);
		margin-left: auto;
	}
</style>
