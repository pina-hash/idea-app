/**
 * WHAT THE SURFACE OPENED ON, so a change can be told from a mount.
 *
 * THE DEFECT THIS EXISTS FOR. Seeding a Tiptap editor emits a transaction
 * indistinguishable from typing -- ProseMirror normalizes whatever it is handed
 * -- so a field wired straight to the editor's change event marks itself dirty
 * before anybody has touched it. Under autosave that write lands, the resulting
 * re-render produces another transaction, and the surface saves itself forever:
 * measured at 151 writes in a few seconds on the check-in guidance field, and on
 * the review console (where each save refetches the section) it wedged the
 * renderer outright. Without autosave it is quieter and still wrong -- a
 * navigation guard asks "discard your unsaved work?" about work nobody did.
 *
 * The editor is only the loudest case. ANY surface that seeds state from a
 * server value and derives `dirty` from the presence of that state has the same
 * bug; `ContentComposer` opened on an existing item reported dirty from mount
 * because its draft carried the item's own title and body.
 *
 * SO: COMPARE, NEVER ASSUME. `seed` records what the surface opened on and
 * `changed` answers whether the current value has moved off it. Both go through
 * one serializer, so two call sites cannot disagree about what "the same
 * document" means.
 *
 * IT IS SEEDED FROM THE EDITOR'S OWN SERIALIZATION (`onready`), NOT FROM THE
 * VALUE HANDED IN. Tiptap normalizes on the way in, so the document it holds
 * after mounting is frequently not byte-identical to the stored one it was given
 * -- comparing against the input would report that harmless normalization as an
 * unsaved change, which is the same false positive one level along.
 *
 * `$state` rather than a plain field because the notebook and the composer read
 * it from a `$derived`; an unreactive baseline there would leave `changed`
 * stuck at whatever it answered on the first read.
 */
export class EditBaseline {
	#serial = $state<string | null>(null);

	/** Whether anything has been seeded yet. Nothing is "changed" before it is. */
	get seeded(): boolean {
		return this.#serial !== null;
	}

	/**
	 * THE BASELINE ITSELF, for the one caller that has to PERSIST the comparison
	 * rather than only ask it: the notebook's local draft mirror stores this
	 * beside the document it kept, so a restore can `seed()` the same reference
	 * back and the composer's own seeded-versus-edited question resumes rather
	 * than being re-invented on the read side.
	 *
	 * Read-only on purpose. Setting a serial directly would be a second way to
	 * seed a baseline, spelled in a shape no serializer had to agree with.
	 */
	get serial(): string | null {
		return this.#serial;
	}

	/** What the surface opened on. Idempotent by value; call it from `onready`. */
	seed(value: unknown): void {
		this.#serial = serializeForBaseline(value);
	}

	/**
	 * Adopt the current value as the new reference -- after a save lands, or
	 * after a real edit has been reported once and should not be reported again.
	 */
	advance(value: unknown): void {
		this.#serial = serializeForBaseline(value);
	}

	/**
	 * Has this diverged from what was seeded?
	 *
	 * FALSE BEFORE ANYTHING IS SEEDED, deliberately. A surface whose editor has
	 * not reported itself yet has, by definition, had nothing typed into it, and
	 * answering true there would reinstate the exact defect this class is for.
	 */
	changed(value: unknown): boolean {
		if (this.#serial === null) return false;
		return serializeForBaseline(value) !== this.#serial;
	}

	/** Forget the baseline (the surface closed, or is about to open on something else). */
	clear(): void {
		this.#serial = null;
	}
}

/**
 * The ONE serialization, so a baseline taken by one call site and compared by
 * another cannot disagree. `undefined` and `null` are the same "nothing here",
 * because an editor that has been handed no document and one holding an explicit
 * null are the same state to a person looking at the screen.
 */
export function serializeForBaseline(value: unknown): string {
	return JSON.stringify(value ?? null);
}
