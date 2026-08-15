/**
 * The primitives every rich-text feature in this app shares.
 *
 * Two things live here and nothing else: the shape of the editor's own output,
 * and the link-scheme check. Both are things that must have exactly ONE
 * implementation.
 *
 * WHY `safeHref` IS HERE RATHER THAN COPIED PER FEATURE. It is the single
 * security-relevant decision in the whole rich-text path -- a typed document
 * cannot express a script tag or an event handler, so an `href` is the only
 * place hostile input has anywhere to go. Two copies of that check is two
 * places to fix when one of them turns out to be wrong, and the one that does
 * not get fixed is the one nobody is looking at. The notebook's written notes
 * (0078) and the classroom's item bodies both import it from here.
 *
 * Everything ABOVE this file stays per-feature on purpose: the notebook's
 * NoteDoc and the classroom's ItemDoc are separate closed shapes with separate
 * normalizers, separate SQL gates and separate renderers, because they are
 * separate contracts -- widening one must never silently widen the other.
 */

/**
 * A ProseMirror-shaped node, loose enough for both directions: what an editor
 * emits (untrusted, arbitrary) and what we build to seed one (ours).
 */
export interface TiptapNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: { type: string; attrs?: Record<string, unknown> }[];
	content?: TiptapNode[];
}

/**
 * Link schemes any rich-text surface may carry. Checked at normalization AND
 * again at render: a renderer has to stay safe for a document that reached the
 * database by some other door than the one that normalized it.
 */
const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'];

export function safeHref(href: string | undefined | null): string | null {
	const trimmed = (href ?? '').trim();
	if (!trimmed) return null;
	const lower = trimmed.toLowerCase();
	if (!SAFE_SCHEMES.some((s) => lower.startsWith(s))) return null;
	// A control character in a URL is only ever an attempt to smuggle a scheme
	// past the prefix check above (`java\nscript:` and friends).
	if ([...trimmed].some((c) => c.charCodeAt(0) <= 0x20 || c.charCodeAt(0) === 0x7f)) return null;
	return trimmed;
}

/**
 * Does an editor document contain any text at all?
 *
 * An editor is never empty STRUCTURALLY -- ProseMirror always holds at least
 * one paragraph -- so "is there anything to save" has to look at the text. The
 * server decides for real; this is only what keeps a Save button honest while
 * someone is typing.
 */
export function tiptapHasText(node: TiptapNode | null | undefined): boolean {
	if (!node || typeof node !== 'object') return false;
	if (typeof node.text === 'string' && node.text.trim() !== '') return true;
	return (node.content ?? []).some(tiptapHasText);
}
