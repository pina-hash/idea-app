<script lang="ts">
	import FrcShell from '$lib/frc/FrcShell.svelte';
	import TrackHome from '$lib/frc/TrackHome.svelte';
	import DomainLanding from '$lib/frc/DomainLanding.svelte';
	import ReferenceShelf from '$lib/frc/ReferenceShelf.svelte';
	import UnitPage from '$lib/frc/UnitPage.svelte';
	import { domainById } from '$lib/frc/track';
	import { MDM_UNITS, mdmUnitByNumber } from '$lib/frc/mdm-content';

	/**
	 * Manual verification harness for the FRC Training shell (dev-only).
	 * Switch between the real page bodies inside the real FrcShell chrome:
	 * track home (7 domain cards), the CAD and Mechanical Design landing (units
	 * 1-10 linked, 11-16 in development), a real per-unit page (MDM-1), a
	 * placeholder domain, and the reference shelf. In-shell links point at the
	 * real gated /frc routes, so use these buttons to switch.
	 */

	type View = 'home' | 'cad' | 'unit' | 'placeholder' | 'refs';
	let view: View = $state('home');

	const cad = domainById('cad-mechanical')!;
	const foundation = domainById('foundation')!;
	const unit1 = mdmUnitByNumber(1)!;

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'home', label: 'Track home' },
		{ id: 'cad', label: 'CAD & Mechanical (16 units)' },
		{ id: 'unit', label: 'Unit page (MDM-1)' },
		{ id: 'placeholder', label: 'Placeholder domain' },
		{ id: 'refs', label: 'Reference shelf' }
	];
</script>

<svelte:head><title>FRC shell harness</title></svelte:head>

<div class="harness-bar">
	<span class="harness-label">FRC shell harness (dev-only)</span>
	{#each VIEWS as v (v.id)}
		<button type="button" class:active={view === v.id} onclick={() => (view = v.id)}>
			{v.label}
		</button>
	{/each}
</div>

<FrcShell>
	{#if view === 'home'}
		<TrackHome />
	{:else if view === 'cad'}
		<DomainLanding domain={cad} />
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
	.harness-bar button {
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
</style>
