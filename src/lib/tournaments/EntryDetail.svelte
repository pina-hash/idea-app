<script lang="ts">
	/**
	 * Everything visual on the entry detail page: this competitor's record,
	 * every match they played (each linking to its own detail page) and their
	 * reward ledger with a running total. The route owns only the load and the
	 * realtime subscription (the TvStage convention), so the dev harness
	 * drives this identical component with no backend.
	 *
	 * The entry renders in its OWN style throughout, at the two scales the
	 * rest of the feature already uses: EntryBanner at full strength for the
	 * page header, EntryChip with the faint accent wash inside the dense match
	 * rows. Neither rule is re-implemented here.
	 *
	 * Restraint: exactly one emerald element on the screen (the eyebrow
	 * label). Record figures are neutral, reward figures gold, match rows
	 * neutral panels.
	 */
	import EntryBanner from './EntryBanner.svelte';
	import EntryChip from './EntryChip.svelte';
	import './tournaments-theme.css';
	import { styleMap, type EntryStyle } from './entry-styles';
	import {
		entryBracketRecord,
		entryLedgerRun,
		entryMap,
		entryQualRecord,
		isByeMatch,
		isForfeitMatch,
		matchHref,
		matchScorelineFor,
		roundLabel,
		type BracketMatch,
		type MatchGame,
		type QualMatch,
		type QualPool,
		type RewardLedgerRow,
		type Tournament,
		type TournamentEntry
	} from './tournaments';

	let {
		tournament,
		entry,
		entries = [],
		styles: styleRows = [],
		bracketMatches = [],
		qualMatches = [],
		pools = [],
		games = [],
		ledger = []
	}: {
		tournament: Tournament;
		entry: TournamentEntry;
		entries?: TournamentEntry[];
		styles?: EntryStyle[];
		bracketMatches?: BracketMatch[];
		qualMatches?: QualMatch[];
		pools?: QualPool[];
		games?: MatchGame[];
		/** The whole tournament's ledger, or just this entry's; filtered here. */
		ledger?: RewardLedgerRow[];
	} = $props();

	const t = $derived(tournament);
	const byId = $derived(entryMap(entries));
	const styles = $derived(styleMap(styleRows));
	const me = $derived(entry);
	const myStyle = $derived(styles[me.id] ?? null);

	const record = $derived(entryBracketRecord(me.id, bracketMatches));
	const quals = $derived(entryQualRecord(me.id, qualMatches));
	const run = $derived(entryLedgerRun(me.id, ledger));
	const rewardTotal = $derived(run.length ? run[run.length - 1].runningTotal : 0);
	const isChampion = $derived(t.champion_entry_id === me.id);

	function maxRound(bracket: string): number {
		return Math.max(0, ...bracketMatches.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	const label = (m: BracketMatch) =>
		`${roundLabel(m.bracket, m.round, maxRound(m.bracket))} · M${m.slot}`;
	const opponentOf = (m: BracketMatch) => (m.entry_a_id === me.id ? m.entry_b_id : m.entry_a_id);
	const poolNumber = (poolId: string) => pools.find((p) => p.id === poolId)?.pool_number ?? null;

	/** How this match ended for THIS entry. */
	function outcome(m: BracketMatch): { text: string; tone: 'win' | 'loss' | 'neutral' } {
		if (m.status === 'in_progress') return { text: 'Live', tone: 'neutral' };
		if (m.status !== 'complete') return { text: 'Upcoming', tone: 'neutral' };
		if (isByeMatch(m)) return { text: 'Bye', tone: 'neutral' };
		if (!m.winner_id) return { text: 'No result', tone: 'neutral' };
		const won = m.winner_id === me.id;
		if (isForfeitMatch(m)) {
			return { text: won ? 'Won by forfeit' : 'Lost by forfeit', tone: won ? 'win' : 'loss' };
		}
		return { text: won ? 'Won' : 'Lost', tone: won ? 'win' : 'loss' };
	}

	function when(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleString([], {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit'
				});
	}
</script>

<div class="tnm-root entry-detail">
	<p class="tnm-label accent">Competitor</p>
	<EntryBanner
		entry={me}
		style={myStyle}
		size="lg"
		seed={me.seed}
		winner={isChampion}
		event={isChampion ? 'win' : null}
	/>
	{#if me.description}<p class="desc">{me.description}</p>{/if}
	{#if isChampion}<p class="champ tnm-label gold">Champion</p>{/if}

	<section class="record">
		<div class="rec-cell">
			<span class="rc-label">Record</span>
			<span class="rc-value">{record.wins}–{record.losses}</span>
			<span class="rc-note">bracket wins and losses</span>
		</div>
		{#if record.byes}
			<div class="rec-cell">
				<span class="rc-label">Byes</span>
				<span class="rc-value">{record.byes}</span>
				<span class="rc-note">advanced without playing</span>
			</div>
		{/if}
		{#if record.forfeitWins || record.forfeitLosses}
			<div class="rec-cell">
				<span class="rc-label">By forfeit</span>
				<span class="rc-value">{record.forfeitWins}–{record.forfeitLosses}</span>
				<span class="rc-note">included in the record</span>
			</div>
		{/if}
		{#if quals.matches.length}
			<div class="rec-cell">
				<span class="rc-label">Qualifying</span>
				<span class="rc-value">{quals.wins}–{quals.losses}</span>
				<span class="rc-note">pool play, seeding only</span>
			</div>
		{/if}
		{#if run.length}
			<div class="rec-cell">
				<span class="rc-label">Rewards</span>
				<span class="rc-value gold">+{rewardTotal}</span>
				<span class="rc-note">{run.length} award{run.length === 1 ? '' : 's'}</span>
			</div>
		{/if}
	</section>

	<section class="block">
		<p class="tnm-label">Bracket matches</p>
		{#if record.matches.length}
			<div class="matches">
				{#each record.matches as m (m.id)}
					{@const o = outcome(m)}
					{@const opp = opponentOf(m)}
					{@const line = matchScorelineFor(m, games, me.id)}
					<a class="match tnm-panel" href={matchHref(t.id, m.id)}>
						<span class="m-label">{label(m)}</span>
						<span class="m-opp">
							{#if opp}
								<span class="vs">vs</span>
								<EntryChip entry={byId[opp] ?? null} style={styles[opp] ?? null} />
							{:else}
								<span class="vs">no opponent</span>
							{/if}
						</span>
						{#if line && !isForfeitMatch(m)}<span class="m-score">{line}</span>{/if}
						<span class="m-outcome {o.tone}" class:forfeit={isForfeitMatch(m)}>{o.text}</span>
					</a>
				{/each}
			</div>
		{:else}
			<p class="empty">No bracket matches yet.</p>
		{/if}
	</section>

	{#if quals.matches.length}
		<section class="block">
			<p class="tnm-label">Qualifying matches</p>
			<div class="matches">
				{#each quals.matches as m (m.id)}
					{@const opp = m.entry_a_id === me.id ? m.entry_b_id : m.entry_a_id}
					{@const pn = poolNumber(m.pool_id)}
					<a class="match tnm-panel" href={matchHref(t.id, m.id)}>
						<span class="m-label">{pn ? `Pool ${pn}` : 'Pool'} · Match {m.sequence}</span>
						<span class="m-opp">
							<span class="vs">vs</span>
							<EntryChip entry={byId[opp] ?? null} style={styles[opp] ?? null} />
						</span>
						{#if m.score_a !== null && m.score_b !== null}
							<span class="m-score">
								{m.entry_a_id === me.id ? m.score_a : m.score_b}–{m.entry_a_id === me.id
									? m.score_b
									: m.score_a}
							</span>
						{/if}
						<span
							class="m-outcome"
							class:win={m.winner_id === me.id}
							class:loss={!!m.winner_id && m.winner_id !== me.id}
						>
							{m.winner_id ? (m.winner_id === me.id ? 'Won' : 'Lost') : 'Not played'}
						</span>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	{#if run.length}
		<section class="block">
			<p class="tnm-label gold">Reward ledger</p>
			<div class="ledger tnm-panel">
				{#each run as row (row.id)}
					<div class="l-row">
						<span class="l-reason">{row.reason}</span>
						{#if row.match_id}
							<a class="l-link" href={matchHref(t.id, row.match_id)}>match</a>
						{:else}
							<span class="l-link muted">placement</span>
						{/if}
						<span class="l-when">{when(row.awarded_at)}</span>
						<span class="l-amount">+{row.amount}</span>
						<span class="l-running">{row.runningTotal}</span>
					</div>
				{/each}
				<div class="l-row total">
					<span class="l-reason">Total</span>
					<span class="l-link"></span>
					<span class="l-when"></span>
					<span class="l-amount"></span>
					<span class="l-running">{rewardTotal}</span>
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.entry-detail {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1.2rem 1.2rem 2rem;
		border-radius: 12px;
	}
	.entry-detail > .tnm-label {
		margin-bottom: 0.5rem;
		font-size: 0.72rem;
	}
	.desc {
		margin: 0.7rem 0 0;
		color: var(--tnm-ink-dim);
	}
	.champ {
		margin-top: 0.6rem;
		font-size: 0.75rem;
	}
	.record {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.5rem;
		margin-top: 1.1rem;
	}
	.rec-cell {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.65rem 0.8rem;
		border-radius: 10px;
		background: var(--tnm-panel);
		border: 1px solid var(--tnm-line);
	}
	.rc-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
	}
	.rc-value {
		font-family: 'Share Tech Mono', monospace;
		font-size: 1.5rem;
		color: var(--tnm-ink);
	}
	.rc-value.gold {
		color: var(--tnm-gold);
	}
	.rc-note {
		font-size: 0.74rem;
		color: var(--tnm-ink-dim);
	}
	.block {
		margin-top: 1.5rem;
	}
	.block .tnm-label {
		font-size: 0.7rem;
		margin-bottom: 0.5rem;
	}
	.matches {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.match {
		display: grid;
		grid-template-columns: 11rem 1fr auto auto;
		align-items: center;
		gap: 0.8rem;
		padding: 0.5rem 0.75rem;
		text-decoration: none;
		color: inherit;
	}
	.match:hover,
	.match:focus-visible {
		border-color: var(--tnm-line-strong);
	}
	.m-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--tnm-ink-dim);
	}
	.m-opp {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}
	.vs {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--tnm-ink-dim);
		flex: none;
	}
	.m-score {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: var(--tnm-ink);
		flex: none;
	}
	.m-outcome {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		flex: none;
		min-width: 6.5rem;
		text-align: right;
	}
	.m-outcome.win {
		color: var(--tnm-ink);
	}
	.m-outcome.loss {
		opacity: 0.75;
	}
	/* A forfeit is the exception case, so it reads in the exception colour --
	 * the same gold the match detail page and the host console use. */
	.m-outcome.forfeit {
		color: var(--tnm-gold);
	}
	@media (max-width: 44rem) {
		.match {
			grid-template-columns: 1fr auto;
			row-gap: 0.3rem;
		}
		.m-label {
			grid-column: 1 / -1;
		}
		.m-outcome {
			min-width: 0;
		}
	}
	.ledger {
		padding: 0.4rem 0.8rem;
	}
	.l-row {
		display: grid;
		grid-template-columns: 1fr auto auto 3.2rem 3.6rem;
		gap: 0.7rem;
		align-items: baseline;
		padding: 0.32rem 0;
		border-bottom: 1px solid var(--tnm-line);
	}
	.l-row.total {
		border-bottom: none;
		border-top: 1px solid var(--tnm-line-strong);
	}
	.l-reason {
		color: var(--tnm-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.l-link {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--tnm-ink-dim);
	}
	.l-link.muted {
		opacity: 0.7;
	}
	.l-when {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--tnm-ink-dim);
	}
	.l-amount,
	.l-running {
		font-family: 'Share Tech Mono', monospace;
		text-align: right;
	}
	.l-amount {
		font-size: 0.8rem;
		color: var(--tnm-ink-dim);
	}
	.l-running {
		color: var(--tnm-gold);
	}
	@media (max-width: 44rem) {
		.l-row {
			grid-template-columns: 1fr auto auto;
		}
		.l-when {
			display: none;
		}
	}
	.empty {
		margin: 0;
		color: var(--tnm-ink-dim);
		font-size: 0.9rem;
	}
</style>
