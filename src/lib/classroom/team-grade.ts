/**
 * GRADING BY TEAM, AS DATA (ledger 0436, 0305; decision 71; rubric standard 1.4).
 *
 * `classroom_team_grading` answers one team's screen: the stored rubric, which
 * criteria are the team's (`team_criteria`) and which belong to a role
 * (`role_of`), the roles with their owners, and every member's grade as it
 * stands. Everything else in the rubric is each student's own.
 *
 * The screen scores the team criteria ONCE, each role block once, and the
 * individual criteria per member; `classroom_grade_team` copies them through
 * the bulk path. A member's total here is a PREVIEW of the database's rule
 * (team + individual + the mean of the role blocks they own); the stored score
 * is the database's own.
 */

import type { RubricCriterion } from './assignment-spec';

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

export interface TeamGradingRole {
	id: string;
	title: string;
	owner: string | null;
	ownerName: string | null;
}

export interface TeamGradingMember {
	email: string;
	name: string;
	roles: string[];
	state: string | null;
	score: number | null;
	scores: Record<string, number>;
	comment: string | null;
	gradedAt: string | null;
}

export interface TeamGrading {
	team: { id: string; name: string; sectionId: string; sectionLabel: string };
	rubric: RubricCriterion[];
	roleOf: Record<string, string>;
	teamCriteria: string[];
	outOf: number;
	roles: TeamGradingRole[];
	members: TeamGradingMember[];
}

export function parseTeamGrading(raw: unknown): { grading: TeamGrading | null; reason: string | null } {
	if (!isRecord(raw) || raw.ok !== true) return { grading: null, reason: 'unreadable' };
	if (!isRecord(raw.team)) return { grading: null, reason: typeof raw.reason === 'string' ? raw.reason : 'no_team' };
	const t = raw.team;
	const roleOf: Record<string, string> = {};
	if (isRecord(raw.role_of)) for (const [k, v] of Object.entries(raw.role_of)) if (typeof v === 'string') roleOf[k] = v;
	return {
		reason: null,
		grading: {
			team: {
				id: String(t.id),
				name: String(t.name ?? ''),
				sectionId: String(t.section_id ?? ''),
				sectionLabel: String(t.section_label ?? '')
			},
			rubric: Array.isArray(raw.rubric) ? (raw.rubric.filter(isRecord) as unknown as RubricCriterion[]) : [],
			roleOf,
			teamCriteria: Array.isArray(raw.team_criteria) ? raw.team_criteria.map(String) : [],
			outOf: num(raw.out_of) ?? 0,
			roles: (Array.isArray(raw.roles) ? raw.roles : []).filter(isRecord).map((r) => ({
				id: String(r.id),
				title: String(r.title ?? r.id),
				owner: typeof r.owner === 'string' ? r.owner : null,
				ownerName: typeof r.owner_name === 'string' ? r.owner_name : null
			})),
			members: (Array.isArray(raw.members) ? raw.members : []).filter(isRecord).map((m) => {
				const scores: Record<string, number> = {};
				if (isRecord(m.scores)) for (const [k, v] of Object.entries(m.scores)) {
					const n = num(v);
					if (n !== null) scores[k] = n;
				}
				return {
					email: String(m.email),
					name: String(m.name ?? ''),
					roles: Array.isArray(m.roles) ? m.roles.map(String) : [],
					state: typeof m.state === 'string' ? m.state : null,
					score: num(m.score),
					scores,
					comment: typeof m.comment === 'string' ? m.comment : null,
					gradedAt: typeof m.graded_at === 'string' ? m.graded_at : null
				};
			})
		}
	};
}

/** The rubric in the screen's three groups, in rubric order. */
export function teamCriterionGroups(g: TeamGrading): {
	team: RubricCriterion[];
	roles: { role: TeamGradingRole; criteria: RubricCriterion[] }[];
	individual: RubricCriterion[];
} {
	const team = g.rubric.filter((c) => g.teamCriteria.includes(c.id));
	const individual = g.rubric.filter((c) => !g.teamCriteria.includes(c.id) && !g.roleOf[c.id]);
	const roles = g.roles
		.map((role) => ({ role, criteria: g.rubric.filter((c) => g.roleOf[c.id] === role.id) }))
		.filter((r) => r.criteria.length > 0);
	return { team, roles, individual };
}

/** Scores in hand on the screen: shared (team and role criteria) and per member (individual). */
export interface TeamGradeDraft {
	shared: Record<string, number | null>;
	member: Record<string, Record<string, number | null>>;
	comment: string;
}

/**
 * Where the screen starts: a team criterion from the most recently graded
 * member, a role criterion from its owner's grade, an individual criterion
 * from the member's own, the comment from the most recent grade.
 */
export function teamGradeStart(g: TeamGrading): TeamGradeDraft {
	const latest = [...g.members].filter((m) => m.gradedAt).sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''));
	const shared: Record<string, number | null> = {};
	for (const c of g.rubric) {
		const role = g.roleOf[c.id];
		if (role) {
			const owner = g.roles.find((r) => r.id === role)?.owner;
			const m = latest.find((x) => x.email === owner) ?? null;
			shared[c.id] = m?.scores[c.id] ?? null;
		} else if (g.teamCriteria.includes(c.id)) {
			shared[c.id] = latest.find((m) => c.id in m.scores)?.scores[c.id] ?? null;
		}
	}
	const individual = g.rubric.filter((c) => !g.teamCriteria.includes(c.id) && !g.roleOf[c.id]);
	const member: Record<string, Record<string, number | null>> = {};
	for (const m of g.members) member[m.email] = Object.fromEntries(individual.map((c) => [c.id, m.scores[c.id] ?? null]));
	return { shared, member, comment: latest[0]?.comment ?? '' };
}

/** One member's total by the database's rule, or null while anything they need is unscored. */
export function teamMemberPreview(g: TeamGrading, draft: TeamGradeDraft, email: string): number | null {
	const m = g.members.find((x) => x.email === email);
	if (!m) return null;
	let total = 0;
	const roleSums = new Map<string, number>();
	for (const c of g.rubric) {
		const role = g.roleOf[c.id];
		if (role && !m.roles.includes(role)) continue;
		const v = role || g.teamCriteria.includes(c.id) ? draft.shared[c.id] : draft.member[email]?.[c.id];
		if (v === null || v === undefined) return null;
		if (role) roleSums.set(role, (roleSums.get(role) ?? 0) + v);
		else total += v;
	}
	if (Object.keys(g.roleOf).length && !m.roles.some((r) => roleSums.has(r))) return null;
	if (m.roles.length) {
		const owned = m.roles.filter((r) => roleSums.has(r));
		if (owned.length) total += owned.reduce((s, r) => s + (roleSums.get(r) ?? 0), 0) / owned.length;
	}
	return Math.round(total * 100) / 100;
}

/** Every member has every criterion they need: what Return asks. */
export function teamGradeComplete(g: TeamGrading, draft: TeamGradeDraft): boolean {
	return g.members.length > 0 && g.members.every((m) => teamMemberPreview(g, draft, m.email) !== null);
}

/** The role a scored criterion needs and nobody owns: Save refuses those first. */
export function teamUnownedRoles(g: TeamGrading, draft: TeamGradeDraft): TeamGradingRole[] {
	return g.roles.filter(
		(r) => !r.owner && g.rubric.some((c) => g.roleOf[c.id] === r.id && draft.shared[c.id] != null)
	);
}

/** The two score arguments of `classroom_grade_team`, unscored criteria left out. */
export function teamGradeArgs(draft: TeamGradeDraft): {
	p_scores: Record<string, number>;
	p_member_scores: Record<string, Record<string, number>>;
} {
	const keep = (o: Record<string, number | null>) =>
		Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number'));
	return {
		p_scores: keep(draft.shared),
		p_member_scores: Object.fromEntries(Object.entries(draft.member).map(([email, s]) => [email, keep(s)]))
	};
}

// The role arithmetic a surface holding the manifest needs lives beside the
// rubric derivation it reads (`html-assignment/rubric.ts`); re-exported here so
// the team screen has one import.
export { teamRoleCriteria, teamRubricOutOf } from './html-assignment/rubric';

/** A bulk result in the grader's words. */
export function teamGradeWords(out: unknown, returned: boolean): { ok: boolean; text: string } {
	if (!isRecord(out)) return { ok: false, text: 'That did not save. Try again.' };
	if (out.ok !== true) {
		if (out.reason === 'role_unowned') return { ok: false, text: 'A role you scored has no owner on this team. Set the roles on the team plan first.' };
		if (out.reason === 'no_members') return { ok: false, text: 'This team has nobody on it.' };
		return { ok: false, text: 'That did not save. Try again.' };
	}
	const refused = Number(out.refused) || 0;
	const succeeded = Number(out.succeeded) || 0;
	if (refused === 0) return { ok: true, text: returned ? `Returned to all ${succeeded}.` : `Saved for all ${succeeded}.` };
	const results = Array.isArray(out.results) ? out.results.filter(isRecord) : [];
	const first = results.find((r) => r.ok !== true);
	const why =
		first?.reason === 'incomplete_scores'
			? 'something they need is unscored'
			: typeof first?.message === 'string'
				? first.message
				: 'it was refused';
	return { ok: false, text: `Saved for ${succeeded}; ${refused} not saved because ${why}.` };
}
