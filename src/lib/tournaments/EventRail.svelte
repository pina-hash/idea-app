<script lang="ts">
	import { bracketProgress } from './live';
	import { formatDuration, msBetween, tournamentStats, type BracketMatch } from './tournaments';

	/**
	 * THE EVENT RAIL (prompt 0077): a bracket that fills in, and a clock.
	 *
	 * A tournament is an event, and the two things the classroom does not
	 * have are a bracket visibly filling up and a clock running on it. This
	 * strip draws one cell per contested match in play order -- done, live,
	 * still to play -- beside the count and the wall clock since the first
	 * match was called. It is what stops the public page reading as a list
	 * of cards.
	 *
	 * Presentation only, and `now` is THREADED IN from the caller (CLAUDE.md:
	 * a component reading its own clock disagrees with the ranking it is
	 * rendering, and a pinned instant is what makes it assertable). The rail
	 * paints no emerald: the live cell is the room's status red, the done
	 * cells are ink, so the page's one emerald element stays the LIVE chip.
	 */
	let {
		matches,
		now,
		dense = false
	}: {
		matches: BracketMatch[];
		/** Epoch ms; null renders no clock at all. */
		now: number | null;
		/** Compact for a console header. */
		dense?: boolean;
	} = $props();

	const progress = $derived(bracketProgress(matches));
	const stats = $derived(tournamentStats(matches));
	const started = $derived(stats.firstStartedAt);
	const finished = $derived(progress.total > 0 && progress.played === progress.total);
	const elapsed = $derived(
		finished
			? stats.totalDurationMs
			: now === null || !started
				? null
				: msBetween(started, new Date(now).toISOString())
	);
</script>

<div class="rail" class:dense data-testid="event-rail">
	<div class="cells" role="img" aria-label={`${progress.played} of ${progress.total} matches played`}>
		{#each progress.cells as cell, i (i)}
			<span class="cell {cell}"></span>
		{/each}
	</div>
	<div class="figures">
		<span class="count">
			<strong>{progress.played}</strong> of {progress.total} played{#if progress.live}
				· <strong>{progress.live}</strong> live{/if}
		</span>
		{#if elapsed !== null}
			<span class="clock" aria-label={finished ? 'Total running time' : 'Running time'}>
				<span class="clock-word">{finished ? 'ran' : 'running'}</span>
				{formatDuration(elapsed)}
			</span>
		{/if}
	</div>
</div>

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		min-width: 0;
	}
	.cells {
		display: flex;
		gap: 3px;
		height: 0.55rem;
	}
	.dense .cells {
		height: 0.4rem;
	}
	.cell {
		flex: 1 1 0;
		min-width: 3px;
		border-radius: 2px;
		background: var(--tnm-line-strong, rgba(237, 237, 232, 0.22));
	}
	.cell.done {
		background: var(--tnm-ink-dim, #93a09a);
	}
	.cell.live {
		background: var(--crimson, #d95f5f);
		animation: rail-pulse 1.2s ease-in-out infinite;
	}
	@keyframes rail-pulse {
		50% {
			opacity: 0.35;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.cell.live {
			animation: none;
		}
	}
	.figures {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim, var(--dim));
	}
	.dense .figures {
		font-size: 0.66rem;
	}
	.figures strong {
		color: var(--tnm-ink, var(--white));
		font-weight: 400;
	}
	.clock {
		font-variant-numeric: tabular-nums;
		color: var(--tnm-ink, var(--white));
	}
	.clock-word {
		color: var(--tnm-ink-dim, var(--dim));
		margin-right: 0.35em;
	}
</style>
