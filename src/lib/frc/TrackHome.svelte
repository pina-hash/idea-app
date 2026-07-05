<script lang="ts">
	import { FRC_DOMAINS, FRC_TEAM } from '$lib/frc/track';

	/**
	 * FRC Training track home: one card per domain, each linking to its domain
	 * landing page, plus the reference shelf callout. Structure only; unit
	 * progress and gating land later.
	 */

	// The accent language rotates the three outline shapes across the cards.
	const shapeFor = (i: number) => (['tri', 'circle', 'square'] as const)[i % 3];
</script>

<section class="track-hero">
	<span class="frc-eyebrow">{FRC_TEAM.name} &middot; {FRC_TEAM.org}</span>
	<h1>FRC Training</h1>
	<p class="lead">
		The {FRC_TEAM.name} training track: work through the domains below to go from new member to a
		trusted contributor on a competition robot. Open to every signed-in student, whatever your
		pathway.
	</p>
</section>

<h2 class="section-head">Domains</h2>
<div class="domain-grid">
	{#each FRC_DOMAINS as d, i (d.id)}
		<a class="frc-card domain-card" href="/frc/{d.id}">
			<span class="glyph glyph-{shapeFor(i)}" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
					{#if shapeFor(i) === 'tri'}
						<path d="M12 4.5L21 20H3z" />
					{:else if shapeFor(i) === 'circle'}
						<circle cx="12" cy="12" r="8.2" />
					{:else}
						<path d="M5 5h14v14H5z" />
					{/if}
				</svg>
			</span>
			<span class="domain-text">
				<span class="domain-title">{d.title}</span>
				<span class="domain-blurb">{d.blurb}</span>
			</span>
			<span class="domain-meta">
				<span class="domain-count">
					{d.units.length ? `${d.units.length} units` : 'In development'}
				</span>
				<span class="domain-cta">Open &rsaquo;</span>
			</span>
		</a>
	{/each}
</div>

<a class="frc-card refs-callout" href="/frc/references">
	<span class="refs-text">
		<span class="refs-title">Reference shelf</span>
		<span class="refs-blurb">
			Cross-cutting references used across every domain: design guides, WPILib, strategy, scouting
			data, and vendor docs.
		</span>
	</span>
	<span class="domain-cta">Browse &rsaquo;</span>
</a>

<style>
	/* Named track-hero, NOT .hero: the app shell has a global centered .hero. */
	.track-hero {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 1.2rem 0 2rem;
	}
	.track-hero h1 {
		font-size: clamp(2rem, 5vw, 2.9rem);
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		color: var(--frc-ink, #231f20);
		font-size: 1.02rem;
	}
	.section-head {
		font-size: 1.15rem;
		margin-bottom: 0.9rem;
		color: var(--frc-blue, #0066b3);
	}
	.domain-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
		gap: 0.9rem;
	}
	.domain-card {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 1.1rem 1.15rem 0.95rem;
		text-decoration: none;
		color: inherit;
		border-top: 3px solid var(--frc-blue, #0066b3);
		transition: box-shadow 0.15s ease, transform 0.15s ease;
	}
	.domain-card:hover {
		box-shadow: 0 4px 14px rgba(35, 31, 32, 0.12);
		transform: translateY(-1px);
	}
	.glyph {
		width: 30px;
		height: 30px;
		color: var(--frc-blue, #0066b3);
	}
	.glyph-circle {
		/* One red shape per triad: the emphasis accent, used sparingly. */
		color: var(--frc-red, #ed1c24);
	}
	.glyph-square {
		color: var(--frc-ink, #231f20);
	}
	.glyph svg {
		width: 100%;
		height: 100%;
	}
	.domain-text {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.domain-title {
		font-weight: 700;
		font-style: italic;
		font-size: 1.12rem;
		color: var(--frc-ink, #231f20);
	}
	.domain-blurb {
		font-size: 0.86rem;
		color: #5c5a5c;
	}
	.domain-meta {
		margin-top: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border-top: 1px solid var(--frc-line, #dde1e8);
		padding-top: 0.6rem;
	}
	.domain-count {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.domain-cta {
		font-weight: 700;
		font-size: 0.8rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
	}
	.domain-card:hover .domain-cta,
	.refs-callout:hover .domain-cta {
		color: var(--frc-red, #ed1c24);
	}
	.refs-callout {
		margin-top: 1.6rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.15rem;
		text-decoration: none;
		border-left: 4px solid var(--frc-blue, #0066b3);
	}
	.refs-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.refs-title {
		font-weight: 700;
		font-style: italic;
		font-size: 1.05rem;
		color: var(--frc-ink, #231f20);
	}
	.refs-blurb {
		font-size: 0.86rem;
		color: #5c5a5c;
		max-width: 70ch;
	}
</style>
