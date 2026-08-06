<script lang="ts">
	import EntryChip from './EntryChip.svelte';
	import {
		bracketLayout,
		isByeMatch,
		matchScoreline,
		type BracketMatch,
		type MatchGame,
		type TournamentEntry
	} from './tournaments';

	/**
	 * The live double-elimination bracket, presentation only (state in via
	 * props, the Minimap convention): winners rounds, losers rounds, then the
	 * grand final (+ reset once it exists). Fully public data.
	 */
	let {
		matches,
		entries,
		games = [],
		championId = null
	}: {
		matches: BracketMatch[];
		entries: Record<string, TournamentEntry>;
		games?: MatchGame[];
		championId?: string | null;
	} = $props();

	const layout = $derived(bracketLayout(matches));

	const sections = $derived(
		[
			{ id: 'winners', title: 'Winners bracket', columns: layout.winners },
			{ id: 'losers', title: 'Losers bracket', columns: layout.losers },
			{ id: 'finals', title: 'Finals', columns: layout.finals }
		].filter((s) => s.columns.length > 0)
	);
</script>

{#snippet side(m: BracketMatch, entryId: string | null)}
	{@const decided = m.status === 'complete' && m.winner_id !== null}
	<div class="side" class:lost={decided && entryId !== null && m.winner_id !== entryId}>
		<EntryChip
			entry={entryId ? (entries[entryId] ?? null) : null}
			seed={entryId ? entries[entryId]?.seed : null}
			winner={decided && m.winner_id === entryId}
		/>
		{#if decided && m.winner_id === entryId}
			<span class="win-mark" aria-label="winner">W</span>
		{/if}
	</div>
{/snippet}

<div class="bracket-scroll">
	{#each sections as section (section.id)}
		<div class="bracket-section">
			<h3 class="section-title">{section.title}</h3>
			<div class="rounds">
				{#each section.columns as col (col.bracket + ':' + col.round)}
					<div class="round">
						<div class="round-label">{col.label}</div>
						<div class="round-matches">
							{#each col.matches as m (m.id)}
								{@const scoreline = matchScoreline(m, games)}
								<div
									class="match"
									class:live={m.status === 'in_progress'}
									class:done={m.status === 'complete'}
									class:bye={isByeMatch(m)}
								>
									<div class="match-head">
										<span class="match-id">M{m.slot}</span>
										{#if m.best_of > 1}
											<span class="best-of">Bo{m.best_of}</span>
										{/if}
										{#if m.status === 'in_progress'}
											<span class="live-chip">LIVE</span>
										{:else if isByeMatch(m)}
											<span class="bye-chip">{m.winner_id ? 'BYE' : '—'}</span>
										{:else if scoreline}
											<span class="scoreline">{scoreline}</span>
										{/if}
									</div>
									{@render side(m, m.entry_a_id)}
									{@render side(m, m.entry_b_id)}
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
	{#if championId && entries[championId]}
		<div class="champion">
			<span class="champion-label">Champion</span>
			<EntryChip entry={entries[championId]} winner />
		</div>
	{/if}
</div>

<style>
	.bracket-scroll {
		overflow-x: auto;
		padding-bottom: 0.5rem;
	}
	.bracket-section {
		margin-bottom: 1.4rem;
	}
	.section-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--dim, #7a8a7a);
		margin: 0 0 0.6rem;
	}
	.rounds {
		display: flex;
		gap: 1.1rem;
		align-items: stretch;
	}
	.round {
		display: flex;
		flex-direction: column;
		min-width: 13.5rem;
	}
	.round-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
		opacity: 0.85;
		margin-bottom: 0.5rem;
	}
	.round-matches {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.7rem;
		flex: 1;
	}
	.match {
		border: 1px solid var(--line, rgba(0, 255, 65, 0.18));
		background: var(--bg1, #0d120d);
		border-radius: 6px;
		padding: 0.45rem 0.6rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.match.live {
		border-color: var(--crimson, #ff3355);
		box-shadow: 0 0 10px rgba(255, 51, 85, 0.18);
	}
	.match.bye {
		opacity: 0.55;
	}
	.match-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim, #7a8a7a);
	}
	.best-of {
		color: var(--gold, #c8a848);
	}
	.scoreline {
		margin-left: auto;
		color: var(--white, #e8ffe8);
	}
	.live-chip {
		margin-left: auto;
		color: var(--crimson, #ff3355);
		animation: pulse 1.2s ease-in-out infinite;
	}
	.bye-chip {
		margin-left: auto;
	}
	@keyframes pulse {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.live-chip {
			animation: none;
		}
	}
	.side {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}
	.side.lost {
		opacity: 0.55;
	}
	.win-mark {
		margin-left: auto;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--green, #00ff41);
	}
	.champion {
		display: inline-flex;
		align-items: center;
		gap: 0.7rem;
		border: 1px solid var(--gold, #c8a848);
		border-radius: 6px;
		padding: 0.55rem 0.9rem;
		background: rgba(200, 168, 72, 0.08);
	}
	.champion-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--gold, #c8a848);
	}
</style>
