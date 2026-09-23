/**
 * A CLASS'S GLYPH IN THE MASTHEAD (ledger 0297, report 26: "my classes should
 * just be listed on the top page banner itself in the form of icons").
 *
 * THERE IS NO PER-SECTION GLYPH IN THE DATA, so it is DERIVED, and derived
 * from the two things a student already reads a class by: the course code and
 * which section of it they are in. Nothing is stored and nothing new is asked
 * of a teacher, so every class that exists today has its icon.
 *
 * Pure and client-safe: ClassroomShell renders it and tests/classroom-class-glyph.test.ts
 * pins it. Two lines, each short enough to sit in a 44px square in the mono
 * face (five characters at most):
 *
 *   code  the course code, uppercased with its spaces removed; a code longer
 *         than five characters that starts with letters before its number
 *         drops the letters (IDEA209H reads 209H: every IDEA course starts
 *         with them, so they distinguish nothing in an IDEA student's row).
 *   sub   the section, then the block, each compacted: a bare value stays as
 *         typed ("1", "B"), "Period 2" becomes "P2", and a value whose first
 *         word only names the kind of thing ("Block A", "Section 3") keeps the
 *         identifier alone.
 *
 * The icon is never the only way the class is named: the link carries the full
 * code and section label as its accessible name and its tooltip, and the class
 * menu beside the row lists every class in words.
 */
import type { ClassroomSection } from '$lib/classroom/classroom';

export const CLASS_GLYPH_MAX = 5;

const KIND_WORDS = /^(block|blk|section|sec)$/i;

/** The course code as the icon's first line. */
export function classGlyphCode(code: string | null | undefined): string {
	const c = (code ?? '').toUpperCase().replace(/\s+/g, '');
	if (!c) return 'CLASS';
	if (c.length <= CLASS_GLYPH_MAX) return c;
	const tail = c.replace(/^[A-Z]+(?=\d)/, '');
	return (tail || c).slice(0, CLASS_GLYPH_MAX);
}

/** One section field (label or block) in two or three characters. */
export function compactSectionField(value: string | null | undefined): string {
	const v = (value ?? '').trim();
	if (!v) return '';
	const words = v.split(/\s+/);
	if (words.length === 1) return v.slice(0, 3).toUpperCase();
	const last = words[words.length - 1];
	if (KIND_WORDS.test(words[0])) return last.slice(0, 3).toUpperCase();
	return (words[0][0] + last).slice(0, 3).toUpperCase();
}

export interface ClassGlyph {
	code: string;
	sub: string;
}

export function classGlyph(section: Pick<ClassroomSection, 'label' | 'block' | 'course'>): ClassGlyph {
	const parts = [compactSectionField(section.label), compactSectionField(section.block)].filter(Boolean);
	return {
		code: classGlyphCode(section.course?.code),
		sub: parts.join('·').slice(0, CLASS_GLYPH_MAX)
	};
}
