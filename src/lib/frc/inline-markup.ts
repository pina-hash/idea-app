/**
 * Minimal inline-markdown renderer for FRC unit content (Brief paragraphs from
 * mdm-content.ts). Supports exactly four things, all produced by the parser:
 *   - `**bold**` -> `<strong>`, for a paragraph's short lead phrase.
 *   - `[label](url)` -> an external link, styled and handled the same way as
 *     the reference shelf's external links (opens in a new tab, `rel=
 *     "noopener noreferrer"`; see `ReferenceShelf.svelte`).
 *   - A leading `> ` marker -> render the paragraph as a blockquote callout
 *     (the "Worked example" paragraph in each unit).
 *   - A `[[diagram:KEY|caption]]` token on its own paragraph -> a concept
 *     diagram figure (see `parseDiagram`, rendered by UnitPage.svelte against
 *     the `DIAGRAMS` map in diagrams.ts).
 * The source is fully author-controlled seed content (mdm-content-seed.md),
 * never user input, so the escaped-then-tagged HTML below is safe to render
 * via `{@html}` (the same trust level already used for icon markup elsewhere,
 * e.g. PathwayChip.svelte).
 */

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Matches `[label](https://...)` after escaping; http(s) only, on purpose. */
const LINK_RE = /\[([^[\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/** True when a Brief paragraph carries the parser's blockquote marker. */
export function isBlockquote(paragraph: string): boolean {
	return paragraph.startsWith('> ');
}

/** Strip the leading blockquote marker before rendering. */
export function stripBlockquote(paragraph: string): string {
	return paragraph.startsWith('> ') ? paragraph.slice(2) : paragraph;
}

/**
 * Escape the text, then turn `**bold**` spans into `<strong>` tags and
 * `[label](url)` spans into external links (new tab, `rel="noopener
 * noreferrer"`, matching the reference shelf).
 */
export function renderInline(text: string): string {
	const bolded = escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
	return bolded.replace(LINK_RE, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export interface DiagramToken {
	key: string;
	caption: string;
}

const DIAGRAM_TOKEN_RE = /^\[\[diagram:([a-z0-9-]+)\|(.+)\]\]$/i;

/**
 * Parse a `[[diagram:KEY|caption text]]` paragraph into its key and caption,
 * or `null` if the paragraph isn't a diagram token. The token must be the
 * paragraph's entire (trimmed) text, one per Brief paragraph, matching how
 * the blockquote marker owns its whole paragraph.
 */
export function parseDiagram(paragraph: string): DiagramToken | null {
	const m = paragraph.trim().match(DIAGRAM_TOKEN_RE);
	if (!m) return null;
	return { key: m[1], caption: m[2].trim() };
}
