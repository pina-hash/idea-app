// tests/dom/maps-duplicates-mount.test.ts
//
// THE SURPLUS PANEL, MOUNTED IN THE REAL EDITOR, WITH A REAL PRESS ON IT
// (prompt 0098). `tests/maps-duplicates.test.ts` pins the grouping; this
// file mounts the whole `MapsEditor` on the fixture that carries the surplus
// rooms and proves the three claims the panel makes in front of a person:
//
//   1. THE WAY IN AND THE SHAPE: the Places tab carries the entry only while
//      there is something to clean up; the panel lists one group, the kept
//      copy with no control, the two empty copies each with their OWN Remove,
//      and the copy holding a unit in its own block with the reason and no
//      control.
//   2. ONE PRESS, ONE CONFIRM, ONE ROW: arming names the copy; confirming
//      calls the transport exactly once with exactly that id; the group
//      shrinks by one on the reload; the note says what went and what stayed.
//   3. NOTHING BULK: no checkbox, no control whose label says "all", and an
//      editor mounted WITHOUT a remove transport renders no Remove at all --
//      absence is the mechanism, so the read-only case is structural.
//
// WHY THIS CANNOT BE A SERVER RENDER: 2 is about what a click does two
// renders later. Geometry is not asserted here (happy-dom has no layout);
// the 44px floor is `npm run verify:browser`'s claim, in
// `tools/browser-verify/routes/maps-edit-state-duplicates.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { mountInto, type Mounted } from './mount';
import MapsEditor from '../../src/lib/maps/MapsEditor.svelte';
import MapsDuplicates from '../../src/lib/maps/MapsDuplicates.svelte';
import {
	SURPLUS,
	mapsEditFixture,
	mapsEditFixtureWithSurplus,
	memoryMapsTransports
} from '../../src/routes/dev/maps-edit/fixture';
import { MAPS_ADMIN_CAPS } from '../../src/lib/maps/grants';
import { mapsDuplicateGroups, mapsDuplicateTotals } from '../../src/lib/maps/maps';
import type { MapsTransports } from '../../src/lib/maps/transports';

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

function openOnSurplus() {
	const data = mapsEditFixtureWithSurplus();
	const inner = memoryMapsTransports(data);
	const deletes: string[] = [];
	const transports: MapsTransports = {
		...inner,
		async deleteRow(table, id) {
			deletes.push(id);
			return inner.deleteRow(table, id);
		}
	};
	const m = mountInto(MapsEditor as never, {
		initial: data,
		transports,
		initialSelection: { kind: 'duplicates' }
	});
	mounted.push(m);
	return { m, data, deletes };
}

const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('1. the way in and the shape', () => {
	it('the Places tab carries the entry only while there is something to clean up', () => {
		const { m } = openOnSurplus();
		expect(m.all('[data-testid="maps-dup-entry"]')).toHaveLength(1);
		expect(text(m.one('[data-testid="maps-dup-entry"]'))).toBe('3 surplus copies of 1 container');

		const clean = mapsEditFixture();
		const none = mountInto(MapsEditor as never, {
			initial: clean,
			transports: memoryMapsTransports(clean),
			initialSelection: null
		});
		mounted.push(none);
		expect(none.all('[data-testid="maps-dup-entry"]')).toHaveLength(0);
		expect(none.all('[data-testid="maps-duplicates"]')).toHaveLength(0);
	});

	it('one group: the kept copy named with no control, two copies each with a Remove, one blocked with the reason', () => {
		const { m } = openOnSurplus();
		expect(m.all('[data-testid="maps-duplicates"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-dup-group"]')).toHaveLength(1);
		expect(text(m.one('[data-testid="maps-dup-summary"]'))).toBe(
			'3 surplus copies across 1 container. 2 can be removed from here, one at a time; 1 is listed separately with the reason.'
		);
		expect(text(m.one('[data-testid="maps-dup-keep"]'))).toMatch(/^Keeping the copy created /);

		const copies = m.all('[data-testid="maps-dup-copy"]');
		expect(copies).toHaveLength(3);
		expect(copies.filter((c) => c.getAttribute('data-removable') === 'true')).toHaveLength(2);
		expect(copies.filter((c) => c.getAttribute('data-removable') === 'false')).toHaveLength(1);
		// Each empty copy has ITS OWN arm; the blocked one has none and says why.
		expect(m.all('[data-testid="maps-dup-arm"]')).toHaveLength(2);
		const blocked = m.one('[data-testid="maps-dup-blocked"]');
		expect(blocked.querySelectorAll('[data-testid="maps-dup-arm"]')).toHaveLength(0);
		expect(text(blocked.querySelector('[data-testid="maps-dup-reason"]'))).toMatch(
			/^It holds 1 container, so it is not offered for removal here\./
		);
		// The kept copy is not a row in either list.
		expect(m.all('[data-testid="maps-dup-copy"]').length).toBe(
			mapsDuplicateTotals(mapsDuplicateGroups(mapsEditFixtureWithSurplus(), MAPS_ADMIN_CAPS)).surplus
		);
	});
});

describe('2. one press, one confirm, one row', () => {
	it('arming names the copy, confirming removes exactly that id, the group shrinks, the note says what went', async () => {
		const { m, data, deletes } = openOnSurplus();
		expect(m.all('[data-testid="maps-dup-confirm"]')).toHaveLength(0);

		const arm = m.all<HTMLButtonElement>('[data-testid="maps-dup-arm"]')[0];
		arm.click();
		flushSync();
		// Arming is not removing.
		expect(deletes).toEqual([]);
		expect(m.all('[data-testid="maps-dup-confirm"]')).toHaveLength(1);
		expect(text(m.one('[data-testid="maps-dup-confirm"] p'))).toMatch(
			/^Remove the "IDEA Classroom" created .+\? It holds nothing\. This cannot be undone\.$/
		);

		m.one<HTMLButtonElement>('[data-testid="maps-dup-do-remove"]').click();
		flushSync();
		await m.settle();
		await m.settle();

		// Exactly one delete, of the OLDEST safe copy (the first arm in the list), never the kept one.
		expect(deletes).toEqual([SURPLUS.safe[0]]);
		expect(data.nodes.some((n) => n.id === SURPLUS.safe[0])).toBe(false);
		expect(data.nodes.some((n) => n.id === SURPLUS.keep)).toBe(true);
		// The group is one smaller on screen: one arm left, the blocked copy still there and still explained.
		expect(m.all('[data-testid="maps-dup-group"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-dup-arm"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-dup-copy"][data-removable="false"]')).toHaveLength(1);
		expect(text(m.one('[data-testid="maps-dup-note"]'))).toMatch(
			/^Removed one copy of "IDEA Classroom" \(created .+\)\. The copy created .+ is kept\.$/
		);
		expect(text(m.one('[data-testid="maps-dup-entry"]'))).toBe('2 surplus copies of 1 container');
	});

	it('Keep it disarms without calling the transport', () => {
		const { m, deletes } = openOnSurplus();
		m.all<HTMLButtonElement>('[data-testid="maps-dup-arm"]')[0].click();
		flushSync();
		const keep = m
			.all<HTMLButtonElement>('[data-testid="maps-dup-confirm"] button')
			.find((b) => text(b) === 'Keep it')!;
		keep.click();
		flushSync();
		expect(m.all('[data-testid="maps-dup-confirm"]')).toHaveLength(0);
		expect(deletes).toEqual([]);
	});

	it('a transport refusal is reported on the panel and removes nothing', async () => {
		const data = mapsEditFixtureWithSurplus();
		const inner = memoryMapsTransports(data);
		const transports: MapsTransports = {
			...inner,
			async deleteRow() {
				return { ok: false, retryable: false, message: 'Something still lives inside this.' };
			}
		};
		const m = mountInto(MapsEditor as never, {
			initial: data,
			transports,
			initialSelection: { kind: 'duplicates' }
		});
		mounted.push(m);
		m.all<HTMLButtonElement>('[data-testid="maps-dup-arm"]')[0].click();
		flushSync();
		m.one<HTMLButtonElement>('[data-testid="maps-dup-do-remove"]').click();
		flushSync();
		await m.settle();
		expect(text(m.one('[data-testid="maps-dup-failure"]'))).toBe(
			'That copy was not removed: Something still lives inside this.'
		);
		expect(m.all('[data-testid="maps-dup-arm"]')).toHaveLength(1);
		expect(m.all('[data-testid="maps-dup-confirm"]')).toHaveLength(1);
		expect(data.nodes.filter((n) => n.name === 'IDEA Classroom')).toHaveLength(4);
	});
});

describe('3. nothing bulk, and absence is the mechanism', () => {
	it('no checkbox and no control whose label says "all"', () => {
		const { m } = openOnSurplus();
		const panel = m.one('[data-testid="maps-duplicates"]');
		expect(panel.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
		const labels = Array.from(panel.querySelectorAll('button')).map((b) => text(b).toLowerCase());
		expect(labels.length).toBeGreaterThan(0);
		expect(labels.filter((l) => /\ball\b/.test(l))).toEqual([]);
	});

	it('a panel mounted with no remove transport offers no Remove at all, and still lists every copy', () => {
		const data = mapsEditFixtureWithSurplus();
		const groups = mapsDuplicateGroups(data, MAPS_ADMIN_CAPS);
		const m = mountInto(MapsDuplicates as never, {
			groups,
			totals: mapsDuplicateTotals(groups),
			onselectnode: () => {}
		});
		mounted.push(m);
		expect(m.all('[data-testid="maps-dup-copy"]')).toHaveLength(3);
		expect(m.all('[data-testid="maps-dup-arm"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-dup-do-remove"]')).toHaveLength(0);
	});
});
