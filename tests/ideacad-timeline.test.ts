/**
 * THE TIMELINE'S ARITHMETIC: what a row SAYS, and that a scrub agrees both ways.
 *
 * TWO CLAIMS LIVE HERE AND THEY FAIL DIFFERENTLY.
 *
 * The first is that a row is READABLE. `/features/1/acrossFlats` is what
 * replays and is not what a fifteen-year-old reads, so every row is named
 * against the tree the action applied to. That one fails VISIBLY -- a student
 * opens the history and sees pointers -- which is why most of it is asserted in
 * the browser pass rather than here, and what IS here is the half a browser
 * cannot see: that the name is taken from the tree AS IT WAS, so a feature
 * reordered later does not rewrite what every earlier row claims to be about.
 *
 * The second is that SCRUBBING AND UNDOING BACK LAND IN THE SAME PLACE. That
 * one fails SILENTLY and is the reason this file exists: a student scrubs to
 * step 40, decides they want it, presses undo until they get there, and lands
 * somewhere else. 0189 proved `stateAt` against `unwindTo` over its 360-action
 * corpus; the prompt for this bundle asked that the SCRUB be held to the same
 * standard, which means proving it over the seq the TIMELINE hands a caller
 * rather than over an index into a row array. They are the same number in a log
 * with no holes and different numbers in one with any -- and a paged read, a
 * deleted concept and a shared document all produce logs this client did not
 * allocate the seqs of.
 */
import { describe, expect, it } from 'vitest';
import {
	diffTrees,
	stateAt,
	unwindTo,
	type IdeacadHistoryRow
} from '../src/lib/ideacad/history';
import {
	ACTOR_WORDS,
	buildTimeline,
	depthWord,
	describeTarget,
	readValue,
	timelineActors,
	undoKeyFor,
	type TimelineEntry
} from '../src/lib/ideacad/ui/timeline';
import { bladeCorpus, CORPUS_ORIGIN } from './ideacad-history-corpus';
import type { BladeTree } from '../src/lib/ideacad/blade/tree';

/* -------------------------------------------------------------------------
 * A log built by the REAL diff, the way the store builds one.
 * ---------------------------------------------------------------------- */

/**
 * THE ROWS COME OUT OF `diffTrees` AND NOT OUT OF THIS FILE.
 *
 * A hand-written row is a claim about what the diff emits, and the namer's
 * whole job is reading what the diff emitted -- so a fixture the producer
 * cannot emit would let the namer pass over a pointer shape that never occurs,
 * while the shapes that DO occur went unread. `tests/ideacad-history-corpus.ts`
 * is the same argument one layer down and imports nothing from `history.ts`.
 */
function logFrom(steps: { before: BladeTree; after: BladeTree }[], firstSeq = 1): IdeacadHistoryRow[] {
	const rows: IdeacadHistoryRow[] = [
		{ seq: 0, kind: 'origin', path: '', before: null, after: steps[0].before }
	];
	let seq = firstSeq;
	for (const step of steps)
		for (const action of diffTrees(step.before, step.after)) rows.push({ ...action, seq: seq++ });
	return rows;
}

const edit = (change: (t: BladeTree) => void, from: BladeTree) => {
	const after = JSON.parse(JSON.stringify(from)) as BladeTree;
	change(after);
	return { before: from, after };
};

describe('a row says what changed, in the words the controls use', () => {
	it('names a feature parameter by the label the PropertyManager draws', () => {
		const a = edit((t) => {
			const hex = t.features.find((f) => f.type === 'hexBoss');
			if (hex && hex.type === 'hexBoss') hex.height = 0.75;
		}, JSON.parse(JSON.stringify(CORPUS_ORIGIN)) as BladeTree);
		const t = buildTimeline(logFrom([a]));
		const row = t.entries[1];
		expect(row.sentence.where).toBe('Hex Extension');
		// The label is `feature-model.ts`'s own, which is the one the control
		// carries -- not a second string written for this surface.
		expect(row.sentence.what).toContain('Extension height');
		expect(row.sentence.what).toContain('to 0.75 in');
	});

	it('never puts a JSON pointer on screen, for any row the real diff emits', () => {
		const rows = logFrom(bladeCorpus(120, 4242));
		const t = buildTimeline(rows);
		expect(t.entries.length).toBe(rows.length);
		for (const e of t.entries) {
			const said = `${e.sentence.where} ${e.sentence.what}`;
			expect(said).not.toMatch(/\/features\//);
			expect(said).not.toMatch(/\/materials\//);
			expect(said).not.toMatch(/~[01]/);
			expect(said.trim().length).toBeGreaterThan(0);
		}
		// A POSITIVE CONTROL: the sweep above is only worth anything if these
		// rows really do carry pointers underneath. Without it, a corpus that
		// generated nothing would pass the same way.
		expect(rows.some((r) => r.path.startsWith('/features/'))).toBe(true);
	});

	it('names a station by its row in the table, not by its index in a pointer', () => {
		const a = edit((t) => {
			const body = t.features.find((f) => f.type === 'revolve');
			if (body && body.type === 'revolve') body.stations[2] = { ...body.stations[2], r: 0.9 };
		}, JSON.parse(JSON.stringify(CORPUS_ORIGIN)) as BladeTree);
		const row = buildTimeline(logFrom([a])).entries[1];
		expect(row.sentence.where).toBe('Body Revolve');
		// One-based, because the table a student reads is one-based.
		expect(row.sentence.what).toContain('station 3 radius');
	});

	it('reads a stored rotation as the word the picker shows', () => {
		expect(readValue('ccw')).toBe('counter-clockwise');
		expect(readValue('cw')).toBe('clockwise');
	});

	it('rounds for reading and does not report a float artefact as a decision', () => {
		expect(readValue(0.1 + 0.2)).toBe('0.3');
		expect(readValue(0.5)).toBe('0.5');
		expect(readValue(null)).toBe('nothing');
	});

	/**
	 * THE ONE A POINTER-TO-NAME TABLE GETS WRONG. `/features/1` means whatever
	 * sat at index 1 AT THAT MOMENT; a reorder later does not retroactively
	 * change what an earlier row was about, and naming every row against the
	 * CURRENT tree would say it did.
	 */
	it('names a row against the tree it applied to, not against the tree today', () => {
		const origin = JSON.parse(JSON.stringify(CORPUS_ORIGIN)) as BladeTree;
		const one = edit((t) => {
			const hex = t.features.find((f) => f.type === 'hexBoss');
			if (hex && hex.type === 'hexBoss') hex.height = 0.8;
		}, origin);
		// Now move the hex to the front, which changes what index 1 means.
		const two = edit((t) => {
			const i = t.features.findIndex((f) => f.type === 'hexBoss');
			const [f] = t.features.splice(i, 1);
			t.features.unshift(f);
		}, one.after);
		const t = buildTimeline(logFrom([one, two]));
		expect(t.entries[1].sentence.where).toBe('Hex Extension');
		const later = edit((t2) => {
			const hex = t2.features.find((f) => f.type === 'hexBoss');
			if (hex && hex.type === 'hexBoss') hex.height = 0.9;
		}, two.after);
		const t2 = buildTimeline(logFrom([one, two, later]));
		// The SAME early row still says Hex Extension, and the later one does
		// too, even though the two rows carry different pointers.
		expect(t2.entries[1].sentence.where).toBe('Hex Extension');
		expect(t2.entries[t2.entries.length - 1].sentence.where).toBe('Hex Extension');
	});

	it('says the origin is as far back as it goes, and the origin can never be undone', () => {
		const t = buildTimeline(logFrom([edit((x) => (x.rotation = 'ccw'), JSON.parse(JSON.stringify(CORPUS_ORIGIN)) as BladeTree)]));
		expect(t.entries[0].state).toBe('origin');
		expect(t.entries[0].sentence.where).toBe('Part created');
		expect(t.entries[0].isUndoTarget).toBe(false);
	});

	it('falls back to a readable shell rather than throwing on a log it cannot replay', () => {
		// A pointer into a container that is not there. `history.ts` refuses this
		// LOUDLY and is right to; a refusal inside a LABEL is a blank editor.
		const rows: IdeacadHistoryRow[] = [
			{ seq: 0, kind: 'origin', path: '', before: null, after: { a: 1 } },
			{ seq: 1, kind: 'set', path: '/nope/deep/deeper', before: 1, after: 2 }
		];
		const t = buildTimeline(rows);
		expect(t.entries).toHaveLength(2);
		expect(t.entries[1].state).toBe('broken');
		expect(t.entries[1].sentence.what).toContain('1');
	});
});

describe('the list has no cursor in it', () => {
	const origin = JSON.parse(JSON.stringify(CORPUS_ORIGIN)) as BladeTree;
	const one = edit((t) => (t.rotation = 'ccw'), origin);
	const two = edit((t) => {
		const p = t.features.find((f) => f.type === 'circularPattern');
		if (p && p.type === 'circularPattern') p.count = 5;
	}, one.after);

	/** Press undo the way the store does: fold, invert, append. */
	const press = (rows: IdeacadHistoryRow[], which: 'undo' | 'redo'): IdeacadHistoryRow[] => {
		const t = buildTimeline(rows);
		const target = rows.find((r) => r.seq === (which === 'undo' ? t.entries.find((e) => e.isUndoTarget)?.seq : t.entries.find((e) => e.isRedoTarget)?.seq));
		if (!target) throw new Error(`nothing to ${which}`);
		const seq = Math.max(...rows.map((r) => r.seq)) + 1;
		const inverted: IdeacadHistoryRow =
			target.kind === 'set'
				? { seq, kind: 'set', path: target.path, before: target.after, after: target.before, undoesSeq: target.seq }
				: (() => {
						throw new Error('this fixture only presses on set rows');
					})();
		return [...rows, inverted];
	};

	/**
	 * 0189'S PRICE, ON SCREEN. Four presses over two edits leave SIX rows and
	 * the timeline renders all six -- nothing is greyed out as "ahead of" a
	 * position and nothing is removed. A UI implying a cursor is what this
	 * asserts against.
	 */
	it('grows by one row per press and never shrinks', () => {
		let rows = logFrom([one, two]);
		const started = rows.length;
		expect(buildTimeline(rows).entries).toHaveLength(started);
		rows = press(rows, 'undo');
		rows = press(rows, 'redo');
		rows = press(rows, 'undo');
		rows = press(rows, 'redo');
		expect(rows).toHaveLength(started + 4);
		expect(buildTimeline(rows).entries).toHaveLength(started + 4);
	});

	/**
	 * DEPTH 3 IS THE CASE 0189 GOT WRONG FIRST and the shallow rule strands the
	 * student's work one press away. The timeline reads the parity through
	 * `foldHistory` rather than re-deciding it, and this walks press by press
	 * because an end-state assertion passes on a fold that was wrong in the
	 * middle and happened to come back.
	 */
	it('keeps a redo available after undo, redo, undo -- the depth-3 case', () => {
		let rows = logFrom([one, two]);
		rows = press(rows, 'undo');
		expect(buildTimeline(rows).canRedo).toBe(true);
		rows = press(rows, 'redo');
		expect(buildTimeline(rows).canUndo).toBe(true);
		rows = press(rows, 'undo');
		const t = buildTimeline(rows);
		expect(t.canRedo).toBe(true);
		// And the row it points at is the depth-2 redo, not the depth-0 edit.
		const redo = t.entries.find((e) => e.isRedoTarget);
		expect(redo?.depth).toBe(3);
	});

	it('gives an undone step its own state and its own word, so colour is never the only signal', () => {
		let rows = logFrom([one, two]);
		rows = press(rows, 'undo');
		const t = buildTimeline(rows);
		expect(t.entries.some((e) => e.state === 'undone')).toBe(true);
		expect(depthWord(1)).toBe('Undid');
		expect(depthWord(2)).toBe('Redid');
		expect(depthWord(0)).toBe('');
		// Depth 3 says the number rather than inventing a fourth verb.
		expect(depthWord(3)).toContain('Undid');
		expect(depthWord(3)).toContain('3');
	});
});

/* =========================================================================
 * THE SCRUB AGREES BOTH WAYS
 * ====================================================================== */

describe('scrubbing to a step and undoing back to it land in the same document', () => {
	/**
	 * THE FULL CORPUS, EVERY POINT, BY SEQ.
	 *
	 * 0189 compared `stateAt` against `unwindTo` at every point of a 360-action
	 * corpus. This is that comparison driven through the TIMELINE's own seqs --
	 * the number a row hands a caller when it is clicked -- which is the number
	 * the scrub actually uses. In a log this client allocated they coincide with
	 * array indices; in a paged read, a shared document or a concept whose log
	 * this client did not write, they do not, and an off-by-one between the two
	 * is a scrub that shows the wrong step with nothing on screen to say so.
	 */
	it('agrees at every seq the timeline offers, over the real corpus', () => {
		const rows = logFrom(bladeCorpus(220, 20260912));
		const t = buildTimeline(rows);
		const current = stateAt<BladeTree>(rows);
		expect(t.entries).toHaveLength(rows.length);
		let compared = 0;
		for (const entry of t.entries) {
			const forward = stateAt<BladeTree>(rows, entry.seq);
			const backward = unwindTo<BladeTree>(current, rows, entry.seq);
			expect(backward).toEqual(forward);
			compared += 1;
		}
		// THE CASE COUNT, so a sweep that generated nothing cannot pass.
		expect(compared).toBe(rows.length);
		expect(compared).toBeGreaterThan(300);
	});

	it('replaying the whole log still equals the tree the corpus left', () => {
		const steps = bladeCorpus(220, 20260912);
		const rows = logFrom(steps);
		// The expected value comes from the plain mutator, which imports nothing
		// from `history.ts` -- so the two sides meet only here.
		expect(stateAt<BladeTree>(rows)).toEqual(steps[steps.length - 1].after);
	});

	it('scrubbing to the newest seq is the document as it stands', () => {
		const rows = logFrom(bladeCorpus(40, 7));
		const t = buildTimeline(rows);
		expect(stateAt<BladeTree>(rows, t.newestSeq)).toEqual(stateAt<BladeTree>(rows));
	});

	it('scrubbing to the origin seq is the part as it was created', () => {
		const rows = logFrom(bladeCorpus(40, 7));
		const t = buildTimeline(rows);
		expect(stateAt<BladeTree>(rows, t.originSeq)).toEqual(rows[0].after);
	});

	/**
	 * A LOG WITH A HOLE IN ITS SEQS, which is what a paged read and a
	 * multi-editor document both produce. The index and the seq are different
	 * numbers here, so a scrub written against the index shows the wrong step.
	 */
	it('uses the seq and not the array index, on a log whose seqs are not 0..n', () => {
		const dense = logFrom(bladeCorpus(12, 99));
		const sparse = dense.map((r, i) => ({ ...r, seq: i === 0 ? 0 : r.seq * 10 }));
		const t = buildTimeline(sparse);
		const current = stateAt<BladeTree>(sparse);
		expect(t.entries.map((e) => e.seq)).toEqual(sparse.map((r) => r.seq));
		for (const entry of t.entries)
			expect(unwindTo<BladeTree>(current, sparse, entry.seq)).toEqual(
				stateAt<BladeTree>(sparse, entry.seq)
			);
		// The positive control that the seqs really are sparse.
		expect(t.newestSeq).toBeGreaterThan(sparse.length);
	});
});

describe('the keystroke map, unchanged by the retirement of ui/undo.ts', () => {
	const ev = (key: string, mods: Partial<KeyboardEvent> = {}) => ({
		key,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		...mods
	});
	it('reads Ctrl+Z as undo and both redo spellings as redo', () => {
		expect(undoKeyFor(ev('z', { ctrlKey: true }))).toBe('undo');
		expect(undoKeyFor(ev('y', { ctrlKey: true }))).toBe('redo');
		expect(undoKeyFor(ev('z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
		expect(undoKeyFor(ev('z', { metaKey: true }))).toBe('undo');
		expect(undoKeyFor(ev('z'))).toBeNull();
	});
});

describe('describeTarget on the shapes the tree actually has', () => {
	const tree = CORPUS_ORIGIN as unknown;
	it('names the materials area rather than the pointer into it', () => {
		expect(describeTarget('/materials/bladeStock', tree)).toEqual({
			where: 'Materials',
			what: 'Blade stock',
			unit: ''
		});
	});
	it('names a tree-level setting', () => {
		expect(describeTarget('/rotation', tree).what).toBe('Spin direction');
	});
	it('answers for the empty pointer, which only the origin uses', () => {
		expect(describeTarget('', tree).where).toBe('The whole part');
	});
	it('falls back to a positional name rather than throwing on a feature index that is not there', () => {
		expect(describeTarget('/features/99/count', tree).where).toBe('Feature 100');
	});
});

/* -------------------------------------------------------------------------
 * WHO MADE AN EDIT -- decision 27.
 *
 * THE ACTOR VALUES HERE ARE THE ONES `0209` CAN ACTUALLY WRITE, and that is
 * the whole reason this block exists in the shape it does. The migration has
 * exactly three producers: `current_user_email()` (an address), the literal
 * `system` (a definer path with no session), and the literal `migration:0209`
 * (its own backfill). The dev harness used to seed `'you'` and `'A. Reyes'` --
 * strings nothing can produce, which already read like names, which is why a
 * surface printing its actor RAW passed sixty browser measurements.
 * ---------------------------------------------------------------------- */

/** A row carrying only what the namer reads, so a case is one line. */
function actorRow(seq: number, actor: string | null): TimelineEntry {
	return {
		seq,
		state: 'applied',
		sentence: { where: 'x', what: 'y', unit: '' },
		undoesSeq: null,
		depth: 0,
		actor,
		at: null,
		isUndoTarget: false,
		isRedoTarget: false
	} as TimelineEntry;
}
const label = (rows: TimelineEntry[], viewer: string | null, actor: string) =>
	timelineActors(rows, viewer).get(actor)?.label;

describe('timelineActors: who made an edit', () => {
	const VIEWER = 'a.pina@boscotech.net';
	const PARTNER = 'm.reyes@boscotech.net';

	it('says "You" for the reader and a name for everybody else', () => {
		const rows = [actorRow(1, VIEWER), actorRow(2, PARTNER)];
		expect(label(rows, VIEWER, VIEWER)).toBe(ACTOR_WORDS.you);
		expect(label(rows, VIEWER, PARTNER)).toBe('M Reyes');
	});

	it('NEVER prints a bare address for a person, which is the defect', () => {
		const rows = [actorRow(1, VIEWER), actorRow(2, PARTNER)];
		const actors = timelineActors(rows, VIEWER);
		for (const [, who] of actors) expect(who.label).not.toContain('@');
	});

	it('renders two authors DISTINGUISHABLY, which is the point of decision 27', () => {
		const rows = [actorRow(1, VIEWER), actorRow(2, PARTNER)];
		const actors = timelineActors(rows, VIEWER);
		const labels = [...actors.values()].map((a) => a.label);
		expect(new Set(labels).size).toBe(labels.length);
		// And distinguishable by something other than colour: the words differ.
		expect(actors.get(VIEWER)!.isViewer).toBe(true);
		expect(actors.get(PARTNER)!.isViewer).toBe(false);
	});

	it('refuses to name a non-person as a classmate', () => {
		// Both values `0209` writes that are not addresses.
		for (const value of ['system', 'migration:0209']) {
			const rows = [actorRow(0, value), actorRow(1, VIEWER)];
			const who = timelineActors(rows, VIEWER).get(value)!;
			expect(who.label).toBe(ACTOR_WORDS.system);
			expect(who.isSystem).toBe(true);
			expect(who.isViewer).toBe(false);
			// The backfill's own value never reaches the screen: claiming a
			// student made the part is what `0209` refused to write.
			expect(who.label).not.toContain('0209');
		}
	});

	it('falls back to the full address when two actors share a local part', () => {
		// The case this school actually has: staff on `.edu` and students on
		// `.net`, issued off the same name.
		const staff = 'a.pina@boscotech.edu';
		const student = 'a.pina@boscotech.net';
		const rows = [actorRow(1, staff), actorRow(2, student), actorRow(3, PARTNER)];
		const actors = timelineActors(rows, null);
		expect(actors.get(staff)!.label).toBe(staff);
		expect(actors.get(student)!.label).toBe(student);
		// An actor whose local part is unique is unaffected by somebody else's
		// collision.
		expect(actors.get(PARTNER)!.label).toBe('M Reyes');
	});

	it('counts the READER into the collision set, so their own short name is never on somebody else', () => {
		const staff = 'a.pina@boscotech.edu';
		const student = 'a.pina@boscotech.net';
		const rows = [actorRow(1, staff), actorRow(2, student)];
		const actors = timelineActors(rows, staff);
		expect(actors.get(staff)!.label).toBe(ACTOR_WORDS.you);
		// THE ROW THAT MATTERS: the other `a.pina` must not render as `a.pina`,
		// which the reader would read as their own edit.
		expect(actors.get(student)!.label).toBe(student);
	});

	it('nobody is "You" when there is no viewer, and every row still names its actor', () => {
		const rows = [actorRow(1, VIEWER), actorRow(2, PARTNER)];
		const actors = timelineActors(rows, null);
		expect([...actors.values()].some((a) => a.isViewer)).toBe(false);
		expect(actors.get(VIEWER)!.label).toBe('A Pina');
		expect(actors.get(PARTNER)!.label).toBe('M Reyes');
		for (const [, who] of actors) expect(who.label.length).toBeGreaterThan(0);
	});

	it('matches the reader case- and whitespace-insensitively, the way the database keys a grant', () => {
		const rows = [actorRow(1, '  A.Pina@BoscoTech.NET ')];
		const actors = timelineActors(rows, VIEWER.toUpperCase());
		expect(actors.get('A.Pina@BoscoTech.NET')!.label).toBe(ACTOR_WORDS.you);
	});

	it('has nothing to say about a row with no actor, rather than inventing one', () => {
		const actors = timelineActors([actorRow(1, null), actorRow(2, '   ')], VIEWER);
		expect(actors.size).toBe(0);
	});

	it('keeps the stored value verbatim, so nothing downstream has to re-derive it', () => {
		const rows = [actorRow(1, PARTNER)];
		expect(timelineActors(rows, VIEWER).get(PARTNER)!.stored).toBe(PARTNER);
	});

	it('resolves every actor a REAL log produced', () => {
		// THE ROWS COME OUT OF THE REAL DIFF, like every other case in this
		// file: a namer proven over hand-written rows is proven over rows
		// nothing emits.
		const rows = logFrom(bladeCorpus(40, 91)).map((r, i) => ({
			...r,
			actor: i % 2 === 0 ? VIEWER : PARTNER
		}));
		const entries = buildTimeline(rows).entries;
		const actors = timelineActors(entries, VIEWER);
		expect(actors.size).toBe(2);
		for (const e of entries) expect(actors.get(e.actor!)).toBeTruthy();
	});
});
