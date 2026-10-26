// tests/classroom-team-board.test.ts
//
// LEDGER 0436, 0306: the team board's arithmetic, from a board in
// `classroom_team_board`'s own shape (the harness fixture). Silent-if-wrong:
// a machine count that does not equal the tags seeded, a burn-up counting
// work before it was saved, a slipping team shown on pace, the next sign-off
// counted in calendar days.

import { describe, expect, it } from 'vitest';
import { boardDays, boardTeamCard, machineCounts, parseTeamBoard, schoolDayOf, teamBurnUp } from '../src/lib/classroom/team-board';
import { fixtureBoard, MACHINE_TAGS } from '../src/routes/dev/team-board/_fixture';

const board = () => parseTeamBoard(fixtureBoard())!;

describe('team board', () => {
	it('reads every team as its own plan', () => {
		const b = board();
		expect(b.teams.map((t) => [t.plan.team.name, t.sectionLabel])).toEqual([
			['Team Torque', 'Block 2'],
			['Team Arc', 'Block 2'],
			['Team Volt', 'Block 3'],
			['Team Bolt', 'Block 4']
		]);
	});

	it('the machine counts equal the tags seeded, by day, across every class; an untagged machine counts nothing', () => {
		const b = board();
		const counts = machineCounts(b, boardDays(b));
		for (const [machine, byDay] of Object.entries(MACHINE_TAGS)) {
			const row = counts.find((c) => c.id === machine)!;
			const nonzero = Object.fromEntries(Object.entries(row.byDay).filter(([, n]) => n > 0));
			expect(nonzero).toEqual(byDay);
			expect(row.total).toBe(Object.values(byDay).reduce((s: number, n) => s + n, 0));
		}
		expect(counts.find((c) => c.id === 'mill')!.total).toBe(0);
	});

	it('the burn-up counts done work from the day it was saved, planned work from its due date, stacked by owner', () => {
		const b = board();
		const days = boardDays(b);
		expect(days[0]).toBe('2026-10-26');
		expect(days).not.toContain('2026-11-11');
		expect(days).not.toContain('2026-10-31');
		const torque = teamBurnUp(b.teams[0], days);
		const at = (d: string) => torque.find((p) => p.day === d)!;
		expect(at('2026-10-26')).toMatchObject({ planned: 0, done: 0 });
		// Goal (Ana, 20) saved Oct 27; Launch method (Ben, 10) saved Oct 28.
		expect(at('2026-10-27')).toMatchObject({ planned: 30, done: 20, byOwner: { 'k-ana': 20 } });
		expect(at('2026-10-28')).toMatchObject({ planned: 70, done: 30, byOwner: { 'k-ana': 20, 'k-ben': 10 } });
		expect(at('2026-10-29').planned).toBe(90);
		expect(schoolDayOf('2026-10-28T06:30:00Z')).toBe('2026-10-27');
	});

	it('flags a slipping team two school days before its sign-off, and an on-pace team as on pace', () => {
		const b = board();
		const torque = boardTeamCard(b.teams[0]);
		expect(torque.slipping).toBe(true);
		expect(torque.next).toMatchObject({ key: 'design', schoolDaysLeft: 2 });
		expect(torque.gates.map((g) => g.open)).toEqual([false, false]);
		const arc = boardTeamCard(b.teams[1]);
		expect(arc.slipping).toBe(false);
		expect(arc.behind).toBe(0);
		expect(arc.percent).toBeGreaterThan(torque.percent);
	});
});
