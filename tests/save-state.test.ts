import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	SaveState,
	backoffMs,
	clockTime,
	saveStateLabel,
	type SaveOutcome
} from '../src/lib/save-state.svelte';
import {
	NOTEBOOK_DISCARD_WARNING,
	NOTEBOOK_NOTE_DISCARD_WARNING,
	notebookUnsavedReason,
	notebookUnsavedWarning
} from '../src/lib/notebook/notebook-shell';

/**
 * THE HONEST SAVE STATE, asserted where it fails SILENTLY.
 *
 * Every guarantee in here looks completely normal when it is broken, which is
 * the whole reason the defect this bundle closes survived: an indicator that
 * says "Saving..." for a request nobody made is indistinguishable, on screen,
 * from one that is telling the truth. So is a debounce timer that is discarded
 * by a navigation instead of flushed. So is a failed write that is never
 * retried. None of it shows up in a type check, none of it is visible in a
 * screenshot, and the only symptom is a student's answer not being there the
 * next day.
 *
 * WHERE THE EXPECTED VALUES COME FROM. Nothing here is derived from the
 * implementation's own rule. The store is a plain Map written by the test's own
 * save function, so "did the value land" is answered by reading the Map, not by
 * asking the machine what it thinks it did. The backoff figures are the literal
 * sequence FspTechSelection shipped and was verified against in the browser,
 * typed out rather than recomputed from `backoffMs`.
 *
 * THE SOURCE-WALKING HALF is the tests/classroom-measure.test.ts convention:
 * the surfaces are named explicitly rather than globbed, so one that moves out
 * of this set fails loudly instead of quietly stopping being covered.
 */

// ---------------------------------------------------------------------------
// A stand-in for the server: a store the test can read directly.
// ---------------------------------------------------------------------------

type Store = {
	rows: Map<string, string>;
	calls: number;
	/** How many of the next calls should fail, and how. */
	failNext: number;
	failMode: 'retryable' | 'refuse';
	/** When set, a call parks here until the test resolves it. */
	gate: { promise: Promise<void>; release: () => void } | null;
};

function makeStore(): Store {
	return { rows: new Map(), calls: 0, failNext: 0, failMode: 'retryable', gate: null };
}

function openGate(store: Store) {
	let release!: () => void;
	const promise = new Promise<void>((r) => (release = r));
	store.gate = { promise, release };
}

/**
 * The save function a surface hands in. Reads `field` FRESH on every call, the
 * way every real one does, so a retry and a coalesced re-run both send the
 * latest value rather than a snapshot.
 */
function writerFor(store: Store, field: () => string, key = 'answer') {
	return async (): Promise<SaveOutcome> => {
		store.calls += 1;
		if (store.gate) await store.gate.promise;
		if (store.failNext > 0) {
			store.failNext -= 1;
			return store.failMode === 'retryable'
				? { ok: false, retryable: true, message: 'The network is down.' }
				: { ok: false, retryable: false, message: 'This is submitted, so edits are locked.' };
		}
		store.rows.set(key, field());
		return { ok: true };
	};
}

/** Let queued microtasks settle. */
const settle = async () => {
	for (let i = 0; i < 8; i++) await Promise.resolve();
};

function read(s: SaveState) {
	return {
		phase: s.phase,
		savedAt: s.savedAt,
		message: s.message,
		attempt: s.attempt,
		maxAttempts: s.maxAttempts
	};
}

describe('SaveState: the acknowledgement is the only thing that means saved', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('never reports saved while the write is still in flight', async () => {
		const store = makeStore();
		let field = '';
		const save = new SaveState({
			save: writerFor(store, () => field),
			now: () => 1_700_000_000_000
		});

		openGate(store);
		field = 'photosynthesis';
		save.markDirty();

		// Inside the debounce window: dispatched to nobody yet.
		expect(save.phase).toBe('dirty');
		expect(store.calls).toBe(0);

		await vi.advanceTimersByTimeAsync(800);
		// Dispatched, and parked at the gate. THIS is the state the old classroom
		// engine called "saving" 800ms before it was true, and the state a
		// dispatch-driven indicator would call "saved".
		expect(store.calls).toBe(1);
		expect(save.phase).toBe('writing');
		expect(save.phase).not.toBe('saved');
		expect(save.savedAt).toBeNull();
		expect(store.rows.get('answer')).toBeUndefined();

		store.gate!.release();
		store.gate = null;
		await settle();

		expect(save.phase).toBe('saved');
		expect(save.savedAt).toBe(1_700_000_000_000);
		expect(store.rows.get('answer')).toBe('photosynthesis');
		save.destroy();
	});

	it('stamps savedAt from the acknowledgement, not from when the edit was made', async () => {
		const store = makeStore();
		let clock = 1_000;
		const save = new SaveState({ save: writerFor(store, () => 'x'), now: () => clock });
		save.markDirty();
		clock = 9_999;
		await vi.advanceTimersByTimeAsync(800);
		await settle();
		expect(save.savedAt).toBe(9_999);
		save.destroy();
	});
});

describe('SaveState: navigating inside the debounce window', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	/**
	 * THE REPORTED DEFECT, and the first thing this file covers. A student types
	 * an answer and clicks the next item 200ms later. The debounce has not
	 * fired. Before this bundle the timer was simply destroyed with the
	 * component and the answer was gone, with nothing said anywhere.
	 */
	it('flushes the pending value, so a navigation 200ms after typing still lands it', async () => {
		const store = makeStore();
		let field = '';
		const save = new SaveState({ save: writerFor(store, () => field) });

		field = 'mitochondria';
		save.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(store.rows.get('answer')).toBeUndefined();

		// What guardSaveNavigation does before it lets the navigation proceed.
		await save.saveNow();

		expect(store.rows.get('answer')).toBe('mitochondria');
		expect(save.dirty).toBe(false);
		save.destroy();
	});

	/**
	 * THE POSITIVE CONTROL FOR THE ABOVE, so it cannot pass vacuously. Same
	 * timing, same store, no flush: the value must NOT be there. If this ever
	 * goes green the assertion above has stopped proving that the flush is what
	 * saved the answer.
	 */
	it('positive control: the same edit with no flush does not reach the store', async () => {
		const store = makeStore();
		let field = '';
		const save = new SaveState({ save: writerFor(store, () => field) });

		field = 'mitochondria';
		save.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		save.destroy();
		await vi.advanceTimersByTimeAsync(5_000);

		expect(store.rows.get('answer')).toBeUndefined();
		expect(store.calls).toBe(0);
	});

	it('reports dirty for the whole window, so a guard has something to read', async () => {
		const store = makeStore();
		const save = new SaveState({ save: writerFor(store, () => 'v') });
		expect(save.dirty).toBe(false);
		save.markDirty();
		expect(save.dirty).toBe(true);
		await vi.advanceTimersByTimeAsync(800);
		await settle();
		expect(save.dirty).toBe(false);
		save.destroy();
	});
});

describe('SaveState: a rejected write', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('reaches failed, keeps the value in the field, and lands on a retry', async () => {
		const store = makeStore();
		const field = 'first answer';
		const save = new SaveState({ save: writerFor(store, () => field), maxAttempts: 3 });

		store.failNext = 99; // the endpoint is down
		save.markDirty();
		await vi.advanceTimersByTimeAsync(800 + 800 + 1600 + 50);
		await settle();

		expect(save.phase).toBe('failed');
		expect(save.failed).toBe(true);
		expect(save.message).toBe('The network is down.');
		expect(store.calls).toBe(3);
		// THE VALUE IS STILL THE CALLER'S. Nothing here has touched it, which is
		// what "stays in the field" means: the machine holds no copy to lose.
		expect(field).toBe('first answer');
		expect(store.rows.get('answer')).toBeUndefined();
		// Still dirty, so a guard still has a reason to ask.
		expect(save.dirty).toBe(true);

		store.failNext = 0;
		await save.retry();
		expect(save.phase).toBe('saved');
		expect(store.rows.get('answer')).toBe('first answer');
		save.destroy();
	});

	it('backs off between attempts on the FSP curve', async () => {
		const store = makeStore();
		const waits: number[] = [];
		const save = new SaveState({
			save: writerFor(store, () => 'v'),
			maxAttempts: 5,
			wait: async (ms) => void waits.push(ms)
		});
		store.failNext = 99;
		save.markDirty();
		await vi.advanceTimersByTimeAsync(800);
		await settle();

		// The literal sequence the FSP tools shipped, typed out rather than
		// recomputed from backoffMs: a test whose expected value comes from the
		// implementation's own rule cannot fail.
		expect(waits).toEqual([800, 1600, 3200, 6400]);
		expect(store.calls).toBe(5);
		save.destroy();
	});

	it('does NOT retry a refusal: the server considered it and said no', async () => {
		const store = makeStore();
		const waits: number[] = [];
		const save = new SaveState({
			save: writerFor(store, () => 'v'),
			maxAttempts: 5,
			wait: async (ms) => void waits.push(ms)
		});
		store.failNext = 99;
		store.failMode = 'refuse';
		save.markDirty();
		await vi.advanceTimersByTimeAsync(800);
		await settle();

		expect(store.calls).toBe(1);
		expect(waits).toEqual([]);
		expect(save.phase).toBe('failed');
		expect(save.message).toBe('This is submitted, so edits are locked.');
		save.destroy();
	});

	it('treats a transport that THROWS as a retryable failure rather than stranding', async () => {
		const save = new SaveState({
			maxAttempts: 2,
			wait: async () => {},
			save: async () => {
				throw new Error('NetworkError when attempting to fetch resource.');
			}
		});
		save.markDirty();
		await vi.advanceTimersByTimeAsync(800);
		await settle();
		expect(save.phase).toBe('failed');
		expect(save.message).toBe('NetworkError when attempting to fetch resource.');
		save.destroy();
	});
});

describe('SaveState: an edit that lands mid-write', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('is coalesced into one more run, and the LATEST value is what is stored', async () => {
		const store = makeStore();
		let field = 'v1';
		const save = new SaveState({ save: writerFor(store, () => field) });

		openGate(store);
		save.markDirty();
		await vi.advanceTimersByTimeAsync(800);
		expect(store.calls).toBe(1);

		// Typed while the first request is still in the air.
		field = 'v2';
		save.markDirty();

		store.gate!.release();
		store.gate = null;
		await settle();
		await vi.advanceTimersByTimeAsync(800);
		await settle();

		// TWO, not three: the settle path sends the newer value, and the debounce
		// timer the same edit armed must find nothing pending and stand down.
		expect(store.calls).toBe(2);
		expect(store.rows.get('answer')).toBe('v2');
		expect(save.phase).toBe('saved');
		save.destroy();
	});
});

describe('SaveState: the durability net', () => {
	const listeners = new Map<string, Set<() => void>>();
	let visibility = 'visible';

	beforeEach(() => {
		vi.useFakeTimers();
		listeners.clear();
		visibility = 'visible';
		const add = (type: string, fn: () => void) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		};
		const remove = (type: string, fn: () => void) => listeners.get(type)?.delete(fn);
		// A deliberately tiny stand-in: the ONLY thing under test is whether the
		// two events are subscribed and whether firing them writes.
		(globalThis as Record<string, unknown>).document = {
			addEventListener: add,
			removeEventListener: remove,
			get visibilityState() {
				return visibility;
			}
		};
		(globalThis as Record<string, unknown>).window = {
			addEventListener: add,
			removeEventListener: remove
		};
	});

	afterEach(() => {
		vi.useRealTimers();
		delete (globalThis as Record<string, unknown>).document;
		delete (globalThis as Record<string, unknown>).window;
	});

	const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn());

	it('subscribes to visibilitychange AND pagehide, and unsubscribes on teardown', () => {
		const save = new SaveState({ save: async () => ({ ok: true }) });
		const off = save.attach();
		expect(listeners.get('visibilitychange')?.size).toBe(1);
		expect(listeners.get('pagehide')?.size).toBe(1);
		off();
		expect(listeners.get('visibilitychange')?.size).toBe(0);
		expect(listeners.get('pagehide')?.size).toBe(0);
	});

	it('writes a pending value when the tab is hidden inside the debounce window', async () => {
		const store = makeStore();
		let field = '';
		const save = new SaveState({ save: writerFor(store, () => field) });
		const off = save.attach();

		field = 'chloroplast';
		save.markDirty();
		await vi.advanceTimersByTimeAsync(200);
		expect(store.rows.get('answer')).toBeUndefined();

		visibility = 'hidden';
		fire('visibilitychange');
		await settle();

		expect(store.rows.get('answer')).toBe('chloroplast');
		off();
	});

	it('does nothing when the tab is hidden with nothing pending', async () => {
		const store = makeStore();
		const save = new SaveState({ save: writerFor(store, () => 'v') });
		const off = save.attach();
		visibility = 'hidden';
		fire('visibilitychange');
		fire('pagehide');
		await settle();
		expect(store.calls).toBe(0);
		off();
	});

	it('prefers the caller onHide (the FSP sendBeacon) over a fetch it cannot finish', async () => {
		const store = makeStore();
		let beacons = 0;
		const save = new SaveState({
			save: writerFor(store, () => 'v'),
			onHide: () => void (beacons += 1)
		});
		const off = save.attach();
		save.markDirty();
		fire('pagehide');
		await settle();
		expect(beacons).toBe(1);
		expect(store.calls).toBe(0);
		off();
	});
});

describe('SaveState: the baseline and the reset', () => {
	it('markSaved seeds a saved state with no clock time to show', () => {
		const save = new SaveState({ save: async () => ({ ok: true }) });
		save.markSaved();
		expect(save.phase).toBe('saved');
		expect(save.savedAt).toBeNull();
		expect(save.dirty).toBe(false);
		expect(saveStateLabel(read(save)).text).toBe('Saved');
	});

	it('reset returns a discarded surface to clean', () => {
		const save = new SaveState({ save: async () => ({ ok: true }), autosave: false });
		save.markDirty();
		expect(save.dirty).toBe(true);
		save.reset();
		expect(save.phase).toBe('clean');
		expect(save.dirty).toBe(false);
	});

	it('autosave:false marks dirty for the guard but schedules nothing', async () => {
		vi.useFakeTimers();
		const store = makeStore();
		const save = new SaveState({ save: writerFor(store, () => 'v'), autosave: false });
		save.markDirty();
		expect(save.dirty).toBe(true);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(store.calls).toBe(0);
		await save.saveNow();
		expect(store.calls).toBe(1);
		vi.useRealTimers();
		save.destroy();
	});
});

describe('the words, said once', () => {
	it('gives each of the five states its own line', () => {
		const base = { savedAt: null, message: null, attempt: 0, maxAttempts: 5 };
		expect(saveStateLabel({ ...base, phase: 'clean' }).text).toBe('');
		expect(saveStateLabel({ ...base, phase: 'dirty' }).text).toBe('Unsaved changes');
		expect(saveStateLabel({ ...base, phase: 'writing', attempt: 1 }).text).toBe('Saving...');
		expect(saveStateLabel({ ...base, phase: 'writing', attempt: 3 }).text).toBe(
			'Retrying (attempt 3 of 5)...'
		);
		expect(saveStateLabel({ ...base, phase: 'failed', message: 'The network is down.' }).text).toBe(
			'Not saved. The network is down.'
		);
	});

	it('carries the clock time of the last successful write', () => {
		const at = new Date(2026, 7, 20, 14, 37, 0).getTime();
		const label = saveStateLabel({
			phase: 'saved',
			savedAt: at,
			message: null,
			attempt: 0,
			maxAttempts: 5
		});
		expect(label.text).toBe(`Saved ${clockTime(at)}`);
		// The stamp is a real clock reading, not a relative phrase that stops
		// being true the moment nobody looks at it.
		expect(label.text).toMatch(/\d/);
		expect(label.text).not.toContain('ago');
	});

	it('uses no em dash anywhere, the house rule', () => {
		const texts = (['clean', 'dirty', 'writing', 'saved', 'failed'] as const).map(
			(phase) =>
				saveStateLabel({ phase, savedAt: Date.now(), message: 'x', attempt: 2, maxAttempts: 5 })
					.text
		);
		expect(texts.length).toBe(5);
		for (const t of texts) expect(t).not.toContain('—');
	});

	it('backoffMs is pinned at the ceiling once the curve passes it', () => {
		expect(backoffMs(1)).toBe(800);
		expect(backoffMs(5)).toBe(8000);
		expect(backoffMs(9)).toBe(8000);
	});
});

// ---------------------------------------------------------------------------
// The notebook page's guard now covers an open note editor.
// ---------------------------------------------------------------------------

describe("NotebookView's guard covers an open note editor", () => {
	const emptyComposer = { staged: [], title: '', noteDraft: null };

	it('reports the note editor even when the composer is empty', () => {
		expect(notebookUnsavedReason({ composer: emptyComposer, dirtyNoteEditors: 1 })).toBe('note');
		// The case that used to fall straight through: no composer mounted at
		// all, one open note editor holding a retyped paragraph.
		expect(notebookUnsavedReason({ composer: null, dirtyNoteEditors: 1 })).toBe('note');
	});

	it('positive control: neither, and both', () => {
		expect(notebookUnsavedReason({ composer: null, dirtyNoteEditors: 0 })).toBeNull();
		expect(notebookUnsavedReason({ composer: emptyComposer, dirtyNoteEditors: 0 })).toBeNull();
		expect(
			notebookUnsavedReason({
				composer: { staged: [], title: 'Lab 4', noteDraft: null },
				dirtyNoteEditors: 0
			})
		).toBe('composer');
	});

	it('names what is at stake differently for each', () => {
		expect(notebookUnsavedWarning('note')).toBe(NOTEBOOK_NOTE_DISCARD_WARNING);
		expect(notebookUnsavedWarning('composer')).toBe(NOTEBOOK_DISCARD_WARNING);
		expect(NOTEBOOK_NOTE_DISCARD_WARNING).not.toBe(NOTEBOOK_DISCARD_WARNING);
		for (const w of [NOTEBOOK_NOTE_DISCARD_WARNING, NOTEBOOK_DISCARD_WARNING]) {
			expect(w).not.toContain('—');
		}
	});
});

// ---------------------------------------------------------------------------
// THE SURFACES ARE ACTUALLY ON IT.
//
// Named explicitly, never globbed: a surface that moves out of this set must
// fail here rather than quietly stop being covered. Each of these assertions is
// the one a mutation in that file is expected to redden.
// ---------------------------------------------------------------------------

const SURFACES = {
	assignmentEngine: 'src/lib/classroom/AssignmentEngine.svelte',
	entryNotes: 'src/lib/notebook/EntryNotes.svelte',
	gradingConsole: 'src/lib/classroom/GradingConsole.svelte',
	contentComposer: 'src/lib/classroom/ContentComposer.svelte',
	fspTechSelection: 'src/lib/fsp/FspTechSelection.svelte',
	fspPulse: 'src/lib/fsp-pulse/FspPulse.svelte',
	notebookView: 'src/lib/notebook/NotebookView.svelte',
	entryCard: 'src/lib/notebook/NotebookEntryCard.svelte'
} as const;

const src = Object.fromEntries(
	Object.entries(SURFACES).map(([k, p]) => [
		k,
		readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
	])
) as Record<keyof typeof SURFACES, string>;

describe('every surface that persists work is on the one primitive', () => {
	it('all six consumers construct a SaveState, and none rolls its own retry loop', () => {
		const consumers = [
			'assignmentEngine',
			'entryNotes',
			'gradingConsole',
			'contentComposer',
			'fspTechSelection',
			'fspPulse'
		] as const;
		for (const key of consumers) {
			expect(src[key], key).toContain('new SaveState(');
			expect(src[key], key).toContain("from '$lib/save-state.svelte'");
			// The copies the extraction exists to remove. A hand-rolled backoff and
			// attempt loop must live in exactly one module now.
			expect(src[key], key).not.toContain('function backoffMs');
			expect(src[key], key).not.toContain('attempt <= MAX_ATTEMPTS');
		}
	});

	it('the four classroom and notebook surfaces render the SAME indicator', () => {
		const four = ['assignmentEngine', 'entryNotes', 'gradingConsole', 'contentComposer'] as const;
		for (const key of four) {
			expect(src[key], key).toContain('<SaveIndicator');
			expect(src[key], key).toContain("import SaveIndicator from '$lib/SaveIndicator.svelte'");
		}
	});

	it('the assignment engine no longer has a dispatch-driven status of its own', () => {
		// Matched as an ASSIGNMENT, not as the word: the comment in that file
		// still names the flag it replaced, which is history worth keeping.
		expect(src.assignmentEngine).not.toMatch(/saveStatus\s*=/);
		expect(src.assignmentEngine).not.toContain("'All changes saved'");
		expect(src.assignmentEngine).not.toMatch(/setTimeout\([^)]*\r?\n?[^)]*,\s*800\s*\)/);
	});

	it('the assignment engine flushes before navigation and nets the tab going away', () => {
		expect(src.assignmentEngine).toContain('guardSaveNavigation(save');
		expect(src.assignmentEngine).toContain("from '$lib/save-guard.svelte'");
		expect(src.assignmentEngine).toContain('save.attach()');
		// Pending writes go out before a submit, too.
		expect(src.assignmentEngine).toContain('await save.saveNow()');
	});

	it('the assignment engine offers an explicit save beside the autosave', () => {
		expect(src.assignmentEngine).toContain('saveLabel="Save now"');
		expect(src.assignmentEngine).toContain('onsave=');
	});

	it("the notebook page's guard asks about note editors, not only the composer", () => {
		expect(src.notebookView).toContain('notebookUnsavedReason(');
		expect(src.notebookView).toContain('dirtyNoteEditors');
		// The signal genuinely travels editor -> card -> page.
		expect(src.entryNotes).toContain('ondirty?.(');
		expect(src.entryCard).toContain('onNoteDirty');
		expect(src.notebookView).toContain('onNoteDirty={noteEditorDirty}');
	});

	/**
	 * FOUND IN THE BROWSER, and it is exactly the kind of thing that looks fine.
	 *
	 * The dirty signal was reported from the effect that tracks the DRAFT. A
	 * successful save clears the draft before the acknowledgement lands, so the
	 * last thing the page heard was `dirty` while the phase was still `writing`,
	 * and the transition that actually releases the guard re-ran nothing. The
	 * note saved, the editor closed, and every navigation after that still asked
	 * about it, which is a warning people learn to click through.
	 */
	it('EntryNotes reports its dirty state off the MACHINE, not off the draft', () => {
		expect(src.entryNotes).toContain('const isDirty = save.dirty;');
		expect(src.entryNotes).toContain('untrack(() => ondirty?.(isDirty));');
		// And withdraws it on teardown: the card remounts after a save, so the
		// instance that reported dirty is destroyed rather than corrected.
		expect(src.entryNotes).toContain('ondirty?.(false);');
	});

	it('EntryNotes reports the acknowledgement, never the dispatch', () => {
		// The old label: a `busy` flag set before the call and cleared after it.
		expect(src.entryNotes).not.toContain("{busy ? 'Saving");
		expect(src.entryNotes).not.toContain('let busy = $state(false)');
		expect(src.entryNotes).toContain('const busy = $derived(');
	});

	it('the two FSP surfaces kept their sendBeacon net through the primitive', () => {
		for (const key of ['fspTechSelection', 'fspPulse'] as const) {
			expect(src[key], key).toContain('navigator.sendBeacon');
			expect(src[key], key).toContain('onHide: () => flushBeacon()');
			expect(src[key], key).toContain('save.attach()');
		}
	});

	it('the guard module is the only place a navigation is cancelled for a SaveState', () => {
		const guard = readFileSync(new URL('../src/lib/save-guard.svelte.ts', import.meta.url), 'utf8');
		expect(guard).toContain('beforeNavigate');
		expect(guard).toContain('state.saveNow()');
		// A flush first, a question only if it could not land.
		expect(guard.indexOf('state.saveNow()')).toBeLessThan(guard.indexOf('window.confirm'));
	});

	it('there is no global shell banner reading a save state', () => {
		// A surface saying "all changes saved" for a sibling holding a failed
		// write is a false negative with a much wider blast radius. The primitive
		// is constructed per instance, inside the surface that owns the work, and
		// nowhere else.
		const layouts = [
			'src/routes/+layout.svelte',
			'src/lib/classroom/ClassroomShell.svelte',
			'src/lib/ProfileMenu.svelte'
		];
		for (const rel of layouts) {
			let text: string;
			try {
				text = readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
			} catch {
				continue;
			}
			expect(text, rel).not.toContain('SaveState');
			expect(text, rel).not.toContain('SaveIndicator');
		}
	});
});
