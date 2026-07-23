<script lang="ts">
	import './brand/brand';
	import { uiSounds } from './ui-sfx';
	import { CURRENCY_SHORT, type RaceAward } from './economy';
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
	 *
	 * Visual language: a result LANDING, not a data table. The finish position
	 * is the hero (chrome, with the reserved amber flourish only on a win); the
	 * player's own leaderboard row carries the signature green.
	 */
	const {
		outcome,
		trackName,
		board,
		boardLoading = false,
		submitting = false,
		submitError = false,
		myUserId,
		award = null,
		creative = false,
		unrankedNote = undefined,
		rating = undefined,
		onRate,
		ratingStatus = '',
		onRaceAgain,
		onGarage,
		onTitle,
		onFeedback
	}: {
		outcome: RaceOutcome | null;
		trackName: string;
		board: LeaderboardEntry[];
		boardLoading?: boolean;
		submitting?: boolean;
		submitError?: boolean;
		myUserId: string;
		/** Ignition Credits the submit paid out (Phase 7); null = none/unknown. */
		award?: RaceAward | null;
		/** The run was a creative-mode run: no IC, not ranked. */
		creative?: boolean;
		/** Overrides the creative strip's copy (a community-track run is
		 * unranked without being the player's creative-mode choice). */
		unrankedNote?: string;
		/**
		 * Community-track rating (Bundle 4a). When provided, a RATE THIS TRACK
		 * star row renders under the run stats. Presentation only: the parent
		 * owns the RPC (server-gated on a completed attempt) and echoes state
		 * back through `rating.mine` / `ratingStatus`.
		 */
		rating?: { avg: number | null; count: number; mine: number | null; canRate: boolean };
		onRate?: (stars: number) => void;
		/** Status line under the stars ('saving…' / 'saved' / an error). */
		ratingStatus?: string;
		onRaceAgain: () => void;
		onGarage: () => void;
		onTitle: () => void;
		/**
		 * Optional: opens the host's feedback box. The results screen is the
		 * single best moment to ask — the player has just finished a race and
		 * still remembers exactly what felt wrong about it.
		 */
		onFeedback?: () => void;
	} = $props();

	const boardName = (e: LeaderboardEntry) => e.display_name || e.full_name || 'Pilot';
	const won = $derived(outcome?.finishPosition === 1);
</script>

<div class="glb gr-results" use:uiSounds>
	<div class="gr-eyebrow">RACE COMPLETE · {trackName.toUpperCase()}</div>

	{#if outcome}
		<div class="gr-hero" class:won>
			{#if won}<span class="gr-hero-flash" aria-hidden="true"></span>{/if}
			<span class="gr-pos">P{outcome.finishPosition}</span>
			<span class="gr-pos-label">{won ? 'RACE WON' : 'FINISH POSITION'}</span>
		</div>
		<div class="gr-line" aria-hidden="true"></div>
		<div class="gr-stat-row">
			<div class="gr-stat">
				<span class="gr-stat-label">TOTAL TIME</span>
				<span class="gr-stat-val">{formatLapMs(outcome.totalTimeMs)}</span>
			</div>
			<div class="gr-stat">
				<span class="gr-stat-label">BEST LAP</span>
				<span class="gr-stat-val">{formatLapMs(outcome.bestLapMs)}</span>
			</div>
			<div class="gr-stat">
				<span class="gr-stat-label">LAPS</span>
				<span class="gr-stat-val">{outcome.laps}</span>
			</div>
		</div>
		{#if creative}
			<div class="gr-award gr-award-creative">
				{unrankedNote ?? `CREATIVE RUN · no ${CURRENCY_SHORT} earned · not ranked`}
			</div>
		{:else if award && award.awarded > 0}
			<div class="gr-award">
				<span class="gr-award-amt">+{award.awarded} {CURRENCY_SHORT}</span>
				<span class="gr-award-detail">
					placement +{award.placement}{award.pbBonus > 0
						? ` · personal best lap +${award.pbBonus}`
						: ''}{award.balance != null ? ` · wallet ${award.balance} ${CURRENCY_SHORT}` : ''}
				</span>
			</div>
		{/if}
	{/if}

	{#if rating}
		<div class="gr-rate">
			<span class="gr-rate-label">RATE THIS TRACK</span>
			<span class="gr-stars" role="group" aria-label="Rate this track 1 to 5 stars">
				{#each [1, 2, 3, 4, 5] as n (n)}
					<button
						type="button"
						class="gr-star"
						class:lit={rating.mine != null && n <= rating.mine}
						disabled={!rating.canRate || !onRate}
						title={rating.canRate
							? `${n} star${n === 1 ? '' : 's'}`
							: 'Finish a race on this track to rate it'}
						onclick={() => onRate?.(n)}>★</button
					>
				{/each}
			</span>
			<span class="gr-rate-note">
				{#if !rating.canRate}
					finish a race on this track to rate it
				{:else if ratingStatus}
					{ratingStatus}
				{:else if rating.avg != null}
					average ★ {rating.avg.toFixed(1)} from {rating.count}
					{rating.count === 1 ? 'rating' : 'ratings'}
				{:else}
					be the first to rate it
				{/if}
			</span>
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
		{#if onFeedback}
			<button class="gr-btn" onclick={onFeedback}>FEEDBACK</button>
		{/if}
	</div>
</div>

<style>
	.gr-results {
		width: min(94vw, 46rem);
		background:
			radial-gradient(120% 46% at 50% -8%, rgba(120, 165, 205, 0.06), transparent 60%),
			linear-gradient(180deg, #0b1016 0%, #070a0e 40%, #04060a 100%);
		border: 1px solid var(--glb-line);
		border-top-color: var(--glb-line-strong);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.08),
			0 30px 80px rgba(0, 0, 0, 0.6);
		padding: 1.3rem 1.6rem 1.5rem;
		margin: 2rem 0;
		color: var(--glb-ink);
	}
	@media (prefers-reduced-motion: no-preference) {
		.gr-results {
			animation: gr-land 420ms cubic-bezier(0.2, 0.9, 0.25, 1);
		}
		@keyframes gr-land {
			from {
				opacity: 0;
				transform: translateY(18px);
			}
			to {
				opacity: 1;
				transform: none;
			}
		}
	}
	.gr-eyebrow {
		font: 600 0.68rem var(--glb-font-ui);
		letter-spacing: 0.3em;
		color: var(--glb-ink-dim);
	}
	.gr-hero {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.1rem 0 0.9rem;
	}
	/* The reserved amber flourish: only a WIN detonates. */
	.gr-hero-flash {
		position: absolute;
		left: 50%;
		top: 52%;
		width: 22rem;
		max-width: 90%;
		height: 9rem;
		transform: translate(-50%, -50%);
		background: radial-gradient(
			50% 50%,
			rgba(255, 231, 194, 0.32) 0%,
			rgba(255, 176, 46, 0.18) 42%,
			transparent 72%
		);
		pointer-events: none;
	}
	.gr-pos {
		position: relative;
		font-family: var(--glb-font-display);
		font-size: clamp(3.4rem, 11vw, 5.4rem);
		line-height: 0.95;
		letter-spacing: -0.015em;
		transform: skewX(-7deg);
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		filter: drop-shadow(0 8px 26px rgba(0, 0, 0, 0.7));
		user-select: none;
	}
	.gr-hero.won .gr-pos {
		filter: drop-shadow(0 0 22px rgba(255, 176, 46, 0.35)) drop-shadow(0 8px 26px rgba(0, 0, 0, 0.7));
	}
	.gr-pos-label {
		position: relative;
		margin-top: 0.5rem;
		font: 600 0.64rem var(--glb-font-ui);
		letter-spacing: 0.42em;
		text-indent: 0.42em;
		color: var(--glb-steel);
	}
	.gr-hero.won .gr-pos-label {
		color: var(--glb-amber-warm);
	}
	/* The signature line lands under the result. */
	.gr-line {
		height: 3px;
		margin: 0.2rem -0.4rem 1rem;
		background: linear-gradient(
			90deg,
			rgba(42, 229, 126, 0) 0%,
			#2ae57e 18%,
			#eafff3 50%,
			#2ae57e 82%,
			rgba(42, 229, 126, 0) 100%
		);
		box-shadow:
			0 0 14px rgba(42, 229, 126, 0.8),
			0 0 36px rgba(42, 229, 126, 0.35);
	}
	.gr-stat-row {
		display: flex;
		justify-content: center;
		gap: clamp(1.4rem, 6vw, 3.4rem);
		margin: 0 0 1.4rem;
	}
	.gr-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}
	.gr-stat-label {
		color: var(--glb-ink-dim);
		font-weight: 600;
		font-size: 0.62rem;
		letter-spacing: 0.26em;
		text-indent: 0.26em;
	}
	.gr-stat-val {
		font-family: var(--glb-font-data);
		color: var(--glb-chrome-hi);
		font-size: 1.5rem;
		line-height: 1;
	}
	/* Ignition Credits payout strip (Phase 7). The amount rides the signature
	   green — it is the player's own earnings, the "your line" doctrine. */
	.gr-award {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin: -0.6rem 0 1.2rem;
	}
	.gr-award-amt {
		font-family: var(--glb-font-data);
		font-size: 1.05rem;
		color: var(--glb-green-ui);
		text-shadow: 0 0 12px rgba(42, 229, 126, 0.35);
	}
	.gr-award-detail {
		color: var(--glb-ink-dim);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
	}
	.gr-award-creative {
		color: var(--glb-ink-faint);
		font: 600 0.66rem var(--glb-font-ui);
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	/* Community-track rating (Bundle 4a). Gold is already the site's callout
	   accent; here it is the literal star color, dimmed until lit. */
	.gr-rate {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		flex-wrap: wrap;
		margin: -0.4rem 0 1.1rem;
	}
	.gr-rate-label {
		color: var(--glb-ink-dim);
		font: 600 0.62rem var(--glb-font-ui);
		letter-spacing: 0.26em;
	}
	.gr-stars {
		display: inline-flex;
		gap: 0.15rem;
	}
	.gr-star {
		background: none;
		border: none;
		padding: 0 0.1rem;
		font-size: 1.15rem;
		line-height: 1;
		color: rgba(147, 163, 176, 0.35);
		cursor: pointer;
		transition: color 120ms ease, transform 120ms ease;
	}
	.gr-star.lit {
		color: #c9a15f;
		text-shadow: 0 0 10px rgba(201, 161, 95, 0.4);
	}
	.gr-star:hover:not(:disabled),
	.gr-star:focus-visible:not(:disabled) {
		color: #e3c68a;
		transform: translateY(-1px);
		outline: none;
	}
	.gr-star:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.gr-rate-note {
		color: var(--glb-ink-faint);
		font-size: 0.7rem;
		letter-spacing: 0.06em;
	}

	.gr-board-head {
		color: var(--glb-ink-dim);
		font-weight: 600;
		letter-spacing: 0.26em;
		font-size: 0.66rem;
		border-bottom: 1px solid var(--glb-line);
		padding-bottom: 0.3rem;
		margin-bottom: 0.4rem;
	}
	.gr-board {
		display: flex;
		flex-direction: column;
		min-height: 3rem;
	}
	.gr-board-row {
		position: relative;
		display: grid;
		grid-template-columns: 2rem 1fr 5.4rem 5.4rem 6.5rem;
		gap: 0.5rem;
		align-items: baseline;
		font-size: 0.8rem;
		color: var(--glb-ink-dim);
		padding: 0.24rem 0.4rem;
	}
	.gr-board-row:nth-child(odd) {
		background: rgba(147, 163, 176, 0.04);
	}
	/* The player's own row carries the signature green. */
	.gr-board-row.me {
		color: var(--glb-green-ui);
		background: rgba(42, 229, 126, 0.05);
	}
	.gr-board-row.me::before {
		content: '';
		position: absolute;
		left: 0;
		top: 2px;
		bottom: 2px;
		width: 2px;
		background: linear-gradient(180deg, #2ae57e, #c8ffe2);
		box-shadow: 0 0 8px rgba(42, 229, 126, 0.8);
	}
	.gr-rank {
		font-family: var(--glb-font-data);
		color: var(--glb-steel-dim);
	}
	.gr-board-row.me .gr-rank {
		color: var(--glb-green-ui);
	}
	.gr-pilot {
		font-weight: 600;
		letter-spacing: 0.08em;
		color: var(--glb-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gr-board-row.me .gr-pilot {
		color: var(--glb-green-ui);
	}
	.gr-arch {
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		color: var(--glb-ink-faint);
	}
	.gr-time {
		font-family: var(--glb-font-data);
		color: var(--glb-chrome-mid);
	}
	.gr-board-row.me .gr-time {
		color: var(--glb-green-ui);
	}
	.gr-lap {
		font-family: var(--glb-font-data);
		color: var(--glb-ink-faint);
		font-size: 0.7rem;
	}
	.gr-note {
		color: var(--glb-ink-faint);
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.06em;
	}
	.gr-warn {
		color: #c9a15f;
	}
	.gr-actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1.5rem;
	}
	.gr-btn {
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: var(--glb-steel);
		font: 600 0.76rem var(--glb-font-ui);
		letter-spacing: 0.22em;
		text-indent: 0.22em;
		padding: 0.55rem 1.3rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.gr-btn:hover,
	.gr-btn:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	.gr-btn-primary {
		color: var(--glb-chrome-mid);
		border-color: var(--glb-line-strong);
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.12);
	}
	.gr-btn-primary:hover,
	.gr-btn-primary:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: rgba(42, 229, 126, 0.7);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.16),
			0 0 16px rgba(42, 229, 126, 0.25);
	}
</style>
