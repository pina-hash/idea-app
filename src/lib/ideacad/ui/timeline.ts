/**
 * THE HISTORY TIMELINE'S ARITHMETIC -- pure, no Svelte, no DOM, no Supabase.
 *
 * ---------------------------------------------------------------------------
 * WHAT MR. PINA ASKED FOR
 * ---------------------------------------------------------------------------
 *
 * A history you can SCROLL THROUGH, like SolidWorks or Fusion 360, at MAXIMUM
 * RESOLUTION, ALL THE WAY BACK TO THE CREATION OF THE PART (2026-09-12).
 *
 * 0209 built the durable half: an append-only action log, one row per accepted
 * parameter change, `src/lib/ideacad/history.ts` the arithmetic over it. What
 * it did not build is the surface, and until this file landed the log was
 * written and read by NOTHING -- a student's Ctrl+Z still hit `ui/undo.ts`'s
 * fifty in-memory trees, which the next reload threw away. This is the surface,
 * and retiring that stack is the point of the bundle it arrived in.
 *
 * ---------------------------------------------------------------------------
 * A ROW SAYS WHAT CHANGED, NOT WHERE IT CHANGED
 * ---------------------------------------------------------------------------
 *
 * A stored action carries an RFC 6901 JSON Pointer -- `/features/1/acrossFlats`
 * -- because that is what replays. It is NOT what a fifteen-year-old reads. A
 * timeline that printed the pointer would be a debugging view wearing a
 * student's clothes, and the student would learn to ignore it, which costs the
 * whole feature.
 *
 * So every row is named against THE TREE THE ACTION APPLIED TO. `/features/1`
 * is only "Hex Extension" if you know what sat at index 1 at that moment, and
 * that is a fact about the log's own past rather than about the document on
 * screen -- a feature reordered later would make a pointer-to-name table lie
 * about every row written before the reorder. `buildTimeline` therefore walks
 * FORWARD from the origin, carrying the tree, and names each row before
 * applying it. One pass, and the names are true at the moment they describe.
 *
 * THE NAMES COME FROM THE CONTROLS. `featureLabel` and `fieldLabel` are
 * `feature-model.ts`'s own -- the same strings the PropertyManager draws -- so
 * a student reads "Across flats" in the timeline because that is the words on
 * the control they turned. `fieldLabel` did not exist before this bundle; its
 * nine names were literals inside `panelFor`, and a second copy here is exactly
 * the drift this file would have caused.
 *
 * ---------------------------------------------------------------------------
 * IT NEVER THROWS, AND THAT IS A RULE RATHER THAN DEFENSIVENESS
 * ---------------------------------------------------------------------------
 *
 * A log is durable and a tree shape is not: a row written by an older editor,
 * a pointer into a feature that a later action removed, a `move` whose indices
 * no longer resolve. `history.ts` refuses those LOUDLY and it is right to --
 * a replay that invented the missing container would produce a document that
 * never existed. But a REFUSAL INSIDE A LABEL IS A BLANK EDITOR, over a
 * sentence. So `buildTimeline` catches, marks the row `broken`, stops advancing
 * the tree it names against, and renders the rest. The student sees their
 * history with one row saying it cannot be read, rather than seeing nothing.
 *
 * ---------------------------------------------------------------------------
 * THERE IS NO CURSOR HERE, AND THE UI MUST NOT IMPLY ONE
 * ---------------------------------------------------------------------------
 *
 * 0189 chose append-an-inverse over move-a-pointer deliberately: a cursor
 * DISCARDS history, which is what "all the way back to the creation of the
 * part" refuses, and it is one mutable cell two editors of a 0205-shared
 * document fight over. Four presses over two edits leave SIX rows, and all six
 * are on screen.
 *
 * So a row is never greyed out as "ahead of the cursor" and nothing is ever
 * removed from the list. What a row carries instead is its own STATE --
 * `applied` or `undone`, read from the depth parity `foldHistory` computes --
 * plus, for an inverse, the row it inverts. An undo row reads "Undid: Across
 * flats 0.50 in to 0.62 in", which is a thing that HAPPENED and is in the
 * history because it happened.
 */

import {
	foldHistory,
	pointerTokens,
	stateAt,
	type IdeacadHistoryRow
} from '../history';
import { featureLabel, fieldLabel } from './feature-model';

/* -------------------------------------------------------------------------
 * 1. THE VOCABULARY THE CONTROLS DO NOT OWN
 * ---------------------------------------------------------------------- */

/**
 * The tree-level parameters `panelFor` does not draw, and therefore the ones
 * `fieldLabel` has no name for.
 *
 * THESE ARE NOT A SECOND COPY OF ANYTHING. `rotation` and the three `materials`
 * keys are drawn by `BladeEditor`'s OWN materials panel (0208 moved them there,
 * because material and thickness are two controls over one stored stock id and
 * a `PmField` union cannot express that), so `feature-model.ts` genuinely has
 * no name for them and there is nothing here to drift from. The strings are the
 * ones that panel puts on screen.
 *
 * `bladeStock` IS NAMED FOR WHAT THE STUDENT CHANGED, WHICH IS TWO CONTROLS.
 * One stored id carries both the material and the thickness, so an edit to
 * either writes this one key; "Blade stock" is the honest name for the pair and
 * the value the row prints is what tells them which moved.
 */
const TREE_LABELS: Record<string, string> = {
	/* SPIN DIRECTION IS DRAWN BY THE MATERIALS PANEL (0208 put it there), so
	   that is the `where` a student would go to change it back. It sits at the
	   TREE's top level rather than under `materials`, which is why it needs
	   saying here. */
	rotation: 'Spin direction',
	'materials/body': 'Body material',
	'materials/bodySolidFraction': 'Body fill',
	'materials/bladeStock': 'Blade stock',
	features: 'Feature order',
	schema: 'Document format',
	editor: 'Editor',
	units: 'Units'
};

/** The two station columns, which are a table rather than a panel field. */
const STATION_LABELS: Record<string, string> = { r: 'radius', z: 'height' };

/** The words `rotation` stores against the words the picker shows. */
const ROTATION_WORDS: Record<string, string> = {
	cw: 'clockwise',
	ccw: 'counter-clockwise'
};

/* -------------------------------------------------------------------------
 * 2. VALUES
 * ---------------------------------------------------------------------- */

/**
 * A stored value as a student reads it.
 *
 * NUMBERS ARE ROUNDED FOR READING AND NOT FOR STORING. `round4` is the tree's
 * own precision; a timeline that printed 0.6250000000000001 would be reporting
 * a float artefact as a decision the student made. Trailing zeros go, so 0.5
 * reads "0.5" rather than "0.5000" -- the control shows a typed number and so
 * does this.
 */
/**
 * A STORED ID IS NOT A NAME, AND THIS IS THE SEAM THAT FIXES IT.
 *
 * `materials.bladeStock` holds `aluminum-0125`; the picker beside it says
 * "6061 aluminum" and "0.125 in". A timeline printing the id is a debugging
 * view wearing a student's clothes -- the same defect as printing a JSON
 * pointer, one column over, and it survived the first browser pass because the
 * pointer sweep had nothing to say about a VALUE.
 *
 * IT IS A FUNCTION THE CALLER SUPPLIES RATHER THAN A TABLE IN HERE, because the
 * names live in the resolved material library (`bladeConfigWithMaterials`) which
 * is per-document, includes a student's own custom materials, and is exactly
 * what the pickers read. A lookup table in this module would be a second
 * vocabulary that goes stale the first time somebody adds a material -- which
 * 0208 made a thing an admin does in a form, with no deploy.
 *
 * RETURNING NULL IS NORMAL and prints the stored value, which is right for
 * every path that is not an id.
 */
export type TimelineNamer = (path: string, value: unknown) => string | null;

export function readValue(value: unknown): string {
	if (value === null || value === undefined) return 'nothing';
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) return String(value);
		return String(Number(value.toFixed(4)));
	}
	if (typeof value === 'boolean') return value ? 'on' : 'off';
	if (typeof value === 'string') return ROTATION_WORDS[value] ?? value;
	if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
	if (typeof value === 'object') {
		const o = value as Record<string, unknown>;
		// A station is the one small object a student edits directly, and
		// "radius 0.5, height 1.2" is what its row in the table says.
		if (typeof o.r === 'number' && typeof o.z === 'number')
			return `radius ${readValue(o.r)}, height ${readValue(o.z)}`;
		if (typeof o.id === 'string') return featureLabel(o.id);
		return 'a group of settings';
	}
	return String(value);
}

/* -------------------------------------------------------------------------
 * 3. NAMING A POINTER AGAINST THE TREE IT POINTED INTO
 * ---------------------------------------------------------------------- */

/** What one pointer names, in the words of the controls. */
export interface TimelineTarget {
	/** The feature or area, e.g. "Hex Extension" or "Materials". */
	readonly where: string;
	/** The parameter inside it, e.g. "Across flats". Empty when the row is about
	 *  the whole thing. */
	readonly what: string;
	/** The unit, when the tree fixes one. Empty otherwise. */
	readonly unit: string;
}

/** Every length in this tree is inches; `sweepDeg` is the one angle. */
const unitFor = (key: string): string =>
	key === 'sweepDeg' ? 'deg' : key === 'count' || key === 'bodySolidFraction' ? '' : 'in';

/**
 * Resolve a pointer to a pair of names, against the tree it pointed into.
 *
 * THE TREE IS THE `before` TREE AND THAT MATTERS FOR `remove`. A removal's
 * pointer names something that is gone once the action lands, so naming it
 * against the tree AFTER would leave every removal unnamed -- which is the
 * half of the log a student most wants a sentence for.
 */
export function describeTarget(path: string, tree: unknown): TimelineTarget {
	const t = pointerTokens(path);
	if (t.length === 0) return { where: 'The whole part', what: '', unit: '' };

	// /features/<i>/...
	if (t[0] === 'features') {
		if (t.length === 1) return { where: TREE_LABELS.features, what: '', unit: '' };
		const list = (tree as { features?: unknown[] } | null)?.features;
		const entry = Array.isArray(list) ? list[Number(t[1])] : undefined;
		const id = entry && typeof entry === 'object' ? (entry as { id?: unknown }).id : undefined;
		const where = typeof id === 'string' ? featureLabel(id) : `Feature ${Number(t[1]) + 1}`;
		if (t.length === 2) return { where, what: '', unit: '' };
		// /features/<i>/stations/<j>[/r|/z]
		if (t[2] === 'stations') {
			if (t.length === 3) return { where, what: 'the station table', unit: '' };
			const n = Number(t[3]) + 1;
			if (t.length === 4) return { where, what: `station ${n}`, unit: '' };
			return { where, what: `station ${n} ${STATION_LABELS[t[4]] ?? t[4]}`, unit: 'in' };
		}
		return { where, what: fieldLabel(t[2]), unit: unitFor(t[2]) };
	}

	// /materials/<key> and the flat tree-level keys.
	const joined = t.join('/');
	if (TREE_LABELS[joined])
		return {
			where: t[0] === 'materials' || joined === 'rotation' ? 'Materials' : 'The part',
			what: TREE_LABELS[joined],
			unit: ''
		};
	if (t[0] === 'materials') return { where: 'Materials', what: fieldLabel(t[t.length - 1]), unit: '' };
	return { where: 'The part', what: fieldLabel(t[t.length - 1]), unit: '' };
}

/* -------------------------------------------------------------------------
 * 4. ONE ACTION, AS A SENTENCE
 * ---------------------------------------------------------------------- */

/** What one row says, split so a renderer can weight the two halves. */
export interface TimelineSentence {
	/** The thing that changed: "Hex Extension" or "Materials". */
	readonly where: string;
	/** What happened to it, in full: "Across flats 0.5 in to 0.62 in". */
	readonly what: string;
}

const withUnit = (value: string, unit: string): string => (unit && value !== 'nothing' ? `${value} ${unit}` : value);

/**
 * Turn one stored action into the sentence a student reads.
 *
 * THE FIVE KINDS ARE EXHAUSTIVE and each says a different thing, because they
 * ARE different things: `set` is a value moving, `insert` and `remove` are a
 * thing arriving or going, `move` is a reorder, `origin` is the part being
 * made. Collapsing them into "changed X" would make the most common row in the
 * log -- a number the student turned -- the least informative one on screen.
 */
export function describeAction(
	row: IdeacadHistoryRow,
	treeBefore: unknown,
	namer?: TimelineNamer
): TimelineSentence {
	const target = describeTarget(row.path, treeBefore);
	const label = target.what || target.where;
	/* The namer first, the raw reading second. A name never carries a unit --
	   "6061 aluminum 0.125 in" already has one in it. */
	const say = (v: unknown) => namer?.(row.path, v) ?? withUnit(readValue(v), target.unit);
	switch (row.kind) {
		case 'origin':
			return { where: 'Part created', what: 'This is as far back as the history goes.' };
		case 'set':
			return { where: target.where, what: `${label} ${say(row.before)} to ${say(row.after)}` };
		case 'insert':
			return { where: target.where, what: `Added ${label} (${say(row.after)})` };
		case 'remove':
			return { where: target.where, what: `Removed ${label} (${say(row.before)})` };
		case 'move': {
			const from = Number(row.before) + 1;
			const to = Number(row.after) + 1;
			return { where: target.where, what: `Moved position ${from} to position ${to}` };
		}
	}
}

/* -------------------------------------------------------------------------
 * 5. THE LIST
 * ---------------------------------------------------------------------- */

/**
 * Whether a row's effect is currently in the document.
 *
 * `applied` and `undone` are the DEPTH PARITY `foldHistory` computes -- even is
 * applied, odd is undone -- and the parity rule is 0189's, not a second reading
 * of it. `origin` is its own state because the creation of the part is neither
 * (it cannot be undone: `invertAction` refuses it and 0209's CHECK constraint
 * refuses it again). `broken` is a row this client could not replay.
 */
export type TimelineState = 'origin' | 'applied' | 'undone' | 'broken';

export interface TimelineEntry {
	readonly seq: number;
	readonly state: TimelineState;
	readonly sentence: TimelineSentence;
	/** The seq this row inverts, when it is an undo or a redo. */
	readonly undoesSeq: number | null;
	/** How deep in an inverse chain: 0 an edit, 1 an undo, 2 a redo, 3 an
	 *  undo of a redo. Rendered as a word, never as the number. */
	readonly depth: number;
	readonly actor: string | null;
	readonly at: string | null;
	/** True for the newest row an undo would invert -- the only "you are here"
	 *  mark the list carries, and it is not a cursor: it is the answer to
	 *  "what does Ctrl+Z do next", which is a fact about the fold. */
	readonly isUndoTarget: boolean;
	readonly isRedoTarget: boolean;
}

/** The word for an inverse chain's depth, which is what a row prints. */
export function depthWord(depth: number): string {
	if (depth === 0) return '';
	if (depth === 1) return 'Undid';
	if (depth === 2) return 'Redid';
	// Depth 3 is an undo of a redo, 4 a redo of that, and so on. Saying the
	// number is honest where inventing a fourth verb is not.
	return depth % 2 === 1 ? `Undid (step ${depth})` : `Redid (step ${depth})`;
}

export interface Timeline {
	readonly entries: readonly TimelineEntry[];
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	/** The newest seq, which is the scrub's right-hand end. */
	readonly newestSeq: number;
	/** The origin's seq, which is its left-hand end. Always 0 in practice, read
	 *  from the rows rather than assumed. */
	readonly originSeq: number;
}

const EMPTY: Timeline = { entries: [], canUndo: false, canRedo: false, newestSeq: 0, originSeq: 0 };

/**
 * The whole list, oldest first, named against the tree each row applied to.
 *
 * OLDEST FIRST IS THE ORDER SOLIDWORKS AND FUSION USE and it is the order the
 * part was built in, which is what "all the way back to the creation of the
 * part" means on screen: scroll UP to go back. The newest row is at the bottom,
 * where the student's attention already is.
 */
export function buildTimeline(rows: readonly IdeacadHistoryRow[], namer?: TimelineNamer): Timeline {
	if (rows.length === 0) return EMPTY;
	const fold = foldHistory(rows);
	const ordered = [...rows].sort((a, b) => a.seq - b.seq);
	const origin = ordered.find((r) => r.kind === 'origin');
	if (!origin) return EMPTY;

	const entries: TimelineEntry[] = [];
	let tree: unknown = null;
	let walkable = true;
	for (const row of ordered) {
		const depth = fold.depth.get(row.seq) ?? 0;
		let sentence: TimelineSentence;
		let state: TimelineState;
		if (!walkable) {
			// THE TREE STOPPED BEING TRUE, so every later name would be a guess
			// dressed as a fact. Saying so once per row is worse than the row
			// carrying no name, so the row keeps its sentence-shaped shell and
			// says what it can: the kind and the seq.
			sentence = { where: 'Change', what: `Step ${row.seq}` };
			state = 'broken';
		} else {
			try {
				sentence = describeAction(row, tree, namer);
				state =
					row.kind === 'origin' ? 'origin' : depth % 2 === 0 ? 'applied' : 'undone';
				tree = stateAt(ordered, row.seq);
			} catch {
				sentence = { where: 'Change', what: `Step ${row.seq}` };
				state = 'broken';
				walkable = false;
			}
		}
		entries.push({
			seq: row.seq,
			state,
			sentence,
			undoesSeq: row.undoesSeq ?? null,
			depth,
			actor: row.actor ?? null,
			at: row.at ?? null,
			isUndoTarget: fold.undoTarget?.seq === row.seq,
			isRedoTarget: fold.redoTarget?.seq === row.seq
		});
	}
	return {
		entries,
		canUndo: fold.canUndo,
		canRedo: fold.canRedo,
		newestSeq: ordered[ordered.length - 1].seq,
		originSeq: origin.seq
	};
}

/* -------------------------------------------------------------------------
 * 6. THE KEYSTROKES
 * ---------------------------------------------------------------------- */

/**
 * `Ctrl+Z` UNDO, `Ctrl+Y` AND `Ctrl+Shift+Z` REDO.
 *
 * MOVED VERBATIM FROM `ui/undo.ts` (0171) WHEN THAT FILE WAS RETIRED. The
 * in-memory `UndoStack` beside it is gone -- undo and redo drive the durable
 * log now, so they survive a reload -- but what the KEYS mean did not change
 * and re-deciding it would have been a second answer to a settled question.
 *
 * The second redo spelling is here because it is what half the world presses,
 * and because the viewport's own `Ctrl+Shift+Z` (Previous view) already calls
 * `preventDefault` on its own element, so a keystroke aimed at the graphics
 * area has been claimed before this is asked. `defaultPrevented` is the
 * discriminator and it is the CALLER's to check; this answers only what the
 * keys say.
 */
export type UndoKey = 'undo' | 'redo' | null;

export function undoKeyFor(
	e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
): UndoKey {
	if (!e.ctrlKey && !e.metaKey) return null;
	const k = e.key.toLowerCase();
	if (k === 'y') return 'redo';
	if (k === 'z') return e.shiftKey ? 'redo' : 'undo';
	return null;
}

/* -------------------------------------------------------------------------
 * 7. THE WORDS
 * ---------------------------------------------------------------------- */

/** Every sentence the timeline shows, in one place, so none is typed twice. */
export const TIMELINE_WORDS = {
	heading: 'History',
	/** WHY A LIST WITH NO CURSOR NEEDS EXPLAINING. A student who knows other CAD
	 *  expects an undone step to vanish; here it stays, and saying so once is
	 *  cheaper than a student concluding the list is broken. */
	note: 'Every change you have made, oldest first. Undo adds a step here, it never removes one.',
	empty: 'Nothing yet. Your first change will show up here.',
	off: 'History is not switched on for this part.',
	undo: 'Undo',
	redo: 'Redo',
	nothingToUndo: 'There is nothing to undo.',
	nothingToRedo: 'There is nothing to redo.',
	/** THE SCRUB IS A LOOK, NOT A CHANGE, and it says so where the student is
	 *  looking. Committing to a past state is undo pressed until it is reached,
	 *  which is what keeps the log append-only. */
	previewing: 'Looking at an earlier step. Nothing has changed.',
	back: 'Back to now',
	broken: 'This step cannot be read by this editor.'
} as const;

/** The clock time a row was written, in the student's own locale, or ''. */
export function timelineTime(at: string | null): string {
	if (!at) return '';
	const d = new Date(at);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
