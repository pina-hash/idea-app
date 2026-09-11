// tests/dom/html-assignment-durability.test.ts
//
// THE TAB-CLOSING NET OVER A PORTED WORKSHEET, WHICH DID NOT EXIST.
//
// MEASURED BEFORE THE FIX: `src/lib/classroom/html-assignment/answers.ts`
// called `SaveState.attach()` ZERO times and exposed no `attach` of its own,
// while every other save surface in the codebase calls it from an `$effect`
// (`AssignmentEngine`, `ContentComposer`, `GradingConsole`, `InstructorCopy`,
// `SpecTextEditor`, and the maps and notebook surfaces). `HxAnswers` also
// builds its `SaveState`s LAZILY, one per block on first write, so nothing
// outside it could attach them either. Closing the tab inside the 800ms
// debounce therefore lost the last keystroke burst on a ported worksheet and on
// no other surface in the app.
//
// THE LAZY HALF IS THE WHOLE DIFFICULTY AND IS WHAT THE CENTRAL TEST HERE
// MEASURES. A net wired once over whatever machines existed at mount would
// cover exactly the blocks nobody had typed in yet -- which is an `attach()`
// that exists, type-checks, reads correctly, and protects nothing. The
// `visibilitychange` case below therefore types into a block for the FIRST time
// AFTER `attach()` has already run, which is the ordinary case rather than an
// edge one.
//
// IT LIVES IN `tests/dom/` BECAUSE THE NET IS REAL LISTENERS ON REAL EVENTS.
// `SaveState.attach()` returns a no-op teardown when `document` is undefined,
// so the whole mechanism is absent under the node project and a control written
// there would be green and vacuous (`tests/dom/README.md`). Nothing here
// measures a box, a ratio or a tap target: happy-dom has no layout engine.

import { describe, expect, it } from 'vitest';
import { HxAnswersStore } from '$lib/classroom/html-assignment/answers-store.svelte';
import { SaveState } from '$lib/save-state.svelte';
import type { HxAnswerTransports } from '$lib/classroom/html-assignment/answers';
import type { HtmlAssignmentManifest } from '$lib/classroom/html-assignment/manifest';

const MANIFEST = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Bench setup',
	course: 'IDEA100',
	points: 2,
	modules: [
		{
			id: 'm1',
			title: 'Module 1',
			points: 2,
			blocks: [
				{ id: 'm1-setup', field: 'setup', type: 'text' },
				{ id: 'm1-later', field: 'later', type: 'text' }
			],
			criteria: []
		}
	]
} as unknown as HtmlAssignmentManifest;

function recorder() {
	const saves: { blockId: string; value: unknown }[] = [];
	const transports = {
		saveResponse: async (_item: string, blockId: string, value: unknown) => {
			saves.push({ blockId, value });
			return { ok: true as const, data: { ok: true } };
		},
		uploadSubmissionFile: async () => ({ ok: true as const, data: {} }),
		deleteSubmissionFile: async () => ({ ok: true as const, data: undefined }),
		setFileCaption: async () => ({ ok: true as const, data: { ok: true } })
	} as unknown as HxAnswerTransports;
	return { saves, transports };
}

/**
 * A REAL 800ms DEBOUNCE, NOT THE COLLAPSED ONE THE SIBLING FILE USES.
 *
 * `wait: async () => {}` is right for measuring what a flush writes; it is
 * exactly wrong here, because a debounce that resolves immediately would write
 * the row before any event fired and EVERY assertion below would pass with no
 * net at all. The window has to still be open when the tab goes away, which is
 * the defect being measured.
 */
function store(transports: HxAnswerTransports, ondirty?: () => void) {
	return new HxAnswersStore({ itemId: 'item-1', manifest: MANIFEST, transports, ondirty });
}

/** Let the microtask queue drain. No timer is advanced: the point is that the
    800ms debounce has NOT elapsed. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function hide() {
	// happy-dom does not let `visibilityState` be assigned directly.
	Object.defineProperty(document, 'visibilityState', {
		value: 'hidden',
		configurable: true
	});
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('the durability net over a ported worksheet', () => {
	it('writes a keystroke the debounce still owes when the tab is hidden', async () => {
		const { saves, transports } = recorder();
		const s = store(transports);
		const off = s.attach();
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'the bench is clear' });

		// THE NEGATIVE CONTROL, IN THE SAME TEST: inside the debounce and with
		// nothing hidden, the row has NOT been written. Without this the
		// assertion below would pass on a machine that wrote on every keystroke,
		// which is a different (and much worse) implementation.
		await settle();
		expect(saves, 'nothing should be written inside the debounce').toHaveLength(0);

		hide();
		await settle();
		expect(saves).toHaveLength(1);
		expect(saves[0].blockId).toBe('m1-setup');
		off();
	});

	it('covers a block typed in for the FIRST TIME after attach -- the lazy case', async () => {
		// This is the assertion the whole design turns on. The machines are built
		// on first write, so a net that only looped over the machines that existed
		// when `attach()` ran would protect nothing a student had actually typed.
		const { saves, transports } = recorder();
		const s = store(transports);
		const off = s.attach();
		s.change({ blockId: 'm1-later', field: 'later', value: 'typed after attach' });
		await settle();
		expect(saves).toHaveLength(0);
		hide();
		await settle();
		expect(saves.map((x) => x.blockId)).toEqual(['m1-later']);
		off();
	});

	it('writes on pagehide too, which is the tab genuinely going away', async () => {
		const { saves, transports } = recorder();
		const s = store(transports);
		const off = s.attach();
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'closing now' });
		await settle();
		expect(saves).toHaveLength(0);
		window.dispatchEvent(new Event('pagehide'));
		await settle();
		expect(saves).toHaveLength(1);
		off();
	});

	it('WITHOUT attach nothing is written -- the defect, reproduced', async () => {
		// The state this codebase shipped in. It is asserted rather than described
		// so that deleting `attach()` cannot look like a refactor.
		const { saves, transports } = recorder();
		const s = store(transports);
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'lost keystrokes' });
		await settle();
		hide();
		await settle();
		expect(saves, 'an unattached controller loses the burst').toHaveLength(0);
		// And the work is still owed, which is what the navigation guard reads.
		expect(s.dirty).toBe(true);
		await s.flush();
		expect(saves).toHaveLength(1);
	});

	it('the teardown takes the listeners off, so a superseded controller is silent', async () => {
		const { saves, transports } = recorder();
		const s = store(transports);
		const off = s.attach();
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'before teardown' });
		await settle();
		off();
		hide();
		await settle();
		// A torn-down controller must not write: the surface that replaced it owns
		// the answers now, and a late write from the old one would put a stale
		// value in the column after a fresh one.
		expect(saves).toHaveLength(0);
	});

	it('attach is idempotent, so a re-run does not stack listeners', async () => {
		const { saves, transports } = recorder();
		const s = store(transports);
		const off1 = s.attach();
		const off2 = s.attach();
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'once only' });
		await settle();
		hide();
		await settle();
		// One row, not two. `SaveState` collapses concurrent writes itself, so
		// this is belt-and-braces -- but two nets over one machine is the shape
		// that produces a duplicate write the day it stops collapsing.
		expect(saves).toHaveLength(1);
		off1();
		off2();
	});
});

describe('the navigation guard\'s handle', () => {
	/**
	 * THE DEFECT THIS PINS IS INVISIBLE AND WAS SHIPPED IN A DRAFT OF THIS VERY
	 * BUNDLE.
	 *
	 * `guardSaveNavigation` takes ONE `SaveState` and this surface has one per
	 * block, so the item page gives it an `autosave: false` handle whose
	 * `save()` calls `flush()`. `SaveState.saveNow()` RETURNS EARLY on a machine
	 * that is clean with nothing pending -- so a handle nothing ever marks dirty
	 * has the guard cancel the navigation, flush NOTHING, re-ask, find the work
	 * still outstanding and put a `window.confirm` in front of the student.
	 * Both halves of what the guard exists to prevent, and nothing on screen or
	 * in a type check says so.
	 */
	it('is armed the moment a block owes a write', async () => {
		const { transports } = recorder();
		let armed = 0;
		const s = store(transports, () => (armed += 1));
		expect(armed, 'nothing is owed before anything is typed').toBe(0);
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'typed' });
		expect(armed).toBe(1);
		s.change({ blockId: 'm1-later', field: 'later', value: 'also typed' });
		expect(armed).toBe(2);
	});

	it('a guard handle armed that way actually FLUSHES, and a clean one does not', async () => {
		const { saves, transports } = recorder();
		const handle = new SaveState({
			autosave: false,
			fallbackMessage: 'unsaved',
			save: async () => {
				await s.flush();
				return { ok: true };
			}
		});
		const s = store(transports, () => handle.markDirty());

		// THE NEGATIVE CONTROL FIRST, on a handle nothing armed: this is the
		// draft that shipped, and it writes nothing.
		const clean = new SaveState({
			autosave: false,
			fallbackMessage: 'unsaved',
			save: async () => {
				await s.flush();
				return { ok: true };
			}
		});
		s.change({ blockId: 'm1-setup', field: 'setup', value: 'the bench is clear' });
		await clean.saveNow();
		expect(saves, 'a clean handle no-ops and the work is still owed').toHaveLength(0);
		expect(s.dirty).toBe(true);

		// And the armed one, which is the fix.
		await handle.saveNow();
		expect(saves).toHaveLength(1);
		expect(s.dirty).toBe(false);
	});
});
