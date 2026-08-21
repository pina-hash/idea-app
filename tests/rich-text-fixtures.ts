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

// --- The editor-document corpus -------------------------------------------
//
// One set of documents both normalizers are driven with, so a construct is
// never covered on one side and forgotten on the other. Lifted out of
// tests/rich-text-nested-lists.test.ts, which declared it inline and is now one
// of three readers: the gate parity sweep, the golden flat corpus that pins
// what the FLATTENING normalizer emitted (tests/fixtures/flat-stored-corpus.json),
// and the nesting pipeline proof.
//
// EVERY ENTRY IS BUILT THROUGH THE REAL SCHEMA at the point of use, by
// `editorDoc`, so nothing here can be a document ProseMirror could not hold.

/** Editor documents both schemas can hold, so one set feeds both normalizers. */
export const SHARED_EDITOR_DOCS: { label: string; json: unknown }[] = [
	{ label: 'one plain paragraph', json: pmDoc(pmPara(pmText('Bench notes for today.'))) },
	{
		label: 'marks and a safe link',
		json: pmDoc(
			pmPara(
				pmText('Plain '),
				pmText('bold', [pmBold]),
				pmText(' and '),
				pmText('italic', [pmItalic]),
				pmText(' and '),
				pmText('a link', [pmLink('https://example.com/a?b=c')])
			)
		)
	},
	{
		label: 'a bulleted list',
		json: pmDoc(
			pmBullets(
				pmItem(pmPara(pmText('250 mL beaker'))),
				pmItem(pmPara(pmText('Digital scale'))),
				pmItem(pmPara(pmText('Graduated cylinder')))
			)
		)
	},
	{
		label: 'a numbered list',
		json: pmDoc(
			pmNumbers(pmItem(pmPara(pmText('Zero the scale'))), pmItem(pmPara(pmText('Mass the beaker'))))
		)
	},
	{
		label: 'a list with a sublist',
		json: pmDoc(
			pmBullets(
				pmItem(
					pmPara(pmText('Materials')),
					pmBullets(
						pmItem(pmPara(pmText('250 mL beaker'))),
						pmItem(pmPara(pmText('Digital scale')))
					)
				),
				pmItem(pmPara(pmText('Method')))
			)
		)
	},
	{
		label: 'a list item holding two paragraphs',
		json: pmDoc(
			pmBullets(pmItem(pmPara(pmText('First half')), pmPara(pmText('Second half'))))
		)
	},
	{
		label: 'paragraphs around a list',
		json: pmDoc(
			pmPara(pmText('Before.')),
			pmBullets(pmItem(pmPara(pmText('Middle')))),
			pmPara(pmText('After.'))
		)
	}
];

/** Documents only the item schema can hold. */
export const ITEM_ONLY_EDITOR_DOCS: { label: string; json: unknown }[] = [
	{ label: 'an h3', json: pmDoc(pmHeading(3, pmText('Safety'))) },
	{
		label: 'an h4 above a list',
		json: pmDoc(pmHeading(4, pmText('Steps')), pmBullets(pmItem(pmPara(pmText('Measure')))))
	}
];
