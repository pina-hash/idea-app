// tests/classroom-team-rows.test.ts
//
// LEDGER 0456 (0324): what the page tells a team document about a table's
// rows, the split's hints, what the class home's "today" card picks, and the
// machine week's grid. Silent-if-wrong: a row a teammate holds drawn free, a
// table drawn shut for a row lock, a clash that nobody sees.

import { describe, expect, it } from 'vitest';
import { teamFieldStates, teamRowKey, type TeamDocument } from '../src/lib/classroom/html-assignment/team-doc';
import type { HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/manifest';
import { parseTeamPlan, teamBalanceHints, teamToday } from '../src/lib/classroom/team-plan';
import { machineWeekGrid, parseMachineWeek } from '../src/lib/classroom/team-board';
import { fixturePlan } from '../src/routes/dev/team-plan/_fixture';

const manifest = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'T',
	course: 'IDEA209H',
	points: 20,
	team: { roles: [{ id: 'frame', title: 'Frame' }] },
	modules: [
		{ id: 'm', title: 'Matrix', points: 10, audience: 'team', blocks: [{ id: 'wot', field: 'wot', type: 'table' }], criteria: [] },
		{ id: 'g', title: 'Goal', points: 10, audience: 'team', blocks: [{ id: 'goal', field: 'goal', type: 'text' }], criteria: [] }
	]
} as unknown as HtmlAssignmentManifest;

const doc = (locks: TeamDocument['locks']): TeamDocument => ({
	team: { id: 't', name: 'Torque', number: 1 },
	reason: null,
	sectionId: 's',
	members: [],
	roles: [],
	values: {},
	locks,
	pastDue: false,
	serverNow: null,
	phases: {}
});

describe('a table locks by row', () => {
	const now = Date.parse('2026-10-28T16:00:00Z');
	const soon = '2026-10-28T16:01:00Z';
	it('a teammate’s row lock shuts that row only; the table and other boxes stay free', () => {
		const s = teamFieldStates(manifest, doc({ [teamRowKey('wot', 2)]: { by: 'Ana', mine: false, until: soon } }), now);
		expect(s.wot).toEqual({ state: 'free', rows: { '2': 'Ana' } });
		expect(s.goal).toEqual({ state: 'free' });
	});
	it('my own row lock and an expired one shut nothing', () => {
		const s = teamFieldStates(
			manifest,
			doc({
				[teamRowKey('wot', 0)]: { by: 'Me', mine: true, until: soon },
				[teamRowKey('wot', 1)]: { by: 'Ben', mine: false, until: '2026-10-28T15:59:00Z' }
			}),
			now
		);
		expect(s.wot).toEqual({ state: 'free' });
	});
	it('a whole-box lock on another box is still the box', () => {
		const s = teamFieldStates(manifest, doc({ goal: { by: 'Cara', mine: false, until: soon } }), now);
		expect(s.goal).toEqual({ state: 'held', by: 'Cara' });
		expect(s.wot).toEqual({ state: 'free' });
	});
});

describe('the plan’s words', () => {
	it('today: only the viewer’s open tasks due by today or checked in on, and the next sign-off', () => {
		const p = parseTeamPlan(fixturePlan()).plan!;
		const t = teamToday(p)!;
		expect(t.mine.every((x) => x.owner === p.me && x.status !== 'done')).toBe(true);
		expect(t.mine.every((x) => (x.dueOn !== null && x.dueOn <= p.today) || x.onIt.includes(p.me))).toBe(true);
		const next = p.checkpoints.find((c) => c.state !== 'approved') ?? null;
		expect(t.next?.title ?? null).toBe(next?.title ?? null);
		expect(teamToday({ ...p, me: '' })).toBeNull();
	});
	it('the split names who is over and under, in points', () => {
		const p = parseTeamPlan(fixturePlan()).plan!;
		const uneven = {
			...p,
			balance: {
				...p.balance,
				balanced: false,
				unowned: 0,
				total: 40,
				rule: 'roles' as const,
				members: p.members.map((m, i) => ({ key: m.key, points: i === 0 ? 30 : 5, expected: i === 0 ? 20 : 10 }))
			}
		};
		const lines = teamBalanceHints(uneven);
		expect(lines.some((l) => l.includes(`${p.members[0].name} is 10 points over`))).toBe(true);
		expect(lines.some((l) => l.includes('points under their share'))).toBe(true);
		expect(lines.at(-1)).toMatch(/fewer people than roles/);
		expect(teamBalanceHints({ ...uneven, balance: { ...uneven.balance, balanced: true } })).toEqual([]);
	});
});

describe('the machine week', () => {
	it('five school days, a row per machine, a clash counted once per cell', () => {
		const w = parseMachineWeek({
			ok: true,
			from: '2026-11-02',
			to: '2026-11-08',
			machines: [
				{ id: 'laser', label: 'Laser cutter' },
				{ id: 'mill', label: 'Mill' }
			],
			bookings: [
				{ day: '2026-11-04', machine: 'laser', section: 'Block 2', team: 'Torque', task: 'Side plates', clash: true },
				{ day: '2026-11-04', machine: 'laser', section: 'Block 4', team: 'Arc', task: 'Base', clash: true },
				{ day: '2026-11-05', machine: 'router', section: 'Block 2', team: 'Volt', task: 'Deck', clash: false }
			]
		})!;
		const g = machineWeekGrid(w);
		expect(g.days).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']);
		expect(g.rows.map((r) => r.machine.id)).toEqual(['laser', 'mill', 'router']);
		expect(g.rows[0].cells[2].bookings.length).toBe(2);
		expect(g.clashes).toBe(1);
		expect(g.rows[2].cells[3].clash).toBe(false);
	});
});
