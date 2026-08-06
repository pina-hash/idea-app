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
	MatchGame,
	QualMatch,
	QualPool,
	TournamentEntry
} from '$lib/tournaments/tournaments';

let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

export interface Sim {
	entries: TournamentEntry[];
	matches: BracketMatch[];
	games: MatchGame[];
	championId: string | null;
	status: 'live' | 'complete';
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

export function buildSim(n: number): Sim {
	counter = 0;
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
	const sim: Sim = { entries, matches: [], games: [], championId: null, status: 'live' };

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

	resolveByes(sim);
	return sim;
}

function setSlot(sim: Sim, matchId: string, pos: 'a' | 'b', entryId: string | null) {
	const m = sim.matches.find((x) => x.id === matchId);
	if (!m) return;
	if (pos === 'a') m.entry_a_id = entryId;
	else m.entry_b_id = entryId;
}

function completeMatch(sim: Sim, m: BracketMatch, winnerId: string | null) {
	const loser =
		winnerId === null ? null : winnerId === m.entry_a_id ? m.entry_b_id : m.entry_a_id;
	m.status = 'complete';
	m.winner_id = winnerId;
	m.completed_at = new Date().toISOString();
	if (winnerId && m.winner_to_match_id) setSlot(sim, m.winner_to_match_id, m.winner_to_pos!, winnerId);
	if (loser && m.loser_to_match_id) setSlot(sim, m.loser_to_match_id, m.loser_to_pos!, loser);
	if (m.bracket === 'grand_final' && winnerId) {
		if (winnerId === m.entry_b_id) {
			if (!sim.matches.some((x) => x.bracket === 'grand_final_reset')) {
				const reset = blankMatch('grand_final_reset', 1, 1);
				reset.entry_a_id = m.entry_a_id;
				reset.entry_b_id = m.entry_b_id;
				sim.matches.push(reset);
			}
		} else {
			sim.championId = winnerId;
			sim.status = 'complete';
		}
	} else if (m.bracket === 'grand_final_reset' && winnerId) {
		sim.championId = winnerId;
		sim.status = 'complete';
	}
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
				completeMatch(sim, m, m.entry_a_id);
				changed = true;
			} else if (m.entry_b_id !== null && aDead) {
				completeMatch(sim, m, m.entry_b_id);
				changed = true;
			} else if (aDead && bDead) {
				completeMatch(sim, m, null);
				changed = true;
			}
		}
	}
}

/** Plays the next playable match. forceSide overrides the coin flip (the GF
 * "b" case exercises the bracket reset). Returns false when nothing is
 * playable. */
export function playNext(sim: Sim, forceSide?: 'a' | 'b'): boolean {
	if (sim.status === 'complete') return false;
	const order = ['winners', 'losers', 'grand_final', 'grand_final_reset'];
	const m = [...sim.matches]
		.sort(
			(a, b) =>
				order.indexOf(a.bracket) - order.indexOf(b.bracket) || a.round - b.round || a.slot - b.slot
		)
		.find(
			(x) =>
				(x.status === 'pending' || x.status === 'in_progress') &&
				x.entry_a_id !== null &&
				x.entry_b_id !== null
		);
	if (!m) return false;
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
	m.status = 'in_progress';
	completeMatch(sim, m, winner);
	resolveByes(sim);
	return true;
}

/** Marks the next playable match in_progress (to eyeball the LIVE styling). */
export function startNext(sim: Sim): boolean {
	const m = sim.matches.find(
		(x) => x.status === 'pending' && x.entry_a_id !== null && x.entry_b_id !== null
	);
	if (!m) return false;
	m.status = 'in_progress';
	m.started_at = new Date().toISOString();
	return true;
}

/** Sample qualifying pools (2 pools of 3) with recorded scores, for PoolsView. */
export function buildQualSample(): {
	entries: TournamentEntry[];
	pools: QualPool[];
	matches: QualMatch[];
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
		mk(pools[1], p2[0], p2[1], 9, 10, )
	];
	return { entries, pools, matches };
}
