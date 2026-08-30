// tests/dom/maps-shelf-mount.test.ts
//
// THE CLAIMS ITEM ENTRY LIVES OR DIES BY, none of which a server render can
// reach, because every one of them is about what is true AFTER a press:
//
//  1. THE CONTAINER SURVIVES A SAVE. Cataloguing thirty things in a drawer
//     must not mean thirty round trips through a tree, so the card empties and
//     the drawer stays. This is the whole difference between the flow spec 7
//     asks for and a form somebody re-navigates to.
//  2. A REFUSED PHOTO NEVER LEAVES THE PHONE. The size check runs off
//     `File.size` before a byte moves, which is measurable here as the upload
//     transport's own log staying empty.
//  3. A SAVE WHOSE PHOTO FAILED KEEPS THE PHOTO. The row landed; the file is
//     still staged and the retry uploads only the photo.
//  4. WITHHOLDING THE PHOTO TRANSPORTS REMOVES THE CAMERA. Absence is the
//     mechanism, so read-only-ness is structural rather than a discipline.
//  5. PUBLISHING SAYS WHAT PUBLISHING MEANS, in a confirm step, because a
//     published row is `to anon` readable by anybody.
//
// WHAT IS ASSERTED AND WHAT IS NOT. Input values, element counts, focus, the
// transports' own call logs. NOT geometry, NOT contrast and NOT a tap target:
// happy-dom has no layout engine, so those read zero and pass vacuously (see
// `tests/dom/README.md`). That the flow fits 375px with no overflow and every
// control clears 44px is `npm run verify:browser`'s claim and stays there.
//
// MUTATION-CHECKED (this session, details in the history entry): making the
// save clear `containerId` -- the exact defect claim 1 exists for -- reddened
// this file, and it was restored from a scratch copy, md5-verified and re-run
// green.

import { describe, expect, it } from 'vitest';
import { mountInto } from './mount';
import ShelfEntry from '../../src/lib/maps/ShelfEntry.svelte';
import { FIX, shelfHarness } from '../../src/routes/dev/maps-shelf/fixture';

function open(overrides: Record<string, unknown> = {}) {
	const h = shelfHarness();
	let uuid = 0;
	const m = mountInto(ShelfEntry as never, {
		data: h.data,
		transports: h.transports,
		photos: h.photos.transports,
		initialContainerId: FIX.drawer1,
		viewerId: 'test-viewer',
		supabaseUrl: '',
		newUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
		onchanged: async () => {},
		...overrides
	});
	return { m, ...h };
}

const press = (el: Element | null | undefined) => {
	if (!el) throw new Error('no control to press');
	el.dispatchEvent(new Event('click', { bubbles: true }));
};
const type = (el: Element, value: string) => {
	(el as HTMLInputElement).value = value;
	el.dispatchEvent(new Event('input', { bubbles: true }));
};
const button = (m: { all: (s: string) => Element[] }, text: string) =>
	m.all('button').find((b) => (b.textContent ?? '').trim().startsWith(text));
/** Tick a radio the way a person does: the property moves, THEN change fires.
 *  A bare synthetic click does not move `checked` in this environment, and a
 *  handler wired to `change` would then never run -- which reads as a broken
 *  control and is the instrument. */
const choose = (el: Element) => {
	(el as HTMLInputElement).checked = true;
	el.dispatchEvent(new Event('change', { bubbles: true }));
};
/** Source is wrapped across lines; an editor reflowing a paragraph must not redden a claim about what it SAYS. */
const says = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A real File of a stated size, which is all the size gate reads. */
function photoOf(bytes: number, name = 'IMG_0001.jpg', mime = 'image/jpeg'): File {
	return new File([new Uint8Array(bytes)], name, { type: mime });
}
function pick(input: Element, file: File) {
	Object.defineProperty(input, 'files', { value: [file], configurable: true });
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function saveOne(m: ReturnType<typeof open>['m'], name: string) {
	type(m.one('[data-testid="maps-shelf-name"]'), name);
	m.flush();
	press(m.one('[data-testid="maps-shelf-save"]'));
	await m.settle();
}

describe('one flow: the container is context and a save does not take it away', () => {
	it('opens on the container it was given, named and with its whole chain', async () => {
		const { m } = open();
		expect(m.one('[data-testid="maps-shelf-container"]').textContent).toBe('Drawer 1');
		expect(m.one('[data-testid="maps-shelf-crumb"]').textContent).toContain('Tool Chest A');
		// The picker is not the surface when a container is already known.
		expect(m.all('[data-testid="maps-shelf-picker"]')).toHaveLength(0);
		await m.stop();
	});

	it('KEEPS THE CONTAINER ACROSS A SAVE, and empties the card for the next thing', async () => {
		const { m, data } = open();
		// A name the fixture does not already carry: `Mystery Fixture Plate`
		// is a real row in it, and finding THAT one would pass this test while
		// the save did nothing.
		await saveOne(m, 'Bevel Protractor');

		// The claim: same drawer, still named on screen.
		expect(m.one('[data-testid="maps-shelf-container"]').textContent).toBe('Drawer 1');
		// The card is ready for the next entry rather than holding the last one.
		expect((m.one('[data-testid="maps-shelf-name"]') as HTMLInputElement).value).toBe('');
		// And the row really landed, in THAT container -- so "kept the
		// container" is about where things go, not only about a heading.
		const created = data.items.find((i) => i.name === 'Bevel Protractor');
		expect(created?.node_id).toBe(FIX.drawer1);
		await m.stop();
	});

	it('puts a SECOND entry in the same container without anything being re-picked', async () => {
		const { m, data } = open();
		await saveOne(m, 'First thing');
		await saveOne(m, 'Second thing');
		const made = data.items.filter((i) => i.name === 'First thing' || i.name === 'Second thing');
		expect(made).toHaveLength(2);
		expect(made.every((i) => i.node_id === FIX.drawer1)).toBe(true);
		await m.stop();
	});

	it('returns focus to the name box, so the next entry is one keystroke away', async () => {
		const { m } = open();
		await saveOne(m, 'Thing');
		expect(document.activeElement).toBe(m.one('[data-testid="maps-shelf-name"]'));
		await m.stop();
	});

	it('leaves a receipt saying what was made and that it is a DRAFT', async () => {
		const { m } = open();
		await saveOne(m, 'Bevel Protractor');
		const receipts = m.all('[data-testid="maps-shelf-receipts"] li');
		expect(receipts).toHaveLength(1);
		expect(says(receipts[0])).toContain('Bevel Protractor in Drawer 1');
		// The acknowledgement has to survive the act it reports: the card that
		// would have carried it is exactly what the save just cleared.
		expect(receipts[0].querySelector('[data-state="draft"]')).not.toBeNull();
		expect(receipts[0].querySelector('[data-state="published"]')).toBeNull();
		await m.stop();
	});

	it('the container CAN still be changed, deliberately, which is the control for the claim above', async () => {
		// The positive control for "a save does not change the container": the
		// container is not merely immutable, it moves when a person moves it.
		const { m, data } = open();
		press(m.one('[data-testid="maps-shelf-change-container"]'));
		m.flush();
		const row = m
			.all('[data-testid="maps-shelf-picker"] .picker-row')
			.find((b) => (b.textContent ?? '').includes('Drawer 2'));
		press(row);
		m.flush();
		expect(m.one('[data-testid="maps-shelf-container"]').textContent).toBe('Drawer 2');
		await saveOne(m, 'In the other drawer');
		expect(data.items.find((i) => i.name === 'In the other drawer')?.node_id).toBe(FIX.drawer2);
		await m.stop();
	});
});

describe('the photo, and the refusal that happens before the transfer', () => {
	it('REFUSES AN OVER-LIMIT PHOTO WITHOUT UPLOADING ANYTHING', async () => {
		const { m, photos } = open();
		pick(m.one('[data-testid="maps-shelf-camera"]'), photoOf(21 * 1024 * 1024, 'huge.jpg'));
		m.flush();
		const problem = m.one('[data-testid="maps-shelf-photo-problem"]').textContent ?? '';
		expect(problem).toContain('21 MB');
		expect(problem).toContain('20 MB');
		// THE MEASUREMENT THAT MATTERS: nothing was sent. On school wifi a
		// refusal on the far end costs a minute; this one costs nothing.
		expect(photos.log).toHaveLength(0);
		await m.stop();
	});

	it('refuses an SVG, which the bucket\'s own image/* wildcard would take', async () => {
		const { m, photos } = open();
		pick(
			m.one('[data-testid="maps-shelf-picker-input"]'),
			new File(['<svg/>'], 'diagram.svg', { type: 'image/svg+xml' })
		);
		m.flush();
		expect(m.one('[data-testid="maps-shelf-photo-problem"]').textContent).toContain(
			'document rather than a photograph'
		);
		expect(photos.log).toHaveLength(0);
		await m.stop();
	});

	it('uploads an accepted photo under a CONCRETE image type and hangs it on the item', async () => {
		const { m, photos, data } = open();
		pick(m.one('[data-testid="maps-shelf-camera"]'), photoOf(2048, 'IMG_0042.HEIC', ''));
		m.flush();
		// The staged photo is announced as living only in this browser.
		expect(says(m.one('[data-testid="maps-shelf-photo-warning"]'))).toContain(
			'only in this browser'
		);
		await saveOne(m, 'Digital Caliper 2');

		expect(photos.log).toHaveLength(1);
		// 0163's obligation: File.type is empty for an iPhone HEIC, and an
		// empty type uploads as application/octet-stream, which the bucket
		// refuses. The extension is what the browser can still tell us.
		expect(photos.log[0].mimeType).toBe('image/heic');
		expect(photos.log[0].storageKey).toBe('item/00000000-0000-4000-8000-000000000001.heic');
		expect(photos.log[0].owner).toBe('item');
		const created = data.items.find((i) => i.name === 'Digital Caliper 2');
		expect(photos.log[0].ownerId).toBe(created?.id);
		// And the photo row points at the item that was just made.
		expect(data.photos.find((p) => p.item_id === created?.id)).toBeDefined();
		await m.stop();
	});

	it('hangs a STOCK entry\'s photo on the TYPE, because 0163 has no stock photos', async () => {
		const { m, photos, data } = open();
		pick(m.one('[data-testid="maps-shelf-camera"]'), photoOf(1024));
		type(m.one('[data-testid="maps-shelf-name"]'), 'M3 Cap Screw');
		m.flush();
		choose(m.all('[data-testid="maps-shelf-how-many"] input')[1]);
		m.flush();
		press(m.one('[data-testid="maps-shelf-save"]'));
		await m.settle();
		expect(photos.log[0].owner).toBe('item_type');
		const type_ = data.itemTypes.find((t) => t.name === 'M3 Cap Screw');
		expect(photos.log[0].ownerId).toBe(type_?.id);
		expect(photos.log[0].storageKey.startsWith('type/')).toBe(true);
		await m.stop();
	});

	it('A FAILED PHOTO NEVER ABANDONS THE ROW: the item saves, the photo stays, the retry works', async () => {
		const { m, photos, data } = open();
		photos.failOnce('The photo did not upload: the connection dropped.');
		pick(m.one('[data-testid="maps-shelf-camera"]'), photoOf(4096));
		await saveOne(m, 'Torque Wrench');

		// The row landed.
		const created = data.items.find((i) => i.name === 'Torque Wrench');
		expect(created).toBeDefined();
		// The receipt says which half is missing rather than reading as a
		// failed save.
		expect(says(m.one('[data-testid="maps-shelf-receipts"] li'))).toContain('photo not uploaded');
		// The photo is STILL HERE, and the retry sends only the photo.
		const retry = m.one('[data-testid="maps-shelf-photo-retry"]');
		expect(retry.textContent).toContain('photo did not upload');
		press(button(m, 'Upload the photo again'));
		await m.settle();
		expect(photos.log).toHaveLength(2);
		expect(data.photos.find((p) => p.item_id === created?.id)).toBeDefined();
		expect(m.all('[data-testid="maps-shelf-photo-retry"]')).toHaveLength(0);
		await m.stop();
	});

	it('WITHHOLDING THE PHOTO TRANSPORTS REMOVES THE CAMERA AND THE PICKER', async () => {
		const { m } = open({ photos: null });
		expect(m.all('[data-testid="maps-shelf-photo"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-shelf-camera"]')).toHaveLength(0);
		expect(m.all('[data-testid="maps-shelf-picker-input"]')).toHaveLength(0);
		// The positive control for those three zeros: with the transports
		// handed in, the same three selectors match. An absence row cannot
		// tell "the rule holds" from "the testid was renamed".
		await m.stop();
		const withPhotos = open();
		expect(withPhotos.m.all('[data-testid="maps-shelf-photo"]')).toHaveLength(1);
		expect(withPhotos.m.all('[data-testid="maps-shelf-camera"]')).toHaveLength(1);
		expect(withPhotos.m.all('[data-testid="maps-shelf-picker-input"]')).toHaveLength(1);
		await withPhotos.m.stop();
	});

	it('the camera input carries `capture` and the picker beside it does not', async () => {
		const { m } = open();
		const camera = m.one('[data-testid="maps-shelf-camera"]');
		const picker = m.one('[data-testid="maps-shelf-picker-input"]');
		// `capture` is a HINT the spec only says a browser SHOULD honour, and
		// on Android it additionally makes an input camera-ONLY -- so the two
		// inputs are the rule rather than a belt and braces, and the picker
		// must NOT carry it or there is no way back to the gallery.
		expect(camera.getAttribute('capture')).toBe('environment');
		expect(picker.hasAttribute('capture')).toBe(false);
		expect(camera.hasAttribute('multiple')).toBe(false);
		await m.stop();
	});
});

describe('publishing says what publishing means, at the moment it is pressed', () => {
	it('does not publish on the first press: it explains, then asks again', async () => {
		const { m, data } = open();
		type(m.one('[data-testid="maps-shelf-name"]'), 'Public Thing');
		m.flush();
		press(m.one('[data-testid="maps-shelf-publish-arm"]'));
		m.flush();
		const confirm = says(m.one('[data-testid="maps-shelf-publish-confirm"]'));
		expect(confirm).toContain('public map');
		expect(confirm).toContain('Anyone can read it without signing in');
		// Nothing has been written yet.
		expect(data.items.find((i) => i.name === 'Public Thing')).toBeUndefined();

		press(m.one('[data-testid="maps-shelf-publish-go"]'));
		await m.settle();
		const created = data.items.find((i) => i.name === 'Public Thing');
		expect(created?.status).toBe('published');
		expect(m.one('[data-testid="maps-shelf-receipts"] li [data-state="published"]')).not.toBeNull();
		await m.stop();
	});

	it('the ordinary Save makes a DRAFT with no confirm at all, because that is the frequent act', async () => {
		const { m, data } = open();
		await saveOne(m, 'Draft Thing');
		expect(data.items.find((i) => i.name === 'Draft Thing')?.status).toBe('draft');
		expect(m.all('[data-testid="maps-shelf-publish-confirm"]')).toHaveLength(0);
		await m.stop();
	});
});

describe('nothing typed is lost when the tab is not', () => {
	it('mirrors the card and puts it back on a fresh mount', async () => {
		const first = open();
		type(first.m.one('[data-testid="maps-shelf-name"]'), 'Half-typed thing');
		type(first.m.one('#shelf-notes'), 'chipped tip');
		first.m.flush();
		// The mirror is debounced, so let it land the way it does in a browser.
		await new Promise((r) => setTimeout(r, 500));
		await first.m.stop();

		const second = open();
		expect((second.m.one('[data-testid="maps-shelf-name"]') as HTMLInputElement).value).toBe(
			'Half-typed thing'
		);
		expect((second.m.one('#shelf-notes') as HTMLTextAreaElement).value).toBe('chipped tip');
		expect(says(second.m.one('[data-testid="maps-shelf-restored"]'))).toContain(
			'Put back what you had typed'
		);
		await second.m.stop();
	});

	it('CLEARS THE MIRROR ON A SAVE, so the next mount is not haunted by a saved entry', async () => {
		const first = open();
		type(first.m.one('[data-testid="maps-shelf-name"]'), 'Saved thing');
		first.m.flush();
		await new Promise((r) => setTimeout(r, 500));
		press(first.m.one('[data-testid="maps-shelf-save"]'));
		await first.m.settle();
		await first.m.stop();

		const second = open();
		expect((second.m.one('[data-testid="maps-shelf-name"]') as HTMLInputElement).value).toBe('');
		expect(second.m.all('[data-testid="maps-shelf-restored"]')).toHaveLength(0);
		await second.m.stop();
	});

	it('does not hand one viewer another viewer\'s typing on a shared device', async () => {
		const first = open({ viewerId: 'student-a' });
		type(first.m.one('[data-testid="maps-shelf-name"]'), 'A private half-thought');
		first.m.flush();
		await new Promise((r) => setTimeout(r, 500));
		await first.m.stop();

		const second = open({ viewerId: 'student-b' });
		expect((second.m.one('[data-testid="maps-shelf-name"]') as HTMLInputElement).value).toBe('');
		await second.m.stop();
		// The positive control: the SAME viewer does get it back, so the
		// isolation above is about the key and not about the mirror being
		// broken outright.
		const third = open({ viewerId: 'student-a' });
		expect((third.m.one('[data-testid="maps-shelf-name"]') as HTMLInputElement).value).toBe(
			'A private half-thought'
		);
		await third.m.stop();
	});
});

describe('reusing an existing type rather than minting a near-duplicate', () => {
	it('suggests a type by its alias and reuses it when picked', async () => {
		const { m, data } = open();
		type(m.one('[data-testid="maps-shelf-name"]'), 'allen');
		m.flush();
		const suggestion = m.one('[data-testid="maps-shelf-suggestions"] .suggest');
		expect(suggestion.textContent?.trim()).toBe('Hex Key Set');
		press(suggestion);
		m.flush();
		expect(says(m.one('[data-testid="maps-shelf-picked-type"]'))).toContain(
			'Editing those is the item type'
		);
		const typesBefore = data.itemTypes.length;
		press(m.one('[data-testid="maps-shelf-save"]'));
		await m.settle();
		// No second Hex Key Set was minted.
		expect(data.itemTypes).toHaveLength(typesBefore);
		expect(data.items.some((i) => i.item_type_id === FIX.hexKeyType && i.node_id === FIX.drawer1)).toBe(
			true
		);
		await m.stop();
	});

	it('warns before minting a second type with a name one already has', async () => {
		const { m } = open();
		type(m.one('[data-testid="maps-shelf-name"]'), 'Hex Key Set');
		m.flush();
		expect(says(m.one('[data-testid="maps-shelf-duplicate-warning"]'))).toContain(
			'already an item type called'
		);
		await m.stop();
	});
});
