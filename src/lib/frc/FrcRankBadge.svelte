<script lang="ts">
	import { rankForCount, nextRank, FRC_RANKS } from '$lib/frc/track';

	/**
	 * The student's FRC rank, computed from their completed CAD-track unit count
	 * (rank logic lives in track.ts). Two sizes: a compact chip for the shell
	 * header (near the profile) and a prominent block for the track view hero.
	 * Rank is FIRST Blue chrome; the achievement IDEA-green is reserved for the
	 * completion progress fill only.
	 */
	let { count = 0, size = 'sm' }: { count?: number; size?: 'sm' | 'lg' } = $props();

	const rank = $derived(rankForCount(count));
	const next = $derived(nextRank(count));
	const topThreshold = $derived(FRC_RANKS[FRC_RANKS.length - 1].minComplete);
	// Progress toward the next rank (or full bar once at the top rank).
	const pct = $derived(next ? Math.min(100, Math.round((count / next.minComplete) * 100)) : 100);
</script>

{#if size === 'lg'}
	<div class="rank-block">
		<span class="rank-eyebrow">Rank</span>
		<span class="rank-name">{rank.name}</span>
		<div class="rank-bar" aria-hidden="true"><span class="rank-fill" style="width:{pct}%"></span></div>
		<span class="rank-meta">
			{count} CAD unit{count === 1 ? '' : 's'} complete
			{#if next}&middot; {next.minComplete - count} to {next.name}{:else}&middot; top rank{/if}
		</span>
	</div>
{:else}
	<span
		class="rank-chip"
		title="FRC rank: {rank.name} ({count}/{topThreshold} CAD units)"
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M6 21v-7M6 14l3-1.5 3 1.5 3-1.5 3 1.5V5l-3 1.5L12 5 9 6.5 6 5z" />
		</svg>
		<span class="rank-chip-name">{rank.name}</span>
		<span class="rank-chip-count">{count}</span>
	</span>
{/if}

<style>
	.rank-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.55rem;
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
		border-radius: 999px;
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
		color: var(--frc-blue, #0066b3);
		white-space: nowrap;
	}
	.rank-chip svg {
		width: 0.9rem;
		height: 0.9rem;
	}
	.rank-chip-name {
		font-weight: 700;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.rank-chip-count {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--frc-gray, #9a989a);
	}

	.rank-block {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.9rem 1.1rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-left: 4px solid var(--frc-blue, #0066b3);
		border-radius: 8px;
		background: var(--frc-surface, #fafbfd);
		min-width: 220px;
	}
	.rank-eyebrow {
		font-weight: 700;
		font-size: 0.62rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.rank-name {
		font-family: 'Roboto', sans-serif;
		font-weight: 700;
		font-style: italic;
		font-size: 1.5rem;
		color: var(--frc-ink, #231f20);
		line-height: 1;
	}
	.rank-bar {
		height: 6px;
		border-radius: 999px;
		background: rgba(154, 152, 154, 0.25);
		overflow: hidden;
		margin-top: 0.15rem;
	}
	.rank-fill {
		display: block;
		height: 100%;
		border-radius: 999px;
		/* Achievement fill: the one place IDEA green appears here. */
		background: var(--frc-achieve, #00ff41);
	}
	.rank-meta {
		font-size: 0.72rem;
		color: var(--frc-gray, #9a989a);
	}
</style>
