// tests/rich-text-fixtures.ts
//
// FIXTURES BUILT FROM THE REAL EDITOR SCHEMA, for the two rich-text
// normalizers.
//
// WHY THIS EXISTS. Both normalizer tests used to type their ProseMirror
// fixtures by hand, and one of those fixtures was a document ProseMirror
// cannot produce: a `bulletList` holding another `bulletList` as a SIBLING of
// its list items. Under the real schema a list's content is `listItem+` and a
// sublist is a child of the list item above it, so that fixture exercised a
// branch no editor output can reach. It passed for as long as it existed while
// every REAL nested list was being silently concatenated into one unreadable
// item. A green test on an impossible document is worse than no test: it is a
// claim of coverage over the exact case that was broken.
//
// So a fixture here is built through `@tiptap/core`'s own `getSchema`, from
// the SAME options object the editor component is configured with
// ($lib/rich-text-schema), and then `check()`ed. If the schema stops allowing
// a shape, the fixture using it throws rather than quietly testing something
// the editor can no longer emit.
//
// No DOM and no browser: `getSchema` and `Node.fromJSON` are pure ProseMirror,
// so this works unchanged in vitest's `node` environment.

import { getSchema } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Node as PMNode, type Schema } from '@tiptap/pm/model';
import { ITEM_SCHEMA_OPTIONS, NOTE_SCHEMA_OPTIONS } from '../src/lib/rich-text-schema';

/** The digital notebook's note schema: no headings. */
export const noteSchema: Schema = getSchema([StarterKit.configure(NOTE_SCHEMA_OPTIONS)]);

/** The classroom's item-body schema: the same, plus h3/h4. */
export const itemSchema: Schema = getSchema([StarterKit.configure(ITEM_SCHEMA_OPTIONS)]);

/**
 * JSON -> a document the schema says the editor could actually hold -> JSON.
 *
 * Throws if the schema does not have the node type, does not have the mark, or
 * does not allow the arrangement. The value returned is ProseMirror's OWN
 * serialization of the node it built, not the object that was passed in, so a
 * fixture cannot smuggle in a key the editor would never emit.
 */
export function editorDoc(schema: Schema, json: unknown): Record<string, unknown> {
	const node = PMNode.fromJSON(schema, json as Parameters<typeof PMNode.fromJSON>[1]);
	node.check();
	return node.toJSON() as Record<string, unknown>;
}

/** Can this schema hold that arrangement at all? The negative half of the above. */
export function canHold(schema: Schema, json: unknown): boolean {
	try {
		editorDoc(schema, json);
		return true;
	} catch {
		return false;
	}
}

// --- Convenience builders, in the editor's own vocabulary ------------------
// These produce the JSON shape; `editorDoc` is what makes it real.

export const pmDoc = (...content: unknown[]) => ({ type: 'doc', content });
export const pmPara = (...content: unknown[]) => ({ type: 'paragraph', content });
export const pmHeading = (level: number, ...content: unknown[]) => ({
	type: 'heading',
	attrs: { level },
	content
});
export const pmText = (text: string, marks?: unknown[]) => ({
	type: 'text',
	text,
	...(marks ? { marks } : {})
});
export const pmBold = { type: 'bold' };
export const pmItalic = { type: 'italic' };
export const pmLink = (href: string) => ({ type: 'link', attrs: { href } });
export const pmItem = (...content: unknown[]) => ({ type: 'listItem', content });
export const pmBullets = (...content: unknown[]) => ({ type: 'bulletList', content });
export const pmNumbers = (...content: unknown[]) => ({ type: 'orderedList', content });
