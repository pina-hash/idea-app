/**
 * THE IDEACAD ACTION LOG -- pure arithmetic, no Svelte, no DOM, no Supabase.
 *
 * ---------------------------------------------------------------------------
 * WHAT MR. PINA ASKED FOR, AND THE ONE CONSTRAINT THAT DECIDES THE SHAPE
 * ---------------------------------------------------------------------------
 *
 * Every action a student takes should be undoable, the way SolidWorks and
 * Fusion 360 are, with a history you can scroll through, at maximum resolution,
 * ALL THE WAY BACK TO THE CREATION OF THE PART (2026-09-12).
 *
 * STORE ACTIONS, NEVER GEOMETRY. A row here is a PARAMETER CHANGE -- which
 * feature, what changed, the new value, who, when. It is not a mesh and it is
 * not a serialized tree. A stored snapshot is roughly a hundred times larger
 * and would exhaust the free tier inside a term; the whole budget argument
 * (~400 bytes an action, 100 students, three projects a year, ~192 MB against a
 * 500 MB tier shared with coins, notebooks, Foundry and tournaments) holds ONLY
 * while a row is an action. `tests/db/ideacad-history-row-size.test.ts` measures
 * the real number against real Postgres rather than trusting this paragraph.
 *
 * THE ONE EXCEPTION IS `origin`, AND IT IS ONE ROW PER CONCEPT. "All the way
 * back to the creation of the part" is not answerable without the state the
 * part was created in, so seq 0 carries the tree as it was seeded. Amortised
 * over the hundreds of actions that follow it, it is noise; per action it would
 * be the thing this design exists to refuse.
 *
 * ---------------------------------------------------------------------------
 * WHY UNDO APPENDS AN INVERSE RATHER THAN MOVING A POINTER
 * ---------------------------------------------------------------------------
 *
 * The rejected design is a per-document cursor: undo decrements it, redo
 * increments it, a fresh edit truncates the future. It is smaller and it is
 * wrong twice over here. It DISCARDS history, which is precisely what "as far
 * back as possible" refuses; and a cursor is one mutable cell two editors of a
 * shared document (0205) fight over, where appends serialise on their own.
 *
 * So UNDO IS AN ACTION. It appends the inverse of its target and names that
 * target in `undoesSeq`. Nothing is ever deleted or rewritten, which makes the
 * log append-only in the sense `coin_transactions` and `notebook_entry_notes`
 * are, and REPLAY IS OBLIVIOUS TO UNDO: reconstructing the state at any point
 * is applying rows 1..k on top of the origin, with no special case for an undo
 * row anywhere in it. That obliviousness is the property that makes a scrub
 * cheap and a scrub-versus-unwind equality test meaningful.
 *
 * ---------------------------------------------------------------------------
 * DEPTH, WHICH IS THE ONLY SUBTLE PART
 * ---------------------------------------------------------------------------
 *
 * A row's DEPTH is 0 when it names no target, and one more than its target's
 * otherwise. A chain 2 <- 3 <- 4 <- 5 has depths 0, 1, 2, 3.
 *
 *   EVEN depth means the action is APPLIED. Depth 0 is the original edit;
 *   depth 2 is a redo, which re-applies it; depth 4 is a redo of an undo of a
 *   redo, which is the same thing again.
 *
 *   ODD depth means the action is UNDONE. Depth 1 is the undo; depth 3 is the
 *   undo of a redo.
 *
 * So the undo target is the newest LIVE row (even depth, not already inverted)
 * and the redo target is the newest UNDONE row (odd depth, not already
 * inverted). A shallower rule -- "a row whose target is itself an inverse is a
 * redo" -- gets depth 3 wrong, classifying an undo-of-a-redo as a redo and
 * leaving the student with no way to redo the thing they just undid. It was
 * written that way first; the four-step trace in
 * `tests/ideacad-history-fold.test.ts` is what caught it.
 */

/* -------------------------------------------------------------------------
 * 1. THE VOCABULARY
 * ---------------------------------------------------------------------- */

/**
 * The five kinds, and they are closed. A sixth is a migration, not a string:
 * the CHECK constraint in 0209 names these exactly, and every function below
 * is exhaustive over the union, so adding one without a branch is a type error
 * rather than an action that silently does nothing.
 */
export type IdeacadActionKind = 'origin' | 'set' | 'insert' | 'remove' | 'move';

/**
 * One action.
 *
 * `path` is an RFC 6901 JSON Pointer into the feature tree. The empty string is
 * the whole tree, which only `origin` uses.
 *
 * WHAT `before` AND `after` MEAN DEPENDS ON `kind`, and the asymmetry is
 * deliberate rather than sloppy -- it is what keeps a row narrow:
 *
 *   origin  after  = the tree the part was created with. before is null.
 *   set     before = the value that was there, after = the value now.
 *   insert  after  = the value added at `path`. before is null.
 *   remove  before = the value that was at `path`. after is null.
 *   move    `path` names the ARRAY; before = the index moved FROM, after = the
 *           index moved TO. Storing the element itself would put a feature in
 *           every reorder row for no information at all.
 */
export interface IdeacadAction {
	readonly kind: IdeacadActionKind;
	readonly path: string;
	readonly before?: unknown;
	readonly after?: unknown;
}

/** One stored row: an action, its place in the order, and who put it there. */
export interface IdeacadHistoryRow extends IdeacadAction {
	readonly seq: number;
	/** The row this one inverts, when it is an undo or a redo. */
	readonly undoesSeq?: number | null;
	readonly actor?: string;
	readonly at?: string;
}

/* -------------------------------------------------------------------------
 * 2. JSON POINTERS
 * ---------------------------------------------------------------------- */

const escapeToken = (token: string): string => token.replace(/~/g, '~0').replace(/\//g, '~1');
const unescapeToken = (token: string): string => token.replace(/~1/g, '/').replace(/~0/g, '~');

/** Build a pointer by appending one token to a parent pointer. */
export function pointerChild(parent: string, token: string | number): string {
	return `${parent}/${escapeToken(String(token))}`;
}

/** Split a pointer into its tokens. The empty pointer has none. */
export function pointerTokens(pointer: string): string[] {
	if (pointer === '') return [];
	if (!pointer.startsWith('/')) throw new Error(`Not a JSON Pointer: ${pointer}`);
	return pointer.slice(1).split('/').map(unescapeToken);
}

/** Read the value at a pointer, or undefined if any step is absent. */
export function pointerGet(root: unknown, pointer: string): unknown {
	let node: unknown = root;
	for (const token of pointerTokens(pointer)) {
		if (node === null || typeof node !== 'object') return undefined;
		node = Array.isArray(node)
			? (node as unknown[])[Number(token)]
			: (node as Record<string, unknown>)[token];
	}
	return node;
}

/**
 * Resolve a pointer's PARENT and final token, raising rather than creating
 * anything on the way.
 *
 * NOTHING HERE AUTOVIVIFIES. A pointer whose parent is not already there is a
 * log that does not describe the tree it is being replayed onto, and inventing
 * the missing object would turn that into a silently different document. It is
 * the same reason the preflight refuses rather than repairs.
 */
function resolveParent(root: unknown, pointer: string): { parent: unknown; token: string } {
	const tokens = pointerTokens(pointer);
	if (tokens.length === 0) throw new Error('The empty pointer has no parent.');
	let node: unknown = root;
	for (const token of tokens.slice(0, -1)) {
		if (node === null || typeof node !== 'object')
			throw new Error(`Cannot walk ${pointer}: ${token} has no container.`);
		node = Array.isArray(node)
			? (node as unknown[])[Number(token)]
			: (node as Record<string, unknown>)[token];
	}
	if (node === null || typeof node !== 'object')
		throw new Error(`Cannot walk ${pointer}: its parent is not a container.`);
	return { parent: node, token: tokens[tokens.length - 1] };
}

/* -------------------------------------------------------------------------
 * 3. APPLY AND INVERT
 * ---------------------------------------------------------------------- */

const clone = <T>(value: T): T =>
	value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/**
 * Apply one action to a tree, returning a NEW tree.
 *
 * It clones the whole tree rather than the touched spine. A blade tree is six
 * features of scalars; the spine-cloning version is more code for an
 * optimisation nothing has measured a need for, and a partially shared tree is
 * exactly the shape that lets a replay accidentally mutate the state it started
 * from.
 */
export function applyAction<T>(tree: T, action: IdeacadAction): T {
	if (action.kind === 'origin') return clone(action.after) as T;
	const next = clone(tree);
	const { parent, token } = resolveParent(next, action.path);
	if (Array.isArray(parent)) {
		const index = Number(token);
		if (!Number.isInteger(index)) throw new Error(`${action.path} is not an array index.`);
		switch (action.kind) {
			case 'set':
				parent[index] = clone(action.after);
				return next;
			case 'insert':
				parent.splice(index, 0, clone(action.after));
				return next;
			case 'remove':
				parent.splice(index, 1);
				return next;
			case 'move':
				throw new Error('A move names the array itself, not an element of it.');
		}
	}
	const object = parent as Record<string, unknown>;
	switch (action.kind) {
		case 'set':
		case 'insert':
			object[token] = clone(action.after);
			return next;
		case 'remove':
			delete object[token];
			return next;
		case 'move': {
			const array = object[token];
			if (!Array.isArray(array)) throw new Error(`${action.path} is not an array.`);
			const from = Number(action.before);
			const to = Number(action.after);
			if (!Number.isInteger(from) || !Number.isInteger(to))
				throw new Error('A move carries two integer indices.');
			if (from < 0 || from >= array.length || to < 0 || to >= array.length)
				throw new Error(`A move on ${action.path} names an index outside the array.`);
			const [element] = array.splice(from, 1);
			array.splice(to, 0, element);
			return next;
		}
	}
}

/** Apply a run of actions in order. */
export function applyActions<T>(tree: T, actions: readonly IdeacadAction[]): T {
	let out = tree;
	for (const action of actions) out = applyAction(out, action);
	return out;
}

/**
 * The inverse of an action, which is what an undo appends.
 *
 * `origin` HAS NO INVERSE AND MUST NOT ACQUIRE ONE. Undoing the creation of the
 * part would leave a concept whose stored tree no replay can produce; the floor
 * of the history is the part existing.
 */
export function invertAction(action: IdeacadAction): IdeacadAction {
	switch (action.kind) {
		case 'origin':
			throw new Error('The creation of the part cannot be undone.');
		case 'set':
			return { kind: 'set', path: action.path, before: action.after, after: action.before };
		case 'insert':
			return { kind: 'remove', path: action.path, before: action.after, after: null };
		case 'remove':
			return { kind: 'insert', path: action.path, before: null, after: action.before };
		case 'move':
			return { kind: 'move', path: action.path, before: action.after, after: action.before };
	}
}

/* -------------------------------------------------------------------------
 * 4. REPLAY AND SCRUB
 * ---------------------------------------------------------------------- */

/** The rows in seq order. Sorting here rather than trusting a caller's order. */
export function ordered(rows: readonly IdeacadHistoryRow[]): IdeacadHistoryRow[] {
	return [...rows].sort((a, b) => a.seq - b.seq);
}

/**
 * REPLAY FROM THE CREATION OF THE PART, up to and including `throughSeq`.
 *
 * This is the whole correctness claim of the feature: replaying to the newest
 * row must equal the stored tree. A test that does not make that comparison,
 * on a part with real depth, has not tested this.
 */
export function stateAt<T>(rows: readonly IdeacadHistoryRow[], throughSeq?: number): T {
	const all = ordered(rows);
	const origin = all.find((r) => r.kind === 'origin');
	if (!origin) throw new Error('This history has no origin row, so it cannot be replayed.');
	const limit = throughSeq ?? (all.length ? all[all.length - 1].seq : origin.seq);
	let tree = clone(origin.after) as T;
	for (const row of all) {
		if (row.seq <= origin.seq || row.seq > limit) continue;
		tree = applyAction(tree, row);
	}
	return tree;
}

/**
 * The same point reached the OTHER way: from the current state, inverting rows
 * newest-first back down to `throughSeq`.
 *
 * IT EXISTS TO BE COMPARED AGAINST `stateAt`, and the comparison is not
 * ceremony. Forward replay is what a scrub uses and backward inversion is what
 * an undo uses, so the two agreeing is the statement that scrubbing to a point
 * and undoing back to it land a student in the same document. They are
 * different code paths over different rows and nothing but a test makes them
 * agree.
 */
export function unwindTo<T>(
	current: T,
	rows: readonly IdeacadHistoryRow[],
	throughSeq: number
): T {
	const all = ordered(rows);
	let tree = clone(current);
	for (let i = all.length - 1; i >= 0; i -= 1) {
		const row = all[i];
		if (row.seq <= throughSeq) break;
		if (row.kind === 'origin') break;
		tree = applyAction(tree, invertAction(row));
	}
	return tree;
}

/* -------------------------------------------------------------------------
 * 5. THE FOLD -- what undo and redo point at
 * ---------------------------------------------------------------------- */

export interface IdeacadHistoryFold {
	/** The newest live row an undo would invert, or null. */
	readonly undoTarget: IdeacadHistoryRow | null;
	/** The newest undone row a redo would re-apply, or null. */
	readonly redoTarget: IdeacadHistoryRow | null;
	/** Every row's depth, by seq. Exposed because a timeline renders it. */
	readonly depth: ReadonlyMap<number, number>;
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	/** A normal edit landed after an undo, so that abandoned branch is retained
	 *  in the audit log but is no longer a redo candidate. */
	readonly redoDiscarded: boolean;
}

/**
 * Read the log and say what undo and redo would act on.
 *
 * The walk is NEWEST FIRST and consumes a whole inverse chain when it meets the
 * head of one, which is what keeps it linear: a row already inverted by
 * something later is not a candidate for anything, and neither is anything
 * further down its own chain.
 */
export function foldHistory(rows: readonly IdeacadHistoryRow[]): IdeacadHistoryFold {
	const all = ordered(rows);
	const bySeq = new Map(all.map((r) => [r.seq, r]));

	const depth = new Map<number, number>();
	for (const row of all) {
		const target = row.undoesSeq ?? null;
		depth.set(row.seq, target === null ? 0 : (depth.get(target) ?? 0) + 1);
	}

	const consumed = new Set<number>();
	let undoTarget: IdeacadHistoryRow | null = null;
	let redoTarget: IdeacadHistoryRow | null = null;
	let newerEdit = false;
	let redoDiscarded = false;

	for (let i = all.length - 1; i >= 0; i -= 1) {
		const row = all[i];
		if (consumed.has(row.seq)) continue;
		if (row.kind === 'origin') continue;
		// This row is the head of its chain, so nothing below it is live.
		for (let c = row.undoesSeq ?? null; c !== null; c = bySeq.get(c)?.undoesSeq ?? null)
			consumed.add(c);
		const even = (depth.get(row.seq) ?? 0) % 2 === 0;
		if (even) {
			if (!undoTarget) undoTarget = row;
			// A depth-zero row is a new decision, rather than an inverse-chain
			// operation. It explicitly closes every older redo branch.
			if ((depth.get(row.seq) ?? 0) === 0) newerEdit = true;
		} else if (newerEdit) {
			redoDiscarded = true;
		} else if (!redoTarget) redoTarget = row;
		if (undoTarget && redoTarget) break;
	}

	return {
		undoTarget,
		redoTarget,
		depth,
		canUndo: undoTarget !== null,
		canRedo: redoTarget !== null,
		redoDiscarded
	};
}

/**
 * The row an undo would append: the inverse of the undo target, naming it.
 *
 * A REDO IS THE SAME OPERATION ONE LINK FURTHER ALONG, which is why there is no
 * second function for it. Redoing is undoing an undo -- the inverse of the
 * inverse -- so the two differ only in which target the fold handed back, and
 * writing them separately is two spellings of one rule.
 */
export function inverseOf(target: IdeacadHistoryRow): IdeacadAction & { undoesSeq: number } {
	return { ...invertAction(target), undoesSeq: target.seq };
}

/* -------------------------------------------------------------------------
 * 6. THE DIFF -- how a whole-tree edit becomes actions
 * ---------------------------------------------------------------------- */

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const idOf = (v: unknown): string | null =>
	isPlainObject(v) && typeof v.id === 'string' ? v.id : null;

/** Whether an array is keyed: every element an object with a string `id`. */
const keyed = (a: readonly unknown[]): boolean =>
	a.length > 0 && a.every((v) => idOf(v) !== null);

/**
 * Turn a before/after pair of trees into the actions that take one to the
 * other.
 *
 * THIS IS WHY NO `.svelte` FILE HAD TO CHANGE. `store.edit(features)` has
 * always taken a whole tree, because that is what `feature-model.ts`'s four
 * verbs produce; asking every call site to hand over an action instead would be
 * a rewrite of the editor to record something the store can work out for
 * itself. The store diffs the accepted tree against the last accepted one and
 * appends what comes back.
 *
 * THE RESOLUTION IS THE ACCEPTED EDIT, AND THAT IS THE RIGHT GRAIN RATHER THAN
 * A COMPROMISE. `ui/undo.ts` already made the case: a student drags a slider
 * through forty values before pressing the green check, and a history fed by
 * the preview needs forty presses of Ctrl+Z to undo one decision. SolidWorks
 * records the feature edit, not the mouse. So does this.
 *
 * A REORDER IS A `move` AND NOT SIX `set`s. The features array is keyed, so a
 * reorder is detected by id and costs one narrow row per displaced element
 * instead of rewriting every feature that shifted.
 */
export function diffTrees(before: unknown, after: unknown, path = ''): IdeacadAction[] {
	if (same(before, after)) return [];

	if (Array.isArray(before) && Array.isArray(after)) {
		const out: IdeacadAction[] = [];
		let working = [...before];

		if (keyed(before) && keyed(after)) {
			const beforeIds = before.map(idOf).sort();
			const afterIds = after.map(idOf).sort();
			if (before.length === after.length && same(beforeIds, afterIds)) {
				// A permutation of the same elements. Emit the minimal moves,
				// then recurse at the POST-MOVE indices, because the moves are
				// applied first and every later pointer is read against them.
				for (let i = 0; i < after.length; i += 1) {
					if (idOf(working[i]) === idOf(after[i])) continue;
					const from = working.findIndex((v, j) => j > i && idOf(v) === idOf(after[i]));
					if (from < 0) break;
					out.push({ kind: 'move', path, before: from, after: i });
					const [element] = working.splice(from, 1);
					working.splice(i, 0, element);
				}
			}
		}

		const shared = Math.min(working.length, after.length);
		for (let i = 0; i < shared; i += 1)
			out.push(...diffTrees(working[i], after[i], pointerChild(path, i)));
		// Trailing removals go BACK TO FRONT so each index is still valid when
		// its own row is applied; front to back would have every row after the
		// first naming a position that has already shifted underneath it.
		for (let i = working.length - 1; i >= after.length; i -= 1)
			out.push({ kind: 'remove', path: pointerChild(path, i), before: working[i], after: null });
		for (let i = working.length; i < after.length; i += 1)
			out.push({ kind: 'insert', path: pointerChild(path, i), before: null, after: after[i] });
		return out;
	}

	if (isPlainObject(before) && isPlainObject(after)) {
		const out: IdeacadAction[] = [];
		for (const key of Object.keys(before)) {
			if (!(key in after)) {
				out.push({ kind: 'remove', path: pointerChild(path, key), before: before[key], after: null });
				continue;
			}
			out.push(...diffTrees(before[key], after[key], pointerChild(path, key)));
		}
		for (const key of Object.keys(after))
			if (!(key in before))
				out.push({ kind: 'insert', path: pointerChild(path, key), before: null, after: after[key] });
		return out;
	}

	// A leaf, or a change of container KIND (array to object, object to scalar),
	// which is one replacement rather than a walk of two unrelated shapes.
	if (path === '') return [{ kind: 'origin', path: '', before: null, after }];
	return [{ kind: 'set', path, before, after }];
}

/* -------------------------------------------------------------------------
 * 7. THE BUDGET
 * ---------------------------------------------------------------------- */

/**
 * The per-action storage budget this design was sized against, and the number a
 * measurement is compared to rather than a number anything enforces.
 *
 * Mr. Pina and prompt 0189 worked it out together: 100 students, three projects
 * a year, ~192 MB against a 500 MB tier shared with coins, notebooks, Foundry
 * and tournaments. It holds only while a row is an action.
 * `tests/db/ideacad-history-row-size.test.ts` measures the real figure -- heap
 * plus every index -- against real Postgres and reports it.
 */
export const IDEACAD_ACTION_BUDGET_BYTES = 400;

/* -------------------------------------------------------------------------
 * 8. THE TRANSPORT BOUNDARY
 * ---------------------------------------------------------------------- */

/**
 * The two RPCs 0209 adds, as an OPTIONAL boundary the store takes on the side.
 *
 * WHY IT IS HERE AND NOT IN `transports.ts`. 0209 is applied by hand, so a
 * deployment sitting between 0208 and 0209 is a real state; on it these are
 * undefined and the store has no undo, no redo and no timeline. ABSENCE IS THE
 * MECHANISM, exactly as it is for 0205's five sharing transports -- read-only
 * history is structural rather than a flag somebody has to remember to check.
 * Keeping the pair beside the arithmetic it serves means one import for a
 * surface that wants the feature and nothing at all for one that does not.
 *
 * NEITHER TAKES AN IDENTITY. The caller is `current_user_email()` inside the
 * definer.
 */
export interface IdeacadApplyResult<C> {
	readonly ok: boolean;
	readonly reason?: string;
	readonly concept: C;
	readonly appended: number;
	readonly firstSeq: number | null;
	readonly lastSeq: number | null;
}

export interface IdeacadHistoryPayload {
	readonly conceptId: string;
	readonly rows: IdeacadHistoryRow[];
	readonly total: number;
	readonly newestSeq: number | null;
}

export interface IdeacadHistoryTransports<C = unknown> {
	/** `ideacad_apply_actions`: the actions and the tree they produced, in one statement. */
	applyActions(
		conceptId: string,
		actions: readonly (IdeacadAction & { undoesSeq?: number })[],
		features: unknown,
		revision: number
	): Promise<IdeacadApplyResult<C>>;
	/** `ideacad_concept_history`: one page forward from an exclusive cursor. */
	conceptHistory(
		conceptId: string,
		afterSeq: number,
		limit: number
	): Promise<IdeacadHistoryPayload>;
}

/**
 * Read a whole log by paging until the newest row is in hand.
 *
 * A REPLAY NEEDS ALL OF IT AND A PARTIAL PAGE IS NOT A SMALLER REPLAY, it is a
 * tree that never existed -- `applyAction` refuses to walk onto a parent that
 * is not there, which is what turns that loud instead of plausible. The read
 * RPC caps a page at 5000 and always includes seq 0, so this loop is what turns
 * a paged read back into a replayable log.
 */
export async function readWholeHistory(
	transports: Pick<IdeacadHistoryTransports, 'conceptHistory'>,
	conceptId: string,
	pageSize = 2000
): Promise<IdeacadHistoryRow[]> {
	const seen = new Map<number, IdeacadHistoryRow>();
	let cursor = -1;
	for (let guard = 0; guard < 1000; guard += 1) {
		const page = await transports.conceptHistory(conceptId, cursor, pageSize);
		for (const row of page.rows) seen.set(row.seq, row);
		const newest = page.rows.length ? Math.max(...page.rows.map((r) => r.seq)) : cursor;
		if (newest <= cursor) break;
		cursor = newest;
		if (page.newestSeq !== null && cursor >= page.newestSeq) break;
	}
	return ordered([...seen.values()]);
}
