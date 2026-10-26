// tests/classroom-team-plan.test.ts
//
// LEDGER 0436: the team plan's statuses and flags, from a plan in
// `classroom_team_plan`'s own shape (the harness fixture). Silent-if-wrong:
// a team that is slipping read as on pace, a blocked task read as behind, a
// Done that a stored answer short of its sentences would earn.

import { describe, expect, it } from 'vitest';
import {
	isSchoolDay,
	parseTeamPlan,
	schoolDaysBetween,
	teamPlanSummary,
	teamTaskDone,
	teamTaskStatus,
	teamTrackerMessage
} from '../src/lib/classroom/team-plan';
import { fixturePlan } from '../src/routes/dev/team-plan/_fixture';

const plan = () => parseTeamPlan(fixturePlan()).plan!;

describe('statuses', () => {
	it('Done is the completion rule: an answer counts, a short one against minSentences does not', () => {
		const p = plan();
		const goal = p.tasks.find((t) => t.id === 'goal')!;
		expect(teamTaskDone(goal)).toBe(true);
		expect(teamTaskDone({ ...goal, block: { ...goal.block!, minSentences: 3 } })).toBe(false);
		expect(teamTaskDone({ ...goal, value: { text: '   ' } })).toBe(false);
		// A team's own task with no linked field is never done by itself.
		expect(teamTaskDone(p.tasks.find((t) => t.id === 'bolts')!)).toBe(false);
	});
	it('Blocked outranks Behind; Behind is past due and not done; On it is today’s check-in', () => {
		const p = plan();
		const s = (id: string) => teamTaskStatus(p.tasks.find((t) => t.id === id)!, p.today);
		expect(s('energy-req')).toBe('blocked');
		expect(s('frame-req')).toBe('behind');
		expect(s('drive-req')).toBe('on-it');
		expect(s('ballpath-req')).toBe('todo');
		expect(s('goal')).toBe('done');
	});
});

describe('the team flags', () => {
	it('a slipping team is flagged at least two school days before its sign-off', () => {
		const p = plan();
		const design = p.checkpoints.find((c) => c.key === 'design')!;
		const ahead = schoolDaysBetween(p.today, design.date!, p.noSchool).filter((d) => d > p.today);
		expect(ahead.length).toBeGreaterThanOrEqual(2);
		const s = teamPlanSummary(p);
		expect(s.plannedToDate).toBe(90);
		expect(s.done).toBe(30);
		expect(s.slipping).toBe(true);
		expect(s.uneven).toBe(true);
		expect(s.behind).toBe(1);
	});
	it('a team at or above 80% of what it planned to date is on pace (90 of 90)', () => {
		const raw = fixturePlan();
		for (const t of raw.tasks as Record<string, unknown>[]) {
			if (['frame-req', 'energy-req', 'drive-req'].includes(String(t.id))) t.value = { text: 'Written.' };
		}
		expect(teamPlanSummary(parseTeamPlan(raw).plan!).slipping).toBe(false);
	});
});

describe('school days', () => {
	it('skip weekends and the admin list (Nov 11)', () => {
		const p = plan();
		expect(isSchoolDay('2026-11-11', p.noSchool)).toBe(false);
		expect(isSchoolDay('2026-10-31', p.noSchool)).toBe(false);
		expect(schoolDaysBetween('2026-11-09', '2026-11-13', p.noSchool)).toEqual([
			'2026-11-09',
			'2026-11-10',
			'2026-11-12',
			'2026-11-13'
		]);
	});
});

describe('the tracker sent into the document', () => {
	it('carries names, titles and statuses, the student first, and no answer', () => {
		const m = teamTrackerMessage(plan());
		expect(m.tasks[0].owner).toBe('Ana');
		expect(JSON.stringify(m)).not.toMatch(/Done and written up/);
		expect(m.next).toEqual({ title: 'Design', date: '2026-11-02', state: 'open' });
		expect(m.flags).toEqual({ behind: 1, slipping: true, uneven: true });
	});
});
