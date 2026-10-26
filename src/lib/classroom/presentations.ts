/**
 * PRESENTATION CHECK-OFF FROM THE PHONE (ledger 0438, feedback 68d4780e): the
 * client half of 0310's presentation list. Plain data and one transport; the
 * page is `PresentationQueue.svelte`, the route `/classroom/<id>/present`.
 *
 * WHAT IS NOT HERE: the notes and the rubric scores. A note is an instructor
 * note on the student's work (`classroom_feedback_post`, progressive feedback,
 * so it shows when he grades) and a score is a grade through the grading
 * functions that already exist; the page takes both transports from where they
 * already live rather than a second write path for either.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RubricCriterion } from './assignment-spec';

export type PresentationStatus = 'waiting' | 'up' | 'presented' | 'absent' | 'redo';
export type PresentationOrder = 'roster' | 'random' | 'teams';

export interface PresentationMember {
	email: string;
	name: string;
}

export interface PresentationEntry {
	id: string;
	position: number;
	status: PresentationStatus;
	markedAt: string | null;
	kind: 'student' | 'team';
	teamId: string | null;
	name: string;
	members: PresentationMember[];
}

export interface PresentationQueueData {
	id: string;
	title: string;
	itemId: string | null;
	itemTitle: string | null;
	up: string | null;
	entries: PresentationEntry[];
}

export type PresentationResult<T> = { ok: true; data: T } | { ok: false; message: string; missing?: boolean };

/** The rubric a presenter is scored on: every criterion, or for a team only the team and role ones. */
export interface PresentationRubric {
	criteria: RubricCriterion[];
	/** For a team entry: the criteria scored once for the team (team and role criteria). */
	teamCriteria: string[] | null;
}

export interface PresentationScoring {
	rubric(itemId: string, teamId: string | null): Promise<PresentationResult<PresentationRubric | null>>;
	/** Held, never returned: he returns grades from the grading console when he is ready. */
	score(itemId: string, who: { email: string } | { teamId: string }, scores: Record<string, number>): Promise<PresentationResult<null>>;
}

export interface PresentationTransports {
	load(sectionId: string): Promise<PresentationResult<PresentationQueueData | null>>;
	start(sectionId: string, input: { itemId: string | null; title: string | null; order: PresentationOrder }): Promise<PresentationResult<null>>;
	mark(entryId: string, status: PresentationStatus): Promise<PresentationResult<null>>;
	move(entryId: string, position: number): Promise<PresentationResult<null>>;
	close(queueId: string): Promise<PresentationResult<null>>;
}

const STATUSES: PresentationStatus[] = ['waiting', 'up', 'presented', 'absent', 'redo'];

/** The status words, never colour alone. */
export const STATUS_WORDS: Record<PresentationStatus, string> = {
	waiting: 'Waiting',
	up: 'Up now',
	presented: 'Presented',
	absent: 'Absent',
	redo: 'Redo'
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** One list from the function's JSON, or null for none (or anything that is not one). */
export function parsePresentationQueue(raw: unknown): PresentationQueueData | null {
	const q = isObj(raw) && isObj(raw.queue) ? raw.queue : null;
	if (!q || !s(q.id)) return null;
	const entries: PresentationEntry[] = (Array.isArray(q.entries) ? q.entries : []).filter(isObj).map((e) => ({
		id: String(e.id),
		position: Number(e.position) || 0,
		status: STATUSES.includes(e.status as PresentationStatus) ? (e.status as PresentationStatus) : 'waiting',
		markedAt: s(e.marked_at),
		kind: e.kind === 'team' ? 'team' : 'student',
		teamId: s(e.team_id),
		name: s(e.name) ?? 'Unnamed',
		members: (Array.isArray(e.members) ? e.members : []).filter(isObj).map((m) => ({ email: String(m.email), name: s(m.name) ?? String(m.email) }))
	}));
	return {
		id: String(q.id),
		title: s(q.title) ?? 'Presentations',
		itemId: s(q.item_id),
		itemTitle: s(q.item_title),
		up: s(q.up),
		entries
	};
}

/** Who is up, who is next, and who is done, from the list's own order. */
export function presentationLanes(q: PresentationQueueData | null): {
	up: PresentationEntry | null;
	next: PresentationEntry[];
	done: PresentationEntry[];
} {
	if (!q) return { up: null, next: [], done: [] };
	const up = q.entries.find((e) => e.id === q.up) ?? null;
	const next = q.entries.filter((e) => e.id !== q.up && (e.status === 'waiting' || e.status === 'redo' || e.status === 'up'));
	const done = q.entries.filter((e) => e.status === 'presented' || e.status === 'absent');
	return { up, next, done };
}

function fail(error: { code?: string; message?: string } | null): { ok: false; message: string; missing?: boolean } {
	const missing = error?.code === 'PGRST202' || error?.code === '42883';
	return {
		ok: false,
		missing,
		message: missing ? 'Presentation lists arrive with the next site update.' : (error?.message ?? 'That did not save. Try again.')
	};
}

export function createPresentationTransports(supabase: SupabaseClient): PresentationTransports {
	return {
		async load(sectionId) {
			const { data, error } = await supabase.rpc('classroom_presentation_queue', { p_section_id: sectionId });
			if (error) return fail(error);
			return { ok: true, data: parsePresentationQueue(data) };
		},
		async start(sectionId, input) {
			const { data, error } = await supabase.rpc('classroom_presentation_start', {
				p_section_id: sectionId,
				p_item_id: input.itemId,
				p_title: input.title,
				p_order: input.order,
				p_seed: null
			});
			if (error) return fail(error);
			if (isObj(data) && data.ok === false) {
				return { ok: false, message: data.reason === 'no_teams' ? 'This class has no posted teams yet. Post a team draw on People first.' : 'The list could not be made.' };
			}
			return { ok: true, data: null };
		},
		async mark(entryId, status) {
			const { error } = await supabase.rpc('classroom_presentation_mark', { p_entry_id: entryId, p_status: status });
			return error ? fail(error) : { ok: true, data: null };
		},
		async move(entryId, position) {
			const { error } = await supabase.rpc('classroom_presentation_move', { p_entry_id: entryId, p_position: position });
			return error ? fail(error) : { ok: true, data: null };
		},
		async close(queueId) {
			const { error } = await supabase.rpc('classroom_presentation_close', { p_queue_id: queueId });
			return error ? fail(error) : { ok: true, data: null };
		}
	};
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * A TEAM SCORE THAT KEEPS WHAT IS STORED. `classroom_grade_team` writes one
 * comment and one set of row comments to every member and replaces each
 * member's scores, so: the team and role rows already scored (on any member,
 * a role row only on its owner) carry over under the tapped ones, each
 * member's own rows go back as their member scores, and when the members'
 * comments differ the phone refuses rather than overwrite one with another.
 */
export function teamScorePlan(
	raw: unknown,
	tapped: Record<string, number>
):
	| { ok: true; scores: Record<string, unknown>; memberScores: Record<string, Record<string, unknown>>; comment: string | null; criterionComments: Record<string, unknown> | null }
	| { ok: false; message: string } {
	const d = isObj(raw) ? raw : {};
	const teamKeys = new Set<string>([
		...(Array.isArray(d.team_criteria) ? d.team_criteria.filter((k): k is string => typeof k === 'string') : []),
		...(isObj(d.role_of) ? Object.keys(d.role_of) : [])
	]);
	const members = (Array.isArray(d.members) ? d.members : []).filter(isObj);
	if (!members.length) return { ok: false, message: 'This team has nobody on it.' };
	const first = members[0];
	const differ = members.some((m) => !sameJson(m.comment, first.comment) || !sameJson(m.criterion_comments ?? {}, first.criterion_comments ?? {}));
	if (differ) return { ok: false, message: 'This team already has separate notes for each student. Score it on the Teams screen so none is lost.' };
	const scores: Record<string, unknown> = {};
	const memberScores: Record<string, Record<string, unknown>> = {};
	for (const m of members) {
		const own: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(isObj(m.scores) ? m.scores : {})) {
			if (teamKeys.has(k)) {
				if (v !== null && v !== undefined) scores[k] = v;
			} else own[k] = v;
		}
		if (Object.keys(own).length) memberScores[String(m.email)] = own;
	}
	Object.assign(scores, tapped);
	const cc = isObj(first.criterion_comments) && Object.keys(first.criterion_comments).length ? first.criterion_comments : null;
	return { ok: true, scores, memberScores, comment: s(first.comment), criterionComments: cc };
}

/**
 * LIVE RUBRIC SCORES, HELD (ledger 0438). One student through the one grading
 * rule (`classroom_grade_submission`), a team through the Teams screen's own
 * (`classroom_grade_team`), both with return false, so nothing reaches a
 * student until he returns it. Scores are tapped as rubric levels, so a
 * score never lands between two levels and never needs an override note.
 */
export function createPresentationScoring(supabase: SupabaseClient): PresentationScoring {
	return {
		async rubric(itemId, teamId) {
			const { data, error } = await supabase.from('classroom_rubrics').select('criteria').eq('item_id', itemId).maybeSingle();
			if (error) return fail(error);
			const criteria = ((data?.criteria ?? []) as RubricCriterion[]).filter((c) => c && typeof c.id === 'string');
			if (!criteria.length) return { ok: true, data: null };
			if (!teamId) return { ok: true, data: { criteria, teamCriteria: null } };
			const g = await supabase.rpc('classroom_team_grading', { p_item_id: itemId, p_team_id: teamId });
			if (g.error) return fail(g.error);
			const d = (g.data ?? {}) as { team_criteria?: string[]; role_of?: Record<string, string> };
			const once = [...(d.team_criteria ?? []), ...Object.keys(d.role_of ?? {})];
			return { ok: true, data: { criteria: criteria.filter((c) => once.includes(c.id)), teamCriteria: once } };
		},
		async score(itemId, who, scores) {
			// BOTH GRADE WRITES REPLACE A STUDENT'S WHOLE GRADE: every rubric
			// score, the comment and the per-row comments. A phone score names a
			// few rows, so what is stored is read first and sent back with the
			// tapped rows over it; nothing scored or written elsewhere is lost.
			let r;
			if ('teamId' in who) {
				const g = await supabase.rpc('classroom_team_grading', { p_item_id: itemId, p_team_id: who.teamId });
				if (g.error) return fail(g.error);
				const plan = teamScorePlan(g.data, scores);
				if (!plan.ok) return plan;
				r = await supabase.rpc('classroom_grade_team', {
					p_item_id: itemId,
					p_team_id: who.teamId,
					p_scores: plan.scores,
					p_member_scores: plan.memberScores,
					p_comment: plan.comment,
					p_criterion_comments: plan.criterionComments,
					p_return: false
				});
			} else {
				const s = await supabase
					.from('classroom_submissions')
					.select('rubric_scores, criterion_comments, teacher_comment')
					.eq('item_id', itemId)
					.eq('student_email', who.email)
					.maybeSingle();
				if (s.error) return fail(s.error);
				const stored = (s.data ?? {}) as { rubric_scores?: unknown; criterion_comments?: unknown; teacher_comment?: string | null };
				r = await supabase.rpc('classroom_grade_submission', {
					p_item_id: itemId,
					p_student_email: who.email,
					p_scores: { ...(isObj(stored.rubric_scores) ? stored.rubric_scores : {}), ...scores },
					p_comment: stored.teacher_comment ?? null,
					p_return: false,
					p_criterion_comments: isObj(stored.criterion_comments) ? stored.criterion_comments : null,
					p_extra_credit: null
				});
			}
			if (r.error) return fail(r.error);
			const d = r.data as { ok?: boolean; reason?: string } | null;
			if (d && d.ok === false) {
				return { ok: false, message: d.reason === 'role_unowned' ? 'A role on this team has no owner yet. Score the team on the Teams screen.' : 'The score was not saved.' };
			}
			return { ok: true, data: null };
		}
	};
}

