/**
 * Coin sections: plain types + pure helpers (client-safe, the coin-desk.ts
 * convention). Sections reuse src/lib/curriculum.ts's Section ids as the
 * canonical class list rather than duplicating it -- see 0073_coin_sections.sql
 * for the full design rationale. This module never talks to Supabase; every
 * write here is a call to a migration 0073 RPC made from CoinDeskTool.svelte
 * / SectionManager.svelte directly.
 */

import { SECTIONS, sectionById, type Section } from '$lib/curriculum';
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
	amount?: number;
	message?: string;
	strike?: boolean;
	[key: string]: unknown;
}

export interface BulkLogResponse {
	ok: boolean;
	section_id: string;
	category_id: string;
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

/** Extra Credit is 'per_unit' already, but it's worth naming explicitly since it's the category the convenience gap is most often confused with. */
export function isBulkEligible(cat: CoinCategory): boolean {
	return BULK_ELIGIBLE_PRICING_MODELS.includes(cat.pricing_model) && cat.id !== 'extra_credit';
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

/** Curriculum sections that don't already have a coin section, for the "add from curriculum" picker. */
export function curriculumSectionOptions(existingIds: Iterable<string>): Section[] {
	const used = new Set(existingIds);
	return SECTIONS.filter((s) => !used.has(s.id));
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
