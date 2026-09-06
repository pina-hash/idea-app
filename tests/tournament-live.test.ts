// tests/tournament-live.test.ts
//
// THE LIVE EVENT'S ARITHMETIC, AND THE ONE-IMPLEMENTATION RULE AROUND IT
// (prompt 0077).
//
// `src/lib/tournaments/live.ts` is what the host console, the public event
// page and the projector stage all read for "what is on, what is next, how
// far along is the bracket". Each of those used to derive it for itself, and
// three copies of a five-line filter are three things that quietly stop
// agreeing about which match a host should call -- on the one surface where
// disagreeing is visible to a whole classroom at once.
//
// Everything here is either PURE ARITHMETIC over a fixture, or a SOURCE SWEEP
// that reddens when a surface grows its own copy back. What is deliberately
// NOT here is anything geometric: the 44px floors on the host controls are
// `npm run verify:browser`'s claim (routes/tournaments*.mjs), and the tap
// count between two matches is `tests/dom/tournament-host-control-mount.test.ts`'s,
// because it needs a mounted component and real clicks.
//
// THE POSITIVE CONTROL FOR THE SECTION ORDER is in the bundle's history entry:
// with `hostSectionOrder` reverted to put the match card at the bottom while
// live, `matches first while live` below reddens.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	FORFEIT_REASONS,
	bracketProgress,
	hostSectionOrder,
	matchQueue,
	nextUp,
	type HostSection
} from '$lib/tournaments/live';
import type { BracketMatch, TournamentStatus } from '$lib/tournaments/tournaments';
import { buildSim, playNext, startNext } from '../src/routes/dev/tournaments/sim';

const ROOT = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

function match(over: Partial<BracketMatch> & Pick<BracketMatch, 'id'>): BracketMatch {
	return {
		tournament_id: 't',
		bracket: 'winners',
		round: 1,
		slot: 1,
		entry_a_id: 'a',
		entry_b_id: 'b',
		best_of: 1,
		status: 'pending',
		winner_id: null,
		started_at: null,
		completed_at: null,
		winner_to_match_id: null,
		winner_to_pos: null,
		loser_to_match_id: null,
		loser_to_pos: null,
		...over
	};
}

describe('matchQueue partitions a bracket by what a host can do with it', () => {
	it('splits in-progress, ready, waiting and completed, and drops byes from completed', () => {
		const rows: BracketMatch[] = [
			match({ id: 'live', status: 'in_progress', slot: 2 }),
			match({ id: 'ready', slot: 3 }),
			match({ id: 'waiting', entry_b_id: null, slot: 4 }),
			match({ id: 'done', status: 'complete', winner_id: 'a', slot: 1 }),
			// A bye: complete with an empty side. Nobody played it, nothing to
			// correct, so it is in NO list.
			match({ id: 'bye', status: 'complete', winner_id: 'a', entry_b_id: null, slot: 5 })
		];
		const q = matchQueue(rows);
		expect(q.inProgress.map((m) => m.id)).toEqual(['live']);
		expect(q.ready.map((m) => m.id)).toEqual(['ready']);
		expect(q.waiting.map((m) => m.id)).toEqual(['waiting']);
		expect(q.completed.map((m) => m.id)).toEqual(['done']);
		const listed = [...q.inProgress, ...q.ready, ...q.waiting, ...q.completed].map((m) => m.id);
		expect(listed).not.toContain('bye');
	});

	it('orders every list winners, losers, grand final, reset, then round, then slot', () => {
		const rows: BracketMatch[] = [
			match({ id: 'gf', bracket: 'grand_final', round: 1, slot: 1 }),
			match({ id: 'l2', bracket: 'losers', round: 2, slot: 1 }),
			match({ id: 'w1s2', bracket: 'winners', round: 1, slot: 2 }),
			match({ id: 'w1s1', bracket: 'winners', round: 1, slot: 1 }),
			match({ id: 'l1', bracket: 'losers', round: 1, slot: 1 }),
			match({ id: 'reset', bracket: 'grand_final_reset', round: 1, slot: 1 })
		];
		expect(matchQueue(rows).ready.map((m) => m.id)).toEqual([
			'w1s1',
			'w1s2',
			'l1',
			'l2',
			'gf',
			'reset'
		]);
	});

	it('nextUp is the first ready match and null when nothing is callable', () => {
		expect(nextUp([match({ id: 'x', slot: 2 }), match({ id: 'y', slot: 1 })])?.id).toBe('y');
		expect(nextUp([match({ id: 'w', entry_a_id: null })])).toBeNull();
		expect(nextUp([])).toBeNull();
	});

	it('agrees with the simulator that mirrors 0062, over a real 6-entry field', () => {
		const sim = buildSim(6);
		// Two byes resolve at generation in a 6-field: they must not be
		// "completed" work, and the first ready match is the first contested
		// winners-round-1 slot.
		const q0 = matchQueue(sim.matches);
		expect(q0.completed).toHaveLength(0);
		expect(q0.inProgress).toHaveLength(0);
		expect(q0.ready.length).toBeGreaterThan(0);
		expect(q0.ready[0].bracket).toBe('winners');
		expect(q0.ready[0].round).toBe(1);

		startNext(sim);
		const q1 = matchQueue(sim.matches);
		expect(q1.inProgress).toHaveLength(1);
		expect(q1.inProgress[0].id).toBe(q0.ready[0].id);
		expect(q1.ready.map((m) => m.id)).not.toContain(q0.ready[0].id);

		playNext(sim);
		const q2 = matchQueue(sim.matches);
		expect(q2.inProgress).toHaveLength(0);
		expect(q2.completed.map((m) => m.id)).toContain(q0.ready[0].id);
	});
});

describe('bracketProgress counts contested matches only', () => {
	it('excludes byes from the total and the played count', () => {
		const rows: BracketMatch[] = [
			match({ id: 'bye', status: 'complete', winner_id: 'a', entry_b_id: null }),
			match({ id: 'done', status: 'complete', winner_id: 'a', slot: 2 }),
			match({ id: 'live', status: 'in_progress', slot: 3 }),
			match({ id: 'todo', slot: 4 }),
			match({ id: 'waiting', entry_a_id: null, slot: 5 })
		];
		const p = bracketProgress(rows);
		expect(p.total).toBe(4);
		expect(p.played).toBe(1);
		expect(p.live).toBe(1);
		expect(p.cells).toEqual(['done', 'live', 'todo', 'todo']);
	});

	it('a 6-entry field reads 0 played at the start and ends fully played', () => {
		const sim = buildSim(6);
		const start = bracketProgress(sim.matches);
		expect(start.played).toBe(0);
		// 6 entries double elimination: 2 byes out of 14 generated rows.
		expect(start.total).toBe(sim.matches.length - 2);
		let guard = 0;
		while (guard++ < 300 && playNext(sim)) {
			/* run to champion */
		}
		const end = bracketProgress(sim.matches);
		expect(end.played).toBe(end.total);
		expect(end.live).toBe(0);
		// THE TOTAL SETTLES DURING PLAY, IN BOTH DIRECTIONS, and the rail says
		// "of N" with the N it knows now. A losers-round slot fed by a bye can
		// only be recognised as a bye once its feeder resolves (the 0062
		// resolver runs after every result), so the count drops; a grand-final
		// reset adds one. Measured on this field: 14 rows, 12 contested at the
		// start, 10 by the end with no reset.
		const contested = sim.matches.filter((m) => !(m.status === 'complete' && (m.entry_a_id === null || m.entry_b_id === null)));
		expect(end.total).toBe(contested.length);
		expect(end.total).toBeLessThanOrEqual(start.total + 1);
	});
});

describe('hostSectionOrder puts the match card first the moment there is a bracket', () => {
	const ALL: HostSection[] = ['phase', 'matches', 'entries', 'invites', 'quals', 'rewards', 'danger'];
	const statuses: TournamentStatus[] = [
		'draft',
		'registration_open',
		'seeding',
		'live',
		'complete'
	];

	it('names every section exactly once in every phase', () => {
		for (const s of statuses) {
			const order = hostSectionOrder(s);
			expect([...order].sort()).toEqual([...ALL].sort());
			expect(new Set(order).size).toBe(ALL.length);
		}
	});

	it('matches first while live and complete', () => {
		expect(hostSectionOrder('live')[0]).toBe('matches');
		expect(hostSectionOrder('complete')[0]).toBe('matches');
	});

	it('setup first before the bracket exists, with danger always last', () => {
		for (const s of ['draft', 'registration_open', 'seeding'] as TournamentStatus[]) {
			const order = hostSectionOrder(s);
			expect(order[0]).toBe('phase');
			expect(order.indexOf('matches')).toBeGreaterThan(order.indexOf('rewards'));
		}
		for (const s of statuses) expect(hostSectionOrder(s).at(-1)).toBe('danger');
	});
});

describe('FORFEIT_REASONS are what 0065 will accept', () => {
	it('each is 1-200 characters after trimming, and they are distinct', () => {
		expect(FORFEIT_REASONS.length).toBeGreaterThanOrEqual(2);
		for (const r of FORFEIT_REASONS) {
			expect(r.trim().length).toBeGreaterThanOrEqual(1);
			expect(r.trim().length).toBeLessThanOrEqual(200);
			expect(r).toBe(r.trim());
		}
		expect(new Set(FORFEIT_REASONS).size).toBe(FORFEIT_REASONS.length);
	});

	it('ForfeitForm offers every preset as a chip', () => {
		const src = read('src/lib/tournaments/ForfeitForm.svelte');
		expect(src).toMatch(/import \{ FORFEIT_REASONS \} from '\.\/live'/);
		expect(src).toMatch(/\{#each FORFEIT_REASONS as preset/);
	});
});

describe('one implementation of the queue, and the room on every page', () => {
	const surfaces = [
		'src/lib/tournaments/HostMatchControl.svelte',
		'src/lib/tournaments/TvStage.svelte',
		'src/routes/tournaments/[id]/+page.svelte'
	];

	it('every surface that lists what is next imports matchQueue from live.ts', () => {
		for (const rel of surfaces) {
			const src = read(rel);
			expect(src, rel).toMatch(/import \{[^}]*\bmatchQueue\b[^}]*\} from '(\.\/live|\$lib\/tournaments\/live)'/);
		}
	});

	it('no surface re-derives "ready" with its own bracket-order sort', () => {
		// The shape every copy had: a literal bracket order array sorted inline.
		const copy = /\['winners', 'losers', 'grand_final', 'grand_final_reset'\]\.indexOf/;
		for (const rel of surfaces) {
			expect(read(rel), rel).not.toMatch(copy);
		}
		expect(read('src/routes/tournaments/[id]/host/+page.svelte')).not.toMatch(copy);
		// Positive control for the sweep: the pattern IS what live.ts spells,
		// once, so the regex is not matching nothing anywhere.
		expect(read('src/lib/tournaments/live.ts')).toMatch(/BRACKET_ORDER\.indexOf/);
	});

	it('the host route mounts HostMatchControl and lays its cards out through hostSectionOrder', () => {
		const src = read('src/routes/tournaments/[id]/host/+page.svelte');
		expect(src).toMatch(/import HostMatchControl from '\$lib\/tournaments\/HostMatchControl\.svelte'/);
		expect(src).toMatch(/\{#each hostSectionOrder\(t\.status\) as section/);
		expect(src).toMatch(/<HostMatchControl/);
		// The inline forms are gone from the route: one mount of each, in the
		// component the harness also mounts.
		expect(src).not.toMatch(/<ResultForm/);
		expect(src).not.toMatch(/<ForfeitForm/);
	});

	it('the tournaments layout is a room and nothing else', () => {
		const dir = join(ROOT, 'src/routes/tournaments');
		expect(existsSync(join(dir, '+layout.svelte'))).toBe(true);
		const src = read('src/routes/tournaments/+layout.svelte');
		expect(src).toMatch(/class="tnm-root tnm-shell"/);
		expect(src).toMatch(/tournaments-theme\.css/);
		// PUBLIC TIER: no load, no guard, no session read, ever (CLAUDE.md).
		expect(readdirSync(dir)).not.toContain('+layout.server.ts');
		expect(readdirSync(dir)).not.toContain('+layout.ts');
		expect(src).not.toMatch(/supabase|claims|redirect|load\(/);
	});

	it('the room aliases the shared vocabulary on .tnm-root itself and never re-points a semantic accent', () => {
		const css = read('src/lib/tournaments/tournaments-theme.css');
		const block = css.match(/\.tnm-root \{\n\t--bg0: var\(--tnm-bg\);[\s\S]*?\n\}/);
		expect(block, 'alias block on .tnm-root').not.toBeNull();
		for (const token of ['--green', '--gold', '--cyan', '--amber', '--crimson', '--violet']) {
			expect(css, token).not.toMatch(new RegExp(`\\n\\t${token}:`));
		}
	});
});
