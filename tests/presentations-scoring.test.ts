// tests/presentations-scoring.test.ts
//
// A LIVE SCORE FROM THE PHONE KEEPS WHAT IS STORED (ledger 0438 item 5). Both
// grade writes replace a student's whole grade (every rubric score, the
// comment, the per-row comments), and the phone names only the rows tapped, so
// the client reads what is stored and sends it back under the tapped rows.
// Judged by the arguments the grade write receives.

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPresentationScoring, teamScorePlan } from '../src/lib/classroom/presentations';

function fakeClient(stored: Record<string, unknown> | null, team: unknown = null) {
	const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
	const query = {
		select: () => query,
		eq: () => query,
		maybeSingle: async () => ({ data: stored, error: null })
	};
	const client = {
		from: () => query,
		rpc: async (fn: string, args: Record<string, unknown>) => {
			calls.push({ fn, args });
			if (fn === 'classroom_team_grading') return { data: team, error: null };
			return { data: { ok: true }, error: null };
		}
	};
	return { client: client as unknown as SupabaseClient, calls };
}

describe('one student', () => {
	it('sends the stored rows, comment and row comments with the tapped row over them', async () => {
		const { client, calls } = fakeClient({
			rubric_scores: { design: 8, build: 6 },
			criterion_comments: { build: 'Loose fasteners.' },
			teacher_comment: 'Good start.'
		});
		const r = await createPresentationScoring(client).score('item-1', { email: 'a@boscotech.net' }, { talk: 9, build: 7 });
		expect(r.ok).toBe(true);
		const g = calls.find((c) => c.fn === 'classroom_grade_submission')!;
		expect(g.args.p_scores).toEqual({ design: 8, build: 7, talk: 9 });
		expect(g.args.p_comment).toBe('Good start.');
		expect(g.args.p_criterion_comments).toEqual({ build: 'Loose fasteners.' });
		expect(g.args.p_return).toBe(false);
	});

	it('with nothing stored, sends only the tapped rows and no comment', async () => {
		const { client, calls } = fakeClient(null);
		await createPresentationScoring(client).score('item-1', { email: 'a@boscotech.net' }, { talk: 9 });
		const g = calls.find((c) => c.fn === 'classroom_grade_submission')!;
		expect(g.args.p_scores).toEqual({ talk: 9 });
		expect(g.args.p_comment).toBeNull();
		expect(g.args.p_criterion_comments).toBeNull();
	});
});

describe('a team', () => {
	const team = (members: unknown[]) => ({ ok: true, team_criteria: ['talk', 'demo'], role_of: { cad: 'designer' }, members });

	it('keeps team and role rows already scored, each member\'s own rows, and the shared comment', () => {
		const plan = teamScorePlan(
			team([
				{ email: 'a@x', scores: { demo: 5, cad: 4, notebook: 7 }, comment: 'Clear.', criterion_comments: {} },
				{ email: 'b@x', scores: { demo: 5, notebook: 9 }, comment: 'Clear.', criterion_comments: {} }
			]),
			{ talk: 8 }
		);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(plan.scores).toEqual({ demo: 5, cad: 4, talk: 8 });
		expect(plan.memberScores).toEqual({ 'a@x': { notebook: 7 }, 'b@x': { notebook: 9 } });
		expect(plan.comment).toBe('Clear.');
		expect(plan.criterionComments).toBeNull();
	});

	it('refuses when members carry different comments, rather than overwrite one', () => {
		const plan = teamScorePlan(
			team([
				{ email: 'a@x', scores: {}, comment: 'One.', criterion_comments: {} },
				{ email: 'b@x', scores: {}, comment: 'Two.', criterion_comments: {} }
			]),
			{ talk: 8 }
		);
		expect(plan.ok).toBe(false);
	});

	it('the refusal writes nothing', async () => {
		const { client, calls } = fakeClient(
			null,
			team([
				{ email: 'a@x', scores: {}, comment: 'One.' },
				{ email: 'b@x', scores: {}, comment: null }
			])
		);
		const r = await createPresentationScoring(client).score('item-1', { teamId: 't1' }, { talk: 8 });
		expect(r.ok).toBe(false);
		expect(calls.map((c) => c.fn)).toEqual(['classroom_team_grading']);
	});

	it('a team with matching comments is graded once with the merged plan', async () => {
		const { client, calls } = fakeClient(null, team([{ email: 'a@x', scores: { demo: 3, notebook: 2 }, comment: null, criterion_comments: {} }]));
		await createPresentationScoring(client).score('item-1', { teamId: 't1' }, { talk: 8 });
		const g = calls.find((c) => c.fn === 'classroom_grade_team')!;
		expect(g.args.p_scores).toEqual({ demo: 3, talk: 8 });
		expect(g.args.p_member_scores).toEqual({ 'a@x': { notebook: 2 } });
		expect(g.args.p_return).toBe(false);
	});
});
