<script lang="ts">
	import { formatLapMs } from './track-runtime';
	import type { RaceOutcome } from './GreenlineRace.svelte';
	import type { LeaderboardEntry } from './persistence';

	/**
	 * GREENLINE post-race results screen. Presentation only (the Minimap / Garage
	 * convention: state in via props, intent out via callbacks): the finishing
	 * position / total time / best lap for the run, plus the track leaderboard.
	 * The /greenline route owns the submit + board fetch (the persistence seam)
	 * and passes the results here; /dev/greenline-portal mounts this same
	 * component with sample data so the layout is browser-verifiable without auth.
	 */
	const {
		outcome,
		trackName,
		board,
		boardLoading = false,
		submitting = false,
		submitError = false,
		myUserId,
		onRaceAgain,
		onGarage,
		onTitle
	}: {
		outcome: RaceOutcome | null;
		trackName: string;
		board: LeaderboardEntry[];
		boardLoading?: boolean;
		submitting?: boolean;
		submitError?: boolean;
		myUserId: string;
		onRaceAgain: () => void;
		onGarage: () => void;
		onTitle: () => void;
	} = $props();

	const boardName = (e: LeaderboardEntry) => e.display_name || e.full_name || 'Pilot';
</script>

<div class="gr-results">
	<div class="gr-head">RACE COMPLETE · {trackName}</div>
	{#if outcome}
		<div class="gr-stat-row">
			<div class="gr-stat">
				<span class="gr-stat-label">FINISH</span>
				<span class="gr-stat-val">P{outcome.finishPosition}</span>
			</div>
			<div class="gr-stat">
				<span class="gr-stat-label">TOTAL TIME</span>
				<span class="gr-stat-val">{formatLapMs(outcome.totalTimeMs)}</span>
			</div>
			<div class="gr-stat">
				<span class="gr-stat-label">BEST LAP</span>
				<span class="gr-stat-val">{formatLapMs(outcome.bestLapMs)}</span>
			</div>
		</div>
	{/if}

	<div class="gr-board-head">
		TRACK LEADERBOARD
		{#if submitting}<span class="gr-note">· submitting…</span>
		{:else if submitError}<span class="gr-note gr-warn">· offline, run not saved</span>{/if}
	</div>
	<div class="gr-board">
		{#if boardLoading}
			<div class="gr-note">loading…</div>
		{:else if board.length === 0}
			<div class="gr-note">
				no ranked runs yet{submitError ? ' (leaderboard unavailable offline)' : ''}
			</div>
		{:else}
			{#each board as e (e.user_id)}
				<div class="gr-board-row" class:me={e.user_id === myUserId}>
					<span class="gr-rank">{e.rank}</span>
					<span class="gr-pilot">{boardName(e)}</span>
					<span class="gr-arch">{(e.archetype ?? '').toUpperCase()}</span>
					<span class="gr-time">{formatLapMs(e.total_time_ms)}</span>
					<span class="gr-lap">best {formatLapMs(e.best_lap_ms)}</span>
				</div>
			{/each}
		{/if}
	</div>

	<div class="gr-actions">
		<button class="gr-btn gr-btn-primary" onclick={onRaceAgain}>RACE AGAIN</button>
		<button class="gr-btn" onclick={onGarage}>GARAGE</button>
		<button class="gr-btn" onclick={onTitle}>TITLE</button>
	</div>
</div>

<style>
	.gr-results {
		width: min(94vw, 44rem);
		background: rgba(6, 12, 8, 0.97);
		border: 1px solid rgba(0, 255, 65, 0.4);
		padding: 1.2rem 1.4rem 1.4rem;
		margin: 2rem 0;
		font-family: 'Share Tech Mono', monospace;
		color: #e8ffe8;
	}
	.gr-head {
		color: #c8ff00;
		letter-spacing: 0.12em;
		font-size: 1rem;
		border-bottom: 1px solid rgba(0, 255, 65, 0.2);
		padding-bottom: 0.5rem;
	}
	.gr-stat-row {
		display: flex;
		gap: 1.5rem;
		margin: 1rem 0 1.4rem;
	}
	.gr-stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.gr-stat-label {
		color: #7fbf8f;
		font-size: 0.72rem;
		letter-spacing: 0.1em;
	}
	.gr-stat-val {
		color: #00f0ff;
		font-size: 1.8rem;
		line-height: 1;
	}
	.gr-board-head {
		color: #7fbf8f;
		letter-spacing: 0.1em;
		font-size: 0.8rem;
		border-bottom: 1px solid rgba(0, 255, 65, 0.15);
		padding-bottom: 0.3rem;
		margin-bottom: 0.4rem;
	}
	.gr-board {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-height: 3rem;
	}
	.gr-board-row {
		display: grid;
		grid-template-columns: 2rem 1fr 5rem 5rem 6.5rem;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.8rem;
		color: #b9d9c2;
		padding: 0.15rem 0;
	}
	.gr-board-row.me {
		color: #00ff41;
	}
	.gr-rank {
		color: #7fbf8f;
	}
	.gr-arch {
		color: #5f7f6a;
		font-size: 0.68rem;
	}
	.gr-time {
		color: #00f0ff;
	}
	.gr-lap {
		color: #5f7f6a;
		font-size: 0.72rem;
	}
	.gr-note {
		color: #5f7f6a;
		font-size: 0.85rem;
	}
	.gr-warn {
		color: #ffb347;
	}
	.gr-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.4rem;
	}
	.gr-btn {
		background: rgba(0, 255, 65, 0.1);
		border: 1px solid rgba(0, 255, 65, 0.4);
		color: #00ff41;
		font-family: inherit;
		font-size: 0.85rem;
		letter-spacing: 0.1em;
		padding: 0.5rem 1.2rem;
		cursor: pointer;
	}
	.gr-btn:hover {
		background: rgba(0, 255, 65, 0.2);
	}
	.gr-btn-primary {
		background: rgba(200, 255, 0, 0.12);
		border-color: rgba(200, 255, 0, 0.5);
		color: #c8ff00;
	}
	.gr-btn-primary:hover {
		background: rgba(200, 255, 0, 0.22);
	}
</style>
