// tests/classroom-team-grade.test.ts
//
// LEDGER 0436, 0305: the team grading screen's arithmetic, from a screen in
// `classroom_team_grading`'s own shape (the harness fixture). Silent-if-wrong:
// a double owner shown the sum of two role blocks instead of their mean, a
// member's total shown while something they need is unscored, a role score
// sent for a member who does not own it, and an "out of" counting every role.

import { describe, expect, it } from 'vitest';
import {
	parseTeamGrading,
	teamCriterionGroups,
	teamGradeArgs,
	teamGradeComplete,
	teamGradeStart,
	teamGradeWords,
	teamMemberPreview,
	teamRoleCriteria,
	teamRubricOutOf,
	teamUnownedRoles
} from '../src/lib/classroom/team-grade';
import { manifestRubricIssues, manifestRubricTotal, type HtmlAssignmentManifest } from '../src/lib/classroom/html-assignment/rubric';
import { fixtureGrading, ROLE_TITLES } from '../src/routes/dev/team-grade/_fixture';

const grading = () => parseTeamGrading(fixtureGrading()).grading!;
const [ELI, FAY, GUS] = ['eli.moss@boscotech.net', 'fay.kim@boscotech.net', 'gus.cole@boscotech.net'];

function manifest(team: boolean): HtmlAssignmentManifest {
	const g = grading();
	// A manifest criterion's own id is what follows `<module id>-` in the stored one.
	const c = (moduleId: string, id: string) => {
		const r = g.rubric.find((x) => x.id === `${moduleId}-${id}`)!;
		return { id, text: r.criterion, points: r.points, levels: r.levels };
	};
	return {
		schemaVersion: 3,
		kind: 'html-assignment',
		title: 'Design Review',
		course: 'IDEA209H',
		points: 225,
		...(team ? { team: { roles: Object.entries(ROLE_TITLES).map(([id, title]) => ({ id, title })) } } : {}),
		modules: [
			{ id: 'review', title: 'Review', points: 100, audience: 'team', blocks: [], criteria: [c('review', 'talk'), c('review', 'answers')] },
			...Object.keys(ROLE_TITLES).map((id) => ({
				id: `${id}-plan`,
				title: id,
				points: 25,
				audience: 'role' as const,
				role: id,
				blocks: [],
				criteria: [c(`${id}-plan`, 'c1')]
			})),
			{ id: 'reflect', title: 'Reflection', points: 25, audience: 'individual', blocks: [], criteria: [c('reflect', 'c1')] }
		]
	} as unknown as HtmlAssignmentManifest;
}

describe('team grading screen', () => {
	it('reads the screen and groups the rubric: team once, each role once, individual per member', () => {
		const g = grading();
		const groups = teamCriterionGroups(g);
		expect(groups.team.map((c) => c.id)).toEqual(['review-talk', 'review-answers']);
		expect(groups.roles.map((r) => [r.role.id, r.criteria.length])).toEqual([
			['frame', 1],
			['energy', 1],
			['drive', 1],
			['ballpath', 1]
		]);
		expect(groups.individual.map((c) => c.id)).toEqual(['reflect-c1']);
	});

	it('a member total is the team, their own work and the MEAN of the role blocks they own, and only once complete', () => {
		const g = grading();
		const d = teamGradeStart(g);
		expect(Object.values(d.shared).every((v) => v === null)).toBe(true);
		Object.assign(d.shared, {
			'review-talk': 50,
			'review-answers': 35,
			'frame-plan-c1': 25,
			'energy-plan-c1': 10,
			'drive-plan-c1': 18,
			'ballpath-plan-c1': 0
		});
		d.member[ELI]['reflect-c1'] = 25;
		d.member[FAY]['reflect-c1'] = 18;
		// Eli owns frame and energy: (25 + 10) / 2, never 35.
		expect(teamMemberPreview(g, d, ELI)).toBe(85 + 17.5 + 25);
		expect(teamMemberPreview(g, d, FAY)).toBe(85 + 18 + 18);
		// Gus's reflection is unscored: no total, and nothing returns.
		expect(teamMemberPreview(g, d, GUS)).toBeNull();
		expect(teamGradeComplete(g, d)).toBe(false);
		d.member[GUS]['reflect-c1'] = 10;
		expect(teamMemberPreview(g, d, GUS)).toBe(95);
		expect(teamGradeComplete(g, d)).toBe(true);
		// Every member's maximum is the same: the stored out_of.
		for (const k of Object.keys(d.shared)) d.shared[k] = g.rubric.find((c) => c.id === k)!.points;
		for (const e of [ELI, FAY, GUS]) d.member[e]['reflect-c1'] = 25;
		expect([ELI, FAY, GUS].map((e) => teamMemberPreview(g, d, e))).toEqual([g.outOf, g.outOf, g.outOf]);
	});

	it('sends scored criteria only, shared and per member apart', () => {
		const g = grading();
		const d = teamGradeStart(g);
		d.shared['review-talk'] = 50;
		d.member[FAY]['reflect-c1'] = 18;
		expect(teamGradeArgs(d)).toEqual({
			p_scores: { 'review-talk': 50 },
			p_member_scores: { [ELI]: {}, [FAY]: { 'reflect-c1': 18 }, [GUS]: {} }
		});
	});

	it('starts from what is stored: team from the latest grade, a role from its owner, individual from each member', () => {
		const raw = fixtureGrading() as { members: { scores: Record<string, number>; graded_at: string | null; comment: string | null }[] };
		raw.members[0].scores = { 'review-talk': 35, 'frame-plan-c1': 18, 'energy-plan-c1': 25, 'reflect-c1': 10 };
		raw.members[0].graded_at = '2026-11-02T18:00:00Z';
		raw.members[0].comment = 'Clear.';
		raw.members[1].scores = { 'review-talk': 50, 'drive-plan-c1': 10 };
		raw.members[1].graded_at = '2026-11-02T19:00:00Z';
		const d = teamGradeStart(parseTeamGrading(raw).grading!);
		expect(d.shared['review-talk']).toBe(50);
		expect(d.shared['frame-plan-c1']).toBe(18);
		expect(d.shared['drive-plan-c1']).toBe(10);
		expect(d.shared['ballpath-plan-c1']).toBeNull();
		expect(d.member[ELI]['reflect-c1']).toBe(10);
		expect(d.comment).toBe('');
	});

	it('a scored role with no owner is named before Save', () => {
		const raw = fixtureGrading() as { roles: { owner: string | null }[] };
		raw.roles[2].owner = null;
		const g = parseTeamGrading(raw).grading!;
		const d = teamGradeStart(g);
		expect(teamUnownedRoles(g, d)).toEqual([]);
		d.shared['drive-plan-c1'] = 10;
		expect(teamUnownedRoles(g, d).map((r) => r.id)).toEqual(['drive']);
	});

	it('the out of mirrors the database: one role block on a team assignment, the whole rubric otherwise', () => {
		const g = grading();
		expect(teamRoleCriteria(manifest(true)).size).toBe(4);
		expect(teamRubricOutOf(g.rubric, manifest(true))).toBe(150);
		expect(teamRoleCriteria(manifest(false)).size).toBe(0);
		expect(teamRubricOutOf(g.rubric, manifest(false))).toBe(225);
		expect(teamRubricOutOf(g.rubric, null)).toBe(225);
	});

	it('the authoring check asks role blocks of equal points, and the manifest total counts one', () => {
		const m = manifest(true);
		expect(manifestRubricTotal(m)).toBe(150);
		expect(manifestRubricIssues(m).filter((i) => i.includes('role blocks'))).toEqual([]);
		const drive = m.modules.find((x) => x.id === 'drive-plan')!;
		drive.points = 30;
		drive.criteria[0].points = 30;
		drive.criteria[0].levels = [
			{ points: 30, label: 'Complete', short: 'All', descriptor: 'All of it.' },
			{ points: 15, label: 'Developing', short: 'Half', descriptor: 'Half of it.' },
			{ points: 0, label: 'Absent', short: 'None', descriptor: 'None of it.' }
		];
		expect(manifestRubricIssues(m).filter((i) => i.includes('role blocks'))).toHaveLength(1);
		expect(manifestRubricIssues(manifest(false)).filter((i) => i.includes('role blocks'))).toEqual([]);
	});

	it('names a partial save in the grader’s words', () => {
		expect(teamGradeWords({ ok: true, succeeded: 3, refused: 0 }, true).text).toBe('Returned to all 3.');
		const part = teamGradeWords({ ok: true, succeeded: 2, refused: 1, results: [{ ok: false, reason: 'incomplete_scores' }] }, true);
		expect(part).toEqual({ ok: false, text: 'Saved for 2; 1 not saved because something they need is unscored.' });
		expect(teamGradeWords({ ok: false, reason: 'role_unowned' }, false).ok).toBe(false);
	});
});
