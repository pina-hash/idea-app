<script lang="ts">
	import { entries } from 'virtual:site-versions';

	/**
	 * Compact footer changelog for the FRC track. Auto-populated at build time
	 * from git history via the existing `virtual:site-versions` substrate
	 * (vite.config.ts reads the full commit log into this module), so there is
	 * NO manual upkeep: each deploy regenerates it. Presented as an unobtrusive
	 * disclosure ("Changelog") that opens a short, capped list of recent
	 * entries, each a date and a summary.
	 */

	const LIMIT = 8;
	const recent = entries.slice(0, LIMIT);
	const latest = recent[0];
</script>

{#if recent.length}
	<details class="cl">
		<summary>
			<span class="cl-label">Changelog</span>
			{#if latest}<span class="cl-latest">Updated {latest.date}</span>{/if}
			<span class="cl-chev" aria-hidden="true">&#9662;</span>
		</summary>
		<ul class="cl-list">
			{#each recent as e (e.sha)}
				<li>
					<span class="cl-date">{e.date}</span>
					<span class="cl-note">{e.note}</span>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	.cl {
		font-size: 0.72rem;
	}
	.cl summary {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		cursor: pointer;
		list-style: none;
		color: var(--frc-gray, #9a989a);
	}
	.cl summary::-webkit-details-marker {
		display: none;
	}
	.cl-label {
		font-weight: 700;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--frc-blue, #0066b3);
	}
	.cl-latest {
		font-size: 0.68rem;
		color: var(--frc-gray, #9a989a);
	}
	.cl-chev {
		font-size: 0.6rem;
		color: var(--frc-blue, #0066b3);
		transition: transform 0.15s ease;
	}
	.cl[open] .cl-chev {
		transform: rotate(180deg);
	}
	.cl-list {
		list-style: none;
		margin: 0.7rem 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 70ch;
	}
	.cl-list li {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
		line-height: 1.4;
	}
	.cl-date {
		flex-shrink: 0;
		width: 6.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--frc-gray, #9a989a);
	}
	.cl-note {
		color: #4a4849;
	}
</style>
