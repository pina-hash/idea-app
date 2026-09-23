/**
 * WHAT THE PROJECTOR PAGE'S LOAD MAY READ, written down once (ledger 0297).
 *
 * The class's own name, and nothing that names a person: no `teacher_email`
 * (which `SECTION_SELECT` carries for the composer and the switcher), no
 * roster, no item. The projector's load imports this select rather than the
 * shared one, and the privacy test asserts the load sends exactly it.
 */

import { formatSectionLabel } from '$lib/section-label';

export const PROJECTOR_SECTION_SELECT = 'id, label, block, classroom_courses(code, title)';

/** "IDEA209H · Section 2 · Block 3", from the projector's own narrow row. */
export function projectorClassLabel(row: Record<string, unknown>): string {
	const embed = row.classroom_courses as { code?: unknown } | { code?: unknown }[] | null | undefined;
	const course = Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null);
	const code = course && typeof course.code === 'string' ? course.code.trim() : '';
	const name = formatSectionLabel(String(row.label ?? ''), (row.block as string | null | undefined) ?? null);
	return [code, name].filter(Boolean).join(' · ') || 'Class';
}
