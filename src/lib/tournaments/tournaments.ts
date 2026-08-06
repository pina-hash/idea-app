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
}

const PLACEMENT_LABELS: Record<number, string> = { 1: '1st place', 2: '2nd place', 3: '3rd place' };

export function rewardRuleLabel(r: Pick<RewardRule, 'trigger_type' | 'trigger_value'>): string {
	if (r.trigger_type === 'win') return 'Match win';
	if (r.trigger_type === 'round_reached') return `Reached round ${r.trigger_value}`;
	return PLACEMENT_LABELS[r.trigger_value ?? 0] ?? `Placement ${r.trigger_value}`;
}

export interface RewardTotalRow {
	entryId: string;
	total: number;
	awards: number;
}

/** Per-entry totals over the ledger, largest first. */
export function rewardTotals(ledger: RewardLedgerRow[]): RewardTotalRow[] {
	const totals = new Map<string, RewardTotalRow>();
	for (const row of ledger) {
		let t = totals.get(row.entry_id);
		if (!t) {
			t = { entryId: row.entry_id, total: 0, awards: 0 };
			totals.set(row.entry_id, t);
		}
		t.total += row.amount;
		t.awards += 1;
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
			o.best_of && typeof o.best_of === 'object' ? (o.best_of as Record<string, number>) : {}
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

/** Per-side game-win tally for a match ("2-1"); single decided game in score
 * mode reads as its score ("10-5"). */
export function matchScoreline(m: BracketMatch, games: MatchGame[]): string | null {
	const mine = games
		.filter((g) => g.bracket_match_id === m.id)
		.sort((a, b) => a.game_number - b.game_number);
	if (!mine.length) return null;
	if (mine.length === 1 && mine[0].score_a !== null && mine[0].score_b !== null) {
		return `${mine[0].score_a}–${mine[0].score_b}`;
	}
	let a = 0;
	let b = 0;
	for (const g of mine) {
		if (g.winner_id && g.winner_id === m.entry_a_id) a++;
		else if (g.winner_id && g.winner_id === m.entry_b_id) b++;
	}
	return `${a}–${b}`;
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
