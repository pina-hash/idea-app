// tests/dom/maps-node-create-once.test.ts
//
// ONE PRESS OF "Create draft" WRITES ONE ROW, and this file is the proof that
// was missing when Mr. Pina added one room to the IDEA building on
// 2026-09-06 and got about thirty (prompt 0098, item ZERO).
//
// THE MECHANISM, READ OFF THE CODE AND THEN MEASURED HERE. `NodeDetail`'s save
// callback, on a CREATE, calls `onselectnode(newId)` while its own `SaveState`
// run is still in flight. The shell's `attemptSelect` asks every registered
// form whether it is dirty -- and `writing` counts as dirty, correctly, for a
// navigation guard -- so it calls the form's `flush()`, which called
// `doSave()`, which called `markDirty()`. The machine reads a `markDirty()`
// during a write as "an edit landed mid-write, send the newest value once this
// settles" (its designed, correct behaviour for typing), re-runs `save()`,
// and `node` is STILL null because the selection never moved: `attemptSelect`
// is parked on the flush, which is parked on the run, which is now the next
// run. Every cycle inserts another identical row and re-enters the same path.
// The indicator flips `saved` -> `writing` inside one microtask, so it reads
// "Saving..." the whole time, which is why a person presses again.
//
// THREE DRIVES, BECAUSE THE PROMPT ASKS WHICH ONE HE HIT AND THEY NEED
// DIFFERENT FIXES:
//   1. rapid presses while the create is in flight (a busy state);
//   2. exactly one press, through the REAL MapsEditor (the loop above);
//   3. one press, then `visibilitychange` and `pagehide` fired while the
//      request is open (the durability net).
// Plus a fourth: presses SPACED so each lands after the last settled, on a
// form the shell did not remount -- which is what a failed reload or the
// unsaved-changes prompt leaves on screen -- so the created id has to be
// remembered.
//
// MEASURED ON THE TREE BEFORE THE FIX (the positive control, in the history
// entry): drive 2 wrote rows until the transport's cap stopped it, drive 1
// wrote 2, drive 4 wrote one per press, drive 3 wrote 1. Drive 2 is what he
// hit. The fix is two halves in `doSave`: a press while a save is in flight
// JOINS that save and starts nothing (closes 1 and breaks the loop in 2), and a
// press after a create UPDATES the id that create returned (closes 4).
//
// WHY THIS CANNOT BE A SERVER RENDER: every claim is about what an EVENT does
// several promise ticks later. `svelte/server`'s render() runs no handler.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { mountInto, type Mounted } from './mount';
import MapsEditor from '../../src/lib/maps/MapsEditor.svelte';
import NodeDetail from '../../src/lib/maps/NodeDetail.svelte';
import { FIX, mapsEditFixture, memoryMapsTransports } from '../../src/routes/dev/maps-edit/fixture';
import type { MapsEditorData } from '../../src/lib/maps/maps';
import type { MapsTransports } from '../../src/lib/maps/transports';

/** The room he added, at the size the ledger records. */
const ROOM = { name: 'IDEA Classroom', w: '466.25', h: '477.75' };

/**
 * The fixture transport, with its writes COUNTED, each insert HELD OPEN for a
 * real macrotask so a press can land while one is in flight, and a CAP so a
 * transport that is asked for a thirty-first row refuses instead of letting
 * the test spin forever. The cap is a refusal (`retryable: false`), which is
 * what stops the machine; on the fixed code it is never reached.
 */
function instrumented(data: MapsEditorData, opts: { holdMs: number; cap: number }) {
	const inner = memoryMapsTransports(data);
	const calls = { insert: 0, update: 0 };
	const t: MapsTransports = {
		...inner,
		async insertRow(table, values) {
			calls.insert += 1;
			if (calls.insert > opts.cap) {
				return { ok: false, retryable: false, message: `cap of ${opts.cap} inserts reached` };
			}
			await new Promise((r) => setTimeout(r, opts.holdMs));
			return inner.insertRow(table, values);
		},
		async updateRow(table, id, patch) {
			calls.update += 1;
			return inner.updateRow(table, id, patch);
		}
	};
	return { t, calls };
}

const rooms = (data: MapsEditorData) => data.nodes.filter((n) => n.name === ROOM.name);

function set(m: Mounted, idSuffix: string, value: string) {
	const el = m.one(`[id$="${idSuffix}"]`) as HTMLInputElement | HTMLSelectElement;
	if (el.tagName === 'SELECT') {
		// happy-dom's select quirk, handled the way maps-editor-stage-mount
		// does: Svelte's binding falls back to the first ENABLED option, so the
		// placeholder is disabled and the target option selected outright.
		for (const opt of Array.from((el as HTMLSelectElement).options)) {
			opt.disabled = opt.value !== value && opt.value === 'none';
			opt.selected = opt.value === value;
		}
		el.value = value;
		el.dispatchEvent(new Event('change', { bubbles: true }));
	} else {
		el.value = value;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}
	m.flush();
}

/** Fill the new-room form the way he did: a name and a rectangle. */
function fillRoom(m: Mounted) {
	set(m, '-name', ROOM.name);
	set(m, '-outline', 'rect');
	set(m, '-rect-w', ROOM.w);
	set(m, '-rect-h', ROOM.h);
	expect(m.all('[data-testid="maps-node-problems"]')).toHaveLength(0);
}

const buttonNamed = (m: Mounted, text: string) =>
	m.all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === text) ?? null;

const indicatorText = (m: Mounted) =>
	m.all('.save-ind-text').map((el) => el.textContent?.replace(/\s+/g, ' ').trim()).join(' | ');

/** Let the held transport, the reload and the effect graph all settle. */
async function settle(m: Mounted, rounds = 4) {
	for (let i = 0; i < rounds; i++) await m.settle();
}

/** The whole workspace, opened on a new room under the building -- the route's own mount. */
function openEditorOnNewRoom(opts: { holdMs: number; cap: number }) {
	const data = mapsEditFixture();
	const { t, calls } = instrumented(data, opts);
	const m = mountInto(MapsEditor as never, {
		initial: data,
		transports: t,
		initialSelection: { kind: 'new-node', parentId: FIX.building, presetKind: 'room' }
	});
	return { m, data, calls };
}

/**
 * The inspector alone, with a shell that never remounts it. This is the
 * isolation for drives 1, 3 and 4: `onselectnode` is a no-op, so nothing
 * about the shell's flush-on-switch is in play and what is measured is the
 * form's own handling of a second press.
 */
function openDetailOnNewRoom(opts: { holdMs: number; cap: number }) {
	let data = mapsEditFixture();
	const { t, calls } = instrumented(data, opts);
	const selected: string[] = [];
	const m = mountInto(NodeDetail as never, {
		node: null,
		parentId: FIX.building,
		presetKind: 'room',
		data,
		transports: t,
		onchanged: async () => {
			const r = await t.reload();
			if (r.ok) data = r.data;
		},
		onselectnode: (id: string) => selected.push(id),
		onaddchild: () => {},
		ondeleted: () => {},
		registerForm: () => {}
	});
	return { m, calls, selected, rows: () => rooms(data) };
}

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

describe('DRIVE 2: exactly one press, through the real editor (what he hit)', () => {
	it('writes ONE row, moves the pane onto it, and the indicator acknowledges the write', async () => {
		const { m, data, calls } = openEditorOnNewRoom({ holdMs: 2, cap: 12 });
		mounted.push(m);
		fillRoom(m);
		expect(rooms(data)).toHaveLength(0);

		const create = buttonNamed(m, 'Create draft');
		expect(create).not.toBeNull();
		create!.click();
		flushSync();
		await settle(m, 8);

		// THE ASSERTION THIS FILE EXISTS FOR. One insert, and NO update either:
		// with the id remembered but no in-flight guard, the shell's flush
		// still re-runs the save once and lands an identical row a second
		// time as an UPDATE (measured: the mutation removing the guard alone
		// left the insert count at 1 and the update count at 1).
		expect(calls.insert).toBe(1);
		expect(calls.update).toBe(0);
		expect(rooms(data)).toHaveLength(1);

		// The pane is now the created node's own editor, not the create form.
		expect(buttonNamed(m, 'Create draft')).toBeNull();
		expect(buttonNamed(m, 'Save draft')).not.toBeNull();
		expect(m.one('[data-testid="maps-node-tree"] [aria-current="true"]').textContent).toContain(ROOM.name);
		// And the acknowledgement survived the remount: it does not read
		// "Saving...", and it is not blank.
		expect(indicatorText(m)).toMatch(/^Saved/);
	});

	it('while the request is open the indicator says so and the control cannot be pressed again', async () => {
		const { m } = openEditorOnNewRoom({ holdMs: 20, cap: 12 });
		mounted.push(m);
		fillRoom(m);
		buttonNamed(m, 'Create draft')!.click();
		flushSync();
		expect(indicatorText(m)).toBe('Saving...');
		expect(buttonNamed(m, 'Create draft')?.disabled).toBe(true);
		expect(buttonNamed(m, 'Create & publish')?.disabled).toBe(true);
		await settle(m, 6);
	});
});

describe('DRIVE 1: rapid presses while the create is in flight', () => {
	it('five presses in one tick write ONE row', async () => {
		const { m, calls, rows } = openDetailOnNewRoom({ holdMs: 5, cap: 12 });
		mounted.push(m);
		fillRoom(m);
		const create = buttonNamed(m, 'Create draft')!;
		for (let i = 0; i < 5; i++) create.click();
		flushSync();
		await settle(m, 6);
		expect(calls.insert).toBe(1);
		expect(calls.update).toBe(0);
		expect(rows()).toHaveLength(1);
	});
});

describe('DRIVE 3: one press, then the durability net fires while the request is open', () => {
	it('visibilitychange and pagehide during the flight add nothing', async () => {
		const { m, calls, rows } = openDetailOnNewRoom({ holdMs: 5, cap: 12 });
		mounted.push(m);
		fillRoom(m);
		buttonNamed(m, 'Create draft')!.click();
		flushSync();

		const original = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
		Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
		try {
			document.dispatchEvent(new Event('visibilitychange'));
			window.dispatchEvent(new Event('pagehide'));
			flushSync();
			await settle(m, 6);
		} finally {
			delete (document as unknown as Record<string, unknown>).visibilityState;
			if (original) Object.defineProperty(Document.prototype, 'visibilityState', original);
		}
		expect(calls.insert).toBe(1);
		expect(calls.update).toBe(0);
		expect(rows()).toHaveLength(1);
	});
});

describe('DRIVE 4: presses spaced out, on a form the shell did not remount', () => {
	it('the first press inserts and every later press UPDATES the id it returned', async () => {
		const { m, calls, rows, selected } = openDetailOnNewRoom({ holdMs: 2, cap: 12 });
		mounted.push(m);
		fillRoom(m);
		for (let i = 0; i < 4; i++) {
			(buttonNamed(m, 'Create draft') ?? buttonNamed(m, 'Save draft'))!.click();
			flushSync();
			await settle(m, 3);
		}
		expect(calls.insert).toBe(1);
		expect(calls.update).toBe(3);
		expect(rows()).toHaveLength(1);
		// The shell was told about the create exactly once.
		expect(selected).toHaveLength(1);
	});
});
