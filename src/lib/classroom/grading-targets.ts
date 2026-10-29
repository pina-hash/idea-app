/**
 * SYLLABUS POINT TARGETS, POSTED VS TARGET PER CATEGORY (ledger 0457, report
 * c622b97a). IDEA100 Rotation 2's posts totaled 295 points against the
 * syllabus's 500 and IDEA209H Unit 3 was 25 Unit Assignment points short, and
 * nothing on the site said so. A course's categories and targets are stored
 * (0321, seeded from the syllabi committed in the repo); this is the one
 * tally of a class's posted points against them.
 *
 * A POST COUNTS IN A CATEGORY BY ITS OWN GRADING CATEGORY, matched without
 * case or spacing, or by a category name that starts the post's ("Unit
 * Assignments" holds a post filed "Unit Assignment"). A post in no category,
 * or one the syllabus does not list, is counted as unfiled so the gap is
 * visible rather than silently left out. Drafts and scheduled posts count:
 * the question is what the class will be graded on, and he plans ahead.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassroomItem } from './classroom';

export interface GradeTarget {
	category: string;
	target: number | null;
	source: string | null;
}

export interface TargetRow {
	category: string;
	target: number | null;
	posted: number;
	posts: number;
	/** posted - target, or null with no target. Negative is short. */
	gap: number | null;
}

function key(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Which listed category a post's own category means, or null. */
export function categoryFor(postCategory: string | null | undefined, targets: readonly GradeTarget[]): string | null {
	const k = key(postCategory ?? '');
	if (!k) return null;
	for (const t of targets) if (key(t.category) === k) return t.category;
	for (const t of targets) {
		const tk = key(t.category);
		if (tk.startsWith(k) || k.startsWith(tk)) return t.category;
	}
	return null;
}

export function postedVsTarget(
	items: ReadonlyArray<Pick<ClassroomItem, 'kind' | 'points' | 'category'>>,
	targets: readonly GradeTarget[]
): { rows: TargetRow[]; unfiled: { posted: number; posts: number }; total: { posted: number; target: number | null } } {
	const rows: TargetRow[] = targets.map((t) => ({ category: t.category, target: t.target, posted: 0, posts: 0, gap: null }));
	const byName = new Map(rows.map((r) => [r.category, r] as const));
	const unfiled = { posted: 0, posts: 0 };
	for (const it of items) {
		if (it.kind !== 'assignment' || it.points == null) continue;
		const cat = categoryFor(it.category, targets);
		const row = cat ? byName.get(cat) : null;
		if (row) {
			row.posted += it.points;
			row.posts += 1;
		} else {
			unfiled.posted += it.points;
			unfiled.posts += 1;
		}
	}
	for (const r of rows) r.gap = r.target == null ? null : r.posted - r.target;
	const withTargets = rows.filter((r) => r.target != null);
	return {
		rows,
		unfiled,
		total: {
			posted: rows.reduce((n, r) => n + r.posted, 0) + unfiled.posted,
			target: withTargets.length ? withTargets.reduce((n, r) => n + (r.target ?? 0), 0) : null
		}
	};
}

/** The course's categories, or null where 0321 is not applied. */
export async function readGradeTargets(supabase: SupabaseClient, courseId: string): Promise<GradeTarget[] | null> {
	const { data, error } = await supabase
		.from('classroom_course_grade_targets')
		.select('category, target_points, source, sort')
		.eq('course_id', courseId)
		.order('sort');
	if (error) return null;
	return ((data ?? []) as Array<{ category: string; target_points: number | null; source: string | null }>).map((r) => ({
		category: r.category,
		target: r.target_points == null ? null : Number(r.target_points),
		source: r.source
	}));
}

/** One line of the editor, parsed: "Unit Labs 200", "Final Exam", "Hook Competition: 130". */
export function parseTargetLines(text: string): Array<{ category: string; target_points: number | null }> {
	return text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean)
		.map((l) => {
			const m = /^(.*?)[\s:,-]+(\d+(?:\.\d+)?)\s*(?:pts?|points)?$/i.exec(l);
			return m ? { category: m[1].trim(), target_points: Number(m[2]) } : { category: l, target_points: null };
		});
}

export function targetLines(targets: readonly GradeTarget[]): string {
	return targets.map((t) => (t.target == null ? t.category : `${t.category} ${t.target}`)).join('\n');
}
