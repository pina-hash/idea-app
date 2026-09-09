/**
 * IDEA Tournaments: row types + pure display helpers (client-safe, plain data,
 * the curriculum.ts convention). The data model and every write path live in
 * supabase/migrations/0062_tournaments.sql; everything here is read-side.
 *
 * IDENTITY RULE (enforced at the type level by simply not carrying the data):
 * a participant's public identity is entries.display_name + thumbnail_url.
 * Nothing in this module or its components touches profiles, Google names, or
 * avatars.
 */

export type TournamentStatus = 'draft' | 'registration_open' | 'seeding' | 'live' | 'complete';
export type BracketId = 'winners' | 'losers' | 'grand_final' | 'grand_final_reset';
export type MatchStatus = 'pending' | 'in_progress' | 'complete';

export interface TournamentConfig {
	quals_enabled: boolean;
	score_entry: boolean;
	best_of_default: number;
	/** Per-round overrides: 'winners' | 'losers' | 'grand_final' | 'winners:<n>' | 'losers:<n>'. */
	best_of: Record<string, number>;
	/**
	 * Registrants per entry (0192): 1 is a solo event, up to TEAM_SIZE_MAX. An
	 * entry may hold fewer than this and never more; the RPCs refuse the
	 * (team_size + 1)th member and `entryIsFull` is the client's reading of
	 * the same number.
	 */
	team_size: number;
}

export interface Tournament {
	id: string;
	name: string;
	description: string;
	config: TournamentConfig | Record<string, unknown>;
	status: TournamentStatus;
	champion_entry_id: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface TournamentEntry {
	id: string;
	tournament_id: string;
	user_id: string | null;
	display_name: string;
	description: string;
	thumbnail_url: string | null;
	seed: number | null;
	created_at: string;
}

/**
 * One registrant on an entry (0192: `tournament_entry_members`). An entry
 * has at least one; the CAPTAIN is the member whose user_id equals the
 * entry's own user_id. `name` is the name the registrant CHOSE for this
 * tournament -- never a profile name, which is the identity rule above
 * extended to teammates. `user_id` null is a walk-up teammate with no
 * account.
 */
export interface TournamentEntryMember {
	id: string;
	entry_id: string;
	tournament_id: string;
	user_id: string | null;
	name: string;
	created_at: string;
}

export interface TournamentInvite {
	id: string;
	tournament_id: string;
	invited_user_id: string;
	invited_by: string | null;
	status: 'pending' | 'accepted' | 'declined';
	created_at: string;
	responded_at: string | null;
}

export interface QualPool {
	id: string;
	tournament_id: string;
	pool_number: number;
}

export interface QualMatch {
	id: string;
	pool_id: string;
	tournament_id: string;
	sequence: number;
	entry_a_id: string;
	entry_b_id: string;
	winner_id: string | null;
	score_a: number | null;
	score_b: number | null;
	played_at: string | null;
}

export interface BracketMatch {
	id: string;
	tournament_id: string;
	bracket: BracketId;
	round: number;
	slot: number;
	entry_a_id: string | null;
	entry_b_id: string | null;
	best_of: number;
	status: MatchStatus;
	winner_id: string | null;
	started_at: string | null;
	completed_at: string | null;
	winner_to_match_id: string | null;
	winner_to_pos: 'a' | 'b' | null;
	loser_to_match_id: string | null;
	loser_to_pos: 'a' | 'b' | null;
	/**
	 * Phase 3a (0065). Optional on the type so every surface keeps rendering
	 * against a pre-0065 backend, where the column simply is not selected.
	 */
	forfeit?: boolean | null;
	forfeit_reason?: string | null;
}

/**
 * One row of the append-only audit stream (tournament_match_events). Public
 * -select like everything else here, which is what lets the match detail page
 * reconstruct a timeline with no session.
 */
export interface MatchEvent {
	id: number;
	tournament_id: string;
	match_kind: 'bracket' | 'qual' | null;
	match_id: string | null;
	event_type: 'created' | 'checked_in' | 'started' | 'completed' | 'corrected' | 'seeded';
	actor_id: string | null;
	occurred_at: string;
	metadata: Record<string, unknown>;
}

export interface MatchGame {
	id: string;
	tournament_id: string;
	bracket_match_id: string;
	game_number: number;
	score_a: number | null;
	score_b: number | null;
	winner_id: string | null;
}

export type RewardTriggerType = 'win' | 'round_reached' | 'placement';

export interface RewardRule {
	id: string;
	tournament_id: string;
	trigger_type: RewardTriggerType;
	/** Null for 'win'; the round number for 'round_reached'; 1/2/3 for 'placement'. */
	trigger_value: number | null;
	amount: number;
}

export interface RewardLedgerRow {
	id: number;
	tournament_id: string;
	entry_id: string;
	user_id: string | null;
	amount: number;
	reason: string;
	/** Null exactly for placement awards. */
	match_id: string | null;
	awarded_at: string;
	/**
	 * Which registrant this row paid (0192). Optional on the type and null on
	 * a row written before the column existed, when an award was one row per
	 * ENTRY; after it an award is one row per MEMBER, each carrying the full
	 * amount. `rewardAwards` is what folds those rows back into one award.
	 */
	member_id?: string | null;
}

const PLACEMENT_LABELS: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

export function rewardRuleLabel(r: Pick<RewardRule, 'trigger_type' | 'trigger_value'>): string {
	if (r.trigger_type === 'win') return 'Match win';
	if (r.trigger_type === 'round_reached') return `Reached round ${r.trigger_value}`;
	return PLACEMENT_LABELS[r.trigger_value ?? 0] ?? `Placement ${r.trigger_value}`;
}

/**
 * ONE AWARD, however many rows paid it.
 *
 * Since 0192 `_tournament_award` writes one ledger row PER MEMBER of the
 * winning entry, each for the full amount, so a team of two that wins a
 * 10-coin match puts two 10-coin rows in the table. Read row by row that is
 * "+20" beside an entry that was told the match pays 10, which is a total
 * nobody was promised. This folds the rows of one award back together: the
 * amount is what EACH registrant received, `recipients` is how many did.
 *
 * The fold key is `entry | match | reason`: a placement award has no match
 * and is told apart by its reason; a match win has exactly one row per
 * member for one reason. A pre-0192 row (member_id null, one per entry) is
 * an award with one recipient, so the answer for a legacy ledger is the
 * answer it always was.
 */
export interface RewardAward {
	entryId: string;
	/** What each registrant received, not the sum over them. */
	amount: number;
	reason: string;
	matchId: string | null;
	awardedAt: string;
	/** Ledger rows folded into this award: 1 for a solo or a legacy row. */
	recipients: number;
	/** The lowest row id in the award: the stable ordering key. */
	firstId: number;
}

export function rewardAwards(ledger: RewardLedgerRow[]): RewardAward[] {
	const awards = new Map<string, RewardAward>();
	for (const row of ledger) {
		const key = `${row.entry_id}|${row.match_id ?? ''}|${row.reason}`;
		const a = awards.get(key);
		if (!a) {
			awards.set(key, {
				entryId: row.entry_id,
				amount: row.amount,
				reason: row.reason,
				matchId: row.match_id,
				awardedAt: row.awarded_at,
				recipients: 1,
				firstId: row.id
			});
			continue;
		}
		a.recipients += 1;
		if (row.id < a.firstId) {
			a.firstId = row.id;
			a.awardedAt = row.awarded_at;
		}
	}
	return [...awards.values()].sort((x, y) => x.firstId - y.firstId);
}

export interface RewardTotalRow {
	entryId: string;
	/** Per registrant: what one member of this entry has been paid. */
	total: number;
	/** Distinct awards, not ledger rows. */
	awards: number;
	/** The widest an award on this entry went: how many people each total reached. */
	recipients: number;
}

/** Per-entry totals over the ledger's AWARDS, largest first. */
export function rewardTotals(ledger: RewardLedgerRow[]): RewardTotalRow[] {
	const totals = new Map<string, RewardTotalRow>();
	for (const a of rewardAwards(ledger)) {
		let t = totals.get(a.entryId);
		if (!t) {
			t = { entryId: a.entryId, total: 0, awards: 0, recipients: 0 };
			totals.set(a.entryId, t);
		}
		t.total += a.amount;
		t.awards += 1;
		t.recipients = Math.max(t.recipients, a.recipients);
	}
	return [...totals.values()].sort(
		(a, b) => b.total - a.total || a.entryId.localeCompare(b.entryId)
	);
}

export function parseConfig(raw: unknown): TournamentConfig {
	const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		quals_enabled: o.quals_enabled === true,
		score_entry: o.score_entry === true,
		best_of_default: typeof o.best_of_default === 'number' ? o.best_of_default : 1,
		best_of:
			o.best_of && typeof o.best_of === 'object' ? (o.best_of as Record<string, number>) : {},
		// A whole number 1..TEAM_SIZE_MAX, else 1: the same range 0192's
		// normaliser refuses outside of, so a row that reached the table is
		// read back as it was written and anything else reads as solo.
		team_size:
			typeof o.team_size === 'number' &&
			Number.isInteger(o.team_size) &&
			o.team_size >= 1 &&
			o.team_size <= TEAM_SIZE_MAX
				? o.team_size
				: 1
	};
}

export const STATUS_LABELS: Record<TournamentStatus, string> = {
	draft: 'Draft',
	registration_open: 'Registration open',
	seeding: 'Seeding',
	live: 'Live',
	complete: 'Complete'
};

export function statusLabel(s: string): string {
	return STATUS_LABELS[s as TournamentStatus] ?? s;
}

/** A match the resolver auto-completed: one (bye) or zero (dead) participants. */
export function isByeMatch(m: BracketMatch): boolean {
	return m.status === 'complete' && (m.entry_a_id === null || m.entry_b_id === null);
}

/**
 * A match a host awarded without it being played (0065). Like a bye it is a
 * real advancement and a real elimination, and like a bye it pays no reward;
 * unlike a bye it has two named participants, so it needs its own marker
 * wherever results list out.
 */
export function isForfeitMatch(m: BracketMatch): boolean {
	return m.forfeit === true;
}

/** A completed match that was actually contested: not a bye, not a forfeit. */
export function isPlayedMatch(m: BracketMatch): boolean {
	return m.status === 'complete' && !isByeMatch(m) && !isForfeitMatch(m);
}

export function roundLabel(bracket: BracketId, round: number, maxRound: number): string {
	if (bracket === 'grand_final') return 'Grand Final';
	if (bracket === 'grand_final_reset') return 'Bracket Reset';
	const side = bracket === 'winners' ? 'Winners' : 'Losers';
	return round === maxRound ? `${side} Final` : `${side} Round ${round}`;
}

export interface BracketColumn {
	bracket: BracketId;
	round: number;
	label: string;
	matches: BracketMatch[];
}

export interface BracketLayout {
	winners: BracketColumn[];
	losers: BracketColumn[];
	finals: BracketColumn[];
}

/** Groups bracket matches into ordered per-round columns for rendering. */
export function bracketLayout(matches: BracketMatch[]): BracketLayout {
	const columns = (bracket: BracketId): BracketColumn[] => {
		const rows = matches.filter((m) => m.bracket === bracket);
		const rounds = [...new Set(rows.map((m) => m.round))].sort((a, b) => a - b);
		const maxRound = rounds[rounds.length - 1] ?? 0;
		return rounds.map((round) => ({
			bracket,
			round,
			label: roundLabel(bracket, round, maxRound),
			matches: rows.filter((m) => m.round === round).sort((a, b) => a.slot - b.slot)
		}));
	};
	return {
		winners: columns('winners'),
		losers: columns('losers'),
		finals: [...columns('grand_final'), ...columns('grand_final_reset')]
	};
}

/**
 * A match's scoreline as the numeric pair [side A, side B]: the per-side
 * game-win tally, or the single decided game's score in score mode.
 */
export function matchScorePair(m: BracketMatch, games: MatchGame[]): [number, number] | null {
	const mine = games
		.filter((g) => g.bracket_match_id === m.id)
		.sort((a, b) => a.game_number - b.game_number);
	if (!mine.length) return null;
	if (mine.length === 1 && mine[0].score_a !== null && mine[0].score_b !== null) {
		return [mine[0].score_a, mine[0].score_b];
	}
	let a = 0;
	let b = 0;
	for (const g of mine) {
		if (g.winner_id && g.winner_id === m.entry_a_id) a++;
		else if (g.winner_id && g.winner_id === m.entry_b_id) b++;
	}
	return [a, b];
}

/** Per-side game-win tally for a match ("2-1"); single decided game in score
 * mode reads as its score ("10-5"). Always A-first (the bracket's own order). */
export function matchScoreline(m: BracketMatch, games: MatchGame[]): string | null {
	const pair = matchScorePair(m, games);
	return pair ? `${pair[0]}–${pair[1]}` : null;
}

/**
 * The same scoreline read from ONE entry's point of view: their number
 * first. A surface that lists an entry's own matches has to orient it this
 * way, or a won match shows as "4-10" beside the word "Won".
 */
export function matchScorelineFor(
	m: BracketMatch,
	games: MatchGame[],
	entryId: string
): string | null {
	const pair = matchScorePair(m, games);
	if (!pair) return null;
	return m.entry_b_id === entryId ? `${pair[1]}–${pair[0]}` : `${pair[0]}–${pair[1]}`;
}

export interface PoolStandingRow {
	entryId: string;
	wins: number;
	losses: number;
	played: number;
	pf: number;
	pa: number;
	diff: number;
}

/**
 * Display standings for one pool's matches. This is presentation only: the
 * AUTHORITATIVE ranking (head-to-head two-way ties, logged random draws) runs
 * server-side in tournament_generate_bracket; this table shows wins then
 * point differential, which matches the server everywhere short of a tie the
 * server breaks by head-to-head or draw.
 */
export function poolStandings(poolMatches: QualMatch[]): PoolStandingRow[] {
	const rows = new Map<string, PoolStandingRow>();
	const rowFor = (id: string): PoolStandingRow => {
		let r = rows.get(id);
		if (!r) {
			r = { entryId: id, wins: 0, losses: 0, played: 0, pf: 0, pa: 0, diff: 0 };
			rows.set(id, r);
		}
		return r;
	};
	for (const m of poolMatches) {
		const a = rowFor(m.entry_a_id);
		const b = rowFor(m.entry_b_id);
		if (!m.winner_id) continue;
		a.played++;
		b.played++;
		if (m.winner_id === m.entry_a_id) {
			a.wins++;
			b.losses++;
		} else {
			b.wins++;
			a.losses++;
		}
		if (m.score_a !== null && m.score_b !== null) {
			a.pf += m.score_a;
			a.pa += m.score_b;
			b.pf += m.score_b;
			b.pa += m.score_a;
		}
	}
	for (const r of rows.values()) r.diff = r.pf - r.pa;
	return [...rows.values()].sort(
		(x, y) => y.wins - x.wins || y.diff - x.diff || x.entryId.localeCompare(y.entryId)
	);
}

/** Entries keyed by id, for the render components. */
export function entryMap(entries: TournamentEntry[]): Record<string, TournamentEntry> {
	return Object.fromEntries(entries.map((e) => [e.id, e]));
}

// ---------------------------------------------------------------------------
// Registrants (0192). An entry is one or more people; the bracket shows the
// entry and every surface that names the people reads the member rows.
// ---------------------------------------------------------------------------

/** The most registrants an entry may hold; mirrors 0192's normaliser. */
export const TEAM_SIZE_MAX = 6;

/** Members grouped by entry, each list in registration order (created_at,
 * then id so two rows from one transaction order the same on every read). */
export function memberMap(
	members: TournamentEntryMember[]
): Record<string, TournamentEntryMember[]> {
	const out: Record<string, TournamentEntryMember[]> = {};
	const ordered = [...members].sort(
		(a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
	);
	for (const m of ordered) (out[m.entry_id] ??= []).push(m);
	return out;
}

/** The chosen names of one entry's members, in order; nothing for no rows. */
export function memberNames(members: TournamentEntryMember[] | undefined): string[] {
	return (members ?? []).map((m) => m.name);
}

export function entryIsFull(memberCount: number, teamSize: number): boolean {
	return memberCount >= Math.max(1, teamSize);
}

/**
 * THE ONE CLIENT SPELLING OF "MY ENTRY". Membership first: a teammate who
 * joined somebody else's entry has no entries.user_id of their own and is
 * still in the tournament. Then the entry's own user_id, for a row with no
 * member row -- which cannot exist after 0192's backfill and is kept for a
 * deployment sitting between the client and the migration.
 * `tests/tournament-members.test.ts` sweeps the routes for the inline form
 * this replaces.
 */
export function myEntryFor(
	entries: TournamentEntry[],
	members: TournamentEntryMember[],
	userId: string | null | undefined
): TournamentEntry | null {
	if (!userId) return null;
	const mine = members.find((m) => m.user_id === userId);
	if (mine) {
		const e = entries.find((x) => x.id === mine.entry_id);
		if (e) return e;
	}
	return entries.find((e) => e.user_id === userId) ?? null;
}

/**
 * THE ONE CLIENT SPELLING OF 0192's "NOT STARTED". The bracket is what starts
 * an event and `tournament_generate_bracket` stamps `live`, so a rename is
 * open through draft, registration and seeding and locked from live on --
 * for a host and an admin too. A surface that wants to know whether a
 * rename control belongs on screen asks this and nothing else.
 */
export function entriesLocked(status: TournamentStatus): boolean {
	return status === 'live' || status === 'complete';
}

// ---------------------------------------------------------------------------
// Phase 3a: timing, records and aggregates.
//
// Every figure below is DERIVED from data Phase 1 already captures -- the
// append-only tournament_match_events stream plus started_at / completed_at
// on the match row. Nothing here is stored, so a tournament that ran before
// this phase existed reports the same numbers as one that runs after it.
// ---------------------------------------------------------------------------

/** Milliseconds between two ISO stamps; null unless both parse. */
export function msBetween(from: string | null, to: string | null): number | null {
	if (!from || !to) return null;
	const a = Date.parse(from);
	const b = Date.parse(to);
	if (Number.isNaN(a) || Number.isNaN(b)) return null;
	return b - a;
}

/** Compact human duration: "38s", "4m 12s", "1h 05m". Negative reads as a dash. */
export function formatDuration(ms: number | null): string {
	if (ms === null || !Number.isFinite(ms) || ms < 0) return '—';
	const total = Math.round(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
	if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
	return `${s}s`;
}

export interface MatchTimeline {
	/** When the match row was created: bracket generation, or the grand-final
	 * reset's own creation. From the 'created' event. */
	createdAt: string | null;
	startedAt: string | null;
	completedAt: string | null;
	/** Created to started: how long this pairing sat waiting to be called. */
	waitMs: number | null;
	/** Started to completed: how long it actually took to play. */
	durationMs: number | null;
	/** Every event for this match, oldest first. */
	events: MatchEvent[];
	/** Just the corrections, oldest first; each carries its logged reason. */
	corrections: MatchEvent[];
}

/**
 * Builds one match's timeline from its slice of the event stream plus the
 * authoritative stamps on its row.
 *
 * The row's started_at / completed_at win wherever they exist: the events are
 * the audit trail (they also record a correction's re-stamp), the columns are
 * the current truth. A qualifying match has no start at all -- nothing starts
 * one, a result is simply recorded -- so its wait time is legitimately null
 * rather than zero.
 */
export function matchTimeline(
	events: MatchEvent[],
	row: { started_at?: string | null; completed_at?: string | null }
): MatchTimeline {
	const ordered = [...events].sort(
		(a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at) || a.id - b.id
	);
	const firstOf = (type: MatchEvent['event_type']) =>
		ordered.find((e) => e.event_type === type)?.occurred_at ?? null;
	const lastOf = (type: MatchEvent['event_type']) =>
		[...ordered].reverse().find((e) => e.event_type === type)?.occurred_at ?? null;

	const createdAt = firstOf('created');
	const startedAt = row.started_at ?? firstOf('started');
	const completedAt = row.completed_at ?? lastOf('corrected') ?? lastOf('completed');

	return {
		createdAt,
		startedAt: startedAt ?? null,
		completedAt: completedAt ?? null,
		waitMs: msBetween(createdAt, startedAt ?? null),
		durationMs: msBetween(startedAt ?? null, completedAt ?? null),
		events: ordered,
		corrections: ordered.filter((e) => e.event_type === 'corrected')
	};
}

/** A correction rendered as what actually changed. */
export interface CorrectionSummary {
	at: string;
	reason: string;
	previousWinnerId: string | null;
	newWinnerId: string | null;
	/** True when the correction replaced a forfeit with a played result. */
	previousForfeit: boolean;
}

export function correctionSummary(e: MatchEvent): CorrectionSummary {
	const md = e.metadata ?? {};
	const str = (k: string) => (typeof md[k] === 'string' ? (md[k] as string) : null);
	return {
		at: e.occurred_at,
		reason: str('reason') ?? '',
		previousWinnerId: str('previous_winner_id'),
		newWinnerId: str('winner_id'),
		previousForfeit: md.previous_forfeit === true
	};
}

/** True when a 'completed' event is the forfeit flavour (0065 metadata). */
export function eventIsForfeit(e: MatchEvent): boolean {
	return e.event_type === 'completed' && e.metadata?.forfeit === true;
}

/** True when a 'completed' event is the auto-resolved bye flavour. */
export function eventIsBye(e: MatchEvent): boolean {
	return e.event_type === 'completed' && e.metadata?.bye === true;
}

export interface MatchDurationRow {
	match: BracketMatch;
	durationMs: number;
}

export interface TournamentStats {
	/** Contested, timed matches: the population every duration figure uses. */
	timedCount: number;
	averageDurationMs: number | null;
	fastest: MatchDurationRow | null;
	slowest: MatchDurationRow | null;
	/** First match started to last match completed. */
	firstStartedAt: string | null;
	lastCompletedAt: string | null;
	totalDurationMs: number | null;
}

/**
 * Tournament-level aggregates over the bracket.
 *
 * Duration figures count only CONTESTED, TIMED matches: a bye and a forfeit
 * were never played, so averaging them in would report an event running
 * faster than it did. The overall span is deliberately wider -- it is
 * wall clock, from whenever the first match was started to whenever the last
 * one finished, so a forfeit that ended the event still closes the window --
 * while byes stay out of it entirely, since they complete the instant the
 * bracket is generated and describe no elapsed time at all.
 */
export function tournamentStats(matches: BracketMatch[]): TournamentStats {
	const timed: MatchDurationRow[] = [];
	for (const m of matches) {
		if (!isPlayedMatch(m)) continue;
		const durationMs = msBetween(m.started_at, m.completed_at);
		if (durationMs === null || durationMs < 0) continue;
		timed.push({ match: m, durationMs });
	}

	let firstStartedAt: string | null = null;
	let lastCompletedAt: string | null = null;
	for (const m of matches) {
		if (isByeMatch(m)) continue;
		if (m.started_at && (!firstStartedAt || Date.parse(m.started_at) < Date.parse(firstStartedAt))) {
			firstStartedAt = m.started_at;
		}
		if (
			m.status === 'complete' &&
			m.completed_at &&
			(!lastCompletedAt || Date.parse(m.completed_at) > Date.parse(lastCompletedAt))
		) {
			lastCompletedAt = m.completed_at;
		}
	}

	const sorted = [...timed].sort((a, b) => a.durationMs - b.durationMs);
	const total = timed.reduce((sum, r) => sum + r.durationMs, 0);

	return {
		timedCount: timed.length,
		averageDurationMs: timed.length ? Math.round(total / timed.length) : null,
		fastest: sorted[0] ?? null,
		// Only meaningful as a contrast to the fastest, so a single timed
		// match reports one figure rather than the same match twice.
		slowest: sorted.length > 1 ? sorted[sorted.length - 1] : null,
		firstStartedAt,
		lastCompletedAt,
		totalDurationMs: msBetween(firstStartedAt, lastCompletedAt)
	};
}

export interface EntryRecord {
	wins: number;
	losses: number;
	/** Advancements the bracket's shape handed over: never counted as wins. */
	byes: number;
	forfeitWins: number;
	forfeitLosses: number;
	/** Every bracket match with this entry on one side, in bracket order. */
	matches: BracketMatch[];
}

const BRACKET_ORDER: BracketId[] = ['winners', 'losers', 'grand_final', 'grand_final_reset'];

export function sortMatches(matches: BracketMatch[]): BracketMatch[] {
	return [...matches].sort(
		(a, b) =>
			BRACKET_ORDER.indexOf(a.bracket) - BRACKET_ORDER.indexOf(b.bracket) ||
			a.round - b.round ||
			a.slot - b.slot
	);
}

/**
 * One entry's bracket record.
 *
 * A BYE is excluded from the win/loss line: it is an advancement the
 * bracket's shape handed over, not a result. A FORFEIT is included -- it
 * really did advance one side and eliminate the other -- and is also
 * reported separately so the record can be read honestly.
 */
export function entryBracketRecord(entryId: string, matches: BracketMatch[]): EntryRecord {
	const mine = sortMatches(
		matches.filter((m) => m.entry_a_id === entryId || m.entry_b_id === entryId)
	);
	const rec: EntryRecord = {
		wins: 0,
		losses: 0,
		byes: 0,
		forfeitWins: 0,
		forfeitLosses: 0,
		matches: mine
	};
	for (const m of mine) {
		if (m.status !== 'complete' || !m.winner_id) continue;
		if (isByeMatch(m)) {
			if (m.winner_id === entryId) rec.byes++;
			continue;
		}
		const won = m.winner_id === entryId;
		if (won) rec.wins++;
		else rec.losses++;
		if (isForfeitMatch(m)) {
			if (won) rec.forfeitWins++;
			else rec.forfeitLosses++;
		}
	}
	return rec;
}

export interface QualRecord {
	wins: number;
	losses: number;
	matches: QualMatch[];
}

export function entryQualRecord(entryId: string, matches: QualMatch[]): QualRecord {
	const mine = matches
		.filter((m) => m.entry_a_id === entryId || m.entry_b_id === entryId)
		.sort((a, b) => a.sequence - b.sequence);
	let wins = 0;
	let losses = 0;
	for (const m of mine) {
		if (!m.winner_id) continue;
		if (m.winner_id === entryId) wins++;
		else losses++;
	}
	return { wins, losses, matches: mine };
}

export interface LedgerRunRow extends RewardAward {
	/** Per registrant, like every figure on an award. */
	runningTotal: number;
}

/** One entry's AWARDS oldest first (by first row id), each carrying the
 * per-person running total and how many registrants it paid. */
export function entryLedgerRun(entryId: string, ledger: RewardLedgerRow[]): LedgerRunRow[] {
	let total = 0;
	return rewardAwards(ledger.filter((r) => r.entry_id === entryId)).map((a) => {
		total += a.amount;
		return { ...a, runningTotal: total };
	});
}

/** The one place a detail URL is built, so every surface links the same way. */
export function matchHref(tournamentId: string, matchId: string): string {
	return `/tournaments/${tournamentId}/match/${matchId}`;
}

export function entryHref(tournamentId: string, entryId: string): string {
	return `/tournaments/${tournamentId}/entry/${entryId}`;
}
