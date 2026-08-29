// tests/dom/item-detail-delete-acknowledgement-mount.test.ts
//
// WHAT A SUCCESSFUL DELETE LOOKS LIKE, IN THE TWO ARRANGEMENTS THAT EXIST.
//
// THE DEFECT THIS FILE CLOSES. `remove()` used to end at `ondeleted?.()` and
// do nothing to the component itself: no unmount, no blanking, no
// acknowledgement. Production wires that callback to `goto()`, so on the live
// site the navigation carries the outcome and nobody ever saw the gap. Every
// dev harness passes no callback -- nine `ItemDetail` mounts across four `/dev`
// routes, not one of them supplies `ondeleted` -- and there a successful delete
// left the deleted item on screen, byte for byte as it was, which is
// indistinguishable from a silent failure. Measured on the shipping component
// before the change: the write landed, `res.ok` was true, and
// `target.textContent` did not move.
//
// THE RULE IT IS FIXED UNDER. An acknowledgement must survive the act it
// reports, and a delete's cannot render in the pane the delete just destroyed
// -- the recorded `/foundry/mine` lesson, where the confirmation lived in the
// detail pane, the app delete unmounted it, and the card vanished from the list
// with nothing anywhere saying a word. `ItemDetail` IS the whole page, so the
// surface on screen afterwards is either whatever a caller navigated to, or --
// with no caller -- this component, still mounted, showing a row that is gone.
//
// SO THE CALLBACK'S PRESENCE DECIDES, and BOTH directions are asserted here
// because either one alone is a component that is wrong in the other place:
//
//   1. NO CALLBACK -> the page is REPLACED by an acknowledgement naming the
//      item, plus a way back to the class. Not added above the page: every
//      control below acts on a row that no longer exists.
//   2. A CALLBACK -> the callback fires and the component renders EXACTLY what
//      it rendered before the press. Production must not show a "deleted" panel
//      for as long as a client-side navigation takes to run its loads, and must
//      not show a second acknowledgement beside whatever the caller shows.
//      Asserted as a byte comparison of `target.innerHTML` taken across the
//      press, which is the strongest available form of "nothing flashed".
//
// AND A REFUSAL IS NEITHER. A delete the server declined must not acknowledge
// anything, must leave the item on screen, and must say why -- the negative
// control that stops (1) from being "the page blanks whenever Delete is
// pressed twice".
//
// THE DELETE CONTROL IS BEHIND A COLLAPSED DISCLOSURE. It lives under
// `{#if inspectorOpen}`, the "Instructor tools" strip, so it is not on screen
// at mount and a test that queried for it directly would report a FALSE
// ABSENCE. Opening the strip is a step in the instrument, not an assumption,
// and `openInspector()` asserts the control arrived.
//
// MUTATION-CHECKED; the mutants and their outcomes are in this bundle's
// history entry.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';
import ItemDetail from '$lib/classroom/ItemDetail.svelte';
import { mountInto, type Mounted } from './mount';
import { itemInspector } from '$lib/classroom/inspector.svelte';
import type {
	ClassroomComposerTransports,
	ClassroomItem,
	ClassroomSection
} from '$lib/classroom/classroom';

const Detail = ItemDetail as unknown as Component<Record<string, unknown>>;

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	course: {
		id: 'course-1',
		code: 'IDEA209H',
		title: 'Engineering I Honors',
		active: true
	} as ClassroomSection['course']
};

const ITEM: ClassroomItem = {
	id: 'item-1',
	kind: 'material',
	title: 'Bridge loading worksheet',
	body: 'Read the loading table before Thursday.',
	points: null,
	due_at: null,
	category: null,
	author_email: 'teacher@boscotech.edu',
	author_name: 'A Teacher',
	published: true,
	pinned: false,
	sort_order: 0,
	first_published_at: '2026-08-01T00:00:00Z',
	edited_at: null,
	created_at: '2026-08-01T00:00:00Z',
	updated_at: '2026-08-01T00:00:00Z',
	links: [],
	attachments: [],
	postings: []
};

/**
 * A transports object whose ONLY live member is `deleteItem`. Everything else
 * throws rather than answering: this file drives one write, and a fixture that
 * quietly answered a call nobody meant to make is a fixture that could pass for
 * the wrong reason.
 */
function transportsWith(
	deleteItem: ClassroomComposerTransports['deleteItem']
): ClassroomComposerTransports {
	const refuse = (name: string) => () => {
		throw new Error(`${name} was called; this file drives deleteItem only`);
	};
	return {
		deleteItem,
		createItem: refuse('createItem'),
		updateItem: refuse('updateItem'),
		duplicateItem: refuse('duplicateItem'),
		addPostings: refuse('addPostings'),
		removePosting: refuse('removePosting'),
		setPublished: refuse('setPublished'),
		setPinned: refuse('setPinned'),
		setOrder: refuse('setOrder'),
		uploadAttachment: refuse('uploadAttachment'),
		deleteAttachment: refuse('deleteAttachment'),
		uploadInstructorAttachment: refuse('uploadInstructorAttachment'),
		deleteInstructorAttachment: refuse('deleteInstructorAttachment'),
		setInstructorResources: refuse('setInstructorResources'),
		// `markViewed` is the one exception, and it is not a write this file
		// drives: an `$effect` fires it for a NON-manager. Every mount here is a
		// manager, so the effect returns early -- but a throwing stand-in would
		// turn a future non-manager mount into a crash rather than a finding.
		markViewed: async () => {}
	} as unknown as ClassroomComposerTransports;
}

function mountDetail(
	transports: ClassroomComposerTransports,
	ondeleted: (() => void) | null
): Mounted {
	return mountInto(Detail, {
		section: SECTION,
		item: ITEM,
		canManage: true,
		transports,
		ondeleted
	});
}

/**
 * The "Instructor tools" strip, opened. The delete control is inside it.
 *
 * IT PRESSES ONLY IF THE STRIP IS SHUT, because the open state is MODULE state
 * (`inspector.svelte.ts`) and therefore shared by every mount in this process --
 * deliberately, so a teacher clicking through items does not reopen the tools
 * on each one. An unconditional press is a TOGGLE: it opened the strip in the
 * first test of this file and shut it again in the second. `beforeEach` resets
 * the module so the tests are order-independent; this guard is what keeps the
 * helper honest if that reset is ever dropped.
 */
function openInspector(m: Mounted): HTMLButtonElement {
	const strip = m.one<HTMLButtonElement>('[data-testid="inspector-toggle"]');
	if (strip.getAttribute('aria-expanded') !== 'true') {
		strip.click();
		m.flush();
	}
	expect(strip.getAttribute('aria-expanded')).toBe('true');
	const del = m
		.all<HTMLButtonElement>('button')
		.find((b) => b.textContent?.trim() === 'Delete');
	// A false absence is the failure shape this directory exists to avoid
	// producing, so the instrument asserts its own step landed.
	expect(del, 'the Delete control did not appear after opening Instructor tools').toBeTruthy();
	return del!;
}

/** Press it twice: arm, then confirm. Returns after the write settles. */
async function pressDeleteTwice(m: Mounted, del: HTMLButtonElement): Promise<void> {
	del.click();
	m.flush();
	expect(del.textContent?.trim()).toBe('Really delete?');
	del.click();
	await m.settle();
}

let mounted: Mounted | null = null;
beforeEach(() => {
	// Module state, shared across mounts in this process. See `openInspector`.
	itemInspector.open = false;
});
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

describe('with no ondeleted -- every dev harness, and nothing else will say so', () => {
	it('replaces the page with an acknowledgement naming the item', async () => {
		const deleteItem = vi.fn(async () => ({ ok: true as const, data: undefined }));
		const m = (mounted = mountDetail(transportsWith(deleteItem), null));

		const before = m.target.textContent ?? '';
		expect(before).toContain('Bridge loading worksheet');

		await pressDeleteTwice(m, openInspector(m));

		expect(deleteItem).toHaveBeenCalledTimes(1);
		expect(deleteItem).toHaveBeenCalledWith('item-1');

		// THE FINDING, INVERTED. Before this change the assertion that held here
		// was `m.target.textContent === before`.
		const note = m.one<HTMLElement>('[data-testid="item-removed"]');
		expect(note.textContent).toContain('is deleted');
		expect(note.textContent).toContain('Bridge loading worksheet');
		expect(note.getAttribute('role')).toBe('status');
		expect(m.target.textContent).not.toBe(before);
	});

	it('takes the dead item and every control on it off the page', async () => {
		const m = (mounted = mountDetail(
			transportsWith(async () => ({ ok: true as const, data: undefined })),
			null
		));

		const del = openInspector(m);

		// POSITIVE CONTROLS, read live from the OPENED page: the things that must
		// go are demonstrably there first, so their absence afterwards cannot be a
		// selector that never matched. (Read after `openInspector`, because the
		// delete control does not exist until the strip is open -- which is the
		// false absence this file's header warns about, found by this assertion
		// failing the first time it ran.)
		expect(m.all('h1').length).toBeGreaterThan(0);
		expect(m.all('[data-testid="item-inspector"]').length).toBe(1);
		const deleteControls = () =>
			m.all<HTMLButtonElement>('button').filter((b) => /delete/i.test(b.textContent ?? ''));
		expect(deleteControls().length).toBeGreaterThan(0);

		await pressDeleteTwice(m, del);

		expect(m.all('[data-testid="item-inspector"]').length).toBe(0);
		expect(deleteControls().length).toBe(0);
		expect(m.target.textContent).not.toContain('Read the loading table before Thursday.');
	});

	it('offers a way back to the class, which is the only place left to go', async () => {
		const m = (mounted = mountDetail(
			transportsWith(async () => ({ ok: true as const, data: undefined })),
			null
		));
		await pressDeleteTwice(m, openInspector(m));

		const back = m.all<HTMLAnchorElement>('a[href]');
		const hrefs = back.map((a) => a.getAttribute('href'));
		expect(hrefs).toContain('/classroom/sec-1');
	});

	it('honours basePath rather than hardcoding /classroom', async () => {
		const m = (mounted = mountInto(Detail, {
			section: SECTION,
			item: ITEM,
			canManage: true,
			transports: transportsWith(async () => ({ ok: true as const, data: undefined })),
			ondeleted: null,
			basePath: '/dev/classroom'
		}));
		await pressDeleteTwice(m, openInspector(m));

		const hrefs = m.all<HTMLAnchorElement>('a[href]').map((a) => a.getAttribute('href'));
		expect(hrefs).toContain('/dev/classroom/sec-1');
		expect(hrefs).not.toContain('/classroom/sec-1');
	});
});

describe('with an ondeleted -- production, where the caller owns the outcome', () => {
	it('fires the callback once, after the write, and renders nothing new', async () => {
		const order: string[] = [];
		const deleteItem = vi.fn(async () => {
			order.push('write');
			return { ok: true as const, data: undefined };
		});
		const ondeleted = vi.fn(() => {
			order.push('callback');
		});
		const m = (mounted = mountDetail(transportsWith(deleteItem), ondeleted));

		const del = openInspector(m);
		// Taken BEFORE the first press, from the open, unarmed page. That is the
		// state a successful delete must return to: `remove()` disarms the confirm
		// on its way out, so the label is "Delete" again and every other node is
		// untouched. Snapshotting the ARMED frame instead was the first shape of
		// this assertion and it failed on exactly that one word -- which is the
		// confirm working, not a flash.
		const beforeHtml = m.target.innerHTML;

		del.click();
		m.flush();
		expect(del.textContent?.trim()).toBe('Really delete?');
		del.click();
		await m.settle();

		expect(order).toEqual(['write', 'callback']);
		expect(ondeleted).toHaveBeenCalledTimes(1);

		// NO FLASH, stated as strongly as this instrument can state it: the whole
		// subtree is byte-identical to the page before Delete was ever pressed, so
		// there is no acknowledgement, no blanked item and no half-torn-down page
		// for the caller's navigation to interrupt.
		expect(m.target.innerHTML).toBe(beforeHtml);
		expect(m.all('[data-testid="item-removed"]').length).toBe(0);
		expect(m.target.textContent).toContain('Bridge loading worksheet');
	});

	it('does not fire the callback on a refused delete, and says why', async () => {
		const ondeleted = vi.fn();
		const m = (mounted = mountDetail(
			transportsWith(async () => ({ ok: false as const, message: 'Only a manager can do that.' })),
			ondeleted
		));

		await pressDeleteTwice(m, openInspector(m));

		expect(ondeleted).not.toHaveBeenCalled();
		expect(m.all('[data-testid="item-removed"]').length).toBe(0);
		expect(m.target.textContent).toContain('Only a manager can do that.');
		expect(m.target.textContent).toContain('Bridge loading worksheet');
	});
});

describe('a refusal with no callback either -- the acknowledgement is not unconditional', () => {
	it('leaves the item on screen and reports the refusal', async () => {
		const m = (mounted = mountDetail(
			transportsWith(async () => ({ ok: false as const, message: 'That did not work.' })),
			null
		));

		await pressDeleteTwice(m, openInspector(m));

		// The negative control for the first describe: the page is replaced
		// because the delete SUCCEEDED, not because Delete was pressed twice.
		expect(m.all('[data-testid="item-removed"]').length).toBe(0);
		expect(m.target.textContent).toContain('That did not work.');
		expect(m.target.textContent).toContain('Bridge loading worksheet');
		expect(m.all('[data-testid="item-inspector"]').length).toBe(1);
	});

	it('re-arms rather than sticking, so a refusal can be retried deliberately', async () => {
		const deleteItem = vi.fn(async () => ({
			ok: false as const,
			message: 'That did not work.'
		}));
		const m = (mounted = mountDetail(transportsWith(deleteItem), null));

		const del = openInspector(m);
		await pressDeleteTwice(m, del);
		expect(deleteItem).toHaveBeenCalledTimes(1);
		expect(del.textContent?.trim()).toBe('Delete');

		// One press is now an ARM again, not a second write.
		del.click();
		await m.settle();
		expect(deleteItem).toHaveBeenCalledTimes(1);
		expect(del.textContent?.trim()).toBe('Really delete?');
	});
});
