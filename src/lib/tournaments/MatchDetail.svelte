<script lang="ts">
	/**
	 * Everything visual on the match detail page. The route owns only the
	 * load and the realtime subscription (the TvStage convention), so the dev
	 * harness drives this identical component with no Supabase.
	 *
	 * Chrome follows the Phase 2b system palette (.tnm-root) like the other
	 * new tournament surfaces, and honours its restraint rule literally:
	 * exactly ONE emerald element on the screen -- the match headline, which
	 * becomes the live indicator while the match is running. Everything else
	 * is a neutral panel; gold is reserved for the two things it is reserved
	 * for everywhere, placement and the forfeit exception.
	 */
	import EntryBanner from './EntryBanner.svelte';
	import MatchTimelineView from './MatchTimeline.svelte';
	import './tournaments-theme.css';
	import { styleMap, type EntryStyle } from './entry-styles';
	import {
		entryHref,
		entryMap,
		isByeMatch,
		isForfeitMatch,
		matchHref,
		matchTimeline,
		roundLabel,
		type BracketMatch,
		type MatchEvent,
		type MatchGame,
		type QualMatch,
		type QualPool,
		type RewardLedgerRow,
		type Tournament,
		type TournamentEntry
	} from './tournaments';

	let {
		tournament,
		kind,
		match = null,
		qualMatch = null,
		qualPool = null,
		entries = [],
		styles: styleRows = [],
		events = [],
		games = [],
		siblings = [],
		ledger = []
	}: {
		tournament: Tournament;
		kind: 'bracket' | 'qual';
		match?: BracketMatch | null;
		qualMatch?: QualMatch | null;
		qualPool?: QualPool | null;
		entries?: TournamentEntry[];
		styles?: EntryStyle[];
		events?: MatchEvent[];
		games?: MatchGame[];
		/** Sibling bracket matches: only used for round labels and advancement. */
		siblings?: BracketMatch[];
		ledger?: RewardLedgerRow[];
	} = $props();

	const t = $derived(tournament);
	const byId = $derived(entryMap(entries));
	const styles = $derived(styleMap(styleRows));

	const bm = $derived(match);
	const qm = $derived(qualMatch);

	const aId = $derived(bm ? bm.entry_a_id : (qm?.entry_a_id ?? null));
	const bId = $derived(bm ? bm.entry_b_id : (qm?.entry_b_id ?? null));
	const winnerId = $derived(bm ? bm.winner_id : (qm?.winner_id ?? null));

	function maxRound(bracket: string): number {
		return Math.max(0, ...siblings.filter((m) => m.bracket === bracket).map((m) => m.round));
	}
	const heading = $derived(
		bm
			? `${roundLabel(bm.bracket, bm.round, maxRound(bm.bracket))} · M${bm.slot}`
			: qm
				? `Qualifying${qualPool ? ` · Pool ${qualPool.pool_number}` : ''} · Match ${qm.sequence}`
				: 'Match'
	);

	const isLive = $derived(bm?.status === 'in_progress');
	const isBye = $derived(!!bm && isByeMatch(bm));
	const forfeit = $derived(!!bm && isForfeitMatch(bm));

	const timeline = $derived(
		matchTimeline(events, {
			started_at: bm?.started_at ?? null,
			completed_at: bm?.completed_at ?? qm?.played_at ?? null
		})
	);

	const statusText = $derived(
		forfeit
			? 'Forfeit'
			: isBye
				? 'Bye'
				: isLive
					? 'Live'
					: (bm ? bm.status : qm?.winner_id ? 'complete' : 'pending') === 'complete'
						? 'Complete'
						: 'Not started'
	);

	/** Where each side went from here (bracket matches only). */
	function target(id: string | null): BracketMatch | null {
		return id ? (siblings.find((m) => m.id === id) ?? null) : null;
	}
	const winnerTo = $derived(target(bm?.winner_to_match_id ?? null));
	const loserTo = $derived(target(bm?.loser_to_match_id ?? null));
	const targetLabel = (m: BracketMatch) =>
		`${roundLabel(m.bracket, m.round, maxRound(m.bracket))} · M${m.slot}`;

	const rewardTotal = $derived(ledger.reduce((sum, r) => sum + r.amount, 0));
</script>

<div class="tnm-root match-detail">
	<header class="head">
		{#if isLive}
			<span class="tnm-live">Live now</span>
		{:else}
			<p class="tnm-label accent">{heading}</p>
		{/if}
		<div class="head-row">
			<h1>{heading}</h1>
			<span class="state" class:gold={forfeit || isBye}>{statusText}</span>
			{#if bm && bm.best_of > 1}<span class="bo">Best of {bm.best_of}</span>{/if}
		</div>
	</header>

	<section class="pairing">
		{#each [aId, bId] as side, i (i)}
			{@const decided = !!winnerId}
			{#if side}
				<a class="side" href={entryHref(t.id, side)}>
					<EntryBanner
						entry={byId[side] ?? null}
						style={styles[side] ?? null}
						size="md"
						label={i === 0 ? 'Side A' : 'Side B'}
						winner={decided && winnerId === side}
						dim={decided && winnerId !== side}
					/>
				</a>
			{:else}
				<div class="side">
					<EntryBanner entry={null} size="md" label={i === 0 ? 'Side A' : 'Side B'} />
				</div>
			{/if}
		{/each}
	</section>

	{#if winnerId && byId[winnerId]}
		<p class="outcome" class:by-forfeit={forfeit}>
			<strong>{byId[winnerId].display_name}</strong>
			{#if forfeit}
				advanced by forfeit{bm?.forfeit_reason ? ` — ${bm.forfeit_reason}` : ''}
			{:else if isBye}
				advanced on a bye
			{:else}
				won this match
			{/if}
		</p>
	{/if}

	{#if games.length}
		<section class="tnm-panel block">
			<p class="tnm-label">Games</p>
			<div class="games">
				{#each games as g (g.id)}
					<div class="game">
						<span class="g-n">Game {g.game_number}</span>
						<span class="g-side" class:won={g.winner_id === aId}>
							{aId ? (byId[aId]?.display_name ?? '?') : '?'}
						</span>
						<span class="g-score">
							{#if g.score_a !== null && g.score_b !== null}
								{g.score_a}–{g.score_b}
							{:else}
								·
							{/if}
						</span>
						<span class="g-side right" class:won={g.winner_id === bId}>
							{bId ? (byId[bId]?.display_name ?? '?') : '?'}
						</span>
					</div>
				{/each}
			</div>
		</section>
	{:else if qm && qm.score_a !== null && qm.score_b !== null}
		<section class="tnm-panel block">
			<p class="tnm-label">Score</p>
			<div class="games">
				<div class="game">
					<span class="g-n">Result</span>
					<span class="g-side" class:won={qm.winner_id === aId}>
						{aId ? (byId[aId]?.display_name ?? '?') : '?'}
					</span>
					<span class="g-score">{qm.score_a}–{qm.score_b}</span>
					<span class="g-side right" class:won={qm.winner_id === bId}>
						{bId ? (byId[bId]?.display_name ?? '?') : '?'}
					</span>
				</div>
			</div>
		</section>
	{/if}

	<section class="tnm-panel block">
		<p class="tnm-label">Timeline</p>
		<MatchTimelineView
			{timeline}
			entries={byId}
			{forfeit}
			forfeitReason={bm?.forfeit_reason ?? null}
			{kind}
		/>
	</section>

	{#if ledger.length}
		<section class="tnm-panel block">
			<p class="tnm-label gold">Rewards from this match</p>
			<div class="ledger">
				{#each ledger as row (row.id)}
					<div class="ledger-row">
						<span class="l-who">{byId[row.entry_id]?.display_name ?? 'entry'}</span>
						<span class="l-reason">{row.reason}</span>
						<span class="l-amount">+{row.amount}</span>
					</div>
				{/each}
				<div class="ledger-row total">
					<span class="l-who">Total</span>
					<span class="l-reason"></span>
					<span class="l-amount">+{rewardTotal}</span>
				</div>
			</div>
		</section>
	{:else if forfeit || isBye}
		<section class="tnm-panel block">
			<p class="tnm-label gold">Rewards from this match</p>
			<p class="no-reward">
				None. {forfeit ? 'A forfeit' : 'A bye'} advances a side without a contested win, so it pays
				nothing.
			</p>
		</section>
	{/if}

	{#if bm && (winnerTo || loserTo)}
		<section class="tnm-panel block">
			<p class="tnm-label">Advancement</p>
			<div class="advance">
				{#if winnerTo}
					<div class="adv-row">
						<span class="adv-label">Winner goes to</span>
						<a class="adv-link" href={matchHref(t.id, winnerTo.id)}>{targetLabel(winnerTo)}</a>
					</div>
				{/if}
				<div class="adv-row">
					<span class="adv-label">Loser goes to</span>
					{#if loserTo}
						<a class="adv-link" href={matchHref(t.id, loserTo.id)}>{targetLabel(loserTo)}</a>
					{:else}
						<span class="adv-out">Eliminated</span>
					{/if}
				</div>
			</div>
		</section>
	{/if}
</div>

<style>
	.match-detail {
		max-width: 52rem;
		margin: 0 auto;
		padding: 1.2rem 1.2rem 2rem;
		border-radius: 12px;
	}
	.head {
		margin-bottom: 1.1rem;
	}
	.head-row {
		display: flex;
		align-items: baseline;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.head h1 {
		margin: 0.2rem 0 0;
		font-size: clamp(1.4rem, 3.2vw, 2rem);
		color: var(--tnm-ink);
	}
	.state {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		border: 1px solid var(--tnm-line-strong);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.state.gold {
		color: var(--tnm-gold);
		border-color: var(--tnm-gold);
	}
	.bo {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--tnm-gold);
	}
	.pairing {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.7rem;
	}
	@media (max-width: 40rem) {
		.pairing {
			grid-template-columns: 1fr;
		}
	}
	.side {
		display: block;
		text-decoration: none;
		border-radius: 10px;
		min-width: 0;
	}
	.side:focus-visible {
		outline: 2px solid var(--tnm-line-strong);
		outline-offset: 2px;
	}
	.outcome {
		margin: 0.7rem 0 0;
		font-size: 1rem;
		color: var(--tnm-ink);
	}
	.outcome.by-forfeit {
		color: var(--tnm-gold);
	}
	.block {
		margin-top: 1.1rem;
		padding: 0.9rem 1rem;
	}
	.block .tnm-label {
		font-size: 0.7rem;
		margin-bottom: 0.6rem;
	}
	.games {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.game {
		display: grid;
		grid-template-columns: 4.6rem 1fr auto 1fr;
		align-items: center;
		gap: 0.6rem;
		padding: 0.28rem 0;
		border-bottom: 1px solid var(--tnm-line);
	}
	.game:last-child {
		border-bottom: none;
	}
	.g-n {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--tnm-ink-dim);
	}
	.g-side {
		color: var(--tnm-ink-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.g-side.right {
		text-align: right;
	}
	.g-side.won {
		color: var(--tnm-ink);
		font-weight: 700;
	}
	.g-score {
		font-family: 'Share Tech Mono', monospace;
		color: var(--tnm-ink);
	}
	.ledger {
		display: flex;
		flex-direction: column;
	}
	.ledger-row {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 0.7rem;
		align-items: baseline;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--tnm-line);
	}
	.ledger-row.total {
		border-bottom: none;
		border-top: 1px solid var(--tnm-line-strong);
		margin-top: 0.2rem;
	}
	.l-who {
		color: var(--tnm-ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.l-reason {
		color: var(--tnm-ink-dim);
		font-size: 0.88rem;
	}
	.l-amount {
		font-family: 'Share Tech Mono', monospace;
		color: var(--tnm-gold);
	}
	.no-reward {
		margin: 0;
		font-size: 0.9rem;
		color: var(--tnm-ink-dim);
	}
	.advance {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.adv-row {
		display: flex;
		gap: 0.7rem;
		align-items: baseline;
	}
	.adv-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--tnm-ink-dim);
		min-width: 8.5rem;
	}
	.adv-link {
		color: var(--tnm-ink);
	}
	.adv-out {
		color: var(--tnm-ink-dim);
	}
</style>
