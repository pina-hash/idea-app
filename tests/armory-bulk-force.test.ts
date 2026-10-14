// tests/armory-bulk-force.test.ts
//
// Ledger 0380, report f62ce574: Force check in over a selection. The
// arithmetic is pure (`checkouts.ts`) and the arm-then-press state is a class
// (`force-check-in.svelte.ts`). What would be invisible if it broke: a count
// that says more landed than did, a second press acting on a different count
// than the first one named, and the plural call reaching a file the single
// key is hidden on (one's own).

import { describe, expect, it } from 'vitest';
import {
	addBulkResults,
	BULK_FORCE_LIMIT,
	bulkForceWords,
	chunkIds,
	emptyTally,
	selectableCheckouts
} from '../src/lib/armory/checkouts';
import { BulkForceCheckIn } from '../src/lib/armory/force-check-in.svelte';
import { breakLockWords, type ArmoryCheckout } from '../src/lib/armory/view';

const row = (id: string, holder: string): ArmoryCheckout =>
	({ file_id: id, name: `${id}.sldprt`, folder: '', holder_email: holder, device_name: 'IDEA-06', since: '2026-10-01T00:00:00Z' }) as ArmoryCheckout;

describe('which rows a bulk press may reach', () => {
	it('never one\'s own file, both directions', () => {
		const rows = [row('a', 'me@x'), row('b', 'you@x'), row('c', 'you@x')];
		expect(selectableCheckouts(rows, 'me@x').map((r) => r.file_id)).toEqual(['b', 'c']);
		expect(selectableCheckouts(rows, 'someone@x').map((r) => r.file_id)).toEqual(['a', 'b', 'c']);
	});
});

describe('chunking to the database\'s ceiling', () => {
	it('716 files are two calls, 500 then 216, and nothing is dropped or doubled', () => {
		const ids = Array.from({ length: 716 }, (_, i) => `f${i}`);
		const parts = chunkIds(ids);
		expect(BULK_FORCE_LIMIT).toBe(500);
		expect(parts.map((p) => p.length)).toEqual([500, 216]);
		expect(parts.flat()).toEqual(ids);
		expect(chunkIds([])).toEqual([]);
	});
});

describe('the tally', () => {
	it('counts checked in, already free and refused apart, and a file the answer omits is refused, not landed', () => {
		const t = emptyTally();
		addBulkResults(
			t,
			[
				{ file_id: 'a', ok: true, broken: true },
				{ file_id: 'b', ok: true, broken: false },
				{ file_id: 'c', ok: false, code: 'P0001', message: 'only a mentor or cad_lead may break a lock' },
				{ file_id: 'a', ok: true, broken: true } // a repeat is not a second file
			],
			['a', 'b', 'c', 'd']
		);
		expect(t).toMatchObject({ checkedIn: 1, alreadyFree: 1, refused: 2 });
		expect(t.refusedIds.sort()).toEqual(['c', 'd']);
	});
	it('an answer with no readable results refuses every file it was asked for', () => {
		const t = addBulkResults(emptyTally(), null, ['a', 'b']);
		expect(t.checkedIn).toBe(0);
		expect(t.refused).toBe(2);
	});
	it('the words name each count, and a refusal says what to do', () => {
		const t = addBulkResults(
			emptyTally(),
			[
				{ file_id: 'a', ok: true, broken: true },
				{ file_id: 'b', ok: false, message: 'only a mentor or cad_lead' }
			],
			['a', 'b']
		);
		const words = bulkForceWords(t, breakLockWords);
		expect(words).toContain('Checked in 1 file.');
		expect(words).toContain('1 file was refused');
		expect(words).toContain('Only a mentor, a CAD lead, an instructor or a site admin');
		expect(words).toContain('stay ticked');
		expect(bulkForceWords(emptyTally(), breakLockWords)).toBe('Nothing was checked in.');
	});
});

describe('arm, then press, over a selection', () => {
	it('the second press acts only on the count the first named, and a changed selection disarms', async () => {
		const sent: string[][] = [];
		const bulk = new BulkForceCheckIn(async (ids) => {
			sent.push(ids);
			return { ok: true, ...addBulkResults(emptyTally(), ids.map((id) => ({ file_id: id, ok: true, broken: true })), ids) };
		});
		await bulk.press(['a', 'b']);
		expect(bulk.armed).toBe(2);
		expect(sent).toHaveLength(0); // the first press sends nothing
		bulk.toggle('c', true); // the selection moved, so the arming is gone
		expect(bulk.armed).toBeNull();
		await bulk.press(['a', 'b', 'c']);
		expect(sent).toHaveLength(0);
		await bulk.press(['a', 'b', 'c']);
		expect(sent).toEqual([['a', 'b', 'c']]);
		expect(bulk.message).toContain('Checked in 3 files.');
		expect(bulk.bad).toBe(false);
		expect(bulk.armed).toBeNull();
	});
	it('refused files stay selected so a second press retries those and nothing else', async () => {
		const bulk = new BulkForceCheckIn(async (ids) => ({
			ok: true,
			...addBulkResults(
				emptyTally(),
				ids.map((id) => (id === 'b' ? { file_id: id, ok: false, message: 'x' } : { file_id: id, ok: true, broken: true })),
				ids
			)
		}));
		bulk.set(['a', 'b']);
		await bulk.press(['a', 'b']);
		await bulk.press(['a', 'b']);
		expect([...bulk.selected]).toEqual(['b']);
		expect(bulk.bad).toBe(true);
	});
	it('nothing selected sends nothing and arms nothing; a whole-call failure is said, not swallowed', async () => {
		let calls = 0;
		const bulk = new BulkForceCheckIn(async () => {
			calls += 1;
			return { ok: false, message: 'device is not registered' };
		});
		await bulk.press([]);
		expect(bulk.armed).toBeNull();
		await bulk.press(['a']);
		await bulk.press(['a']);
		expect(calls).toBe(1);
		expect(bulk.bad).toBe(true);
		expect(bulk.message).toContain('needs one of your computers connected');
	});
});
