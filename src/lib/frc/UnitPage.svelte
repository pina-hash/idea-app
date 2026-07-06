<script lang="ts">
	import { untrack } from 'svelte';
	import { gateLabel, mdmUnitById, type MdmUnit } from '$lib/frc/mdm-content';
	import { isBlockquote, parseDiagram, renderInline, stripBlockquote } from '$lib/frc/inline-markup';
	import { DIAGRAMS } from '$lib/frc/diagrams';
	import type { FrcDomain } from '$lib/frc/track';
	import type { GateSubmission } from '$lib/frc/gate-submissions';
	import FrcQuizGate from '$lib/frc/FrcQuizGate.svelte';
	import FrcModelGate from '$lib/frc/FrcModelGate.svelte';
	import FrcPhaseStepper from '$lib/frc/FrcPhaseStepper.svelte';
	import FrcDrillPhase from '$lib/frc/FrcDrillPhase.svelte';

	/**
	 * A single CAD/Mechanical unit, restructured into four SEQUENTIAL, GATED
	 * phases: Brief -> Drill -> Quiz -> Apply. Each phase unlocks the next; the
	 * student can always click back to an already-unlocked phase to review it,
	 * but cannot open a locked one. The Quiz phase renders per gate type:
	 *   - knowledge units (`gate.enabled`, MDM-1/2/3/9/10): the interactive quiz
	 *     flow (FrcQuizGate);
	 *   - modeling units (`modelGate.enabled`, MDM-4 through MDM-8): the model
	 *     submission panel (FrcModelGate);
	 *   - otherwise: the Gate DESCRIPTION only.
	 * Grading, review, and completion-writing are unchanged; this component only
	 * changes when each section is shown.
	 */
	let {
		domain,
		unit,
		prev,
		next,
		gate = null,
		modelGate = null,
		quizEndpoint,
		onQuizPass,
		onModelSubmit
	}: {
		domain: FrcDomain;
		unit: MdmUnit;
		prev: MdmUnit | null;
		next: MdmUnit | null;
		gate?: {
			enabled: true;
			testLength: number;
			passPercent: number;
			unitComplete: boolean;
			cooldownRemainingSec: number;
		} | null;
		modelGate?: {
			enabled: true;
			ready: boolean;
			submission: GateSubmission | null;
			unitComplete: boolean;
		} | null;
		/** Override the quiz POST target (dev harness); defaults to the real route. */
		quizEndpoint?: string;
		/** Optional pass hook (dev harness). */
		onQuizPass?: () => void;
		/** Model-gate submit handler (real page wires it to an RLS upsert). */
		onModelSubmit?: (link: string, notes: string) => Promise<{ error: string | null }>;
	} = $props();

	const resolvedEndpoint = $derived(quizEndpoint ?? `/frc/${domain.id}/${unit.n}/quiz`);

	const num = $derived(String(unit.n).padStart(2, '0'));
	// Prerequisite title (the seed stores its id, e.g. "MDM-1").
	const prereq = $derived(
		unit.prerequisite && unit.prerequisite.toLowerCase() !== 'none'
			? mdmUnitById(unit.prerequisite)
			: undefined
	);

	const PHASES = [
		{ key: 'brief', label: 'Brief' },
		{ key: 'drill', label: 'Drill' },
		{ key: 'quiz', label: 'Quiz' },
		{ key: 'apply', label: 'Apply' }
	];

	/**
	 * Phase progression. `gateCleared` is the server-authoritative truth (quiz
	 * passed or submission approved) and drives `unlockedThrough` REACTIVELY, so
	 * the Apply tab unlocks the moment a pass/approval lands, with no extra
	 * click. `manualUnlock` is the student's own forward progress through
	 * Brief/Drill/Quiz, which is NOT graded — advancing Brief and (optionally)
	 * Drill is the student's choice, not a checked gate.
	 *
	 * `currentPhase` (which screen is OPEN) is intentionally NOT force-advanced
	 * by a live pass/approval: the student stays on the Quiz screen to see the
	 * result (FrcQuizGate's "Passed" state, or FrcModelGate's "Approved") and
	 * clicks into Apply themselves. It only jumps straight to Apply on a FRESH
	 * mount of an ALREADY-cleared unit (returning to one passed in a prior
	 * session), so re-visiting never makes the student re-click through phases
	 * that are already done.
	 *
	 * Both are client-side, per-mount state (like the Drill practice state).
	 * The effect resets them on a real navigation to a different unit only
	 * (`unit.id` is its sole tracked dependency; the initial-cleared check reads
	 * `gate`/`modelGate` via `untrack` so a live pass/approval on the SAME unit
	 * never re-triggers this reset and yanks the student off the result screen).
	 */
	const initialCleared = !!(gate?.unitComplete || modelGate?.unitComplete);
	let manualUnlock = $state(initialCleared ? 3 : 0);
	let currentPhase = $state(initialCleared ? 3 : 0);

	$effect(() => {
		unit.id; // sole dependency: reset on a real navigation to a different unit
		const cleared = untrack(() => !!(gate?.unitComplete || modelGate?.unitComplete));
		manualUnlock = cleared ? 3 : 0;
		currentPhase = cleared ? 3 : 0;
	});

	const gateCleared = $derived(!!(gate?.unitComplete || modelGate?.unitComplete));
	const unlockedThrough = $derived(gateCleared ? 3 : manualUnlock);

	function goToPhase(i: number) {
		if (i <= unlockedThrough) currentPhase = i;
	}
	function continueToDrill() {
		manualUnlock = Math.max(manualUnlock, 1);
		currentPhase = 1;
	}
	function continueToQuiz() {
		manualUnlock = Math.max(manualUnlock, 2);
		currentPhase = 2;
	}
	function reviewBrief() {
		currentPhase = 0;
	}
</script>

<nav class="crumb" aria-label="Breadcrumb">
	<a href="/frc">FRC Training</a>
	<span aria-hidden="true">/</span>
	<a href="/frc/{domain.id}">{domain.title}</a>
	<span aria-hidden="true">/</span>
	<span class="here">Unit {num}</span>
</nav>

<section class="head">
	<span class="frc-eyebrow">Unit {num} &middot; {domain.title}</span>
	<h1>{unit.title}</h1>
	<div class="meta">
		<span class="meta-item">
			<span class="meta-key">Gate</span>
			<span class="meta-val">{gateLabel(unit.gate)}</span>
		</span>
		<span class="meta-item">
			<span class="meta-key">Pass</span>
			<span class="meta-val">{unit.gatePass}%</span>
		</span>
		<span class="meta-item">
			<span class="meta-key">Prerequisite</span>
			<span class="meta-val">
				{#if prereq}
					<a href="/frc/{domain.id}/{prereq.n}">{prereq.title}</a>
				{:else}
					None
				{/if}
			</span>
		</span>
	</div>
</section>

<FrcPhaseStepper phases={PHASES} currentIndex={currentPhase} {unlockedThrough} onSelect={goToPhase} />

<article class="unit-body">
	{#if currentPhase === 0}
		<section class="sec">
			<h2>Brief</h2>
			{#each unit.brief as p (p)}
				{@const diagram = parseDiagram(p)}
				{#if diagram}
					{@const src = DIAGRAMS[diagram.key]}
					{#if src}
						<figure class="brief-diagram">
							<div class="diagram-frame">
								<img src={src} alt={diagram.caption} loading="lazy" />
							</div>
							<figcaption>{@html renderInline(diagram.caption)}</figcaption>
						</figure>
					{/if}
				{:else if isBlockquote(p)}
					<blockquote class="worked-example">{@html renderInline(stripBlockquote(p))}</blockquote>
				{:else}
					<p>{@html renderInline(p)}</p>
				{/if}
			{/each}
			<div class="phase-actions">
				<button class="phase-continue primary" type="button" onclick={continueToDrill}>
					Continue to drills &rsaquo;
				</button>
			</div>
		</section>
	{:else if currentPhase === 1}
		<section class="sec">
			<h2>Drill</h2>
			<FrcDrillPhase {unit} onContinue={continueToQuiz} onReviewBrief={reviewBrief} />
		</section>
	{:else if currentPhase === 2}
		<section class="sec">
			<h2>Gate</h2>
			{#if gate?.enabled}
				<FrcQuizGate
					endpoint={resolvedEndpoint}
					domainId={domain.id}
					nextUnit={next ? { n: next.n, title: next.title } : null}
					initial={{
						testLength: gate.testLength,
						passPercent: gate.passPercent,
						unitComplete: gate.unitComplete,
						cooldownRemainingSec: gate.cooldownRemainingSec
					}}
					onPass={onQuizPass}
				/>
			{:else if modelGate?.enabled}
				<FrcModelGate
					ready={modelGate.ready}
					submission={modelGate.submission}
					unitComplete={modelGate.unitComplete}
					nextUnit={next ? { n: next.n, title: next.title } : null}
					domainId={domain.id}
					gateName={gateLabel(unit.gate)}
					onSubmit={onModelSubmit ?? (async () => ({ error: 'Submitting is not available here.' }))}
				/>
			{:else}
				<div class="frc-card gate-card">
					<div class="gate-head">
						<span class="frc-state available">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
								<path d="M12 3l7.5 3.5v5c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9v-5z" />
							</svg>
							{gateLabel(unit.gate)}
						</span>
						<span class="gate-pass">Pass at {unit.gatePass}%</span>
					</div>
					<p>{unit.gateDescription}</p>
					<p class="gate-note">Gate attempts are not enabled yet. This describes how the unit will be checked.</p>
				</div>
			{/if}
		</section>
	{:else}
		<section class="sec">
			<h2>Apply</h2>
			{#if unlockedThrough >= 3}
				{#each unit.apply as p (p)}
					<p>{p}</p>
				{/each}
			{:else}
				<div class="frc-card apply-locked">
					<span class="frc-state locked">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="5" y="11" width="14" height="9" rx="1.5" />
							<path d="M8 11V7.5a4 4 0 018 0V11" />
						</svg>
						Locked
					</span>
					<p class="gate-note">Pass the quiz to unlock Apply.</p>
				</div>
			{/if}
		</section>
	{/if}
</article>

<nav class="unit-nav" aria-label="Unit navigation">
	{#if prev}
		<a class="unit-nav-link prev" href="/frc/{domain.id}/{prev.n}">
			<span class="nav-dir">&lsaquo; Previous</span>
			<span class="nav-title">{prev.title}</span>
		</a>
	{:else}
		<span></span>
	{/if}
	{#if next}
		<a class="unit-nav-link next" href="/frc/{domain.id}/{next.n}">
			<span class="nav-dir">Next &rsaquo;</span>
			<span class="nav-title">{next.title}</span>
		</a>
	{:else}
		<a class="unit-nav-link next" href="/frc/{domain.id}">
			<span class="nav-dir">Done &rsaquo;</span>
			<span class="nav-title">Back to {domain.title}</span>
		</a>
	{/if}
</nav>

<style>
	.crumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		flex-wrap: wrap;
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
		gap: 0.6rem;
		padding: 1.1rem 0 1.5rem;
		border-bottom: 1px solid var(--frc-line, #dde1e8);
	}
	.head h1 {
		font-size: clamp(1.7rem, 4vw, 2.4rem);
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 1.6rem;
		margin-top: 0.2rem;
	}
	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.meta-key {
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.meta-val {
		font-size: 0.95rem;
		font-weight: 500;
		color: var(--frc-ink, #231f20);
	}
	.meta-val a {
		text-decoration: none;
	}
	.meta-val a:hover {
		text-decoration: underline;
	}
	.unit-body {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		padding: 0.8rem 0 1rem;
		max-width: 72ch;
	}
	.sec h2 {
		font-size: 1.15rem;
		color: var(--frc-blue, #0066b3);
		margin-bottom: 0.7rem;
		padding-bottom: 0.35rem;
		border-bottom: 2px solid var(--frc-red, #ed1c24);
		display: inline-block;
	}
	.sec p {
		margin: 0 0 0.85rem;
		color: #333133;
		line-height: 1.6;
	}
	.sec p:last-child {
		margin-bottom: 0;
	}
	/* Worked-example callout: a Brief paragraph marked by the parser as a
	   blockquote, styled distinct from plain body copy (tinted panel, blue
	   accent bar) per the FRC theme. */
	.worked-example {
		margin: 0 0 0.85rem;
		padding: 0.85rem 1.1rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		border-radius: 0 8px 8px 0;
		color: var(--frc-ink, #231f20);
		line-height: 1.6;
	}
	.worked-example:last-child {
		margin-bottom: 0;
	}
	/* Concept diagram: a `[[diagram:KEY|caption]]` Brief paragraph, rendered as
	   a centered figure. The SVG scales responsively inside a capped-width,
	   thin FRC-themed frame (reusing the shared .frc-card look); the caption
	   sits below in the same muted, italic note style as .gate-note. */
	.brief-diagram {
		margin: 0 0 0.85rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.brief-diagram:last-child {
		margin-bottom: 0;
	}
	.diagram-frame {
		width: 100%;
		max-width: 480px;
		box-sizing: border-box;
		padding: 1rem;
		display: flex;
		justify-content: center;
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 10px;
		box-shadow: 0 1px 2px rgba(35, 31, 32, 0.06);
	}
	.diagram-frame img {
		width: 100%;
		height: auto;
		display: block;
	}
	.brief-diagram figcaption {
		max-width: 480px;
		text-align: center;
		font-size: 0.82rem;
		font-style: italic;
		color: var(--frc-gray, #9a989a);
		line-height: 1.5;
	}
	.sec :global(strong) {
		font-weight: 700;
		color: var(--frc-ink, #231f20);
	}
	/* Brief -> Drill: the student's own choice, never a graded gate. */
	.phase-actions {
		margin-top: 1.3rem;
	}
	.phase-continue {
		display: inline-block;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		color: #fff;
		background: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.55rem 1rem;
		cursor: pointer;
	}
	.phase-continue:hover {
		background: var(--frc-blue-deep, #004f8a);
	}
	.gate-card {
		padding: 1rem 1.1rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
	}
	.gate-head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
	}
	.gate-pass {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.gate-card p {
		margin: 0 0 0.6rem;
		color: #333133;
		line-height: 1.6;
	}
	.gate-note {
		font-size: 0.82rem;
		font-style: italic;
		color: var(--frc-gray, #9a989a) !important;
		margin-bottom: 0 !important;
	}
	/* Apply, locked: shown until the Quiz phase's gate is passed/approved. */
	.apply-locked {
		padding: 1rem 1.1rem;
		border-left: 4px solid var(--frc-gray, #9a989a);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.6rem;
	}
	.unit-nav {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 2.4rem;
		padding-top: 1.2rem;
		border-top: 1px solid var(--frc-line, #dde1e8);
	}
	.unit-nav-link {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		text-decoration: none;
		max-width: 45%;
	}
	.unit-nav-link.next {
		text-align: right;
		margin-left: auto;
	}
	.nav-dir {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
	}
	.nav-title {
		font-weight: 500;
		font-size: 0.9rem;
		color: var(--frc-ink, #231f20);
	}
	.unit-nav-link:hover .nav-dir {
		color: var(--frc-red, #ed1c24);
	}
	.unit-nav-link:hover .nav-title {
		text-decoration: underline;
	}
</style>
