// tests/dom/notebook-draft-mirror-vocabulary.test.ts
//
// A DRAFT WRITTEN ON A NEW BUILD, RESTORED ON AN OLD ONE, MUST NEVER COME BACK
// EMPTY -- and before this file it did, silently, all the way down to zero
// characters.
//
// THE DEFECT, as ledger 0192 measured it and pinned it in
// `tests/dom/notebook-sheet-undo.test.ts` without being able to fix it.
// `$lib/notebook/draft-mirror` is SHAPE-VERSIONED and was believed to fail
// cleanly on anything it did not understand. It does not, because the version
// covers the mirror's own FIELD SET and `doc` is stored and handed back
// OPAQUELY. Hand Tiptap a document naming a node its schema does not have and
// it does NOT throw: it catches the `RangeError` internally, logs a warning,
// and DISCARDS THE WHOLE DOCUMENT. `NoteEditor.svelte`'s `catch { failed =
// true }` never fires, nothing on any surface reports anything, and the
// student's restored draft is one empty paragraph.
//
// WHY IT IS A REAL STUDENT-FACING CASE AND NOT A THOUGHT EXPERIMENT: a
// rollback, a tab left open across a deploy, or a cached build. In every one of
// those the mirror is the ONLY copy of that writing -- the tab that was typing
// it is gone and nothing was ever dispatched.
//
// WHAT THIS FILE ASSERTS, AND THE ONE NON-NEGOTIABLE PROPERTY. Every path
// through the mirror either returns everything it was given or returns nothing
// and says so. NO PATH SILENTLY RETURNS LESS. The character count of a
// restored document that had content is asserted never to reach zero, in both
// directions, against a real editor -- which is the assertion the defect fails
// and every other framing of it passes.
//
// WHY A REAL EDITOR RATHER THAN A STAND-IN. The whole finding is about what
// ProseMirror does with a schema mismatch, and that is not a thing a fake can
// be asked. `NOTE_SCHEMA_OPTIONS` is IMPORTED, not restated, so an editor
// configured here is configured exactly as `NoteEditor.svelte` configures one.
//
// NOT ASSERTED HERE: geometry, contrast and tap targets. happy-dom has no
// layout engine, so those read zero and pass vacuously (`tests/dom/README.md`).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Editor, getSchema } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { NOTE_SCHEMA_OPTIONS } from '$lib/rich-text-schema';
import { GRID_NODE_NAME, NotebookGrid } from '$lib/notebook/grid';
import { serializeForBaseline } from '$lib/edit-baseline.svelte';
import {
	DRAFT_MIRROR_VERSION,
	KNOWN_MIRROR_VERSIONS,
	NOTE_MIRROR_VOCABULARY,
	V1_MIRROR_VOCABULARY,
	type DraftMirror,
	type MirrorVocabulary,
	draftMirrorKey,
	latestMirror,
	mirrorHeldMessage,
	mirrorVersionFor,
	planMirrorRestore,
	readMirror,
	sweepMirrors,
	unknownTypes,
	writeMirror
} from '$lib/notebook/draft-mirror';

const VIEWER = 'student-1';
const PROSE = 'a paragraph that must survive';

/**
 * The document a NEW build produces: ordinary prose followed by a block the
 * deployed editor has never heard of. The prose FIRST, deliberately -- the
 * finding is that it goes too, and a fixture with the unknown block first
 * could not tell a whole-document discard from a truncation.
 */
const NEW_BUILD_DOC = {
	type: 'doc',
	content: [
		{ type: 'paragraph', content: [{ type: 'text', text: PROSE }] },
		{ type: GRID_NODE_NAME, attrs: { rows: [['a']] } }
	]
};

/** The same shape with nothing exotic in it: the control for every case below. */
const PLAIN_DOC = {
	type: 'doc',
	content: [{ type: 'paragraph', content: [{ type: 'text', text: PROSE }] }]
};

/**
 * AN OLD BUILD'S EDITOR -- `NoteEditor.svelte`'s real extension list, which
 * today genuinely does NOT carry the grid node (ledger 0192 shipped the node
 * without wiring it). So this is not a simulation of a rollback; it is the
 * build that is running.
 */
function oldBuildEditor(content: unknown): Editor {
	const element = document.createElement('div');
	document.body.appendChild(element);
	return new Editor({
		element,
		extensions: [StarterKit.configure(NOTE_SCHEMA_OPTIONS)],
		content: content as never
	});
}

/** A NEW build's editor: the same, plus the node. */
function newBuildEditor(content: unknown): Editor {
	const element = document.createElement('div');
	document.body.appendChild(element);
	return new Editor({
		element,
		extensions: [StarterKit.configure(NOTE_SCHEMA_OPTIONS), NotebookGrid],
		content: content as never
	});
}

/** The vocabulary a build with the grid node would declare. */
const NEW_BUILD_VOCABULARY: MirrorVocabulary = {
	nodes: [...NOTE_MIRROR_VOCABULARY.nodes, GRID_NODE_NAME],
	marks: [...NOTE_MIRROR_VOCABULARY.marks]
};

function mirrorOf(doc: unknown, over: Partial<DraftMirror> = {}): DraftMirror {
	return {
		v: mirrorVersionFor(doc),
		at: Date.now(),
		entryId: null,
		noteId: null,
		doc: doc as never,
		// A baseline of `null` means "the server had nothing", so the document is
		// unsaved writing -- which is the only state a mirror is ever read in.
		baseline: serializeForBaseline(null),
		title: 'Lab 3',
		sessionId: null,
		sectionId: null,
		folderId: null,
		...over
	};
}

beforeEach(() => localStorage.clear());

describe('the measurement the fix rests on', () => {
	/**
	 * THE POSITIVE CONTROL FOR THE WHOLE FILE, and it is the one assertion here
	 * that is about Tiptap rather than about this module. Without it, every
	 * "held" assertion below could be green over a defect that had quietly
	 * stopped existing, and the guard would be protecting against nothing.
	 */
	it('an unknown node still takes the WHOLE document with it, silently', () => {
		const editor = oldBuildEditor(NEW_BUILD_DOC);
		expect(editor.getText()).toBe('');
		expect(editor.getJSON()).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
		editor.destroy();
	});

	/**
	 * WIDER THAN LEDGER 0192 FOUND, which is why the vocabulary has two lists.
	 * `underline`, `strike` and `code` are all switched off in
	 * `NOTE_SCHEMA_OPTIONS` today, so a build that turns one on and is rolled
	 * back reaches this through the MARK list and not the node list -- and a
	 * guard that checked only node types would wave it straight through.
	 */
	it('and so does an unknown MARK, and an unknown INLINE node', () => {
		const marked = oldBuildEditor({
			type: 'doc',
			content: [
				{ type: 'paragraph', content: [{ type: 'text', text: PROSE, marks: [{ type: 'highlight' }] }] }
			]
		});
		expect(marked.getText()).toBe('');
		marked.destroy();

		const inline = oldBuildEditor({
			type: 'doc',
			content: [
				{
					type: 'paragraph',
					content: [{ type: 'text', text: PROSE }, { type: 'mention', attrs: { id: 'x' } }]
				}
			]
		});
		expect(inline.getText()).toBe('');
		inline.destroy();
	});

	/** And the negative control: an unrecognised ATTR is harmless. */
	it('an unknown attr on a known node is dropped and the text survives', () => {
		const editor = oldBuildEditor({
			type: 'doc',
			content: [{ type: 'paragraph', attrs: { weird: 1 }, content: [{ type: 'text', text: PROSE }] }]
		});
		expect(editor.getText()).toBe(PROSE);
		editor.destroy();
	});
});

describe('the vocabulary is the build, not a copy of it', () => {
	/**
	 * PINNED AGAINST THE REAL SCHEMA, IN BOTH DIRECTIONS. A hand-written list
	 * that drifts from the editor is the whole failure this module now rests on:
	 * a name missing from it holds every ordinary draft (the sentence appears
	 * over writing that would have restored perfectly), and a name in it that
	 * the editor does not have restores the blank document the fix exists to
	 * prevent. Both directions, or the pin is half a pin.
	 */
	it('names exactly the node and mark types NoteEditor real schema has', () => {
		const schema = getSchema([StarterKit.configure(NOTE_SCHEMA_OPTIONS)]);
		expect([...NOTE_MIRROR_VOCABULARY.nodes].sort()).toEqual(Object.keys(schema.nodes).sort());
		expect([...NOTE_MIRROR_VOCABULARY.marks].sort()).toEqual(Object.keys(schema.marks).sort());
	});

	it('finds every unknown type, deduped and sorted, and nothing on a plain document', () => {
		expect(unknownTypes(PLAIN_DOC)).toEqual([]);
		expect(unknownTypes(NEW_BUILD_DOC)).toEqual([GRID_NODE_NAME]);
		// Nested, which is where a walk that only looked at top-level blocks would
		// answer empty over a document Tiptap still discards whole.
		expect(
			unknownTypes({
				type: 'doc',
				content: [
					{
						type: 'bulletList',
						content: [
							{ type: 'listItem', content: [{ type: GRID_NODE_NAME, attrs: { rows: [['a']] } }] }
						]
					}
				]
			})
		).toEqual([GRID_NODE_NAME]);
		// Marks, at depth.
		expect(
			unknownTypes({
				type: 'doc',
				content: [
					{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] }
				]
			})
		).toEqual(['highlight']);
		// Deduped and sorted rather than one entry per occurrence.
		expect(
			unknownTypes({
				type: 'doc',
				content: [
					{ type: 'zeta' },
					{ type: 'alpha' },
					{ type: 'zeta' }
				]
			})
		).toEqual(['alpha', 'zeta']);
	});

	/**
	 * "I could not finish looking" must never read as "I looked and found
	 * nothing", which is the shape of every vacuous sweep in this repo's
	 * history. A document past the cap reports rather than answering empty.
	 */
	it('reports rather than answering empty past the depth cap', () => {
		let deep: Record<string, unknown> = { type: 'paragraph' };
		for (let i = 0; i < 80; i++) deep = { type: 'bulletList', content: [deep] };
		expect(unknownTypes({ type: 'doc', content: [deep] })).toContain('(too deeply nested)');
	});
});

describe('the shape version is derived from the document', () => {
	it('stays 1 for an ordinary note, so a deployed build still restores it', () => {
		expect(mirrorVersionFor(PLAIN_DOC)).toBe(1);
	});

	it('bumps to 2 exactly when a v:1 build could not render the document', () => {
		expect(mirrorVersionFor(NEW_BUILD_DOC)).toBe(2);
		expect(DRAFT_MIRROR_VERSION).toBe(2);
	});

	/**
	 * The bump ARMS ITSELF. `V1_MIRROR_VOCABULARY` is frozen and
	 * `NOTE_MIRROR_VOCABULARY` moves, so the bundle that wires a node into the
	 * editor gets the version behaviour by adding one name -- there is no second
	 * edit to forget. This asserts the two are still in the relationship that
	 * makes that true.
	 */
	it('is armed by the two vocabularies diverging, not by a second edit', () => {
		for (const name of V1_MIRROR_VOCABULARY.nodes) {
			expect(NOTE_MIRROR_VOCABULARY.nodes).toContain(name);
		}
		for (const name of V1_MIRROR_VOCABULARY.marks) {
			expect(NOTE_MIRROR_VOCABULARY.marks).toContain(name);
		}
	});

	it('reads every known version back, because an older slot is still writing', () => {
		expect([...KNOWN_MIRROR_VERSIONS]).toEqual([1, 2]);
		const key = draftMirrorKey(VIEWER, null);
		for (const v of KNOWN_MIRROR_VERSIONS) {
			localStorage.clear();
			expect(writeMirror(key, { ...mirrorOf(PLAIN_DOC), v })).toBe('ok');
			expect(readMirror(key, Date.now())?.v).toBe(v);
		}
	});

	it('still drops a version it does not know, rather than guessing', () => {
		const key = draftMirrorKey(VIEWER, null);
		localStorage.setItem(key, JSON.stringify({ ...mirrorOf(PLAIN_DOC), v: 99 }));
		expect(readMirror(key, Date.now())).toBeNull();
	});
});

describe('THE STUDENT-FACING CASE: a draft written on a new build, restored on an old one', () => {
	/**
	 * THE ASSERTION THE WHOLE BUNDLE IS FOR. Driven end to end through the
	 * module's own read path -- write, find, plan, and only then the editor --
	 * rather than through a hand-built plan object, because the defect was in
	 * the seam between those calls and not in any one of them.
	 */
	it('never hands the old build a document that would come back empty', () => {
		const key = draftMirrorKey(VIEWER, null);
		expect(writeMirror(key, mirrorOf(NEW_BUILD_DOC))).toBe('ok');

		const found = latestMirror(VIEWER, Date.now());
		expect(found).not.toBeNull();

		const plan = planMirrorRestore(found!.mirror, undefined, NOTE_MIRROR_VOCABULARY);
		expect(plan.action).toBe('hold');
		expect(plan).toMatchObject({ unknown: [GRID_NODE_NAME] });

		// AND THE SLOT IS STILL THERE. Holding that destroyed the writing would
		// satisfy "not restored empty" and fail the property this file is about.
		expect(localStorage.getItem(key)).not.toBeNull();
		expect(readMirror(key, Date.now())?.doc).toEqual(NEW_BUILD_DOC);
	});

	/**
	 * THE CHARACTER COUNT, ASSERTED DIRECTLY, because it is the number the
	 * student experiences and the one the defect drove to zero. The old build is
	 * only ever handed a document it was cleared to open.
	 */
	it('so the restored character count never drops to zero on a document that had content', () => {
		for (const doc of [PLAIN_DOC, NEW_BUILD_DOC]) {
			localStorage.clear();
			const key = draftMirrorKey(VIEWER, null);
			writeMirror(key, mirrorOf(doc));
			const found = latestMirror(VIEWER, Date.now())!;
			const plan = planMirrorRestore(found.mirror, undefined, NOTE_MIRROR_VOCABULARY);

			if (plan.action !== 'restore') {
				// Nothing was handed over, so nothing was lost: the writing is still
				// in the slot and the student is told in words.
				expect(plan.action).toBe('hold');
				expect(mirrorHeldMessage().length).toBeGreaterThan(0);
				continue;
			}
			const editor = oldBuildEditor(found.mirror.doc);
			expect(editor.getText().length).toBeGreaterThan(0);
			expect(editor.getText()).toContain(PROSE);
			editor.destroy();
		}
	});

	/** THE OTHER DIRECTION: the build that HAS the node restores it whole. */
	it('and the new build restores the very same mirror with everything in it', () => {
		const key = draftMirrorKey(VIEWER, null);
		writeMirror(key, mirrorOf(NEW_BUILD_DOC));
		const found = latestMirror(VIEWER, Date.now())!;

		const plan = planMirrorRestore(found.mirror, undefined, NEW_BUILD_VOCABULARY);
		expect(plan.action).toBe('restore');

		const editor = newBuildEditor(found.mirror.doc);
		expect(editor.getText().length).toBeGreaterThan(0);
		expect(editor.getText()).toContain(PROSE);
		const out = editor.getJSON() as { content?: { type: string }[] };
		expect(out.content).toHaveLength(2);
		expect(out.content?.[1].type).toBe(GRID_NODE_NAME);
		editor.destroy();
	});

	/**
	 * An ordinary draft must be untouched by all of this. A guard that held
	 * everything would be as much of a defect as one that held nothing, and it
	 * would be invisible in exactly the same way.
	 */
	it('and an ordinary prose draft restores exactly as it always did', () => {
		const key = draftMirrorKey(VIEWER, null);
		writeMirror(key, mirrorOf(PLAIN_DOC));
		const found = latestMirror(VIEWER, Date.now())!;
		expect(found.mirror.v).toBe(1);
		expect(planMirrorRestore(found.mirror, undefined).action).toBe('restore');
		const editor = oldBuildEditor(found.mirror.doc);
		expect(editor.getText()).toBe(PROSE);
		editor.destroy();
	});

	/**
	 * THE ORDER INSIDE `planMirrorRestore`, asserted because getting it the
	 * other way round strands a slot forever over a document that was never at
	 * risk and puts a message on screen about it.
	 */
	it('drops rather than holds when the mirror matches its own baseline', () => {
		const acknowledged = mirrorOf(NEW_BUILD_DOC, {
			baseline: serializeForBaseline(NEW_BUILD_DOC)
		});
		expect(planMirrorRestore(acknowledged, undefined).action).toBe('drop');
	});
});

describe('a held slot is protected from every write path', () => {
	/**
	 * THE QUOTA SWEEP IS THE ONE THAT WOULD HAVE EATEN IT. `writeMirror` drops
	 * every OTHER slot regardless of age when storage is full -- which, without
	 * the protection, silently destroys the one copy of writing this build
	 * already refused to open. Reporting `'full'` is loud; destroying a backup
	 * is not.
	 */
	it('the quota sweep skips it, and the housekeeping sweep can too', () => {
		const heldKey = draftMirrorKey(VIEWER, 'entry-a');
		const otherKey = draftMirrorKey(VIEWER, 'entry-b');
		const liveKey = draftMirrorKey(VIEWER, null);
		const now = Date.now();
		writeMirror(heldKey, mirrorOf(NEW_BUILD_DOC));
		writeMirror(otherKey, mirrorOf(PLAIN_DOC));

		// The positive control: without the protection this sweep takes both.
		expect(sweepMirrors(liveKey, now, true, [heldKey])).toBe(1);
		expect(localStorage.getItem(heldKey)).not.toBeNull();
		expect(localStorage.getItem(otherKey)).toBeNull();
	});

	it('and the age cap still bounds it, because exposure outranks holding', () => {
		const heldKey = draftMirrorKey(VIEWER, 'entry-a');
		writeMirror(heldKey, mirrorOf(NEW_BUILD_DOC, { at: 1 }));
		expect(readMirror(heldKey, 1 + 25 * 60 * 60 * 1000)).toBeNull();
	});
});

describe("the caller's version handling, swept from the source", () => {
	/**
	 * A SOURCE SWEEP, AND IT SAYS SO RATHER THAN LOOKING LIKE A MOUNT.
	 * `NotebookView.svelte` is a whole-screen component with the notebook's
	 * entire transport surface in its props, and this repo tests it by reading
	 * it (`tests/notebook-shell.test.ts` does the same) rather than by standing
	 * that surface up. So this is weaker than driving the composer and is here
	 * for one regression in particular: the defect's other half was a `v: 1`
	 * LITERAL pinned at the call site, which no amount of correctness inside
	 * `draft-mirror.ts` can overrule.
	 *
	 * WHAT IT CANNOT SEE, stated so nobody reads more into a green run: that the
	 * branches actually execute, and in what order. Those are the module's, and
	 * they are driven for real above.
	 */
	// `process.cwd()` and not `import.meta.url`: under the DOM project the module
	// url is not a `file:` one and `new URL(...)` throws on it.
	const VIEW = readFileSync(
		resolve(process.cwd(), 'src/lib/notebook/NotebookView.svelte'),
		'utf8'
	);

	it('reads the file it claims to -- the positive control', () => {
		// Without this, every absence assertion below passes over an empty string.
		expect(VIEW.length).toBeGreaterThan(10_000);
		expect(VIEW).toContain("from '$lib/notebook/draft-mirror'");
		expect(VIEW).toContain('writeMirror(');
	});

	it('derives the shape version instead of pinning a literal at the call site', () => {
		expect(VIEW).toContain('v: mirrorVersionFor(doc)');
		// The literal is what shipped the defect. It must not come back.
		expect(VIEW).not.toMatch(/\bv:\s*1\b/);
		expect(VIEW).not.toMatch(/\bv:\s*2\b/);
	});

	it('has a hold branch that restores nothing and clears nothing', () => {
		expect(VIEW).toContain("plan.action === 'hold'");
		expect(VIEW).toContain('mirrorHeldKey = found.key');
		expect(VIEW).toContain('mirrorHeldNote = mirrorHeldMessage()');
		// The held branch returns before the restore, so no document reaches the
		// editor and no `clearMirror` reaches the slot.
		const branch = VIEW.slice(
			VIEW.indexOf("plan.action === 'hold'"),
			VIEW.indexOf('restoredDoc = found.mirror.doc')
		);
		expect(branch).toContain('return;');
		expect(branch).not.toContain('clearMirror');
		expect(branch).not.toContain('restoredDoc =');
	});

	it('steers every write path around the held key', () => {
		// The acknowledgement sweep.
		expect(VIEW).toContain('if (key === mirrorHeldKey) continue;');
		// The debounced write.
		expect(VIEW).toContain('if (key === held) {');
		// And the quota sweep inside writeMirror, told what not to eat.
		expect(VIEW).toContain('held ? [held] : []');
	});

	it('renders the held sentence where the student is working', () => {
		expect(VIEW).toContain('data-testid="nb-mirror-held"');
		expect(VIEW).toContain('{mirrorHeldNote}');
	});
});
