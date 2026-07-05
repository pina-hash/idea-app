<script lang="ts">
	import { getContext } from 'svelte';
	import {
		unitState,
		FRC_VIEW_CONTEXT_KEY,
		type FrcDomain,
		type FrcUnit,
		type FrcViewContext,
		type UnitState
	} from '$lib/frc/track';
	import { mdmUnitByNumber } from '$lib/frc/mdm-content';
	import FrcUnitOverride from '$lib/frc/FrcUnitOverride.svelte';

	/**
	 * Reusable domain landing page: the domain's units as cards, or a clean
	 * "content in development" placeholder for a domain with no units yet.
	 *
	 * OPEN ACCESS: every content-backed unit is a live link regardless of its
	 * `unitState` (complete / available / locked). The prerequisite chain is
	 * shown as a SUGGESTED order only (a hint under the title), never a block
	 * on reading; only a unit with no authored content is unclickable (nothing
	 * to open yet). Real per-user progression (`completed`, the set of
	 * completed unit ids) still drives the Complete/Suggested badge.
	 *
	 * `showOverride` renders the teacher-only completion override
	 * (FrcUnitOverride) for the caller's own account, scoped to this domain's
	 * content-backed units. Defaults to FrcShell's `FrcViewContext` (true only
	 * for a teacher not previewing "as a student"); an explicit prop overrides
	 * it, the same optional-override pattern FrcShell uses for `rankCount`.
	 */

	let {
		domain,
		completed = [],
		showOverride,
		overrideBusyId = '',
		onToggleComplete
	}: {
		domain: FrcDomain;
		completed?: string[];
		showOverride?: boolean;
		overrideBusyId?: string;
		onToggleComplete?: (unitId: string, next: boolean) => void;
	} = $props();

	const frcView = getContext<FrcViewContext>(FRC_VIEW_CONTEXT_KEY);
	const resolvedShowOverride = $derived(showOverride ?? frcView?.showOverride ?? false);

	const completedSet = $derived(new Set(completed));
	const overrideUnits = $derived(domain.units.filter((u) => hasContent(u)));

	const STATE_LABEL: Record<UnitState, string> = {
		locked: 'Suggested later',
		available: 'Available',
		complete: 'Complete'
	};

	/** Whether a unit has an authored per-unit page. */
	function hasContent(u: FrcUnit): boolean {
		return domain.contentSet === 'mdm' && !!mdmUnitByNumber(u.n);
	}

	/** The suggested-order hint for a unit whose prerequisite isn't complete yet. */
	function prereqTitle(u: FrcUnit): string | undefined {
		return domain.units.find((x) => x.id === u.prerequisite)?.title;
	}
</script>

<nav class="crumb" aria-label="Breadcrumb">
	<a href="/frc">FRC Training</a>
	<span aria-hidden="true">/</span>
	<span class="here">{domain.title}</span>
</nav>

<section class="head">
	<span class="frc-eyebrow">Domain</span>
	<h1>{domain.title}</h1>
	<p class="lead">{domain.blurb}</p>
</section>

{#if resolvedShowOverride && domain.contentSet === 'mdm' && overrideUnits.length}
	<div class="teacher-override">
		<div class="teacher-override-head">
			<span class="teacher-override-label">Teacher tools &middot; your account</span>
			<span class="teacher-override-hint">
				Mark or clear your own completion to preview progress states. Hidden in "View as student".
			</span>
		</div>
		<FrcUnitOverride
			units={overrideUnits}
			{completed}
			busyId={overrideBusyId}
			onToggle={onToggleComplete ?? (() => {})}
		/>
	</div>
{/if}

{#if domain.units.length}
	<ol class="units">
		{#each domain.units as u (u.n)}
			{#if hasContent(u)}
				{@const state = unitState(u, completedSet)}
				{@const suggestedAfter = state === 'locked' ? prereqTitle(u) : undefined}
				<li>
					<a class="frc-card unit unit-{state}" href="/frc/{domain.id}/{u.n}">
						<span class="unit-n" aria-hidden="true">{String(u.n).padStart(2, '0')}</span>
						<span class="unit-title-wrap">
							<span class="unit-title">{u.title}</span>
							{#if suggestedAfter}
								<span class="unit-hint">Suggested after {suggestedAfter}</span>
							{/if}
						</span>
						<span class="frc-state {state}">
							{#if state === 'locked' || state === 'available'}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
									<path d="M5 12h13M13 6.5L18.5 12 13 17.5" />
								</svg>
							{:else}
								<!-- Completion marker: filled IDEA-green disc, ink check (achievement only). -->
								<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<circle cx="12" cy="12" r="10" fill="#00ff41" />
									<path d="M7.5 12.5l3 3 6-6.5" stroke="#231f20" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							{/if}
							{STATE_LABEL[state]}
						</span>
						<span class="unit-go" aria-hidden="true">&rsaquo;</span>
					</a>
				</li>
			{:else}
				<li class="frc-card unit unit-dev">
					<span class="unit-n" aria-hidden="true">{String(u.n).padStart(2, '0')}</span>
					<span class="unit-title">{u.title}</span>
					<span class="frc-state dev">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<circle cx="12" cy="12" r="9" />
							<path d="M12 7v5l3 2" />
						</svg>
						In development
					</span>
				</li>
			{/if}
		{/each}
	</ol>
{:else}
	<div class="frc-card in-dev">
		<span class="in-dev-glyphs" aria-hidden="true">
			<svg viewBox="0 0 48 48" fill="none" stroke="#9a989a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="24" cy="24" r="18" />
				<path d="M24 14v10l7 4" />
			</svg>
		</span>
		<h2>Content in development</h2>
		<p>
			The units for {domain.title} are being built. The track structure is live so you can see
			where this domain fits; check back as units are published.
		</p>
		<a class="back" href="/frc">Back to the track &rsaquo;</a>
	</div>
{/if}

<style>
	.crumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.crumb a {
		text-decoration: none;
	}
	.crumb a:hover {
		color: var(--frc-red, #ed1c24);
	}
	.crumb span {
		color: var(--frc-gray, #9a989a);
	}
	.crumb .here {
		color: var(--frc-ink, #231f20);
	}
	.head {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1.1rem 0 1.7rem;
	}
	.head h1 {
		font-size: clamp(1.7rem, 4vw, 2.4rem);
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		color: #5c5a5c;
	}
	/* Teacher-only override panel: a deliberately dark "tool" surface (the
	   shared IDEA dark-theme tokens FrcUnitOverride is styled for) contrasting
	   against the light FRC page, so it reads unmistakably as a non-student
	   control, never confused with the student-facing chrome. */
	.teacher-override {
		background: var(--bg1, #050f07);
		border: 1px solid var(--line, rgba(0, 255, 65, 0.2));
		border-radius: 10px;
		padding: 0.85rem 1rem 1rem;
		margin-bottom: 1.1rem;
	}
	.teacher-override-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.2rem;
	}
	.teacher-override-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.teacher-override-hint {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim, #4a7a52);
	}
	.units {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(430px, 1fr));
		gap: 0.7rem;
	}
	@media (max-width: 520px) {
		.units {
			grid-template-columns: 1fr;
		}
	}
	.units li {
		display: flex;
	}
	.units li,
	.units .unit {
		width: 100%;
	}
	.unit {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.8rem 1rem;
		border-left: 4px solid var(--frc-line, #dde1e8);
	}
	/* Content-backed units are links. */
	a.unit {
		text-decoration: none;
		color: inherit;
		transition: box-shadow 0.15s ease, transform 0.15s ease;
	}
	a.unit:hover {
		box-shadow: 0 4px 14px rgba(35, 31, 32, 0.12);
		transform: translateY(-1px);
	}
	.unit-n {
		font-weight: 700;
		font-style: italic;
		font-size: 1.15rem;
		color: var(--frc-gray, #9a989a);
		min-width: 2ch;
	}
	.unit-title-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		flex: 1;
		min-width: 0;
	}
	.unit-title {
		font-weight: 500;
		font-size: 0.95rem;
		color: var(--frc-ink, #231f20);
	}
	/* Suggested-order hint: informational only, never a block on reading. */
	.unit-hint {
		font-size: 0.72rem;
		font-style: italic;
		color: var(--frc-gray, #9a989a);
	}
	.frc-state {
		margin-left: auto;
	}
	.unit-go {
		font-weight: 700;
		font-size: 1.25rem;
		line-height: 1;
		color: var(--frc-blue, #0066b3);
	}
	a.unit:hover .unit-go {
		color: var(--frc-red, #ed1c24);
	}
	.unit-available {
		border-left-color: var(--frc-blue, #0066b3);
	}
	.unit-available .unit-n {
		color: var(--frc-blue, #0066b3);
	}
	/* Completed unit card: the achievement state, trimmed in IDEA green. */
	.unit-complete {
		border-left-color: var(--frc-achieve, #00ff41);
	}
	/* "Suggested later" unit: prerequisite not complete yet. Still a live link,
	   just visually de-emphasized relative to the recommended next unit. */
	.unit-locked {
		background: #f5f6f8;
		border-left-color: rgba(154, 152, 154, 0.5);
	}
	.unit-locked .unit-n,
	.unit-locked .unit-title {
		color: #9a989a;
	}
	/* In-development unit: authored content not published yet. */
	.unit-dev {
		background: #f3f4f6;
	}
	.unit-dev .unit-title {
		color: #6d6b6d;
	}
	.in-dev {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
		padding: 2.6rem 1.5rem;
	}
	.in-dev-glyphs svg {
		width: 52px;
		height: 52px;
	}
	.in-dev h2 {
		font-size: 1.3rem;
	}
	.in-dev p {
		margin: 0;
		max-width: 52ch;
		color: #5c5a5c;
		font-size: 0.92rem;
	}
	.in-dev .back {
		margin-top: 0.5rem;
		font-weight: 700;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		text-decoration: none;
	}
	.in-dev .back:hover {
		color: var(--frc-red, #ed1c24);
	}
</style>
