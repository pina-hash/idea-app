<script lang="ts">
	import { gateLabel, mdmUnitById, type MdmUnit } from '$lib/frc/mdm-content';
	import { isBlockquote, parseDiagram, renderInline, stripBlockquote } from '$lib/frc/inline-markup';
	import { DIAGRAMS } from '$lib/frc/diagrams';
	import type { FrcDomain } from '$lib/frc/track';
	import type { GateSubmission } from '$lib/frc/gate-submissions';
	import FrcQuizGate from '$lib/frc/FrcQuizGate.svelte';
	import FrcModelGate from '$lib/frc/FrcModelGate.svelte';

	/**
	 * A single CAD/Mechanical unit: its Brief, Drill, Gate, and Apply task. The
	 * Gate section renders per gate type:
	 *   - knowledge units (`gate.enabled`, MDM-1/2/3/9/10): the interactive quiz
	 *     flow (FrcQuizGate);
	 *   - modeling units (`modelGate.enabled`, MDM-4 through MDM-8): the model
	 *     submission panel (FrcModelGate);
	 *   - otherwise: the Gate DESCRIPTION only.
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

	/**
	 * Drill retrieval-practice state: per-question typed attempt, whether it has
	 * been checked (revealing the model answer), and an optional self-mark.
	 * Entirely client-side and per-page, never persisted; MDM_UNITS is a stable
	 * module-level array (parsed once from the seed), so `unit` keeps the same
	 * object reference across re-renders of the SAME unit and only changes
	 * reference on a real navigation to a different unit, which is exactly when
	 * this state should reset.
	 */
	type Mark = 'had-it' | 'review' | null;
	let attempts = $state<string[]>([]);
	let checked = $state<boolean[]>([]);
	let marks = $state<Mark[]>([]);

	$effect(() => {
		const count = unit.drill.length;
		attempts = Array(count).fill('');
		checked = Array(count).fill(false);
		marks = Array(count).fill(null) as Mark[];
	});

	const checkedCount = $derived(checked.filter(Boolean).length);
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

<article class="unit-body">
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
	</section>

	<section class="sec">
		<h2>Drill</h2>
		<p class="drill-progress">{checkedCount} of {unit.drill.length} checked</p>
		<ol class="drill">
			{#each unit.drill as d, i (d)}
				{@const answer = unit.drillAnswers[i]}
				{@const attempted = !!attempts[i]?.trim()}
				<li class="drill-item">
					<span class="drill-q">{d}</span>
					<div class="drill-attempt">
						<label class="drill-label" for="drill-{unit.id}-{i}">Write your answer from memory.</label>
						<textarea
							id="drill-{unit.id}-{i}"
							class="drill-input"
							rows="2"
							placeholder="Type what you remember, then check it."
							value={attempts[i] ?? ''}
							oninput={(e) => (attempts[i] = e.currentTarget.value)}
						></textarea>
						{#if !checked[i]}
							<button
								type="button"
								class="drill-check"
								disabled={!attempted}
								onclick={() => (checked[i] = true)}
							>
								Check answer
							</button>
						{/if}
					</div>
					{#if checked[i]}
						{#if answer}
							<div class="drill-model">
								<span class="drill-model-label">Model answer</span>
								<p class="drill-model-text">{answer}</p>
								<div class="drill-mark">
									<button
										type="button"
										class="mark-btn had-it"
										class:active={marks[i] === 'had-it'}
										aria-pressed={marks[i] === 'had-it'}
										onclick={() => (marks[i] = 'had-it')}
									>
										I had it
									</button>
									<button
										type="button"
										class="mark-btn review"
										class:active={marks[i] === 'review'}
										aria-pressed={marks[i] === 'review'}
										onclick={() => (marks[i] = 'review')}
									>
										Review this
									</button>
								</div>
							</div>
						{:else}
							<div class="drill-model">
								<span class="drill-missing">Model answer not yet added</span>
							</div>
						{/if}
					{/if}
				</li>
			{/each}
		</ol>
	</section>

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

	<section class="sec">
		<h2>Apply</h2>
		{#each unit.apply as p (p)}
			<p>{p}</p>
		{/each}
	</section>
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
		padding: 1.8rem 0 1rem;
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
	/* Progress line: "N of M checked", the only cross-question state on the page. */
	.drill-progress {
		margin: -0.3rem 0 0.9rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.drill {
		margin: 0;
		padding-left: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.drill-item {
		color: #333133;
		line-height: 1.55;
		padding-left: 0.3rem;
	}
	.drill-item::marker {
		font-weight: 700;
		font-style: italic;
		color: var(--frc-blue, #0066b3);
	}
	.drill-q {
		display: block;
		margin-bottom: 0.5rem;
	}
	/* Active-retrieval attempt box: the student must type something here
	   before the model answer can be checked. */
	.drill-attempt {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.drill-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.drill-input {
		width: 100%;
		box-sizing: border-box;
		resize: vertical;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
		color: var(--frc-ink, #231f20);
		font-family: inherit;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.drill-input:focus-visible {
		outline: none;
		border-color: var(--frc-blue, #0066b3);
	}
	.drill-check {
		align-self: flex-start;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		background: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.drill-check:hover:not(:disabled) {
		background: var(--frc-blue-deep, #004f8a);
	}
	/* Disabled until an attempt is typed: the model answer cannot be seen
	   before the student has tried, on purpose. */
	.drill-check:disabled {
		background: none;
		color: var(--frc-gray, #9a989a);
		border-color: var(--frc-line, #dde1e8);
		cursor: not-allowed;
	}
	/* Model-answer panel: distinct FRC-themed callout directly below the
	   student's own attempt, so the two sit side by side for comparison. */
	.drill-model {
		margin-top: 0.6rem;
		padding: 0.75rem 0.9rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		border-radius: 0 8px 8px 0;
	}
	.drill-model-label {
		display: block;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
		margin-bottom: 0.3rem;
	}
	.drill-model-text {
		margin: 0 0 0.6rem;
		color: var(--frc-ink, #231f20);
		font-size: 0.9rem;
		line-height: 1.55;
	}
	.drill-mark {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.mark-btn {
		font-family: inherit;
		font-weight: 700;
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: var(--frc-surface, #fafbfd);
		border-radius: 999px;
		padding: 0.32rem 0.75rem;
		cursor: pointer;
	}
	.mark-btn.had-it {
		color: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
	}
	.mark-btn.had-it:hover,
	.mark-btn.had-it.active {
		color: #fff;
		background: var(--frc-blue, #0066b3);
	}
	.mark-btn.review {
		color: var(--frc-red, #ed1c24);
		border: 1px solid rgba(237, 28, 36, 0.4);
	}
	.mark-btn.review:hover,
	.mark-btn.review.active {
		color: #fff;
		background: var(--frc-red, #ed1c24);
	}
	/* Visibly incomplete, not silently broken: a question with no authored
	   answer key shows this once checked, instead of a fabricated answer. */
	.drill-missing {
		display: inline-block;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		font-style: italic;
		color: var(--frc-gray, #9a989a);
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
