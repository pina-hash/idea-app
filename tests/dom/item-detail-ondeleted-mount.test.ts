// tests/dom/item-detail-ondeleted-mount.test.ts
//
// `ItemDetail.ondeleted` -- the post-delete navigation, on the REAL component.
//
// WHY THIS FILE EXISTS. The prop defaults `null` (ItemDetail.svelte:116) and
// fires at ItemDetail.svelte:469, the last statement of `remove()`. Production
// wires it to a navigation:
// `ondeleted={() => goto(`/classroom/${data.section.id}`)}`
// (classroom/[sectionId]/item/[itemId]/+page.svelte:103). Verified for this
// bundle: sweeping `src/routes/dev/` for the name returns NOTHING, so not one
// of the nine harness mounts of `ItemDetail` supplies it, and no file under
// `tests/` names it either. The delete path has therefore only ever been driven
// with the callback absent -- which is the one arrangement that cannot show
// what the callback is FOR.
//
// WHAT THE ORDER ACTUALLY IS, and why it is worth pinning. The repo already
// records the adjacent lesson: a delete's acknowledgement cannot render in the
// pane the delete just unmounted, so a delete's note belongs on the surface
// that is on screen afterwards. `ItemDetail` resolves that by doing NOTHING to
// itself -- it disarms the confirm, clears `busy`, and calls out. It does not
// unmount, does not blank the item, and renders no acknowledgement of any kind.
// So the entire user-visible outcome of a successful delete lives in the
// caller's callback, and a mount that omits it gets a delete that succeeds
// server-side while the deleted item stays on screen exactly as it was. That is
// what every harness has been showing, and it is indistinguishable from the
// delete having silently failed.
//
// Structure, events and call order only. happy-dom has no layout engine, so no
// geometry, contrast or tap-target claim appears here.

import { afterEach, describe, expect, it, vi } from 'vitest';

// See the sibling attachments file for why this is mocked here rather than in
// the shared stub: `guardSaveNavigation` calls `beforeNavigate` during init and
// `tests/stubs/app-navigation.ts` exports no lifecycle hook.
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('$app/navigation');
	return { ...actual, beforeNavigate: () => {}, afterNavigate: () => {} };
});

import ItemDetail from '../../src/lib/classroom/ItemDetail.svelte';
import { SECTION, ITEMS } from '../../src/routes/dev/classroom-split/fixture';
import type { ClassroomItem } from '../../src/lib/classroom/classroom';
import { mountInto, type Mounted } from './mount';

/** Any published item; the delete control is a manager control, not a kind-specific one. */
const ITEM: ClassroomItem = (() => {
	const found = ITEMS.find((i) => i.published);
	if (!found) throw new Error('the split fixture has no published item');
	return found;
})();

interface Recorder {
	/** Every call the component made, in order, across transports AND callbacks. */
	order: string[];
	/** Ids passed to deleteItem. */
	deleted: string[];
}

/**
 * Manage transports whose `deleteItem` answers as configured.
 *
 * Only the methods this path can reach are real; the rest throw if called, so a
 * component that took a different route would fail loudly rather than quietly
 * being measured on the wrong branch.
 */
function manageTransports(rec: Recorder, result: { ok: boolean; message?: string }) {
	const unexpected = (name: string) => () => {
		throw new Error(`the delete path called ${name}, which it must not`);
	};
	return {
		createItem: unexpected('createItem'),
		updateItem: unexpected('updateItem'),
		deleteItem: async (id: string) => {
			rec.order.push('deleteItem');
			rec.deleted.push(id);
			return result.ok
				? ({ ok: true, data: undefined } as never)
				: ({ ok: false, message: result.message ?? 'refused' } as never);
		},
		duplicateItem: unexpected('duplicateItem'),
		addPostings: unexpected('addPostings'),
		removePosting: unexpected('removePosting'),
		setPinned: unexpected('setPinned'),
		setPublished: unexpected('setPublished'),
		reorder: unexpected('reorder')
	} as never;
}

/**
 * OPEN THE INSPECTOR FIRST. The manager's control row lives behind
 * `{#if inspectorOpen}` (ItemDetail.svelte:603), a collapsed "Instructor tools"
 * strip. So the delete control is not on screen at mount and a test that looked
 * for it straight away would report it missing -- which is the shape of a false
 * absence, and is why this is a step rather than an assumption.
 */
function openInspector(d: Mounted): void {
	const strip = d
		.all<HTMLButtonElement>('button')
		.find((b) => (b.textContent ?? '').includes('Instructor tools'));
	if (!strip) throw new Error('no Instructor tools strip rendered');
	if (strip.getAttribute('aria-expanded') !== 'true') strip.click();
	d.flush();
}

/** The manager's delete button, by the label it carries in either state. */
function deleteButton(d: Mounted): HTMLButtonElement {
	const btn = d
		.all<HTMLButtonElement>('button.danger')
		.find((b) => /Delete|Really delete/.test(b.textContent ?? ''));
	if (!btn) throw new Error('no delete control rendered');
	return btn;
}

function mountManager(
	rec: Recorder,
	opts: { ondeleted?: (() => void) | null; deleteResult?: { ok: boolean; message?: string } } = {}
): Mounted {
	const props: Record<string, unknown> = {
		section: SECTION,
		item: ITEM,
		canManage: true,
		transports: manageTransports(rec, opts.deleteResult ?? { ok: true })
	};
	// UNDEFINED IS THE HARNESS STATE. Omitting the key is exactly what all nine
	// existing mounts do; supplying it is what production does.
	if (opts.ondeleted !== undefined) props.ondeleted = opts.ondeleted;
	const m = mountInto(ItemDetail as never, props);
	openInspector(m);
	return m;
}

function recorder(): Recorder {
	return { order: [], deleted: [] };
}

let open: Mounted[] = [];
function track(m: Mounted): Mounted {
	open.push(m);
	return m;
}
afterEach(async () => {
	for (const m of open) await m.stop();
	open = [];
});

describe('the delete confirm is two presses, and the first one writes nothing', () => {
	it('arms on the first press and calls no transport', async () => {
		const rec = recorder();
		const d = track(mountManager(rec));
		const btn = deleteButton(d);
		expect(btn.textContent?.trim()).toBe('Delete');

		btn.click();
		await d.settle();

		// The label is the whole confirmation surface, so it is the assertion.
		expect(deleteButton(d).textContent?.trim()).toBe('Really delete?');
		expect(rec.order).toEqual([]);
	});

	it('deletes on the second press, passing the item id', async () => {
		const rec = recorder();
		const d = track(mountManager(rec));
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		expect(rec.order).toEqual(['deleteItem']);
		expect(rec.deleted).toEqual([ITEM.id]);
	});
});

describe('what the component has done to itself by the time ondeleted fires', () => {
	it('fires the callback exactly once, AFTER the transport answers', async () => {
		const rec = recorder();
		const d = track(
			mountManager(rec, { ondeleted: () => rec.order.push('ondeleted') })
		);
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		// ORDER, not just occurrence: firing before the write returns would send
		// the caller navigating away from a delete that may still be refused.
		expect(rec.order).toEqual(['deleteItem', 'ondeleted']);
	});

	it('has NOT unmounted, blanked or acknowledged anything -- the item is still on screen', async () => {
		// THE FINDING THIS FILE EXISTS FOR. `remove()` disarms the confirm, clears
		// `busy` and calls out; it changes nothing else. So at the instant the
		// callback runs the deleted item is still fully rendered, which is why the
		// acknowledgement has to live on the surface the CALLER navigates to. A
		// future change that tried to render "Deleted." here would have to redden
		// this.
		const rec = recorder();
		let textAtCallback = '';
		const d = track(
			mountManager(rec, {
				ondeleted: () => {
					rec.order.push('ondeleted');
					textAtCallback = d.target.textContent ?? '';
				}
			})
		);
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		expect(rec.order).toContain('ondeleted');
		// Still the item, read INSIDE the callback rather than after it.
		expect(textAtCallback).toContain(ITEM.title);
		// And no acknowledgement of any kind was rendered in its place.
		expect(textAtCallback).not.toMatch(/deleted\.|has been deleted|removed\./i);
		// The control is back to its unarmed label, so the pane reads as though
		// nothing happened at all.
		expect(deleteButton(d).textContent?.trim()).toBe('Delete');
	});

	it('with NO callback -- every harness -- the write lands and the screen does not move', async () => {
		// The undriven arrangement, asserted rather than described. This is what a
		// reviewer driving `/dev/classroom` sees today: a successful delete that
		// looks identical to a delete that silently failed.
		const rec = recorder();
		const d = track(mountManager(rec));
		const before = d.target.textContent ?? '';
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		expect(rec.order).toEqual(['deleteItem']);
		expect(d.target.textContent).toContain(ITEM.title);
		expect(d.target.textContent).toBe(before);
	});
});

describe('a refused delete', () => {
	it('does NOT fire the callback, and says what went wrong instead', async () => {
		// `remove()` returns early on `!res.ok` (ItemDetail.svelte:466), so the
		// caller must not navigate. A callback that fired here would take the
		// manager away from the message telling them the delete did not happen.
		const rec = recorder();
		const d = track(
			mountManager(rec, {
				ondeleted: () => rec.order.push('ondeleted'),
				deleteResult: { ok: false, message: 'This item still has submissions.' }
			})
		);
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		expect(rec.order).toEqual(['deleteItem']);
		expect(rec.order).not.toContain('ondeleted');
		expect(d.target.textContent).toContain('This item still has submissions.');
	});

	it('re-arms rather than staying stuck, so the manager can try again', async () => {
		const rec = recorder();
		const d = track(
			mountManager(rec, { deleteResult: { ok: false, message: 'refused once' } })
		);
		deleteButton(d).click();
		await d.settle();
		deleteButton(d).click();
		await d.settle();

		// Disarmed by `remove()` before the write, so a retry is two presses again
		// -- the confirm is not skipped just because the last attempt failed.
		expect(deleteButton(d).textContent?.trim()).toBe('Delete');
		expect(deleteButton(d).disabled).toBe(false);
	});
});
