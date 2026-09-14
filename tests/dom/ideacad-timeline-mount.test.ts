// tests/dom/ideacad-timeline-mount.test.ts
//
// THE HISTORY TIMELINE, DRIVEN AGAINST THE REAL `BladeEditor`.
//
// `tests/ideacad-timeline.test.ts` proves the arithmetic with nothing mounted.
// What is here is the half that only exists once the component is wired: the
// control REPLACING the feature tree in the same pane rather than appearing
// below it, a scrub that moves the readouts without moving the document, and
// the transport absences that make a viewer's timeline read-only STRUCTURALLY
// rather than by a flag.
//
// BOTH DIRECTIONS ON EVERY GATING CLAIM. "The read-only timeline has no Undo"
// is not a result; the counts with the transports handed in, beside the counts
// without, are. Every absence assertion in this file has its positive control
// in the same `it`.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, any ratio, any tap
// target, and above all WHETHER A ROW IS ABOVE OR BELOW A FOLD. happy-dom has
// no layout engine, so every one of those reads zero and passes vacuously
// (`tests/dom/README.md`) -- and the fold is exactly the defect ledger 0171
// shipped on this rail. It is measured against a real Chromium in
// `tools/browser-verify/routes/ideacad-role-student-state-history.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import { diffTrees, stateAt, type IdeacadHistoryRow } from '$lib/ideacad/history';
import type { BladeTree } from '$lib/ideacad/blade/tree';
import { mountInto } from './mount';

const Editor = BladeEditor as unknown as Component<Record<string, unknown>>;

/**
 * WHO THE FIXTURE'S ROWS BELONG TO (decision 27).
 *
 * THEY ARE ADDRESSES BECAUSE `0209` STORES ADDRESSES. This fixture used to name
 * its actor with a word nothing can write: `actor` is `current_user_email()`,
 * or the literal `system`, or the literal `migration:0209`. A made-up value
 * that already reads like a name is exactly how a surface printing its actor
 * RAW stayed invisible to every check on this file.
 */
const VIEWER = 'a.pina@boscotech.net';
const PARTNER = 'm.reyes@boscotech.net';

/**
 * THE LOG IS BUILT BY THE REAL DIFF, which is what `store.edit` runs. A
 * hand-written row is a claim about what the diff emits, and this surface's
 * whole job is reading what it emitted.
 */
function log(): IdeacadHistoryRow[] {
	const origin = structuredClone(DEFAULT_BLADE_TREE) as BladeTree;
	const rows: IdeacadHistoryRow[] = [
		{ seq: 0, kind: 'origin', path: '', before: null, after: origin, actor: VIEWER, at: '2026-09-13T15:00:00Z' }
	];
	let at = structuredClone(origin);
	let seq = 1;
	const edit = (change: (t: BladeTree) => void) => {
		const next = structuredClone(at);
		change(next);
		for (const action of diffTrees(at, next)) rows.push({ ...action, seq: seq++, actor: VIEWER });
		at = next;
	};
	edit((t) => {
		const hex = t.features.find((f) => f.type === 'hexBoss');
		if (hex && hex.type === 'hexBoss') hex.height = 0.75;
	});
	edit((t) => {
		const p = t.features.find((f) => f.type === 'circularPattern');
		if (p && p.type === 'circularPattern') p.count = 4;
	});
	edit((t) => (t.rotation = 'ccw'));
	return rows;
}

/** The same log with the newest row undone, so an `undone` state is on screen. */
function logWithUndo(): IdeacadHistoryRow[] {
	const rows = log();
	const target = rows[rows.length - 1];
	return [
		...rows,
		{
			seq: target.seq + 1,
			kind: 'set',
			path: target.path,
			before: target.after,
			after: target.before,
			undoesSeq: target.seq,
			actor: VIEWER
		}
	];
}

function logWithDivergedRedo(): IdeacadHistoryRow[] {
	const rows = logWithUndo();
	return [
		...rows,
		{
			seq: rows[rows.length - 1].seq + 1,
			kind: 'set',
			path: '/rotation',
			before: 'cw',
			after: 'ccw',
			actor: VIEWER
		}
	];
}

/* Every mount is unmounted even when its test throws: `BladeEditor` listens for
   its undo keystrokes on the DOCUMENT, so a mount left standing keeps claiming
   them and reddens unrelated keyboard tests in other files. */
const live: { stop(): Promise<void> }[] = [];
afterEach(async () => {
	while (live.length) await live.pop()!.stop();
});

function open(props: Record<string, unknown> = {}) {
	/* THE EDITOR OPENS ON THE TREE THE LOG ENDS AT, which is what the real page
	   does -- the concept row and its history describe one document. Mounting
	   the ORIGIN beside a log of three edits would make "scrub to step 0" and
	   "now" the same tree, so every scrub assertion would pass vacuously on a
	   scrub that did nothing at all. */
	const rows = (props.history as IdeacadHistoryRow[] | undefined) ?? log();
	const m = mountInto(Editor, {
		tree: rows.length ? stateAt<BladeTree>(rows) : DEFAULT_BLADE_TREE,
		config: DEFAULT_BLADE_CONFIG,
		history: rows,
		...props
	});
	live.push(m);
	return m;
}

type M = ReturnType<typeof open>;

const toggle = (m: M) => m.all<HTMLButtonElement>('[data-testid="ideacad-history-toggle"]')[0];
const rows = (m: M) => m.all('[data-testid="ideacad-timeline-row"]');
const open_ = (m: M) => {
	toggle(m).click();
	m.flush();
};
const treeRows = (m: M) => m.all('.tree [role="treeitem"]');
const text = (m: M) => m.all('[data-testid="ideacad-timeline"]')[0]?.textContent ?? '';
const mass = (m: M) => m.all('.readouts .metric strong')[3]?.textContent ?? '';

describe('the toggle, and the pane it takes over', () => {
	it('offers no History control at all when the log is empty', () => {
		const m = open({ history: [] });
		expect(m.all('[data-testid="ideacad-history-toggle"]')).toHaveLength(0);
		// The positive control: the SAME mount with a log has one.
		const n = open();
		expect(n.all('[data-testid="ideacad-history-toggle"]')).toHaveLength(1);
	});

	it('REPLACES the feature tree rather than rendering below it', () => {
		const m = open();
		const before = treeRows(m).length;
		expect(before).toBeGreaterThan(0);
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(0);
		open_(m);
		// The timeline is in, and the tree is GONE -- not hidden beside it, which
		// is the arrangement a content check cannot tell from this one.
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(1);
		expect(treeRows(m)).toHaveLength(0);
		// And back again.
		toggle(m).click();
		m.flush();
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(0);
		expect(treeRows(m)).toHaveLength(before);
	});

	it('renames the pane so a screen reader is told which of the four it is', () => {
		const m = open();
		expect(m.one('.tree').getAttribute('aria-label')).toBe('FeatureManager');
		open_(m);
		expect(m.one('.tree').getAttribute('aria-label')).toBe('History');
	});

	it('says how many steps there are, because no scrollbar is painted to say it', () => {
		const m = open();
		open_(m);
		const n = log().length;
		expect(m.one('[data-testid="ideacad-timeline-count"]').textContent).toBe(`${n} steps`);
		expect(rows(m)).toHaveLength(n);
	});
});

describe('a row says what changed, not where', () => {
	it('names the part and the parameter in the words the controls use', () => {
		const m = open();
		open_(m);
		const said = text(m);
		expect(said).toContain('Hex Extension');
		expect(said).toContain('Extension height');
		expect(said).toContain('Part created');
		expect(said).toContain('Spin direction');
		// The word the picker shows, not the value the column stores.
		expect(said).toContain('counter-clockwise');
	});

	it('puts no JSON pointer on screen, against a positive control that the rows carry one', () => {
		const m = open();
		open_(m);
		expect(text(m)).not.toMatch(/\/features\//);
		expect(text(m)).not.toMatch(/\/materials\//);
		// The control: these rows really do carry pointers underneath, so the
		// absence above is a fact about the rendering rather than about the log.
		expect(log().some((r) => r.path.startsWith('/features/'))).toBe(true);
	});

	it('lists every step oldest first, with the origin at the top', () => {
		const m = open();
		open_(m);
		const seqs = rows(m).map((r) => Number(r.getAttribute('data-seq')));
		expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
		expect(rows(m)[0].getAttribute('data-state')).toBe('origin');
	});
});

describe('the list has no cursor in it', () => {
	it('keeps an undone step on screen, with its own word and its own state', () => {
		const m = open({ history: logWithUndo() });
		open_(m);
		// SIX presses leave six rows: nothing is removed and nothing is greyed
		// out as "ahead of" a position.
		expect(rows(m)).toHaveLength(logWithUndo().length);
		expect(m.all('[data-state="undone"]').length).toBeGreaterThan(0);
		// The WORD, so colour is never the only signal.
		expect(text(m)).toContain('undone');
		expect(text(m)).toContain('Undid');
		// The positive control: the log WITHOUT the undo has neither.
		const n = open();
		open_(n);
		expect(n.all('[data-state="undone"]')).toHaveLength(0);
	});

	it('marks what Ctrl+Z would do next, which is a fold and not a position', () => {
		const m = open({ undoStep: async () => {}, redoStep: async () => {} });
		open_(m);
		const next = m.all('.row.next');
		expect(next).toHaveLength(1);
		// It is the NEWEST live row, which is the last one here.
		expect(next[0].getAttribute('data-seq')).toBe(String(log()[log().length - 1].seq));
	});
});

describe('undo and redo are transports, and absence removes them', () => {
	it('draws neither control without the transports, and both with them', () => {
		const bare = open();
		open_(bare);
		expect(bare.all('[data-testid="ideacad-timeline-undo"]')).toHaveLength(0);
		expect(bare.all('[data-testid="ideacad-timeline-redo"]')).toHaveLength(0);
		// The header pair is absent too, which is the other place they live.
		expect(bare.all<HTMLButtonElement>('button.hist').filter((b) => b.textContent?.trim() === 'Undo')).toHaveLength(0);

		const wired = open({ undoStep: async () => {}, redoStep: async () => {} });
		open_(wired);
		expect(wired.all('[data-testid="ideacad-timeline-undo"]')).toHaveLength(1);
		expect(wired.all('[data-testid="ideacad-timeline-redo"]')).toHaveLength(1);
		expect(wired.all<HTMLButtonElement>('button.hist').filter((b) => b.textContent?.trim() === 'Undo')).toHaveLength(1);
	});

	/**
	 * READ-ONLY IS TWO LAYERS AND BOTH ARE ASSERTED, which is the rule for
	 * defence in depth: a mutation proof that opens one layer and stays green
	 * has proved nothing about the other. The CONTROL is absent from the markup
	 * (`{#if undoStep && !readOnly}`), and the PREDICATE behind it answers false
	 * (`canUndo`), and the handler refuses a third time. The test below reads the
	 * markup layer; this one reads the predicate through the only surface that
	 * exposes it, which is whether pressing does anything.
	 */
	it('refuses the write even if a control reached a read-only viewer', () => {
		let undid = 0;
		const m = open({ readOnly: true, undoStep: async () => void undid++ });
		// The keystroke path is the one that does not go through the markup gate
		// at all, so it is the layer a missing `!readOnly` in the predicate would
		// otherwise reach.
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
		m.flush();
		expect(undid).toBe(0);
		// The positive control: the identical mount WITHOUT readOnly does undo.
		const n = open({ undoStep: async () => void undid++ });
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
		n.flush();
		expect(undid).toBe(1);
	});

	it('gives a read-only viewer the timeline and no way to write to it', () => {
		// A TEACHER READING A STUDENT'S PART. The history is a record to read,
		// and reading one is not writing to it -- so the list is there and every
		// write control is not.
		const m = open({ readOnly: true, undoStep: async () => {}, redoStep: async () => {} });
		expect(m.all('[data-testid="ideacad-history-toggle"]')).toHaveLength(1);
		open_(m);
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(1);
		expect(rows(m).length).toBeGreaterThan(0);
		expect(m.all('[data-testid="ideacad-timeline-undo"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-timeline-redo"]')).toHaveLength(0);
		// The positive control: the identical mount WITHOUT readOnly has both.
		const n = open({ undoStep: async () => {}, redoStep: async () => {} });
		open_(n);
		expect(n.all('[data-testid="ideacad-timeline-undo"]')).toHaveLength(1);
	});

	it('calls the transport, and explains itself rather than being disabled', () => {
		let undid = 0;
		const m = open({ undoStep: async () => void undid++, redoStep: async () => {} });
		open_(m);
		const btn = m.one<HTMLButtonElement>('[data-testid="ideacad-timeline-undo"]');
		// `aria-disabled`, NEVER `disabled`: a genuinely disabled control
		// swallows the pointer event, so a "why is this off" cue can never fire.
		expect(btn.hasAttribute('disabled')).toBe(false);
		expect(btn.getAttribute('aria-disabled')).toBe('false');
		btn.click();
		m.flush();
		expect(undid).toBe(1);
	});

	it('marks Redo unavailable when the log has nothing undone, and available when it has', () => {
		const m = open({ undoStep: async () => {}, redoStep: async () => {} });
		open_(m);
		expect(m.one('[data-testid="ideacad-timeline-redo"]').getAttribute('aria-disabled')).toBe('true');
		const n = open({ history: logWithUndo(), undoStep: async () => {}, redoStep: async () => {} });
		open_(n);
		expect(n.one('[data-testid="ideacad-timeline-redo"]').getAttribute('aria-disabled')).toBe('false');
	});

	it('says when undo and redo have reached their boundaries', () => {
		const originOnly = open({ history: [log()[0]], undoStep: async () => {}, redoStep: async () => {} });
		open_(originOnly);
		originOnly.one<HTMLButtonElement>('[data-testid="ideacad-timeline-undo"]').click();
		originOnly.flush();
		expect(originOnly.one('[data-testid="ideacad-timeline-boundary"]').textContent).toContain('nothing to undo');
		originOnly.one<HTMLButtonElement>('[data-testid="ideacad-timeline-redo"]').click();
		originOnly.flush();
		expect(originOnly.one('[data-testid="ideacad-timeline-boundary"]').textContent).toContain('nothing to redo');
	});

	it('explicitly says a new edit discarded the old redo branch', () => {
		const m = open({ history: logWithDivergedRedo(), undoStep: async () => {}, redoStep: async () => {} });
		open_(m);
		const redo = m.one<HTMLButtonElement>('[data-testid="ideacad-timeline-redo"]');
		expect(redo.getAttribute('aria-disabled')).toBe('true');
		redo.click();
		m.flush();
		expect(m.one('[data-testid="ideacad-timeline-boundary"]').textContent).toContain('discarded');
	});

	it('reaches undo from Ctrl+Z, which is the keystroke ui/undo.ts used to own', () => {
		let undid = 0;
		const m = open({ undoStep: async () => void undid++ });
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
		m.flush();
		expect(undid).toBe(1);
		// And a bare Z claims nothing, which is what leaves it to the viewport.
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
		m.flush();
		expect(undid).toBe(1);
	});
});

describe('scrubbing is a look and never a write', () => {
	it('moves the readouts to the step being looked at, and back', () => {
		const m = open();
		open_(m);
		const now = mass(m);
		expect(now.length).toBeGreaterThan(0);
		// Step 0 is the part as it was created, which is a different blade from
		// the one three edits later.
		m.all<HTMLButtonElement>('[data-testid="ideacad-timeline-row"] button')[0].click();
		m.flush();
		const atOrigin = mass(m);
		expect(atOrigin).not.toBe(now);
		m.one<HTMLButtonElement>('[data-testid="ideacad-timeline-now"]').click();
		m.flush();
		expect(mass(m)).toBe(now);
	});

	it('says it is a look, where the student is looking', () => {
		const m = open();
		open_(m);
		expect(m.all('[data-testid="ideacad-timeline-preview"]')).toHaveLength(0);
		m.all<HTMLButtonElement>('[data-testid="ideacad-timeline-row"] button')[0].click();
		m.flush();
		const said = m.one('[data-testid="ideacad-timeline-preview"]').textContent ?? '';
		expect(said).toContain('Nothing has changed');
	});

	it('writes NOTHING while scrubbing, which is the claim that fails silently', () => {
		// A scrub that quietly saved the past state over the present one would
		// look identical on screen and would cost the student every edit since.
		const edits: unknown[] = [];
		const writes = {
			edit: (features: unknown) => void edits.push(features),
			create: async () => ({ id: 'x', name: 'x' }),
			rename: async () => {},
			reposition: async () => {},
			remove: async () => ({ activeConceptId: 'c1' }),
			activate: async () => {},
			setPrediction: async () => ({}),
			commit: async () => ({})
		};
		const m = open({ writes });
		open_(m);
		const before = edits.length;
		for (const b of m.all<HTMLButtonElement>('[data-testid="ideacad-timeline-row"] button')) {
			b.click();
			m.flush();
		}
		expect(edits).toHaveLength(before);
		// THE POSITIVE CONTROL, in the same test: this transport genuinely does
		// record, so the zero above is the scrub not writing rather than the
		// instrument not looking. Closing the timeline and accepting an edit
		// through the real control puts a row in.
		m.one<HTMLButtonElement>('[data-testid="ideacad-timeline-now"]').click();
		m.flush();
		toggle(m).click();
		m.flush();
		const row = treeRows(m).find((b) => b.textContent?.includes('Circular Pattern'))!;
		row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		m.flush();
		const input = m.one<HTMLInputElement>('.pm input[type="number"]');
		input.value = '8';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		m.one<HTMLButtonElement>('.pm .accept').click();
		m.flush();
		expect(edits.length).toBeGreaterThan(before);
	});

	/**
	 * THERE ARE TWO WAYS OUT OF THE TIMELINE AND BOTH MUST DROP THE SCRUB.
	 *
	 * The header toggle and the panel's own "Feature tree" button are different
	 * handlers, and a mutation proof caught exactly that: removing `previewSeq =
	 * null` from the PANEL's `onclose` SURVIVED a test that only pressed the
	 * header toggle. A document left showing a past state with nothing on screen
	 * saying so is the worst outcome this surface can produce -- the student's
	 * next edit is measured against a blade that is not theirs.
	 */
	it('drops the scrub when the HEADER TOGGLE closes the timeline', () => {
		const m = open();
		open_(m);
		const now = mass(m);
		m.all<HTMLButtonElement>('[data-testid="ideacad-timeline-row"] button')[0].click();
		m.flush();
		expect(mass(m)).not.toBe(now);
		toggle(m).click();
		m.flush();
		expect(mass(m)).toBe(now);
	});

	it("drops the scrub when the PANEL'S OWN close button is pressed", () => {
		const m = open();
		open_(m);
		const now = mass(m);
		m.all<HTMLButtonElement>('[data-testid="ideacad-timeline-row"] button')[0].click();
		m.flush();
		expect(mass(m)).not.toBe(now);
		const back = m
			.all<HTMLButtonElement>('[data-testid="ideacad-timeline"] button')
			.find((b) => b.textContent?.trim() === 'Feature tree')!;
		expect(back).toBeDefined();
		back.click();
		m.flush();
		// The pane is back on the feature tree AND the document is back at now.
		expect(m.all('[data-testid="ideacad-timeline"]')).toHaveLength(0);
		expect(mass(m)).toBe(now);
	});

	it('makes a row a button only when a scrub is wired, so read-only is structural', () => {
		const m = open();
		open_(m);
		expect(m.all('[data-testid="ideacad-timeline-row"] button').length).toBe(rows(m).length);
		// The absence direction is asserted on the COMPONENT, because
		// `BladeEditor` always wires the scrub -- the timeline's own `onscrub`
		// being optional is what a future surface would rely on.
		expect(rows(m).length).toBeGreaterThan(0);
	});
});

/* -------------------------------------------------------------------------
 * WHO MADE EACH EDIT -- decision 27, 2026-09-13.
 *
 * Mr. Pina: a shared editor gets full history and undo, and every entry is
 * attributed per person the way Google Docs does it. `HistoryTimeline` already
 * rendered `entry.actor`, which agreed with that answer BY ACCIDENT and not by
 * instruction -- and what it rendered was a raw email address. These assert the
 * rendering, which is the half `tests/ideacad-timeline.test.ts` cannot see: the
 * namer being right is not the same claim as the right word reaching a row.
 *
 * WHAT THIS FILE STILL CANNOT ANSWER, unchanged from its own header: happy-dom
 * has no layout engine, so "readable at 375" is not assertable here and is
 * measured in `npm run verify:browser` instead.
 * ---------------------------------------------------------------------- */

/** The same log with one row made somebody else's, which is the two-author case. */
function logTwoAuthors(): IdeacadHistoryRow[] {
	const rows = log();
	// The NEWEST edit is the partner's, so it is the row a reader scanning from
	// the bottom meets first.
	return rows.map((r, i) => (i === rows.length - 1 ? { ...r, actor: PARTNER } : r));
}

describe('every entry says who made it', () => {
	it('names an actor on every row that has one', () => {
		const m = open({ history: logTwoAuthors(), viewerEmail: VIEWER });
		open_(m);
		const whos = m.all('.who');
		expect(whos.length).toBe(logTwoAuthors().filter((r) => r.actor).length);
		for (const w of whos) expect((w.textContent ?? '').trim().length).toBeGreaterThan(0);
	});

	it('NEVER puts a raw address on screen, which is the defect this closes', () => {
		const m = open({ history: logTwoAuthors(), viewerEmail: VIEWER });
		open_(m);
		// The control: these rows really do carry addresses underneath, so the
		// absence is a fact about the rendering and not about the fixture.
		expect(logTwoAuthors().every((r) => (r.actor ?? '').includes('@'))).toBe(true);
		expect(text(m)).not.toContain('@');
	});

	it('renders the two authors distinguishably, in WORDS', () => {
		const m = open({ history: logTwoAuthors(), viewerEmail: VIEWER });
		open_(m);
		const said = m.all('.who').map((w) => (w.textContent ?? '').trim());
		expect(new Set(said).size).toBe(2);
		expect(said).toContain('You');
		expect(said).toContain('M Reyes');
		// AND NOT BY COLOUR ALONE: the two carry different classes as well as
		// different words, and the words alone already tell them apart.
		expect(m.all('.who.is-you').length).toBeGreaterThan(0);
		const theirs = m.all('.who').filter((w) => !w.classList.contains('is-you'));
		expect(theirs.length).toBe(1);
	});

	it('says "You" only for the reader, and nobody is "You" without one', () => {
		const withViewer = open({ history: logTwoAuthors(), viewerEmail: VIEWER });
		open_(withViewer);
		expect(withViewer.all('.who.is-you').length).toBeGreaterThan(0);

		const anonymous = open({ history: logTwoAuthors() });
		open_(anonymous);
		expect(anonymous.all('.who.is-you').length).toBe(0);
		// Every row is still attributed -- absent viewer removes the "You", not
		// the attribution.
		expect(anonymous.all('.who').length).toBe(withViewer.all('.who').length);
		expect(anonymous.all('.who').map((w) => (w.textContent ?? '').trim())).toContain('A Pina');
	});

	it('does not name a non-person as a classmate', () => {
		const rows = log().map((r, i) => (i === 0 ? { ...r, actor: 'migration:0209' } : r));
		const m = open({ history: rows, viewerEmail: VIEWER });
		open_(m);
		const first = m.all('.who')[0];
		expect(first.textContent?.trim()).toBe('system');
		expect(first.classList.contains('is-system')).toBe(true);
		// The backfill's own value never reaches a student's screen.
		expect(text(m)).not.toContain('0209');
	});

	it('puts the label, not the address, in the row a screen reader hears', () => {
		const m = open({ history: logTwoAuthors(), viewerEmail: VIEWER, onscrub: () => {} });
		open_(m);
		// THE SENTENCE IS ON `.hit`, NOT ON THE `<li>`. The row element carries
		// the state attributes; the thing a reader focuses is the control
		// inside it, which is what `onscrub` turns into a button.
		const labels = m.all('.hit').map((r) => r.getAttribute('aria-label') ?? '');
		expect(labels.filter(Boolean).length).toBe(rows(m).length);
		expect(labels.some((l) => l.includes('You'))).toBe(true);
		expect(labels.some((l) => l.includes('M Reyes'))).toBe(true);
		for (const l of labels) expect(l).not.toContain('@');
	});
});
