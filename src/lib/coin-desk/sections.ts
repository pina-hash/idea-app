/**
 * Coin sections: plain types + pure helpers (client-safe, the coin-desk.ts
 * convention). Sections reuse src/lib/curriculum.ts's Section ids as the
 * canonical class list rather than duplicating it -- see 0073_coin_sections.sql
 * for the full design rationale. This module never talks to Supabase; every
 * write here is a call to a migration 0073 RPC made from CoinDeskTool.svelte
 * / SectionManager.svelte directly.
 */

import { SECTIONS, sectionById, type Section } from '$lib/curriculum';
import { FSP_CONCLUDED } from '$lib/fsp/archive';
import type { CoinCategory, CoinPricingModel } from '$lib/coin-desk';

export interface CoinSectionRow {
	id: string;
	label: string | null;
	color: string | null;
	active: boolean;
	note: string | null;
	created_by: string;
	created_at: string;
	updated_at: string;
	student_count: number;
}

export interface CoinSectionStudentRow {
	student_email: string;
	assigned_at: string;
	display_name: string | null;
	full_name: string | null;
}

export interface AssignResult {
	email: string;
	ok: boolean;
	reason?: string;
}

export interface BulkLogResult {
	email: string;
	ok: boolean;
	reason?: string;
	balance?: number;
	physical_balance?: number;
	digital_balance?: number;
	/** Which balance this student's row moved -- the run medium, or their override. */
	medium?: 'physical' | 'digital';
	amount?: number;
	message?: string;
	strike?: boolean;
	[key: string]: unknown;
}

export interface BulkLogResponse {
	ok: boolean;
	/**
	 * Only a SECTION run has one. Since 0115 coin_bulk_log_section is a thin
	 * wrapper that adds this key back around what coin_bulk_log_students
	 * returns, and a picked-students run has no section to name.
	 */
	section_id?: string;
	category_id: string;
	/** The RUN-level medium every student got unless overridden (0096). */
	medium?: 'physical' | 'digital';
	/**
	 * Override emails that matched nobody on the roster. Reported rather than
	 * silently ignored: a typo there would otherwise pay the right student the
	 * wrong way with nothing to notice.
	 */
	unmatched_overrides?: string[];
	total: number;
	succeeded: number;
	refused: number;
	results: BulkLogResult[];
}

/**
 * Bulk logging's scope, matching 0073's coin_bulk_log_section exactly: only
 * pricing models where ONE amount, entered once, applies uniformly to every
 * student. 'per_unit' (a rate x quantity) and 'formula' (grams/hours/points)
 * both need real per-student input, which is a later pass (a per-student
 * input grid), not this one.
 */
export const BULK_ELIGIBLE_PRICING_MODELS: CoinPricingModel[] = ['flat', 'range', 'variable'];

/**
 * Extra Credit is 'per_unit' already, but it's worth naming explicitly since
 * it's the category the convenience gap is most often confused with.
 *
 * Weekly Role Stipend is excluded for a different reason (it IS 'flat', the
 * bulk-eligible shape): bulk-logging it against a whole SECTION would pay
 * every student in the class, role or no role, which is wrong -- it is
 * "every current role holder" money, not "every student in a section"
 * money. It gets its own coin_bulk_log_role_stipend RPC instead, driven from
 * RolesManager.svelte against coin_role_holders, not this section-wide
 * bulk logger. See supabase/migrations/0074_coin_roles.sql's header for the
 * full rationale.
 */
export function isBulkEligible(cat: CoinCategory): boolean {
	return (
		BULK_ELIGIBLE_PRICING_MODELS.includes(cat.pricing_model) &&
		cat.id !== 'extra_credit' &&
		cat.id !== 'weekly_role_stipend'
	);
}

/**
 * A coin section's display name resolves from curriculum.ts when the id
 * matches a real Section.id (the common case -- the DB stores no title/course
 * of its own, see 0073's header). Falls back to the stored label override,
 * then the bare id, for a section curriculum.ts has no entry for.
 */
export function sectionDisplayName(section: { id: string; label: string | null }): string {
	const curriculum = sectionById(section.id);
	if (curriculum) return `${curriculum.course} — ${curriculum.title} (${curriculum.yearLabel})`;
	return section.label || section.id;
}

/**
 * Curriculum sections offerable in the "add from curriculum" picker.
 *
 * THREE RULES, and the second and third are what this used to be missing --
 * it filtered on "already has a coin section" alone, so the picker offered
 * every row in the catalog including ones that are not a class anybody can be
 * in yet, and one that has finished.
 *
 * 1. ALREADY HAS A COIN SECTION -> not offered. Unchanged.
 *
 * 2. `status: 'planned'` -> not offered. A planned section is a row in the
 *    planning sheet, not a class with students in it; making a coin section
 *    for one produces a roster nobody can be added to and a bulk-log target
 *    that pays nobody. 'live' and 'upcoming' are both offered, because an
 *    upcoming class is exactly the one an operator sets a roster up for
 *    BEFORE it starts -- excluding it would make the picker useless for its
 *    main job (every 2026-27 section is 'upcoming' today).
 *
 * 3. A CONCLUDED PROGRAMME -> not offered, keyed on the FSP_CONCLUDED flag
 *    and NOT on `term === 'Summer'`. That is the rule curriculum.ts's own
 *    activeCourseCount() already applies, with the reason written down
 *    there: a term label says WHEN a course runs, not whether it has
 *    finished, so gating on it would silently misreport the moment a summer
 *    programme runs live again. The term is surfaced in the picker's label
 *    instead (see termLabel below), where saying which term a class runs in
 *    is exactly what it is for.
 *
 * NOTHING HERE TOUCHES LIVE DATA. This is which rows a picker OFFERS;
 * archiving an existing coin section is an operator action against
 * coin_sections.active, which this function cannot and does not reach.
 */
export function curriculumSectionOptions(existingIds: Iterable<string>): Section[] {
	const used = new Set(existingIds);
	return SECTIONS.filter((s) => !used.has(s.id) && isOfferableSection(s));
}

/**
 * Rules 2 and 3 above, as a predicate over ONE section.
 *
 * Separate from the filter because the catalog holds no 'planned' section
 * today, so a test written only against SECTIONS could not tell the status
 * rule from its absence -- it would pass whether or not the rule was there.
 * Against a constructed section it is a real check.
 */
export function isOfferableSection(section: Section): boolean {
	if (section.status === 'planned') return false;
	if (section.id === 'summer-2026' && FSP_CONCLUDED) return false;
	return true;
}

/** The term a curriculum section runs in, for a picker row's own label. */
export function termLabel(section: Section): string {
	return section.term === 'Summer' ? 'Summer' : `Term ${section.term}`;
}

/**
 * Parses a pasted list of emails (newline, comma, semicolon, or whitespace
 * separated) into a deduped, lowercased, validated-shape array. Malformed
 * entries are simply dropped here -- the server-side RPC still validates and
 * reports per-entry, this is just what enables/disables the submit button.
 */
export function parseEmailList(raw: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const piece of raw.split(/[\s,;]+/)) {
		const email = piece.trim().toLowerCase();
		if (!email || !email.includes('@')) continue;
		if (seen.has(email)) continue;
		seen.add(email);
		out.push(email);
	}
	return out;
}
