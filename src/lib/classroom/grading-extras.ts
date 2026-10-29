/**
 * WHAT THE GRADING CONSOLE READS BEYOND THE WORK ITSELF (ledger 0457).
 *
 * One optional transport, handed in by the two grading routes, so the console
 * stays the same component with no new required prop: a harness that hands in
 * nothing gets the console it had. Each read degrades on its own (a database
 * before the migration that adds it answers nothing, never a broken page),
 * and every write is a definer function that re-checks the caller.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Which of this post's classes only fill empty grades (0315). */
export interface ProtectedClass {
	sectionId: string;
	on: boolean;
}

/** One student's own due date and absent mark on a post (0321). */
export interface StudentDue {
	email: string;
	dueAt: string | null;
	daysOut: number | null;
	absent: boolean;
	note: string | null;
}

/** A post's grading settings (0321). */
export interface ItemGrading {
	lateRate: number;
	gradeAsTeams: boolean;
	scaleToPoints: boolean;
	rubricTotal: number | null;
	points: number | null;
}

/** The last version of an answer saved on or before the student's due date (0321). */
export interface OnTimeVersion {
	email: string;
	blockId: string;
	value: unknown;
	savedAt: string;
	dueAt: string;
}

/** A class's posted team draw for a post (0321). */
export interface TeamDrawSection {
	sectionId: string;
	label: string;
	teams: Array<{ id: string; number: number; name: string; members: string[] }>;
}

export interface LateCreditResult {
	ok: boolean;
	reason?: string;
	message?: string;
	credited?: Record<string, number>;
	score?: number;
	missing?: string[];
}

export interface GradingExtras {
	/** Which of the post's classes the caller manages only fill empty grades. Empty before 0315. */
	protection(itemId: string): Promise<ProtectedClass[]>;
	/** Every student's own due date and absent mark. Empty before 0321. */
	dueDates?(itemId: string): Promise<StudentDue[]>;
	setDue?(itemId: string, entries: Array<Record<string, unknown>>): Promise<{ ok: boolean; message?: string; refused?: number }>;
	/** The post's late rate, Grade as teams, rubric scaling. Null before 0321 or for a non-manager. */
	settings?(itemId: string): Promise<ItemGrading | null>;
	setSettings?(itemId: string, change: { lateRate?: number; gradeAsTeams?: boolean; scaleToPoints?: boolean }): Promise<{ ok: boolean; message?: string }>;
	/** On-time versions of answers edited after the student's due date. Empty before 0321. */
	onTime?(itemId: string): Promise<OnTimeVersion[]>;
	lateCredit?(
		itemId: string,
		email: string,
		onTime: Record<string, number>,
		final: Record<string, number>,
		comment: string | null,
		release: boolean
	): Promise<LateCreditResult>;
	teamDraw?(itemId: string): Promise<TeamDrawSection[]>;
	/** The worksheet's own HTML, to find a rubric line whose requirement the page hides. */
	documentHtml?(itemId: string): Promise<string | null>;
}

/** PostgREST's "no such function" or "no such table": a deployment before the migration. */
function missing(error: { code?: string } | null): boolean {
	return !!error && (error.code === 'PGRST202' || error.code === '42P01' || error.code === 'PGRST205');
}
const ARRIVING = 'This is still arriving on the site; try again in a few minutes.';

export function createGradingExtras(supabase: SupabaseClient): GradingExtras {
	return {
		async protection(itemId) {
			const { data, error } = await supabase.rpc('classroom_item_grade_protection', { p_item_id: itemId });
			if (error || !Array.isArray(data)) return [];
			return (data as Array<{ section_id: string; on: boolean }>).map((r) => ({ sectionId: r.section_id, on: r.on === true }));
		},
		async dueDates(itemId) {
			const { data, error } = await supabase.rpc('classroom_student_due_dates', { p_item_id: itemId });
			if (error || !Array.isArray(data)) return [];
			return (data as Array<Record<string, unknown>>).map((r) => ({
				email: String(r.email).toLowerCase(),
				dueAt: typeof r.due_at === 'string' ? r.due_at : null,
				daysOut: typeof r.days_out === 'number' ? r.days_out : null,
				absent: r.absent === true,
				note: typeof r.note === 'string' ? r.note : null
			}));
		},
		async setDue(itemId, entries) {
			const { data, error } = await supabase.rpc('classroom_set_student_due', { p_item_id: itemId, p_entries: entries });
			if (error) return { ok: false, message: missing(error) ? ARRIVING : error.message };
			const r = (data ?? {}) as { refused?: number; results?: Array<{ ok: boolean; message?: string }> };
			const first = r.results?.find((x) => !x.ok);
			return { ok: !r.refused, refused: r.refused ?? 0, message: first?.message };
		},
		async settings(itemId) {
			const { data, error } = await supabase.rpc('classroom_item_grading_settings', { p_item_id: itemId });
			if (error || !data || typeof data !== 'object') return null;
			const r = data as Record<string, unknown>;
			return {
				lateRate: Number(r.late_rate ?? 0.5),
				gradeAsTeams: r.grade_as_teams === true,
				scaleToPoints: r.scale_to_points === true,
				rubricTotal: r.rubric_total == null ? null : Number(r.rubric_total),
				points: r.points == null ? null : Number(r.points)
			};
		},
		async setSettings(itemId, change) {
			const { error } = await supabase.rpc('classroom_set_item_grading', {
				p_item_id: itemId,
				p_late_rate: change.lateRate ?? null,
				p_grade_as_teams: change.gradeAsTeams ?? null,
				p_scale_to_points: change.scaleToPoints ?? null
			});
			if (error) return { ok: false, message: missing(error) ? ARRIVING : error.message };
			return { ok: true };
		},
		async onTime(itemId) {
			const out: OnTimeVersion[] = [];
			for (let from = 0; ; from += 1000) {
				const { data, error } = await supabase
					.from('classroom_response_versions')
					.select('student_email, block_id, value, saved_at, due_at')
					.eq('item_id', itemId)
					.order('student_email')
					.order('block_id')
					.range(from, from + 999);
				if (error || !data) return out;
				for (const r of data as Array<Record<string, unknown>>) {
					out.push({
						email: String(r.student_email).toLowerCase(),
						blockId: String(r.block_id),
						value: r.value,
						savedAt: String(r.saved_at),
						dueAt: String(r.due_at)
					});
				}
				if (data.length < 1000) return out;
			}
		},
		async lateCredit(itemId, email, onTime, final, comment, release) {
			const { data, error } = await supabase.rpc('classroom_grade_late_credit', {
				p_item_id: itemId,
				p_student_email: email,
				p_on_time: onTime,
				p_final: final,
				p_rate: null,
				p_comment: comment,
				p_return: release
			});
			if (error) return { ok: false, message: missing(error) ? ARRIVING : error.message };
			return (data ?? { ok: false }) as LateCreditResult;
		},
		async documentHtml(itemId) {
			const { data, error } = await supabase.from('classroom_html_assignments').select('document').eq('item_id', itemId).maybeSingle();
			if (error || !data) return null;
			return typeof (data as { document?: unknown }).document === 'string' ? (data as { document: string }).document : null;
		},
		async teamDraw(itemId) {
			const { data, error } = await supabase.rpc('classroom_item_team_draw', { p_item_id: itemId });
			if (error || !data) return [];
			return ((data as { sections?: Array<Record<string, unknown>> }).sections ?? []).map((s) => ({
				sectionId: String(s.section_id),
				label: String(s.label ?? ''),
				teams: ((s.teams as Array<Record<string, unknown>>) ?? []).map((t) => ({
					id: String(t.id),
					number: Number(t.number),
					name: String(t.name),
					members: ((t.members as string[]) ?? []).map((m) => String(m).toLowerCase())
				}))
			}));
		}
	};
}

/** The refusal a protected class answers, in the grader's words. */
export const PROTECTED_REFUSAL =
	'This class only fills empty grades, and this student already has a grade someone else gave. It was kept and nothing changed.';

/** The late rate as he says it: 0.5 is "50%". */
export function ratePercent(rate: number): string {
	return `${Math.round(rate * 1000) / 10}%`;
}
