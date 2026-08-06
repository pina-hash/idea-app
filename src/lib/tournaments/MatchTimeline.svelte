<script lang="ts">
	/**
	 * One match's full timeline, computed from the append-only
	 * tournament_match_events stream (Phase 1 wrote it precisely so this could
	 * exist later). Presentation only -- props in, nothing out -- so the dev
	 * harness drives it with no Supabase.
	 *
	 * Two headline figures, then the raw stream underneath:
	 *   WAIT     created -> started, how long the pairing sat before it was called
	 *   DURATION started -> completed, how long it actually took to play
	 *
	 * A figure that genuinely does not exist reads as a dash with a reason,
	 * never as zero: a qualifying match is never "started", and a forfeited
	 * no-show usually never started either.
	 */
	import {
		correctionSummary,
		eventIsBye,
		eventIsForfeit,
		formatDuration,
		type MatchEvent,
		type MatchTimeline,
		type TournamentEntry
	} from './tournaments';

	let {
		timeline,
		entries = {},
		forfeit = false,
		forfeitReason = null,
		kind = 'bracket'
	}: {
		timeline: MatchTimeline;
		entries?: Record<string, TournamentEntry>;
		forfeit?: boolean;
		forfeitReason?: string | null;
		kind?: 'bracket' | 'qual';
	} = $props();

	const nameOf = (id: string | null | undefined) =>
		id ? (entries[id]?.display_name ?? 'an entry') : 'nobody';

	function stamp(iso: string | null): string {
		if (!iso) return '—';
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? '—'
			: d.toLocaleString([], {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
					second: '2-digit'
				});
	}

	/** Seconds from the first logged event, so the stream reads as a sequence. */
	function offset(iso: string): string {
		const base = timeline.events[0]?.occurred_at;
		if (!base) return '';
		const ms = Date.parse(iso) - Date.parse(base);
		if (!Number.isFinite(ms) || ms <= 0) return 'start';
		return `+${formatDuration(ms)}`;
	}

	const waitNote = $derived(
		timeline.waitMs !== null
			? null
			: kind === 'qual'
				? 'qualifying matches are recorded, never started'
				: timeline.startedAt
					? 'no creation event logged'
					: 'this match was never started'
	);
	const durationNote = $derived(
		timeline.durationMs !== null
			? null
			: !timeline.startedAt
				? 'never started, so nothing to time'
				: 'not finished yet'
	);

	function label(e: MatchEvent): string {
		switch (e.event_type) {
			case 'created':
				return kind === 'qual' ? 'Scheduled' : 'Created with the bracket';
			case 'checked_in':
				return 'Checked in';
			case 'started':
				return 'Started';
			case 'completed':
				if (eventIsForfeit(e)) return 'Awarded by forfeit';
				if (eventIsBye(e)) return 'Advanced on a bye';
				return 'Result recorded';
			case 'corrected':
				return 'Result corrected';
			default:
				return e.event_type;
		}
	}
</script>

<div class="mt">
	<div class="figures">
		<div class="fig">
			<span class="fig-label">Wait</span>
			<span class="fig-value">{formatDuration(timeline.waitMs)}</span>
			<span class="fig-note">
				{waitNote ?? 'from bracket creation to the opening whistle'}
			</span>
		</div>
		<div class="fig">
			<span class="fig-label">Duration</span>
			<span class="fig-value">{formatDuration(timeline.durationMs)}</span>
			<span class="fig-note">{durationNote ?? 'from start to recorded result'}</span>
		</div>
	</div>

	{#if forfeit}
		<div class="forfeit-note">
			<span class="ff-tag">Forfeit</span>
			<span class="ff-text">
				Awarded without being played{forfeitReason ? ` — ${forfeitReason}` : ''}.
			</span>
		</div>
	{/if}

	{#if timeline.corrections.length}
		<div class="corrections">
			<h3 class="sub">Corrections</h3>
			{#each timeline.corrections as e (e.id)}
				{@const c = correctionSummary(e)}
				<div class="corr">
					<span class="corr-when">{stamp(c.at)}</span>
					<span class="corr-change">
						{#if c.previousWinnerId && c.newWinnerId && c.previousWinnerId !== c.newWinnerId}
							Winner changed from <strong>{nameOf(c.previousWinnerId)}</strong> to
							<strong>{nameOf(c.newWinnerId)}</strong>
						{:else if c.newWinnerId}
							Result re-entered; <strong>{nameOf(c.newWinnerId)}</strong> still advances
						{:else}
							Result re-entered
						{/if}
						{#if c.previousForfeit}
							<span class="corr-extra">(replaced a forfeit with a played result)</span>
						{/if}
					</span>
					{#if c.reason}<span class="corr-reason">“{c.reason}”</span>{/if}
				</div>
			{/each}
		</div>
	{/if}

	<div class="stream">
		<h3 class="sub">Event log</h3>
		{#if timeline.events.length}
			<ol class="events">
				{#each timeline.events as e (e.id)}
					<li class="event" class:is-correction={e.event_type === 'corrected'}>
						<span class="ev-dot" aria-hidden="true"></span>
						<span class="ev-label">{label(e)}</span>
						<span class="ev-stamp">{stamp(e.occurred_at)}</span>
						<span class="ev-offset">{offset(e.occurred_at)}</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="empty">No events logged for this match yet.</p>
		{/if}
	</div>
</div>

<style>
	.mt {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.7rem;
	}
	.fig {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.8rem 0.9rem;
		border-radius: 10px;
		background: var(--tnm-panel, var(--bg1, #0d120d));
		border: 1px solid var(--tnm-line, rgba(255, 255, 255, 0.1));
	}
	.fig-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.fig-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.7rem;
		line-height: 1.1;
		color: var(--tnm-ink, var(--white, #e8ffe8));
	}
	.fig-note {
		font-size: 0.78rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.forfeit-note {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding: 0.6rem 0.8rem;
		border-radius: 8px;
		border: 1px solid var(--tnm-gold, #e0ac4e);
		background: var(--tnm-gold-wash, rgba(224, 172, 78, 0.1));
	}
	.ff-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--tnm-gold, #e0ac4e);
		flex: none;
	}
	.ff-text {
		font-size: 0.9rem;
		color: var(--tnm-ink, var(--white, #e8ffe8));
	}
	.sub {
		margin: 0 0 0.45rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.corr {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.55rem 0.75rem;
		border-radius: 8px;
		border: 1px solid var(--tnm-line, rgba(255, 255, 255, 0.1));
		background: var(--tnm-panel, var(--bg1, #0d120d));
		margin-bottom: 0.45rem;
	}
	.corr-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	.corr-change {
		font-size: 0.92rem;
		color: var(--tnm-ink, var(--white, #e8ffe8));
	}
	.corr-extra {
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		font-size: 0.85rem;
	}
	.corr-reason {
		font-size: 0.85rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		font-style: italic;
	}
	.events {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.event {
		display: grid;
		grid-template-columns: 0.9rem 1fr auto auto;
		align-items: center;
		gap: 0.6rem;
		padding: 0.34rem 0;
		border-bottom: 1px solid var(--tnm-line, rgba(255, 255, 255, 0.07));
	}
	.event:last-child {
		border-bottom: none;
	}
	.ev-dot {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		justify-self: center;
	}
	.event.is-correction .ev-dot {
		background: var(--tnm-gold, #e0ac4e);
	}
	.ev-label {
		font-size: 0.92rem;
		color: var(--tnm-ink, var(--white, #e8ffe8));
		min-width: 0;
	}
	.ev-stamp,
	.ev-offset {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
		flex: none;
	}
	.ev-offset {
		min-width: 4.2rem;
		text-align: right;
	}
	.empty {
		margin: 0;
		font-size: 0.88rem;
		color: var(--tnm-ink-dim, var(--dim, #7a8a7a));
	}
	@media (max-width: 34rem) {
		.event {
			grid-template-columns: 0.9rem 1fr;
		}
		.ev-stamp,
		.ev-offset {
			grid-column: 2;
			text-align: left;
		}
	}
</style>
