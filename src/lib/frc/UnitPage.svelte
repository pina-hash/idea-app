<script lang="ts">
	import { gateLabel, mdmUnitById, type MdmUnit } from '$lib/frc/mdm-content';
	import type { FrcDomain } from '$lib/frc/track';
	import FrcQuizGate from '$lib/frc/FrcQuizGate.svelte';

	/**
	 * A single CAD/Mechanical unit: its Brief, Drill, Gate, and Apply task. When
	 * a unit has a live knowledge-gate quiz (`gate.enabled`, currently MDM-1) the
	 * Gate section becomes the interactive attempt flow (FrcQuizGate); otherwise
	 * it shows the Gate DESCRIPTION only.
	 */
	let {
		domain,
		unit,
		prev,
		next,
		gate = null,
		quizEndpoint,
		onQuizPass
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
		/** Override the quiz POST target (dev harness); defaults to the real route. */
		quizEndpoint?: string;
		/** Optional pass hook (dev harness). */
		onQuizPass?: () => void;
	} = $props();

	const resolvedEndpoint = $derived(quizEndpoint ?? `/frc/${domain.id}/${unit.n}/quiz`);

	const num = $derived(String(unit.n).padStart(2, '0'));
	// Prerequisite title (the seed stores its id, e.g. "MDM-1").
	const prereq = $derived(
		unit.prerequisite && unit.prerequisite.toLowerCase() !== 'none'
			? mdmUnitById(unit.prerequisite)
			: undefined
	);
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
			<p>{p}</p>
		{/each}
	</section>

	<section class="sec">
		<h2>Drill</h2>
		<ol class="drill">
			{#each unit.drill as d (d)}
				<li>{d}</li>
			{/each}
		</ol>
		{#if unit.drillAnswers}
			<details class="answers">
				<summary>Show answer key</summary>
				<p>{unit.drillAnswers}</p>
			</details>
		{/if}
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
	.drill {
		margin: 0;
		padding-left: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.drill li {
		color: #333133;
		line-height: 1.55;
		padding-left: 0.3rem;
	}
	.drill li::marker {
		font-weight: 700;
		font-style: italic;
		color: var(--frc-blue, #0066b3);
	}
	.answers {
		margin-top: 0.9rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 8px;
		background: var(--frc-surface, #fafbfd);
		padding: 0.4rem 0.9rem;
	}
	.answers summary {
		font-weight: 700;
		font-size: 0.82rem;
		color: var(--frc-blue, #0066b3);
		cursor: pointer;
		padding: 0.35rem 0;
	}
	.answers p {
		margin: 0.3rem 0 0.6rem;
		font-size: 0.9rem;
		color: #5c5a5c;
		line-height: 1.55;
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
