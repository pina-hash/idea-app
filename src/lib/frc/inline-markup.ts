/**
 * Minimal inline-markdown renderer for FRC unit content (Brief paragraphs from
 * mdm-content.ts). Supports exactly two things, both produced by the parser:
 *   - `**bold**` -> `<strong>`, for a paragraph's short lead phrase.
 *   - A leading `> ` marker -> render the paragraph as a blockquote callout
 *     (the "Worked example" paragraph in each unit).
 * The source is fully author-controlled seed content (mdm-content-seed.md),
 * never user input, so the escaped-then-tagged HTML below is safe to render
 * via `{@html}` (the same trust level already used for icon markup elsewhere,
 * e.g. PathwayChip.svelte).
 */

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** True when a Brief paragraph carries the parser's blockquote marker. */
export function isBlockquote(paragraph: string): boolean {
	return paragraph.startsWith('> ');
}

/** Strip the leading blockquote marker before rendering. */
export function stripBlockquote(paragraph: string): string {
	return paragraph.startsWith('> ') ? paragraph.slice(2) : paragraph;
}

/** Escape the text, then turn `**bold**` spans into `<strong>` tags. */
export function renderInline(text: string): string {
	return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
