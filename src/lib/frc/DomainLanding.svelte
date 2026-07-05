<script lang="ts">
	import { placeholderUnitState, type FrcDomain, type UnitState } from '$lib/frc/track';

	/**
	 * Reusable domain landing page: the domain's units as cards, each in one of
	 * three visual states (locked / available / complete), or a clean "content
	 * in development" placeholder for a domain with no units yet. States come
	 * from placeholderUnitState() until the real gating layer lands; cards are
	 * intentionally not links yet (unit content comes later).
	 */

	let { domain }: { domain: FrcDomain } = $props();

	const stateOf = (n: number): UnitState => placeholderUnitState(n);
	const STATE_LABEL: Record<UnitState, string> = {
		locked: 'Locked',
		available: 'Available',
		complete: 'Complete'
	};
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

{#if domain.units.length}
	<ol class="units">
		{#each domain.units as u (u.n)}
			{@const state = stateOf(u.n)}
			<li class="frc-card unit unit-{state}">
				<span class="unit-n" aria-hidden="true">{String(u.n).padStart(2, '0')}</span>
				<span class="unit-title">{u.title}</span>
				<span class="frc-state {state}">
					{#if state === 'locked'}
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
							<rect x="5" y="11" width="14" height="9" rx="1.5" />
							<path d="M8 11V7.5a4 4 0 018 0V11" />
						</svg>
					{:else if state === 'available'}
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
			</li>
		{/each}
	</ol>
{:else}
	<div class="frc-card in-dev">
		<span class="in-dev-glyphs" aria-hidden="true">
			<svg viewBox="0 0 64 30" fill="none" stroke-width="2.4" stroke-linejoin="round">
				<path d="M12.5 5.5L22.5 24H2.5z" stroke="#9a989a" />
				<circle cx="31" cy="15" r="9.8" stroke="#9a989a" />
				<path d="M42 5.5h19v19H42z" stroke="#9a989a" />
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
	.unit {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		padding: 0.8rem 1rem;
		border-left: 4px solid var(--frc-line, #dde1e8);
	}
	.unit-n {
		font-weight: 700;
		font-style: italic;
		font-size: 1.15rem;
		color: var(--frc-gray, #9a989a);
		min-width: 2ch;
	}
	.unit-title {
		font-weight: 500;
		font-size: 0.95rem;
		color: var(--frc-ink, #231f20);
		flex: 1;
	}
	.frc-state {
		margin-left: auto;
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
	.unit-locked {
		background: #f3f4f6;
	}
	.unit-locked .unit-title {
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
		width: 96px;
		height: 45px;
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
