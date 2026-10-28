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

export interface GradingExtras {
	/** Which of the post's classes the caller manages only fill empty grades. Empty before 0315. */
	protection(itemId: string): Promise<ProtectedClass[]>;
}

export function createGradingExtras(supabase: SupabaseClient): GradingExtras {
	return {
		async protection(itemId) {
			const { data, error } = await supabase.rpc('classroom_item_grade_protection', { p_item_id: itemId });
			if (error || !Array.isArray(data)) return [];
			return (data as Array<{ section_id: string; on: boolean }>).map((r) => ({ sectionId: r.section_id, on: r.on === true }));
		}
	};
}

/** The refusal a protected class answers, in the grader's words. */
export const PROTECTED_REFUSAL =
	'This class only fills empty grades, and this student already has a grade someone else gave. It was kept and nothing changed.';
