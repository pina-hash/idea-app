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
	 * The Unit page view has its own MDM-1..10 picker, so the Brief markdown
	 * (bold leads, worked-example blockquote) and the Drill per-question reveal
	 * — including the "not yet added" state on units with no authored answer
	 * key — can be checked on any unit, not just MDM-1.
	 *
	 * "Simulate teacher" drives FrcShell's `teacherOverride` prop, standing in
	 * for a real signed-in teacher profile so the "View as student" toggle (the
	 * real header button, rendered by FrcShell itself) and the in-track
	 * teacher-override strip on the CAD domain landing can be verified without
	 * Supabase. DomainLanding reads FrcShell's FrcViewContext itself, so no
	 * separate simulated toggle is needed here; this harness just supplies the
	 * in-memory mark/unmark handler real pages point at the RPC-backed one.
	 */

	type View = 'progression' | 'home' | 'cad' | 'unit' | 'quiz' | 'placeholder' | 'refs';
	let view: View = $state('progression');
	let simulateTeacher = $state(true);

	const cad = domainById('cad-mechanical')!;
	const foundation = domainById('foundation')!;
	const unit1 = mdmUnitByNumber(1)!;
	const unit2 = mdmUnitByNumber(2)!;
	const cadUnits = cad.units.filter((u) => mdmUnitByNumber(u.n));

	// "Unit page" view: pick which authored unit to inspect (e.g. MDM-2, which
	// has no answer key, to verify the Drill "not yet added" state).
	let unitPageN = $state(1);
	const unitPageUnit = $derived(mdmUnitByNumber(unitPageN) ?? unit1);
	const unitPageIdx = $derived(MDM_UNITS.findIndex((u) => u.n === unitPageN));

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

	// Quiz-gate view: mounts the REAL UnitPage + FrcQuizGate against the dev mock
	// endpoint (real engine, in-memory store). A pass marks MDM-1 complete here so
	// the domain landing below shows MDM-2 unlock.
	let quizNonce = $state(0);
	const onQuizPass = () => {
		if (!completed.includes('MDM-1')) completed = [...completed, 'MDM-1'];
	};
	const resetGate = async () => {
		await fetch('/dev/frc-quiz', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'reset' })
		});
		completed = completed.filter((id) => id !== 'MDM-1');
		quizNonce++;
	};

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'progression', label: 'Progression (interactive)' },
		{ id: 'home', label: 'Track home' },
		{ id: 'cad', label: 'CAD domain' },
		{ id: 'unit', label: 'Unit page' },
		{ id: 'quiz', label: 'Quiz gate (MDM-1)' },
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
	<label class="sim-teacher">
		<input type="checkbox" bind:checked={simulateTeacher} />
		Simulate teacher
	</label>
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
{:else if view === 'quiz'}
	<div class="sim-panel">
		<div class="sim-row">
			<strong>Quiz gate (mock backend, real engine):</strong>
			<button type="button" onclick={resetGate}>Reset gate state</button>
			<span class="sim-count">MDM-1 complete: {completed.includes('MDM-1') ? 'yes' : 'no'}</span>
		</div>
	</div>
{:else if view === 'unit'}
	<div class="sim-panel">
		<div class="sim-row">
			<strong>Inspect unit:</strong>
			{#each MDM_UNITS as u (u.id)}
				<button type="button" class:active={unitPageN === u.n} onclick={() => (unitPageN = u.n)}>
					{u.id}
				</button>
			{/each}
			<span class="sim-count">
				{unitPageUnit.drillAnswers.some(Boolean) ? 'has answer key' : 'no answer key'}
			</span>
		</div>
	</div>
{/if}

<FrcShell rankCount={count} teacherOverride={simulateTeacher}>
	{#if view === 'progression'}
		<TrackHome {count} />
		<DomainLanding domain={cad} {completed} onToggleComplete={toggle} />
	{:else if view === 'home'}
		<TrackHome {count} />
	{:else if view === 'cad'}
		<DomainLanding domain={cad} {completed} onToggleComplete={toggle} />
	{:else if view === 'unit'}
		<UnitPage
			domain={cad}
			unit={unitPageUnit}
			prev={unitPageIdx > 0 ? MDM_UNITS[unitPageIdx - 1] : null}
			next={unitPageIdx >= 0 && unitPageIdx < MDM_UNITS.length - 1 ? MDM_UNITS[unitPageIdx + 1] : null}
		/>
	{:else if view === 'quiz'}
		{#key quizNonce}
			<UnitPage
				domain={cad}
				unit={unit1}
				prev={null}
				next={unit2}
				quizEndpoint="/dev/frc-quiz"
				{onQuizPass}
				gate={{
					enabled: true,
					testLength: 10,
					passPercent: 90,
					unitComplete: completed.includes('MDM-1'),
					cooldownRemainingSec: 0
				}}
			/>
		{/key}
		<DomainLanding domain={cad} {completed} onToggleComplete={toggle} />
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
	.sim-teacher {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
		cursor: pointer;
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
