/**
 * In-memory double-elimination simulator for the /dev/tournaments harness.
 * Mirrors the topology + advancement + bye-resolution rules of
 * supabase/migrations/0062_tournaments.sql (which is the authority and was
 * integration-tested against a real Postgres); this exists so the REAL
 * BracketView / PoolsView components can be driven in a browser with no
 * auth or Supabase.
 */
import type {
	BracketMatch,
	MatchEvent,
	MatchGame,
	QualMatch,
	QualPool,
	RewardLedgerRow,
	RewardRule,
	TournamentEntry
} from '$lib/tournaments/tournaments';
import type { EntryStyle } from '$lib/tournaments/entry-styles';

let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

export interface Sim {
	entries: TournamentEntry[];
	matches: BracketMatch[];
	games: MatchGame[];
	championId: string | null;
	status: 'live' | 'complete';
	/** Reward mirror of 0063: rules + the append-only ledger. */
	rewardRules: RewardRule[];
	ledger: RewardLedgerRow[];
	/** Mirror of 0064: per-entry banner styles, keyed by entry id. */
	styles: Record<string, EntryStyle>;
	/** Mirror of tournament_match_events: the append-only audit stream that
	 * the Phase 3a match detail page reconstructs its timeline from. */
	events: MatchEvent[];
}

/**
 * A virtual clock, because the harness plays a whole tournament in a few
 * milliseconds and the Phase 3a timing figures would all read 0s otherwise.
 * Every state change advances it by a plausible number of minutes, so wait
 * times, durations and the fastest/slowest spread are real arithmetic over
 * real (if simulated) stamps.
 */
let clockMs = 0;
function resetClock() {
	// Two hours ago, so the whole run sits in the recent past.
	clockMs = Date.now() - 2 * 60 * 60 * 1000;
}
function tick(minMinutes: number, maxMinutes: number): string {
	clockMs += Math.round((minMinutes + Math.random() * (maxMinutes - minMinutes)) * 60_000);
	return new Date(clockMs).toISOString();
}
function nowIso(): string {
	return new Date(clockMs).toISOString();
}

let eventSeq = 0;
function logEvent(
	sim: Sim,
	matchId: string | null,
	eventType: MatchEvent['event_type'],
	metadata: Record<string, unknown> = {},
	kind: 'bracket' | 'qual' | null = 'bracket'
) {
	sim.events.push({
		id: ++eventSeq,
		tournament_id: 'sim',
		match_kind: matchId ? kind : null,
		match_id: matchId,
		event_type: eventType,
		actor_id: null,
		occurred_at: nowIso(),
		metadata
	});
}

/** This match's slice of the stream, for MatchDetail / MatchTimeline. */
export function eventsFor(sim: Sim, matchId: string): MatchEvent[] {
	return sim.events.filter((e) => e.match_id === matchId);
}

const NAMES = [
	'Vortex', 'Kilowatt', 'Redline', 'Gearbox', 'Sawtooth', 'Nimbus', 'Piston', 'Fluxline',
	'Anvil', 'Quasar', 'Torque', 'Falcon', 'Dynamo', 'Rachet', 'Cobalt', 'Zephyr'
];

function seedPlacement(p: number): number[] {
	let ord = [1];
	let size = 1;
	while (size < p) {
		const next: number[] = [];
		for (const x of ord) next.push(x, 2 * size + 1 - x);
		ord = next;
		size *= 2;
	}
	return ord;
}

function blankMatch(bracket: BracketMatch['bracket'], round: number, slot: number): BracketMatch {
	return {
		id: uid('m'),
		tournament_id: 'sim',
		bracket,
		round,
		slot,
		entry_a_id: null,
		entry_b_id: null,
		best_of: 1,
		status: 'pending',
		winner_id: null,
		started_at: null,
		completed_at: null,
		winner_to_match_id: null,
		winner_to_pos: null,
		loser_to_match_id: null,
		loser_to_pos: null
	};
}

function find(sim: Sim, bracket: string, round: number, slot: number): BracketMatch {
	const m = sim.matches.find(
		(x) => x.bracket === bracket && x.round === round && x.slot === slot
	);
	if (!m) throw new Error(`missing match ${bracket} r${round} s${slot}`);
	return m;
}

/**
 * Sample banner styles mirroring 0064, deliberately covering every axis:
 * all three background types, accents spread across the wheel (never
 * green-heavy), several badges, ALL FOUR flourishes, taglines both present
 * and absent -- and, just as importantly, entries 5+ carry NO STYLE AT ALL,
 * so the default treatment is verifiable side by side with customized ones.
 */
function sampleStyles(entries: TournamentEntry[]): Record<string, EntryStyle> {
	const specs: Omit<EntryStyle, 'entry_id' | 'tournament_id'>[] = [
		{
			background_type: 'gradient',
			background_value: ['#3e1d6b', '#8e5bf0'],
			accent_color: '#8e5bf0',
			badge: 'bolt',
			flourish: 'glow-pulse',
			tagline: 'Third-period specialists'
		},
		{
			background_type: 'solid',
			background_value: '#7a1418',
			accent_color: '#e5484d',
			badge: 'flame',
			flourish: 'confetti-on-win',
			tagline: 'Built in a weekend'
		},
		{
			background_type: 'gradient',
			background_value: ['#0b3b4a', '#22cccc'],
			accent_color: '#22cccc',
			badge: 'gear',
			flourish: 'particle-trail',
			tagline: null
		},
		{
			background_type: 'solid',
			background_value: '#f2e6c4',
			accent_color: '#f76b15',
			badge: 'crown',
			flourish: 'screen-shake-on-elimination',
			tagline: 'Light background, dark ink'
		},
		{
			background_type: null,
			background_value: null,
			accent_color: '#0fbe7a',
			badge: 'shield',
			flourish: null,
			tagline: 'Accent only, no background'
		}
	];
	const out: Record<string, EntryStyle> = {};
	entries.slice(0, specs.length).forEach((e, i) => {
		out[e.id] = { entry_id: e.id, tournament_id: e.tournament_id, ...specs[i] };
	});
	return out;
}

export function buildSim(n: number): Sim {
	counter = 0;
	eventSeq = 0;
	resetClock();
	const entries: TournamentEntry[] = Array.from({ length: n }, (_, i) => ({
		id: uid('e'),
		tournament_id: 'sim',
		user_id: null,
		display_name: NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${i + 1}` : ''),
		description: '',
		thumbnail_url: null,
		seed: i + 1,
		created_at: new Date().toISOString()
	}));

	let p = 1;
	while (p < n) p *= 2;
	const r = Math.log2(p);
	const sim: Sim = {
		entries,
		matches: [],
		games: [],
		championId: null,
		status: 'live',
		rewardRules: [],
		ledger: [],
		styles: sampleStyles(entries),
		events: []
	};

	const placement = seedPlacement(p);
	for (let round = 1; round <= r; round++) {
		const cnt = p >> round;
		for (let slot = 1; slot <= cnt; slot++) {
			const m = blankMatch('winners', round, slot);
			if (round === 1) {
				m.entry_a_id = entries[placement[2 * slot - 2] - 1]?.id ?? null;
				m.entry_b_id = entries[placement[2 * slot - 1] - 1]?.id ?? null;
			}
			sim.matches.push(m);
		}
	}
	if (r >= 2) {
		for (let k = 1; k <= r - 1; k++) {
			const cnt = p >> (k + 1);
			for (const round of [2 * k - 1, 2 * k]) {
				for (let slot = 1; slot <= cnt; slot++) sim.matches.push(blankMatch('losers', round, slot));
			}
		}
	}
	sim.matches.push(blankMatch('grand_final', 1, 1));

	// Wire pointers (same rules as the migration).
	for (const m of sim.matches) {
		if (m.bracket === 'winners') {
			if (m.round < r) {
				const t = find(sim, 'winners', m.round + 1, Math.ceil(m.slot / 2));
				m.winner_to_match_id = t.id;
				m.winner_to_pos = m.slot % 2 === 1 ? 'a' : 'b';
			} else {
				m.winner_to_match_id = find(sim, 'grand_final', 1, 1).id;
				m.winner_to_pos = 'a';
			}
			if (m.round === 1) {
				if (r === 1) {
					m.loser_to_match_id = find(sim, 'grand_final', 1, 1).id;
					m.loser_to_pos = 'b';
				} else {
					const t = find(sim, 'losers', 1, Math.ceil(m.slot / 2));
					m.loser_to_match_id = t.id;
					m.loser_to_pos = m.slot % 2 === 1 ? 'a' : 'b';
				}
			} else {
				const cnt = p >> m.round;
				const s2 = m.round % 2 === 0 ? cnt + 1 - m.slot : m.slot;
				const t = find(sim, 'losers', 2 * (m.round - 1), s2);
				m.loser_to_match_id = t.id;
				m.loser_to_pos = 'b';
			}
		} else if (m.bracket === 'losers') {
			if (m.round % 2 === 1) {
				const t = find(sim, 'losers', m.round + 1, m.slot);
				m.winner_to_match_id = t.id;
				m.winner_to_pos = 'a';
			} else {
				const k = m.round / 2;
				if (k < r - 1) {
					const t = find(sim, 'losers', m.round + 1, Math.ceil(m.slot / 2));
					m.winner_to_match_id = t.id;
					m.winner_to_pos = m.slot % 2 === 1 ? 'a' : 'b';
				} else {
					m.winner_to_match_id = find(sim, 'grand_final', 1, 1).id;
					m.winner_to_pos = 'b';
				}
			}
		}
	}

	// One 'created' event per match at generation time, exactly like
	// tournament_generate_bracket's audit loop.
	for (const m of sim.matches) {
		logEvent(sim, m.id, 'created', { bracket: m.bracket, round: m.round, slot: m.slot });
	}

	resolveByes(sim);
	return sim;
}

function setSlot(sim: Sim, matchId: string, pos: 'a' | 'b', entryId: string | null) {
	const m = sim.matches.find((x) => x.id === matchId);
	if (!m) return;
	if (pos === 'a') m.entry_a_id = entryId;
	else m.entry_b_id = entryId;
}

function completeMatch(
	sim: Sim,
	m: BracketMatch,
	winnerId: string | null,
	eventType: 'completed' | 'corrected' = 'completed',
	metadata: Record<string, unknown> = {}
) {
	const loser =
		winnerId === null ? null : winnerId === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
	m.status = 'complete';
	m.winner_id = winnerId;
	m.completed_at = nowIso();
	logEvent(sim, m.id, eventType, { ...metadata, winner_id: winnerId });
	if (winnerId && m.winner_to_match_id) setSlot(sim, m.winner_to_match_id, m.winner_to_pos!, winnerId);
	if (loser && m.loser_to_match_id) setSlot(sim, m.loser_to_match_id, m.loser_to_pos!, loser);
	if (m.bracket === 'grand_final' && winnerId) {
		if (winnerId === m.entry_b_id) {
			if (!sim.matches.some((x) => x.bracket === 'grand_final_reset')) {
				const reset = blankMatch('grand_final_reset', 1, 1);
				reset.entry_a_id = m.entry_a_id;
				reset.entry_b_id = m.entry_b_id;
				sim.matches.push(reset);
				logEvent(sim, reset.id, 'created', { bracket: 'grand_final_reset', round: 1, slot: 1 });
			}
		} else {
			sim.championId = winnerId;
			sim.status = 'complete';
			awardPlacements(sim, winnerId, loser);
		}
	} else if (m.bracket === 'grand_final_reset' && winnerId) {
		sim.championId = winnerId;
		sim.status = 'complete';
		awardPlacements(sim, winnerId, loser);
	}
}

// --- Reward mirror (the 0063 semantics, so RewardsPanel / RewardRulesEditor
// can be driven in a browser) -----------------------------------------------

export function setSimRewardRules(
	sim: Sim,
	rules: { trigger_type: string; trigger_value: number | null; amount: number }[]
) {
	sim.rewardRules = rules.map((r) => ({
		id: uid('rr'),
		tournament_id: 'sim',
		trigger_type: r.trigger_type as RewardRule['trigger_type'],
		trigger_value: r.trigger_value,
		amount: r.amount
	}));
}

let ledgerSeq = 0;

function award(sim: Sim, entryId: string, amount: number, reason: string, matchId: string | null) {
	sim.ledger.push({
		id: ++ledgerSeq,
		tournament_id: 'sim',
		entry_id: entryId,
		user_id: null,
		amount,
		reason,
		match_id: matchId,
		awarded_at: new Date().toISOString()
	});
}

/** Mirrors the win + round-bonus block of tournament_submit_match_result:
 * only ENTERED results award (playNext calls this; byes never do). */
function awardMatchWin(sim: Sim, m: BracketMatch, winnerId: string) {
	const win = sim.rewardRules.find((r) => r.trigger_type === 'win');
	if (win) award(sim, winnerId, win.amount, 'match win', m.id);
	if (m.bracket === 'winners') {
		const round = sim.rewardRules.find(
			(r) => r.trigger_type === 'round_reached' && r.trigger_value === m.round
		);
		if (round) award(sim, winnerId, round.amount, `reached round ${m.round}`, m.id);
	}
}

/** Mirrors _tournament_award_placements: settles once, third from the losers
 * final (the losers match feeding the grand final's B side). */
function awardPlacements(sim: Sim, championId: string, runnerUpId: string | null) {
	if (sim.ledger.some((row) => row.match_id === null)) return;
	const gf = sim.matches.find((x) => x.bracket === 'grand_final');
	const losersFinal = sim.matches.find(
		(x) =>
			x.bracket === 'losers' &&
			x.winner_to_match_id === gf?.id &&
			x.winner_to_pos === 'b' &&
			x.winner_id !== null
	);
	const third = losersFinal
		? losersFinal.winner_id === losersFinal.entry_a_id
			? losersFinal.entry_b_id
			: losersFinal.entry_a_id
		: null;
	const amountFor = (place: number) =>
		sim.rewardRules.find((r) => r.trigger_type === 'placement' && r.trigger_value === place)
			?.amount ?? null;
	const first = amountFor(1);
	if (first !== null) award(sim, championId, first, '1st place', null);
	const second = amountFor(2);
	if (second !== null && runnerUpId) award(sim, runnerUpId, second, '2nd place', null);
	const thirdAmt = amountFor(3);
	if (thirdAmt !== null && third) award(sim, third, thirdAmt, '3rd place', null);
}

function resolveByes(sim: Sim) {
	let changed = true;
	while (changed) {
		changed = false;
		for (const m of sim.matches) {
			if (m.status !== 'pending') continue;
			const dead = (pos: 'a' | 'b') => {
				const entry = pos === 'a' ? m.entry_a_id : m.entry_b_id;
				if (entry !== null) return false;
				return !sim.matches.some(
					(f) =>
						f.status !== 'complete' &&
						((f.winner_to_match_id === m.id && f.winner_to_pos === pos) ||
							(f.loser_to_match_id === m.id && f.loser_to_pos === pos))
				);
			};
			const aDead = dead('a');
			const bDead = dead('b');
			if (m.entry_a_id !== null && bDead) {
				completeMatch(sim, m, m.entry_a_id, 'completed', { bye: true });
				changed = true;
			} else if (m.entry_b_id !== null && aDead) {
				completeMatch(sim, m, m.entry_b_id, 'completed', { bye: true });
				changed = true;
			} else if (aDead && bDead) {
				completeMatch(sim, m, null, 'completed', { dead: true });
				changed = true;
			}
		}
	}
}

const PLAY_ORDER = ['winners', 'losers', 'grand_final', 'grand_final_reset'];

function nextPlayable(sim: Sim): BracketMatch | undefined {
	return [...sim.matches]
		.sort(
			(a, b) =>
				PLAY_ORDER.indexOf(a.bracket) - PLAY_ORDER.indexOf(b.bracket) ||
				a.round - b.round ||
				a.slot - b.slot
		)
		.find(
			(x) =>
				(x.status === 'pending' || x.status === 'in_progress') &&
				x.entry_a_id !== null &&
				x.entry_b_id !== null
		);
}

/** Plays the next playable match. forceSide overrides the coin flip (the GF
 * "b" case exercises the bracket reset). Returns false when nothing is
 * playable. */
export function playNext(sim: Sim, forceSide?: 'a' | 'b'): boolean {
	if (sim.status === 'complete') return false;
	const m = nextPlayable(sim);
	if (!m) return false;
	// Wait, then play: both figures the match detail page reports.
	if (m.status !== 'in_progress') {
		m.started_at = tick(1, 14);
		m.status = 'in_progress';
		logEvent(sim, m.id, 'started');
	}
	const side = forceSide ?? (Math.random() < 0.5 ? 'a' : 'b');
	const winner = side === 'a' ? m.entry_a_id! : m.entry_b_id!;
	sim.games.push({
		id: uid('g'),
		tournament_id: 'sim',
		bracket_match_id: m.id,
		game_number: 1,
		score_a: side === 'a' ? 10 : Math.floor(Math.random() * 9),
		score_b: side === 'b' ? 10 : Math.floor(Math.random() * 9),
		winner_id: winner
	});
	tick(2, 22);
	completeMatch(sim, m, winner, 'completed', { games: [{ winner: side }] });
	awardMatchWin(sim, m, winner);
	resolveByes(sim);
	return true;
}

/**
 * Mirrors the 0065 forfeit path: advances a side, records NO games, pays NO
 * reward (awardMatchWin is deliberately not called -- the same rule that
 * keeps byes out of the ledger), leaves started_at alone, and logs a
 * 'completed' event carrying forfeit metadata rather than a new event type.
 */
export function forfeitNext(sim: Sim, reason = 'no-show'): boolean {
	if (sim.status === 'complete') return false;
	const m = nextPlayable(sim);
	if (!m) return false;
	const winner = Math.random() < 0.5 ? m.entry_a_id! : m.entry_b_id!;
	const loser = winner === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
	m.forfeit = true;
	m.forfeit_reason = reason;
	tick(1, 5);
	completeMatch(sim, m, winner, 'completed', {
		forfeit: true,
		reason,
		forfeited_by: loser
	});
	resolveByes(sim);
	return true;
}

/** Marks the next playable match in_progress (to eyeball the LIVE styling). */
export function startNext(sim: Sim): boolean {
	const m = sim.matches.find(
		(x) => x.status === 'pending' && x.entry_a_id !== null && x.entry_b_id !== null
	);
	if (!m) return false;
	m.started_at = tick(1, 14);
	m.status = 'in_progress';
	logEvent(sim, m.id, 'started');
	return true;
}

/**
 * Corrects the most recent completed contested match whose downstream is
 * still untouched -- the same restriction _tournament_check_unwindable
 * enforces -- by flipping the winner. Logs a 'corrected' event carrying the
 * reason and previous winner, which is what the match detail page's
 * corrections section renders.
 */
export function correctLast(sim: Sim, reason = 'Scoresheet was misread at the table'): string | null {
	// The same restriction the SQL enforces: a downstream match that is
	// pending is fine, and one the resolver auto-completed as a BYE (derived
	// state, an empty side) is unwound rather than blocking. Anything with a
	// real entered result downstream blocks.
	const unwindable = (id: string | null): boolean => {
		if (!id) return true;
		const d = sim.matches.find((x) => x.id === id);
		if (!d) return true;
		if (d.status === 'pending') return true;
		return d.status === 'complete' && (d.entry_a_id === null || d.entry_b_id === null);
	};
	const candidates = sim.matches.filter(
		(m) =>
			m.status === 'complete' &&
			m.winner_id !== null &&
			m.entry_a_id !== null &&
			m.entry_b_id !== null &&
			unwindable(m.winner_to_match_id) &&
			unwindable(m.loser_to_match_id)
	);
	const m = candidates[candidates.length - 1];
	if (!m) return null;

	const previous = m.winner_id!;
	const next = previous === m.entry_a_id ? m.entry_b_id! : m.entry_a_id!;
	// Unwind what this match pushed downstream before re-advancing, resetting
	// any auto-completed bye it fed so resolveByes can re-derive it.
	for (const [tid, pos] of [
		[m.winner_to_match_id, m.winner_to_pos],
		[m.loser_to_match_id, m.loser_to_pos]
	] as [string | null, 'a' | 'b' | null][]) {
		if (!tid || !pos) continue;
		const d = sim.matches.find((x) => x.id === tid);
		if (d && d.status === 'complete') {
			d.status = 'pending';
			d.winner_id = null;
			d.completed_at = null;
		}
		setSlot(sim, tid, pos, null);
	}
	// A corrected result is a played result, so any forfeit flag clears.
	const wasForfeit = m.forfeit === true;
	m.forfeit = false;
	m.forfeit_reason = null;
	sim.games = sim.games.filter((g) => g.bracket_match_id !== m.id);
	sim.games.push({
		id: uid('g'),
		tournament_id: 'sim',
		bracket_match_id: m.id,
		game_number: 1,
		score_a: next === m.entry_a_id ? 10 : 6,
		score_b: next === m.entry_b_id ? 10 : 6,
		winner_id: next
	});
	tick(3, 12);
	completeMatch(sim, m, next, 'corrected', {
		reason,
		previous_winner_id: previous,
		previous_forfeit: wasForfeit
	});
	resolveByes(sim);
	return m.id;
}

/** Sample qualifying pools (2 pools of 3) with recorded scores, for PoolsView. */
export function buildQualSample(): {
	entries: TournamentEntry[];
	pools: QualPool[];
	matches: QualMatch[];
	/** Enough of the stream for the match detail page's qual variant. */
	events: MatchEvent[];
} {
	counter = 1000;
	const entries: TournamentEntry[] = Array.from({ length: 6 }, (_, i) => ({
		id: uid('qe'),
		tournament_id: 'sim',
		user_id: null,
		display_name: NAMES[i],
		description: '',
		thumbnail_url: null,
		seed: i + 1,
		created_at: new Date().toISOString()
	}));
	const pools: QualPool[] = [
		{ id: uid('p'), tournament_id: 'sim', pool_number: 1 },
		{ id: uid('p'), tournament_id: 'sim', pool_number: 2 }
	];
	// Snake: pool1 = seeds 1,4,5; pool2 = seeds 2,3,6.
	const p1 = [entries[0], entries[3], entries[4]];
	const p2 = [entries[1], entries[2], entries[5]];
	let seq = 0;
	const mk = (
		pool: QualPool,
		a: TournamentEntry,
		b: TournamentEntry,
		sa: number | null,
		sb: number | null
	): QualMatch => ({
		id: uid('qm'),
		pool_id: pool.id,
		tournament_id: 'sim',
		sequence: ++seq,
		entry_a_id: a.id,
		entry_b_id: b.id,
		winner_id: sa === null || sb === null ? null : sa > sb ? a.id : b.id,
		score_a: sa,
		score_b: sb,
		played_at: sa === null ? null : new Date().toISOString()
	});
	const matches = [
		mk(pools[0], p1[1], p1[2], 7, 6),
		mk(pools[0], p1[0], p1[2], 10, 3),
		mk(pools[0], p1[0], p1[1], 10, 5),
		mk(pools[1], p2[1], p2[2], 9, 2),
		mk(pools[1], p2[0], p2[2], 10, 1),
		mk(pools[1], p2[0], p2[1], 9, 10)
	];

	// A qual match is scheduled and then recorded; nothing ever "starts" it,
	// which is exactly the null-wait case the timeline has to explain.
	let seq2 = 0;
	let base = Date.now() - 90 * 60 * 1000;
	const events: MatchEvent[] = [];
	for (const m of matches) {
		events.push({
			id: ++seq2,
			tournament_id: 'sim',
			match_kind: 'qual',
			match_id: m.id,
			event_type: 'created',
			actor_id: null,
			occurred_at: new Date(base).toISOString(),
			metadata: { sequence: m.sequence }
		});
	}
	for (const m of matches) {
		base += 7 * 60 * 1000;
		events.push({
			id: ++seq2,
			tournament_id: 'sim',
			match_kind: 'qual',
			match_id: m.id,
			event_type: 'completed',
			actor_id: null,
			occurred_at: new Date(base).toISOString(),
			metadata: { winner_id: m.winner_id, score_a: m.score_a, score_b: m.score_b }
		});
	}
	return { entries, pools, matches, events };
}
