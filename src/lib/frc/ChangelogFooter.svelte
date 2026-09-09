<script lang="ts">
	import { latest, total } from 'virtual:site-versions';
	import type { VersionEntry } from '$lib/site-versions';
	import Pending from '$lib/Pending.svelte';

	/**
	 * Compact footer changelog for the FRC track. Auto-populated at build time
	 * from git history via the existing `virtual:site-*` substrate
	 * (vite.config.ts reads the full commit log into it), so there is NO manual
	 * upkeep: each deploy regenerates it. Presented as an unobtrusive disclosure
	 * ("Changelog") that opens a short, capped list of recent entries, each a
	 * date and a summary.
	 *
	 * THE LIST IS FETCHED ON OPEN, AND THE SUMMARY LINE IS NOT. This component
	 * shows eight entries and used to import all 1,433 of them to do it, which
	 * put a 247 KB chunk on the FRC track (and, through the shared chunk it
	 * landed in, on every other route in the site -- see vite.config.ts). The
	 * log now arrives from `virtual:site-changelog` when the disclosure is
	 * actually opened.
	 *
	 * `latest` AND `total` STAY EAGER BECAUSE THE COLLAPSED STATE RENDERS THEM.
	 * The summary says "Updated <date>" while closed and the whole component is
	 * gated on there being any history at all, so deferring those two would have
	 * changed what a server-rendered page shows and what a reader sees before
	 * they touch anything. They are two scalars, not a second copy of the log.
	 */

	const LIMIT = 8;

	let recent = $state<VersionEntry[]>([]);
	let loading = $state(false);
	/* Plain, NOT `$state`: this is the "have we already started" latch, and a
	   reactive read of it inside the handler that also writes `recent` would be
	   a dependency on a value this same path sets. */
	let started = false;

	/**
	 * Load on the disclosure's own toggle rather than on a click handler: a
	 * `<details>` can be opened by keyboard, by `find in page` and by the browser
	 * restoring its state, and `toggle` is the one event that fires for all of
	 * them. Failing to load leaves the list empty and the summary intact, which
	 * is the same thing a build with no git history shows.
	 */
	async function onToggle(event: Event) {
		if (!(event.currentTarget as HTMLDetailsElement).open || started) return;
		started = true;
		loading = true;
		try {
			const { entries } = await import('virtual:site-changelog');
			recent = entries.slice(0, LIMIT);
		} finally {
			loading = false;
		}
	}
</script>

{#if total}
	<details class="cl" ontoggle={onToggle}>
		<summary>
			<span class="cl-label">Changelog</span>
			{#if latest}<span class="cl-latest">Updated {latest.date}</span>{/if}
			<span class="cl-chev" aria-hidden="true">&#9662;</span>
		</summary>
		{#if loading}
			<Pending label="Loading the changelog" />
		{:else}
			<ul class="cl-list">
				{#each recent as e (e.sha)}
					<li>
						<span class="cl-date">{e.date}</span>
						<span class="cl-note">{e.note}</span>
					</li>
				{/each}
			</ul>
		{/if}
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
