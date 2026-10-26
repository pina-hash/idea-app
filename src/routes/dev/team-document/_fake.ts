/**
 * THE `/dev/team-document` STAND-IN FOR 0302, IN MEMORY, DEV ONLY (ledger 0436).
 *
 * Two browser contexts are two students; they share nothing but this server,
 * so the team calls answer from one module-scoped store and every notice goes
 * out over server-sent events. It answers in 0302's SHAPES and keeps 0302's
 * RULES only as far as a harness needs to drive the real client (a held box,
 * an owned box, posting as the switch, a move). It is not the boundary and is
 * never evidence for one: tests/db/classroom-team-documents.test.ts holds the
 * real functions to every rule, mutation-proven.
 */
import { TEAM_FIXTURE_MANIFEST, TEAM_FIXTURE_ROLES } from '$lib/classroom/html-assignment/team-fixture';

const TTL_MS = 120_000;

interface Student {
	id: string;
	name: string;
	section: 'A' | 'B';
}

export const STUDENTS: Student[] = [
	{ id: 's1', name: 'Ana', section: 'A' },
	{ id: 's2', name: 'Ben', section: 'A' },
	{ id: 's3', name: 'Cara', section: 'A' },
	{ id: 's4', name: 'Dev', section: 'A' },
	{ id: 's5', name: 'Eli', section: 'B' }
];

type Notice = { key: string; topic: string };

interface State {
	posted: Record<'A' | 'B', boolean>;
	teamOf: Record<string, string | null>;
	teams: Record<string, { name: string; section: 'A' | 'B' }>;
	values: Record<string, Record<string, unknown>>;
	updatedBy: Record<string, Record<string, string>>;
	locks: Record<string, Record<string, { holder: string; touched: number }>>;
	owners: Record<string, Record<string, string>>;
	log: { team: string; block: string | null; kind: string; by: string; at: string; before: unknown; after: unknown }[];
	individual: Record<string, Record<string, unknown>>;
}

function fresh(): State {
	return {
		posted: { A: false, B: true },
		teamOf: { s1: 'A1', s2: 'A1', s3: 'A2', s4: null, s5: 'B1' },
		teams: { A1: { name: 'Team 1', section: 'A' }, A2: { name: 'Team 2', section: 'A' }, B1: { name: 'Team 1', section: 'B' } },
		values: { A1: {}, A2: {}, B1: {} },
		updatedBy: { A1: {}, A2: {}, B1: {} },
		locks: { A1: {}, A2: {}, B1: {} },
		owners: { A1: { drive: 's1', frame: 's2' }, A2: {}, B1: {} },
		log: [],
		individual: {}
	};
}

const g = globalThis as unknown as { __teamDocFake?: { state: State; listeners: Set<(n: Notice) => void> } };
g.__teamDocFake ??= { state: fresh(), listeners: new Set() };
const store = g.__teamDocFake;

export function listen(fn: (n: Notice) => void): () => void {
	store.listeners.add(fn);
	return () => store.listeners.delete(fn);
}

function notice(key: string, topic: string) {
	for (const fn of store.listeners) fn({ key, topic });
}

const sectionKey = (s: 'A' | 'B') => `section-${s}`;
const teamKey = (t: string) => `team-${t}`;
const nameOf = (id: string) => STUDENTS.find((s) => s.id === id)?.name ?? id;

function sharedOf(block: string): { audience: 'team' } | { audience: 'role'; role: string } | null {
	for (const mod of TEAM_FIXTURE_MANIFEST.modules) {
		if (!mod.blocks.some((b) => b.id === block)) continue;
		if (mod.audience === 'team') return { audience: 'team' };
		if (mod.audience === 'role') return { audience: 'role', role: (mod as { role: string }).role };
		return null;
	}
	return null;
}

function ctx(as: string): { team: string | null; reason: string | null; section: 'A' | 'B' } {
	const me = STUDENTS.find((s) => s.id === as)!;
	if (!store.state.posted[me.section]) return { team: null, reason: 'not_posted', section: me.section };
	const team = store.state.teamOf[as];
	return team ? { team, reason: null, section: me.section } : { team: null, reason: 'no_team', section: me.section };
}

function freshLock(team: string, block: string) {
	const l = store.state.locks[team][block];
	return l && Date.now() - l.touched < TTL_MS ? l : null;
}

function refusal(as: string, team: string, block: string): Record<string, unknown> | null {
	const who = sharedOf(block);
	if (who?.audience === 'role') {
		const owner = store.state.owners[team][who.role];
		if (!owner) return { ok: false, reason: 'no_owner', role: who.role };
		if (owner !== as) return { ok: false, reason: 'not_owner', role: who.role, by: nameOf(owner) };
	}
	return null;
}

function take(as: string, team: string, block: string): Record<string, unknown> | null {
	const l = freshLock(team, block);
	if (l && l.holder !== as) return { ok: false, reason: 'held', by: nameOf(l.holder), until: new Date(l.touched + TTL_MS).toISOString() };
	store.state.locks[team][block] = { holder: as, touched: Date.now() };
	return null;
}

export function read(as: string): unknown {
	const c = ctx(as);
	if (!c.team) return { ok: true, team: null, reason: c.reason, section_id: sectionKey(c.section) };
	const t = c.team;
	const st = store.state;
	return {
		ok: true,
		team: { id: t, name: st.teams[t].name, number: Number(t.slice(1)), section_id: sectionKey(c.section) },
		members: STUDENTS.filter((s) => st.teamOf[s.id] === t).map((s) => ({ name: s.name, me: s.id === as, active: true })),
		roles: TEAM_FIXTURE_ROLES.map((r) => ({
			id: r.id,
			title: r.title,
			owner: st.owners[t][r.id] ? nameOf(st.owners[t][r.id]) : null,
			mine: st.owners[t][r.id] === as
		})),
		values: Object.fromEntries(
			Object.entries(st.values[t]).map(([b, v]) => [b, { value: v, by: nameOf(st.updatedBy[t][b] ?? ''), at: null }])
		),
		locks: Object.fromEntries(
			Object.entries(st.locks[t]).flatMap(([b, l]) =>
				Date.now() - l.touched < TTL_MS
					? [[b, { by: nameOf(l.holder), mine: l.holder === as, until: new Date(l.touched + TTL_MS).toISOString() }]]
					: []
			)
		),
		past_due: false,
		now: new Date().toISOString()
	};
}

export function lock(as: string, block: string, wants: boolean): unknown {
	const c = ctx(as);
	if (!c.team) return { ok: false, reason: c.reason };
	if (!wants) {
		if (store.state.locks[c.team][block]?.holder === as) {
			delete store.state.locks[c.team][block];
			notice(teamKey(c.team), 'team-doc');
		}
		return { ok: true, released: true };
	}
	const no = refusal(as, c.team, block) ?? take(as, c.team, block);
	if (no) return no;
	notice(teamKey(c.team), 'team-doc');
	return { ok: true, until: new Date(Date.now() + TTL_MS).toISOString(), value: store.state.values[c.team][block] ?? null };
}

export function save(as: string, block: string, value: unknown): unknown {
	if (!sharedOf(block)) {
		(store.state.individual[as] ??= {})[block] = value;
		return { ok: true };
	}
	const c = ctx(as);
	if (!c.team) return { ok: false, reason: c.reason };
	const no = refusal(as, c.team, block) ?? take(as, c.team, block);
	if (no) return no;
	const before = store.state.values[c.team][block] ?? null;
	if (JSON.stringify(before) === JSON.stringify(value)) return { ok: true };
	store.state.values[c.team][block] = value;
	store.state.updatedBy[c.team][block] = as;
	store.state.log.push({ team: c.team, block, kind: 'answer', by: nameOf(as), at: new Date().toISOString(), before, after: value });
	notice(teamKey(c.team), 'team-doc');
	return { ok: true };
}

export function control(op: string, args: Record<string, string>): unknown {
	const st = store.state;
	switch (op) {
		case 'reset':
			store.state = fresh();
			notice(sectionKey('A'), 'teams');
			notice(sectionKey('B'), 'teams');
			return { ok: true };
		case 'post':
		case 'unpost': {
			const s = args.section === 'B' ? 'B' : 'A';
			st.posted[s] = op === 'post';
			notice(sectionKey(s), 'teams');
			return { ok: true };
		}
		case 'move': {
			const from = st.teamOf[args.student];
			const to = args.team;
			st.teamOf[args.student] = to;
			for (const t of [from, to]) if (t) st.log.push({ team: t, block: null, kind: t === to ? 'move-in' : 'move-out', by: 'teacher', at: new Date().toISOString(), before: null, after: args.student });
			if (from) for (const [b, l] of Object.entries(st.locks[from])) if (l.holder === args.student) delete st.locks[from][b];
			notice(sectionKey(STUDENTS.find((s) => s.id === args.student)!.section), 'teams');
			return { ok: true };
		}
		case 'log':
			return { ok: true, log: st.log };
		default:
			return { ok: false, reason: 'unknown_op' };
	}
}

export function announce(key: string, topic: string) {
	notice(key, topic);
}
