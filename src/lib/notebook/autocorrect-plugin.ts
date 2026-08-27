/**
 * THE PROSEMIRROR HALF of autocorrect: turning the decisions in
 * `autocorrect.ts` into a transaction, and nothing else.
 *
 * Every judgement -- which word, whether it may be touched, what it becomes,
 * where the caret lands -- is made by the pure module and tested without a
 * browser. What is left here is the part that genuinely needs the editor: text
 * offsets to document positions, the transaction, the decoration and the two
 * keys. Keeping the split at exactly that line is why the caret arithmetic is
 * assertable at all.
 *
 * IT IS LOADED WITH THE EDITOR, dynamically and browser-only. `@tiptap/pm` is
 * part of the same ProseMirror bundle `NoteEditor` already defers, so nothing
 * else on the page pays for it and it never runs during SSR.
 */

import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { EditorState, Transaction } from '@tiptap/pm/state';
import {
	CorrectionLedger,
	isBoundary,
	planCorrection,
	shiftCaret,
	sessionDeclined
} from '$lib/notebook/autocorrect';

export const autocorrectKey = new PluginKey('notebookAutocorrect');

/** How long a corrected word stays marked. Long enough to see, short enough
 *  not to become a permanent annotation on the note. */
export const CORRECTION_MARK_MS = 1800;

/** The class the decoration carries. Styled in NoteEditor's own stylesheet. */
export const CORRECTION_MARK_CLASS = 'nb-corrected';

interface AutocorrectPluginState {
	decos: DecorationSet;
}

interface Meta {
	add?: { from: number; to: number };
	clear?: true;
	/** Our own transaction, so `appendTransaction` does not act on it again. */
	mine: true;
}

export interface AutocorrectOptions {
	/**
	 * Read LIVE, on every keystroke, rather than captured at construction: the
	 * switch sits in the toolbar of the editor this plugin is installed in, so
	 * flipping it has to take effect on the very next word without rebuilding
	 * the editor (which would drop what the student had typed).
	 */
	enabled: () => boolean;
	/**
	 * The one-keystroke undo's memory. Passed in rather than created here so
	 * the component owns its lifetime and a test can hand in its own.
	 */
	ledger: CorrectionLedger;
}

/**
 * WHY `appendTransaction` AND NOT `handleTextInput`.
 *
 * `handleTextInput` fires BEFORE the character exists, so the correction and
 * the character it was triggered by would have to be composed by hand into one
 * transaction, and every caret offset would be measured against a document
 * that has not been written yet. `appendTransaction` runs after the boundary
 * character has landed, against the real document, which is the same state the
 * pure planner is reasoning about -- so the offsets it returns need no
 * adjustment for a pending edit.
 */
export function autocorrectPlugin(options: AutocorrectOptions): Plugin {
	const { enabled, ledger } = options;

	return new Plugin<AutocorrectPluginState>({
		key: autocorrectKey,

		state: {
			init: () => ({ decos: DecorationSet.empty }),
			apply(tr, value) {
				const meta = tr.getMeta(autocorrectKey) as Meta | undefined;
				if (meta?.clear) return { decos: DecorationSet.empty };
				let decos = value.decos.map(tr.mapping, tr.doc);
				if (meta?.add) {
					decos = decos.add(tr.doc, [
						Decoration.inline(meta.add.from, meta.add.to, { class: CORRECTION_MARK_CLASS })
					]);
				}
				return { decos };
			}
		},

		props: {
			decorations(state: EditorState) {
				return autocorrectKey.getState(state)?.decos ?? DecorationSet.empty;
			},

			/**
			 * THE REVERT. Backspace with a correction armed puts the original word
			 * back, declines it for the session and consumes the key; every other
			 * key disarms and does nothing else.
			 *
			 * Armed for exactly one keystroke, because a backspace three words
			 * later is a student deleting a letter, and turning that into an undo
			 * would be a bigger surprise than the correction was.
			 */
			handleKeyDown(view, event) {
				if (event.key !== 'Backspace') {
					ledger.disarm();
					return false;
				}
				const plan = ledger.revert();
				if (!plan) return false;

				const caret = view.state.selection.from;
				const tr = view.state.tr.insertText(plan.text, plan.from, plan.to);
				const next = shiftCaret(caret, plan.from, plan.to, plan.text.length);
				tr.setSelection(TextSelection.create(tr.doc, Math.min(next, tr.doc.content.size)));
				tr.setMeta(autocorrectKey, { clear: true, mine: true } satisfies Meta);
				tr.setMeta('addToHistory', false);
				view.dispatch(tr);
				return true;
			}
		},

		appendTransaction(trs, oldState, newState): Transaction | null {
			if (!enabled()) return null;
			// Our own work, and an undo of it, are both off limits.
			if (trs.some((tr) => (tr.getMeta(autocorrectKey) as Meta | undefined)?.mine)) return null;
			if (!trs.some((tr) => tr.docChanged)) return null;
			// TYPED, not deleted. A backspace can also leave the caret sitting
			// after a boundary character, and correcting on a delete would fire
			// the feature at the exact moment a student is undoing something.
			if (newState.doc.content.size <= oldState.doc.content.size) return null;

			const sel = newState.selection;
			if (!sel.empty) return null;

			const $pos = sel.$from;
			// Structural refusal, ahead of the textual one. The note schema has
			// `codeBlock` off, so this cannot fire today -- it is here because a
			// document can reach the editor from the draft mirror and because the
			// schema can widen, and a code block is the one case where a silent
			// correction would change what the code MEANS.
			if ($pos.parent.type.name === 'codeBlock') return null;
			if ($pos.parentOffset < 2) return null;

			// Everything before the caret, blocks joined by newlines. That is the
			// exact string `codeRegions` needs: a fence opened in an earlier
			// paragraph is still open in this one, and the note schema's
			// `hardBreak: false` means these newlines are block boundaries and
			// nothing else.
			const prefix = newState.doc.textBetween(0, sel.from, '\n', '\n');
			if (!isBoundary(prefix[prefix.length - 1] ?? '')) return null;

			const plan = planCorrection(prefix, prefix.length, sessionDeclined);
			if (!plan) return null;

			// The word and the caret are in the same block with no separator
			// between them, so the prefix offsets map to document positions by a
			// single subtraction.
			const docFrom = sel.from - (prefix.length - plan.from);
			const docTo = sel.from - (prefix.length - plan.to);
			if (docFrom < 0 || docTo > newState.doc.content.size) return null;

			// The second structural refusal: an inline `code` mark. Off in this
			// schema too, and refused for the same reason as the block above.
			const marks = newState.doc.resolve(docFrom + 1).marks();
			if (marks.some((mark) => mark.type.name === 'code')) return null;

			const tr = newState.tr.insertText(plan.replacement, docFrom, docTo);
			const caret = shiftCaret(sel.from, docFrom, docTo, plan.replacement.length);
			tr.setSelection(TextSelection.create(tr.doc, Math.min(caret, tr.doc.content.size)));
			tr.setMeta(autocorrectKey, {
				mine: true,
				add: { from: docFrom, to: docFrom + plan.replacement.length }
			} satisfies Meta);

			// ARMED IN DOCUMENT POSITIONS. The ledger is coordinate-agnostic --
			// it stores whatever it was handed and gives it back -- and the revert
			// dispatches against the document, so document positions are what it
			// needs.
			ledger.arm({
				from: docFrom,
				to: docTo,
				original: plan.original,
				replacement: plan.replacement
			});

			return tr;
		}
	});
}

/** Clear every correction mark. Dispatched on a timer by the component. */
export function clearCorrectionMarks(state: EditorState): Transaction {
	return state.tr.setMeta(autocorrectKey, { clear: true, mine: true } satisfies Meta);
}
