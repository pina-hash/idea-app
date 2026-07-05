<script lang="ts">
	import { FRC_REFERENCES } from '$lib/frc/track';

	/**
	 * The reference shelf: cross-cutting external references, grouped. Every
	 * entry opens in a new tab; these are the shared sources units point back
	 * to, not unit content.
	 */
</script>

<nav class="crumb" aria-label="Breadcrumb">
	<a href="/frc">FRC Training</a>
	<span aria-hidden="true">/</span>
	<span class="here">References</span>
</nav>

<section class="head">
	<span class="frc-eyebrow">Cross-cutting</span>
	<h1>Reference shelf</h1>
	<p class="lead">
		The sources this track leans on across every domain. Bookmark the ones your role touches;
		units link back here rather than duplicating them.
	</p>
</section>

{#each FRC_REFERENCES as group (group.label)}
	<section class="ref-group">
		<h2>{group.label}</h2>
		<ul>
			{#each group.refs as ref (ref.title)}
				<li class="frc-card ref">
					<a href={ref.url} target="_blank" rel="noopener noreferrer">
						<span class="ref-main">
							<span class="ref-title">{ref.title}</span>
							<span class="ref-note">{ref.note}</span>
						</span>
						<span class="ref-ext" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M8 6h10v10M18 6L6 18" />
							</svg>
						</span>
						<span class="visually-hidden">(opens in a new tab)</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/each}

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
		padding: 1.1rem 0 1.5rem;
	}
	.head h1 {
		font-size: clamp(1.7rem, 4vw, 2.4rem);
	}
	.lead {
		margin: 0;
		max-width: 62ch;
		color: #5c5a5c;
	}
	.ref-group {
		margin-bottom: 1.6rem;
	}
	.ref-group h2 {
		font-size: 1.02rem;
		color: var(--frc-blue, #0066b3);
		margin-bottom: 0.6rem;
	}
	.ref-group ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.7rem;
	}
	.ref a {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.85rem 1rem;
		text-decoration: none;
		height: 100%;
	}
	.ref-main {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
	}
	.ref-title {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--frc-blue, #0066b3);
	}
	.ref a:hover .ref-title {
		text-decoration: underline;
	}
	.ref-note {
		font-size: 0.8rem;
		color: #5c5a5c;
	}
	.ref-ext {
		width: 16px;
		height: 16px;
		color: var(--frc-gray, #9a989a);
		flex-shrink: 0;
	}
	.ref a:hover .ref-ext {
		color: var(--frc-red, #ed1c24);
	}
	.ref-ext svg {
		width: 100%;
		height: 100%;
	}
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
</style>
