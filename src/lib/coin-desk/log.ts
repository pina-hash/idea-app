/**
 * THE LOG AREA'S PURE LAYER: one class's roster, the bulk-log answer, and
 * which categories a bulk run may use. Plain types and pure helpers
 * (client-safe, the coin-desk.ts convention); this module never talks to
 * Supabase.
 *
 * IDEA COIN V2 SESSION TWO: A CLASS IS AN IDEA CLASSROOM SECTION. The pre-V2
 * coin sections (and their roster, their import and their own bulk logger)
 * are retired (0251). A class's roster is `coin_fine_roster(p_section_id)`,
 * the same read the fine screen uses, and a whole-class run is
 * `coin_bulk_log_students` over that roster's emails: one call, one
 * server-side transaction, per-student results.
 */

import type { CoinCategory, CoinPricingModel } from '$lib/coin-desk';

/** One class the caller may log against: `coinStaff.sections`'s shape. */
export interface CoinClass {
	id: string;
	label: string;
	/** Students on its coin roster, when the load knows (coin_fine_sections). */
	students?: number;
}

/**
 * The Log's class list. `coin_fine_sections()` (0244) answers the caller's
 * economy-on classes with a roster count; where it cannot be read the
 * layout's `coinStaff.sections` is the fallback, which names every class in
 * the caller's scope with no count.
 */
export function logClasses(
	fineSections: { id: string; label: string; students?: number | string | null }[] | null,
	fallback: CoinClass[]
): CoinClass[] {
	if (!fineSections) return fallback.map((c) => ({ id: c.id, label: c.label }));
	return fineSections.map((c) => ({
		id: String(c.id),
		label: String(c.label),
		...(c.students == null ? {} : { students: Number(c.students) })
	}));
}

/** One student of `coin_fine_roster(p_section_id).students` (0244). */
export interface ClassRosterStudent {
	email: string;
	display_name: string | null;
	balance?: number | string;
	out_on_pass?: boolean;
	no_shop?: boolean;
	eating_pass?: boolean;
}

/** `coin_fine_roster`'s answer. */
export interface ClassRoster {
	section_id: string;
	label: string;
	students: ClassRosterStudent[];
}

/** The name a roster row shows: the class roster's name, else the address. */
export function rosterStudentLabel(s: Pick<ClassRosterStudent, 'email' | 'display_name'>): string {
	return s.display_name?.trim() || s.email;
}

/** One row of `coin_bulk_log_students(...).results`. */
export interface BulkLogResult {
	email: string;
	ok: boolean;
	reason?: string;
	/** The one balance after this row (IDEA Coin V2). */
	balance?: number | string;
	amount?: number | string;
	message?: string;
	strike?: boolean;
	[key: string]: unknown;
}

/** `coin_bulk_log_students`'s answer (0251's shape). */
export interface BulkLogResponse {
	ok: boolean;
	category_id: string;
	total: number;
	succeeded: number;
	refused: number;
	results: BulkLogResult[];
}

/**
 * A bulk run is scoped to the pricing models where ONE amount, entered once,
 * applies to every student: exactly 0251's `coin_bulk_log_students` refusal
 * list ('per_unit' and 'formula' need per-student input).
 */
export const BULK_ELIGIBLE_PRICING_MODELS: CoinPricingModel[] = ['flat', 'range', 'variable'];

/**
 * Whether a category may be bulk-logged. Extra Credit is refused by name in
 * the database. The Weekly Role Stipend is left out here for a different
 * reason: it is "every role holder" money, never "every student in a class"
 * money, so it is paid by autopay (or by hand on the Roles area), never from
 * the Log's whole-class mode.
 */
export function isBulkEligible(cat: Pick<CoinCategory, 'id' | 'pricing_model'>): boolean {
	return (
		BULK_ELIGIBLE_PRICING_MODELS.includes(cat.pricing_model) &&
		cat.id !== 'extra_credit' &&
		cat.id !== 'weekly_role_stipend'
	);
}

/**
 * The emails a whole-class run sends: the roster's, lowercased, trimmed,
 * deduplicated and sorted (CLAUDE.md: normalize a list of identity keys
 * before acting on it). The server does the same; sending it already clean
 * means the count on the button is the count the server will log.
 */
export function rosterEmails(students: Pick<ClassRosterStudent, 'email'>[]): string[] {
	return [
		...new Set(
			students.map((s) => s.email.trim().toLowerCase()).filter((e) => e !== '' && e.includes('@'))
		)
	].sort();
}
