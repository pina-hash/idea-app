<script lang="ts">
	/**
	 * Tournament-level timing aggregates, derived from the same started_at /
	 * completed_at stamps the match detail page reads. Presentation only.
	 *
	 * DELIBERATELY SECONDARY. The bracket is the attraction on the page this
	 * sits under, so this is a quiet strip of neutral cells with a muted
	 * label -- no accent surface, no heading that competes with the bracket's,
	 * no chart. It renders nothing at all until at least one match has been
	 * timed, so an event that has not started yet shows no empty scaffolding.
	 */
	import {
		formatDuration,
		matchHref,
		roundLabel,
		tournamentStats,
		type BracketMatch,
		type TournamentEntry
	} from './tournaments';

	let {
		tournamentId,
		matches,
		entries = {}
	}: {
		tournamentId: string;
		matches: BracketMatch[];
		entries?: Record<string, TournamentEntry>;
	} = $props();

	const stats = $derived(tournamentStats(matches));

	function maxRound(bracket: string): number {
		return Math.max(0, ...matches.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	function describe(m: BracketMatch): string {
		const a = m.entry_a_id ? (entries[m.entry_a_id]?.display_name ?? '?') : '?';
		const b = m.entry_b_id ? (entries[m.entry_b_id]?.display_name ?? '?') : '?';
		return `${a} vs ${b}`;
	}
	const label = (m: BracketMatch) => roundLabel(m.bracket, m.round, maxRound(m.bracket));
</script>

{#if stats.timedCount > 0}
	<div class="stats">
		<span class="stats-label">Match timing</span>
		<div class="cells">
			<div class="cell">
				<span class="c-label">Average match</span>
				<span class="c-value">{formatDuration(stats.averageDurationMs)}</span>
				<span class="c-note">
					over {stats.timedCount} played match{stats.timedCount === 1 ? '' : 'es'}
				</span>
			</div>
			<div class="cell">
				<span class="c-label">Event span</span>
				<span class="c-value">{formatDuration(stats.totalDurationMs)}</span>
				<span class="c-note">first start to last result</span>
			</div>
			{#if stats.fastest}
				<a class="cell link" href={matchHref(tournamentId, stats.fastest.match.id)}>
					<span class="c-label">Fastest match</span>
					<span class="c-value">{formatDuration(stats.fastest.durationMs)}</span>
					<span class="c-note">
						{label(stats.fastest.match)} · {describe(stats.fastest.match)}
					</span>
				</a>
			{/if}
			{#if stats.slowest}
				<a class="cell link" href={matchHref(tournamentId, stats.slowest.match.id)}>
					<span class="c-label">Slowest match</span>
					<span class="c-value">{formatDuration(stats.slowest.durationMs)}</span>
					<span class="c-note">
						{label(stats.slowest.match)} · {describe(stats.slowest.match)}
					</span>
				</a>
			{/if}
		</div>
		<p class="foot">Byes and forfeits are excluded: neither was played.</p>
	</div>
{/if}

<style>
	.stats {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	/* Muted on purpose: every other section label on this page is the accent
	 * colour, and this one should not read as their equal. */
	.stats-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.cells {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
		gap: 0.5rem;
	}
	.cell {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		background: var(--tnm-panel, var(--bg1, #0d120d));
		border: 1px solid var(--tnm-line, rgba(255, 255, 255, 0.09));
		min-width: 0;
	}
	a.cell.link {
		text-decoration: none;
		color: inherit;
	}
	a.cell.link:hover,
	a.cell.link:focus-visible {
		border-color: var(--tnm-line-strong, rgba(255, 255, 255, 0.24));
	}
	.c-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.c-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.15rem;
		color: var(--tnm-ink, var(--white, #e8ffe8));
	}
	.c-note {
		font-size: 0.75rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.foot {
		margin: 0;
		font-size: 0.75rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		opacity: 0.85;
	}
</style>
