/**
 * The EDITOR SCHEMA both rich-text features are configured with, as plain data.
 *
 * Plain data only (the curriculum.ts / pathways.ts convention): no Svelte, no
 * `$lib/server`, and no VALUE import of Tiptap -- the type import below is
 * erased at build time, so this module stays free for anything to pull in,
 * including a node test with no DOM. The editors still import the runtime
 * dynamically, browser-only, exactly as they did.
 *
 * WHY IT IS NOT WRITTEN INLINE IN THE TWO EDITORS ANY MORE. The schema is the
 * paste filter and therefore the definition of what a stored document can ever
 * be asked to hold: turning a node type off here is a real guarantee, not a
 * preference. The server-side normalizers are written against that definition
 * and the tests that fix their behaviour build their fixtures from it (see
 * tests/notebook-note-content.test.ts). A fixture typed by hand can encode a
 * document ProseMirror cannot produce, and then it exercises a branch no real
 * input reaches -- which is exactly how the nested-list defect stayed green for
 * two releases. One declaration, read by the editor AND by the test, is what
 * makes that class of drift impossible.
 *
 * `getSchema([StarterKit.configure(<options below>)])` from `@tiptap/core`
 * turns either of these into the real ProseMirror schema with no browser
 * anywhere, which is what a test uses to build a document it KNOWS the editor
 * could have held.
 */

import type { StarterKitOptions } from '@tiptap/starter-kit';

/**
 * Links, in both features: no navigation from inside the editor, autolinking
 * on, and only the three schemes `safeHref` will let through at normalization
 * and again at render.
 */
const LINK_OPTIONS = {
	openOnClick: false,
	autolink: true,
	protocols: ['http', 'https', 'mailto'],
	HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' }
} satisfies NonNullable<Partial<StarterKitOptions>['link']>;

/**
 * The digital notebook's written notes: bold, italic, links, bulleted and
 * numbered lists. No headings -- a note is a note, not a document.
 */
export const NOTE_SCHEMA_OPTIONS: Partial<StarterKitOptions> = {
	// Everything outside the feature's scope is off, so the document cannot
	// contain it in the first place.
	heading: false,
	blockquote: false,
	code: false,
	codeBlock: false,
	horizontalRule: false,
	strike: false,
	underline: false,
	hardBreak: false,
	link: LINK_OPTIONS
};

/**
 * Classroom item bodies: the same, plus headings at LEVELS 3 AND 4 ONLY. The
 * page around a body already owns h1 (the item's title) and h2 (the section
 * label); see the note on `ItemBlock` in $lib/classroom/classroom-doc.
 */
export const ITEM_SCHEMA_OPTIONS: Partial<StarterKitOptions> = {
	// Everything outside the feature's scope is off, so a paste cannot bring it
	// in and the document cannot contain it.
	heading: { levels: [3, 4] },
	blockquote: false,
	code: false,
	codeBlock: false,
	horizontalRule: false,
	strike: false,
	underline: false,
	hardBreak: false,
	link: LINK_OPTIONS
};
