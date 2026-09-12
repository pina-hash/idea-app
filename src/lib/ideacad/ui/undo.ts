/**
 * Undo and redo over ACCEPTED edits, 50 deep, client-side (0145 PART 5).
 *
 * WHAT IS ON THE STACK IS THE ACCEPTED TREE, NEVER THE DRAFT. A student drags a
 * slider through forty values before pressing the green check; a stack fed by
 * the preview would need forty presses of Ctrl+Z to undo one decision, which is
 * an undo nobody uses. The confirm pair is the boundary, exactly as the notebook
 * makes an explicit save a revision boundary.
 *
 * NO SVELTE IN HERE. The class holds plain arrays and the component holds one of
 * it in `$state`, so every rule below -- the depth cap, the redo clear, what a
 * push of an identical tree does -- is assertable without mounting anything.
 */
export const UNDO_DEPTH = 50;

export class UndoStack<T> {
	private past: T[] = [];
	private future: T[] = [];

	constructor(
		private readonly depth = UNDO_DEPTH,
		/** Injected so the caller decides what a snapshot is; the component passes
		 *  a `$state.snapshot` clone, which a raw `structuredClone` of a proxy
		 *  cannot do. */
		private readonly clone: (value: T) => T = (v) => structuredClone(v)
	) {}

	get canUndo(): boolean {
		return this.past.length > 0;
	}
	get canRedo(): boolean {
		return this.future.length > 0;
	}
	get undoDepth(): number {
		return this.past.length;
	}
	get redoDepth(): number {
		return this.future.length;
	}

	/**
	 * Record the state being LEFT, at the moment an edit is accepted.
	 *
	 * A REDO FUTURE IS DISCARDED BY A NEW EDIT, which is what every editor does
	 * and is the one behaviour a stack gets wrong by leaving the future alone:
	 * a redo onto a branch the student abandoned restores work they cannot see
	 * the origin of.
	 */
	push(previous: T): void {
		this.past.push(this.clone(previous));
		if (this.past.length > this.depth) this.past.shift();
		this.future = [];
	}

	/** Hand back the state to restore, taking the current one onto the redo side. */
	undo(current: T): T | null {
		const restored = this.past.pop();
		if (restored === undefined) return null;
		this.future.push(this.clone(current));
		if (this.future.length > this.depth) this.future.shift();
		return restored;
	}

	redo(current: T): T | null {
		const restored = this.future.pop();
		if (restored === undefined) return null;
		this.past.push(this.clone(current));
		if (this.past.length > this.depth) this.past.shift();
		return restored;
	}

	/**
	 * Loading another concept is not an edit of this one, so the history does
	 * not follow it across. An undo that reached back into a different concept
	 * would rewrite a document the student is not looking at.
	 */
	clear(): void {
		this.past = [];
		this.future = [];
	}
}

/**
 * The keystroke map, as a pure reading of an event, so the component's handler
 * has no branching in it and the map is assertable on its own.
 *
 * `Ctrl+Z` UNDO, `Ctrl+Y` AND `Ctrl+Shift+Z` REDO -- the second redo spelling
 * because it is what half the world presses, and because the viewport's own
 * `Ctrl+Shift+Z` (Previous view) already calls `preventDefault`, so a keystroke
 * that reached the console from inside the graphics area has been claimed
 * before this is asked. `defaultPrevented` is the discriminator and it is the
 * caller's to check; this function answers only what the keys say.
 */
export type UndoKey = 'undo' | 'redo' | null;

export function undoKeyFor(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): UndoKey {
	if (!e.ctrlKey && !e.metaKey) return null;
	const k = e.key.toLowerCase();
	if (k === 'y') return 'redo';
	if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
	return null;
}
