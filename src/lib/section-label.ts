/**
 * Section label + block are two SEPARATE fields on a `classroom_sections` row
 * (0082): `label` is the section itself (e.g. "1", "Period 1") and `block` is
 * an optional block/period (e.g. "2", "Block A"). Rendered bare next to each
 * other -- "IDEA209H · 1 · 2" -- they read as two unlabeled numbers with no
 * way to tell which one is the section and which is the block. These three
 * helpers are the ONE place that disambiguates them; every surface that names
 * a section (classroom.ts's `sectionTitle`, notebook-review.ts's
 * `sectionName`, and every inline section display) goes through this file
 * rather than re-deciding the wording per call site.
 *
 * A value that already reads as a word (a teacher typed "Period 1" or
 * "Block A", per the manage console's own placeholders) is left as-is --
 * prepending "Section " to "Period 1" would read as "Section Period 1",
 * which is worse than the ambiguity it fixes. Only a BARE value -- one with
 * no internal whitespace, e.g. "1", "B", or "3B" -- gets the word prefix,
 * since a lone token with nothing else in it is exactly what reads as
 * unlabeled; anything containing a space already combines a word with an
 * identifier and needs no help.
 */

function isBare(value: string): boolean {
	return value.length > 0 && !/\s/.test(value);
}

/** "Section 1" for a bare label, or the label unchanged if it already reads as a word. */
export function sectionLabelText(label: string): string {
	const trimmed = label.trim();
	return isBare(trimmed) ? `Section ${trimmed}` : trimmed;
}

/**
 * "Block 2" for a bare block, or the block unchanged if it already reads as a
 * word ("Block A"). Null when the section has no block/period set.
 */
export function sectionBlockText(block: string | null | undefined): string | null {
	const trimmed = block?.trim();
	if (!trimmed) return null;
	return isBare(trimmed) ? `Block ${trimmed}` : trimmed;
}

/** "Section 1 · Block 2" (or "Period 1 · Block A", or just the label with no block set). */
export function formatSectionLabel(label: string, block: string | null | undefined): string {
	return [sectionLabelText(label), sectionBlockText(block)].filter(Boolean).join(' · ');
}
