<script lang="ts">
	import FrcShell from '$lib/frc/FrcShell.svelte';
	import TrackHome from '$lib/frc/TrackHome.svelte';
	import DomainLanding from '$lib/frc/DomainLanding.svelte';
	import ReferenceShelf from '$lib/frc/ReferenceShelf.svelte';
	import UnitPage from '$lib/frc/UnitPage.svelte';
	import FrcRankBadge from '$lib/frc/FrcRankBadge.svelte';
	import FrcUnitOverride from '$lib/frc/FrcUnitOverride.svelte';
	import FrcReviewQueue from '$lib/frc/FrcReviewQueue.svelte';
	import type { GateSubmission } from '$lib/frc/gate-submissions';
	import { domainById, completedCadCount, rankForCount, FRC_RANKS } from '$lib/frc/track';
	import { MDM_UNITS, mdmUnitByNumber, mdmUnitById, type MdmUnit } from '$lib/frc/mdm-content';
	import { FOUNDATION_UNITS, foundationUnitById } from '$lib/frc/foundation-content';

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

	type View = 'progression' | 'home' | 'cad' | 'unit' | 'quiz' | 'model' | 'placeholder' | 'refs';
	let view: View = $state('progression');
	let simulateTeacher = $state(true);

	const cad = domainById('cad-mechanical')!;
	const foundation = domainById('foundation')!;
	// Still a genuinely EMPTY domain (unlike foundation, which now has F1), so
	// the "content in development" placeholder block stays exercisable.
	const emptyDomain = domainById('mechanisms-prototyping')!;
	const unit1 = mdmUnitByNumber(1)!;
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
	// endpoint (real engine, in-memory store), for ANY quiz unit ACROSS DOMAINS
	// (the five MDM knowledge units, plus F1-F5 in Foundation). The picker keys
	// off the unit id (not a bare number, since e.g. F1 and MDM-1 would otherwise
	// collide on n=1) and drives the `?unit=` query param the mock reads, so
	// each unit's own bank is served. A pass marks that unit complete here so
	// the domain landing below reflects the unlock. `testLength`/`passPercent`
	// mirror the server banks (dev-only display values; the actual questions
	// come from the start response).
	const QUIZ_UNIT_IDS = ['MDM-1', 'MDM-2', 'MDM-3', 'MDM-9', 'MDM-10', 'F1', 'F2', 'F3', 'F4', 'F5'];
	const QUIZ_GATE_META: Record<string, { testLength: number; passPercent: number }> = {
		'MDM-1': { testLength: 10, passPercent: 90 },
		'MDM-2': { testLength: 6, passPercent: 90 },
		'MDM-3': { testLength: 6, passPercent: 90 },
		'MDM-9': { testLength: 6, passPercent: 90 },
		'MDM-10': { testLength: 6, passPercent: 90 },
		'F1': { testLength: 8, passPercent: 90 },
		'F2': { testLength: 6, passPercent: 90 },
		'F3': { testLength: 6, passPercent: 90 },
		'F4': { testLength: 6, passPercent: 90 },
		'F5': { testLength: 6, passPercent: 90 }
	};
	let quizUnitId = $state('MDM-1');
	let quizNonce = $state(0);
	function resolveUnit(id: string): MdmUnit {
		return mdmUnitById(id) ?? foundationUnitById(id) ?? unit1;
	}
	const quizUnit = $derived(resolveUnit(quizUnitId));
	// Which domain owns the selected unit, so the mounted DomainLanding below
	// matches (Foundation for F1-F5, CAD for the rest).
	const quizDomain = $derived(foundationUnitById(quizUnitId) ? foundation : cad);
	const quizUnitsList = $derived(foundationUnitById(quizUnitId) ? FOUNDATION_UNITS : MDM_UNITS);
	const quizIdx = $derived(quizUnitsList.findIndex((u) => u.id === quizUnit.id));
	const quizNext = $derived(
		quizIdx >= 0 && quizIdx < quizUnitsList.length - 1 ? quizUnitsList[quizIdx + 1] : null
	);
	const quizMeta = $derived(QUIZ_GATE_META[quizUnit.id] ?? { testLength: 6, passPercent: 90 });
	const onQuizPass = () => {
		if (!completed.includes(quizUnit.id)) completed = [...completed, quizUnit.id];
	};
	const resetGate = async () => {
		await fetch(`/dev/frc-quiz?unit=${quizUnit.id}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ action: 'reset' })
		});
		completed = completed.filter((id) => id !== quizUnit.id);
		quizNonce++;
	};
	const pickQuizUnit = (id: string) => {
		quizUnitId = id;
		quizNonce++; // remount the gate fresh for the newly-selected unit
	};

	// Model-gate view (MDM-4..8): the student submission panel (UnitPage
	// modelGate) and the teacher review queue (FrcReviewQueue) both operate on
	// one in-memory store, so the full submit -> review -> approve/complete loop
	// is verifiable without Supabase. Approving mirrors frc_mark_complete by
	// marking the unit complete in `completed`. A "migration applied" toggle
	// exercises the fail-soft apply-migration note.
	const MODEL_UNIT_NS = [4, 5, 6, 7, 8];
	const MODEL_UNIT_IDS = MODEL_UNIT_NS.map((n) => `MDM-${n}`);
	let modelUnitN = $state(6);
	let modelReady = $state(true);
	let modelSubs = $state<Record<string, GateSubmission>>({});
	const modelUnit = $derived(mdmUnitByNumber(modelUnitN) ?? unit1);
	const modelIdx = $derived(MDM_UNITS.findIndex((u) => u.n === modelUnitN));
	const modelNext = $derived(
		modelIdx >= 0 && modelIdx < MDM_UNITS.length - 1 ? MDM_UNITS[modelIdx + 1] : null
	);
	const modelGate = $derived({
		enabled: true as const,
		ready: modelReady,
		submission: modelSubs[modelUnit.id] ?? null,
		unitComplete: completed.includes(modelUnit.id)
	});
	const onModelSubmit = async (link: string, notes: string) => {
		modelSubs = {
			...modelSubs,
			[modelUnit.id]: {
				status: 'submitted',
				link,
				notes,
				feedback: modelSubs[modelUnit.id]?.feedback ?? '',
				submittedAt: new Date().toISOString(),
				reviewedAt: null
			}
		};
		return { error: null };
	};
	const reviewItems = $derived(
		Object.entries(modelSubs)
			.filter(([, s]) => s.status === 'submitted')
			.map(([unitId, s]) => {
				const u = mdmUnitById(unitId);
				return {
					userId: 'dev-student',
					unitId,
					unitLabel: u ? `${u.id} · ${u.title}` : unitId,
					studentName: 'Dev Student',
					studentEmail: 'student@boscotech.net',
					link: s.link,
					notes: s.notes,
					submittedAt: s.submittedAt
				};
			})
	);
	// Approve mirrors the real teacher path: frc_mark_complete (here `completed`)
	// plus the submission row flipping to 'approved'.
	const approveModel = (_userId: string, unitId: string) => {
		if (!completed.includes(unitId)) completed = [...completed, unitId];
		const cur = modelSubs[unitId];
		if (cur)
			modelSubs = {
				...modelSubs,
				[unitId]: { ...cur, status: 'approved', reviewedAt: new Date().toISOString() }
			};
	};
	const reviseModel = (_userId: string, unitId: string, feedback: string) => {
		const cur = modelSubs[unitId];
		if (cur)
			modelSubs = {
				...modelSubs,
				[unitId]: { ...cur, status: 'needs_revision', feedback, reviewedAt: new Date().toISOString() }
			};
	};
	const resetModel = () => {
		modelSubs = {};
		completed = completed.filter((id) => !MODEL_UNIT_IDS.includes(id));
	};

	const VIEWS: { id: View; label: string }[] = [
		{ id: 'progression', label: 'Progression (interactive)' },
		{ id: 'home', label: 'Track home' },
		{ id: 'cad', label: 'CAD domain' },
		{ id: 'unit', label: 'Unit page' },
		{ id: 'quiz', label: 'Quiz gate' },
		{ id: 'model', label: 'Model gate' },
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
			{#each QUIZ_UNIT_IDS as id (id)}
				<button type="button" class:active={quizUnitId === id} onclick={() => pickQuizUnit(id)}>
					{id}
				</button>
			{/each}
			<button type="button" onclick={resetGate}>Reset gate state</button>
			<span class="sim-count">{quizUnit.id} complete: {completed.includes(quizUnit.id) ? 'yes' : 'no'}</span>
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
{:else if view === 'model'}
	<div class="sim-panel">
		<div class="sim-row">
			<strong>Model gate (in-memory):</strong>
			{#each MODEL_UNIT_NS as n (n)}
				<button type="button" class:active={modelUnitN === n} onclick={() => (modelUnitN = n)}>
					{`MDM-${n}`}
				</button>
			{/each}
			<button type="button" onclick={resetModel}>Reset</button>
			<label class="sim-teacher"><input type="checkbox" bind:checked={modelReady} /> migration applied</label>
			<span class="sim-count">
				{modelUnit.id}: {modelSubs[modelUnit.id]?.status ?? 'none'} &middot;
				{completed.includes(modelUnit.id) ? 'complete' : 'incomplete'}
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
		{#key `${quizUnitId}-${quizNonce}`}
			<UnitPage
				domain={quizDomain}
				unit={quizUnit}
				prev={null}
				next={quizNext}
				quizEndpoint={`/dev/frc-quiz?unit=${quizUnit.id}`}
				{onQuizPass}
				gate={{
					enabled: true,
					testLength: quizMeta.testLength,
					passPercent: quizMeta.passPercent,
					unitComplete: completed.includes(quizUnit.id),
					cooldownRemainingSec: 0
				}}
			/>
		{/key}
		<DomainLanding domain={quizDomain} {completed} onToggleComplete={toggle} />
	{:else if view === 'model'}
		{#key modelUnitN}
			<UnitPage domain={cad} unit={modelUnit} prev={null} next={modelNext} {modelGate} {onModelSubmit} />
		{/key}
		<div class="teacher-review-demo">
			<h3>Teacher review queue (dashboard)</h3>
			<FrcReviewQueue items={reviewItems} onApprove={approveModel} onRequestRevision={reviseModel} />
		</div>
		<DomainLanding domain={cad} {completed} onToggleComplete={toggle} />
	{:else if view === 'placeholder'}
		<DomainLanding domain={emptyDomain} />
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
	/* Dark panel so the dashboard-themed FrcReviewQueue is readable inside the
	   light FRC shell (harness only; on the real dashboard it sits on dark). */
	.teacher-review-demo {
		margin: 1.6rem 0;
		padding: 0.8rem 1rem 1rem;
		background: var(--bg1, #050f07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 8px;
	}
	.teacher-review-demo h3 {
		font-family: 'Share Tech Mono', monospace;
		font-style: normal;
		font-weight: 700;
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
		margin: 0 0 0.4rem;
	}
</style>
