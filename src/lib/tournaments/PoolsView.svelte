<script lang="ts">
	import EntryChip from './EntryChip.svelte';
	import {
		poolStandings,
		type QualMatch,
		type QualPool,
		type TournamentEntry
	} from './tournaments';

	/**
	 * Qualifying pools: per-pool standings + the round-robin schedule.
	 * Presentation only; standings here are the display approximation (the
	 * authoritative tiebreaks run server-side at bracket generation).
	 */
	let {
		pools,
		matches,
		entries,
		scoreEntry = false
	}: {
		pools: QualPool[];
		matches: QualMatch[];
		entries: Record<string, TournamentEntry>;
		scoreEntry?: boolean;
	} = $props();

	const sortedPools = $derived([...pools].sort((a, b) => a.pool_number - b.pool_number));
	const matchesFor = (poolId: string) =>
		matches.filter((m) => m.pool_id === poolId).sort((a, b) => a.sequence - b.sequence);
</script>

<div class="pools">
	{#each sortedPools as pool (pool.id)}
		{@const poolMatches = matchesFor(pool.id)}
		{@const standings = poolStandings(poolMatches)}
		<div class="pool">
			<h3 class="pool-title">Pool {pool.pool_number}</h3>
			<table class="standings">
				<thead>
					<tr>
						<th class="left">Entry</th>
						<th>W–L</th>
						{#if scoreEntry}
							<th>PF</th>
							<th>PA</th>
							<th>+/−</th>
						{/if}
					</tr>
				</thead>
				<tbody>
					{#each standings as row (row.entryId)}
						<tr>
							<td class="left"><EntryChip entry={entries[row.entryId] ?? null} /></td>
							<td>{row.wins}–{row.losses}</td>
							{#if scoreEntry}
								<td>{row.pf}</td>
								<td>{row.pa}</td>
								<td>{row.diff > 0 ? '+' : ''}{row.diff}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
			<div class="schedule">
				{#each poolMatches as m (m.id)}
					<div class="qmatch" class:decided={m.winner_id !== null}>
						<span class="qside" class:won={m.winner_id === m.entry_a_id}>
							<EntryChip entry={entries[m.entry_a_id] ?? null} />
						</span>
						<span class="qscore">
							{#if m.winner_id && m.score_a !== null && m.score_b !== null}
								{m.score_a}–{m.score_b}
							{:else if m.winner_id}
								{m.winner_id === m.entry_a_id ? 'W–L' : 'L–W'}
							{:else}
								vs
							{/if}
						</span>
						<span class="qside right" class:won={m.winner_id === m.entry_b_id}>
							<EntryChip entry={entries[m.entry_b_id] ?? null} />
						</span>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</div>

<style>
	.pools {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr));
		gap: 1rem;
	}
	.pool {
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: var(--bg1, #0d120d);
		border-radius: 8px;
		padding: 0.9rem 1rem;
	}
	.pool-title {
		margin: 0 0 0.6rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.standings {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
		margin-bottom: 0.8rem;
	}
	.standings th,
	.standings td {
		padding: 0.25rem 0.4rem;
		text-align: center;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--white, #e8ffe8);
	}
	.standings th {
		color: var(--dim, #7a8a7a);
		font-weight: 400;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border-bottom: 1px solid var(--line, rgba(0, 255, 65, 0.18));
	}
	.standings .left {
		text-align: left;
	}
	.schedule {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.qmatch {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.5rem;
		padding: 0.3rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 5px;
	}
	.qmatch.decided {
		border-color: var(--line, rgba(0, 255, 65, 0.12));
	}
	.qside {
		min-width: 0;
		opacity: 0.6;
	}
	.qside.won,
	.qmatch:not(.decided) .qside {
		opacity: 1;
	}
	.qside.right {
		display: flex;
		justify-content: flex-end;
	}
	.qscore {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold, #c8a848);
		white-space: nowrap;
	}
</style>
