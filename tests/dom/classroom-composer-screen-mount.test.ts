// tests/dom/classroom-composer-screen-mount.test.ts
//
// THE EDITOR AS A FULL-VIEWPORT LAYER (prompt 0118, item EIGHT) AND THE 0193
// LAYOUT CONTROLS INSIDE IT (item FOUR), asserted on the REAL ContentComposer.
//
// WHAT THIS FILE CAN SAY. happy-dom runs `$effect`s, delivers real events to
// real listeners and keeps a real `document.activeElement` -- so the dialog's
// CONTRACT is assertable here: it exists only in screen mode and wraps the
// same `.composer` root, Close and Escape both reach `oncancel`, the body is
// scroll-locked while it is mounted and restored after, focus lands in the
// title and goes back to the opener, and the 0193 controls come and go with
// the transport's presence. The save-time writes are assertable too: a
// placement moved off what the item carried reaches `setItemLayout` once, an
// untouched one never does, and a file order moved with the keyboard reaches
// `setAttachmentOrder` BEFORE the uploads -- a file is staged through a real
// paste and the two transports record into ONE array, so the order is read
// rather than inferred.
//
// THREE THINGS THE FIRST REVIEW OF THIS LAYER FOUND, pinned here so they stay
// found: an Escape a NESTED control handled (the attachment rename input) must
// not also close the whole editor; removing an existing file -- an immediate,
// already-landed write -- must not read as unsaved work while a reorder must;
// and ItemDetail's edit composer asks before discarding what was typed, in
// both directions (untouched closes silently, typed asks once).
//
// AND THE OTHER RENDER PATH. ItemDetail draws the Links and Files cards ABOVE
// the body when the author placed them there; every other test renders the
// default, so the `top` branch is asserted here by document order against the
// default as the control.
//
// WHAT IT CANNOT SAY. Nothing about geometry: the layer's z-order, its 44px
// Close, its viewport coverage and its zero horizontal overflow are the
// browser spec's (`tools/browser-verify/routes/classroom-inspector-case-
// assignment-layout-*.mjs`). A box read here is 0x0 and passes vacuously.
//
// EVERY GATING CLAIM IS ASSERTED IN BOTH DIRECTIONS WITH COUNTS, per CLAUDE.md:
// screen on / screen off, transport given / transport null.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Component } from 'svelte';

// ItemDetail mounts `guardSaveNavigation`, which calls `beforeNavigate` during
// init, and `tests/stubs/app-navigation.ts` exports no lifecycle hook -- the
// same mock the sibling `item-detail-*` files carry, for the same reason.
vi.mock('$app/navigation', async () => {
	const actual = await vi.importActual<Record<string, unknown>>('$app/navigation');
	return { ...actual, beforeNavigate: () => {}, afterNavigate: () => {} };
});

import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import ItemDetail from '$lib/classroom/ItemDetail.svelte';
import type { ClassroomLayoutTransports, ItemLayout } from '$lib/classroom/attachments';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';
import type {
	ClassroomComposerTransports,
	ClassroomItem,
	ClassroomSection,
	TxResult
} from '$lib/classroom/classroom';
import { imagePasteEvent } from './drag-events';
import { mountInto, type Mounted } from './mount';

const Composer = ContentComposer as unknown as Component<Record<string, unknown>>;

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

function item(layout: ItemLayout | null = { files: 'bottom', links: 'bottom' }): ClassroomItem {
	const row: ClassroomItem & { layout?: ItemLayout } = {
		id: 'item-1',
		kind: 'assignment',
		title: 'Bridge stackup',
		body: 'Measure the truss.',
		body_doc: null,
		points: 20,
		due_at: null,
		category: null,
		author_email: 'teacher@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		is_public: false,
		publish_at: null,
		unit_id: null,
		sort_order: 1,
		first_published_at: '2026-08-10T16:00:00.000Z',
		edited_at: null,
		created_at: '2026-08-10T16:00:00.000Z',
		updated_at: '2026-08-10T16:00:00.000Z',
		links: [
			{ id: 'l-1', label: 'Calculator', url: 'https://example.org/a' },
			{ id: 'l-2', label: 'Reference', url: 'https://example.org/b' }
		],
		attachments: [
			{ id: 'a-1', filename: 'truss.pdf', mime_type: 'application/octet-stream', sort_order: 1 },
			{ id: 'a-2', filename: 'span.xlsx', mime_type: 'application/octet-stream', sort_order: 2 }
		],
		postings: [{ section_id: 'sec-1' }]
	};
	if (layout) row.layout = layout;
	return row;
}

const ok = <T,>(data: T): Promise<TxResult<T>> => Promise.resolve({ ok: true, data });

/** The smallest transport object a SAVE in edit mode needs. */
const transports = {
	updateItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	createItem: () => ok({ itemId: 'item-1', sectionIds: ['sec-1'], formattingDropped: false }),
	uploadAttachment: () => ok(undefined),
	uploadInstructorAttachment: () => ok(undefined),
	deleteAttachment: () => ok(undefined),
	deleteInstructorAttachment: () => ok(undefined),
	setInstructorResources: () => ok(undefined),
	addPostings: () => ok({ added: 0 }),
	removePosting: () => ok({ ok: true }),
	loadCategorySuggestions: () => ok([])
} as unknown as ClassroomComposerTransports;

/** A recording 0193 transport: every call is appended, every call succeeds. */
function layoutStub() {
	const calls: { method: string; args: unknown[] }[] = [];
	const t: ClassroomLayoutTransports = {
		setItemLayout: (id, layout) => {
			calls.push({ method: 'setItemLayout', args: [id, { ...layout }] });
			return ok(undefined);
		},
		setAttachmentOrder: (id, ids) => {
			calls.push({ method: 'setAttachmentOrder', args: [id, [...ids]] });
			return ok(undefined);
		},
		renameAttachment: (_id, filename) => ok({ filename }),
		setInstructorAttachmentOrder: (id, ids) => {
			calls.push({ method: 'setInstructorAttachmentOrder', args: [id, [...ids]] });
			return ok(undefined);
		},
		renameInstructorAttachment: (_id, filename) => ok({ filename })
	};
	return { t, calls };
}

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	document.body.style.overflow = '';
});

function mountEdit(props: Record<string, unknown>) {
	mounted = mountInto(Composer, {
		mode: 'edit',
		item: item(),
		sections: [SECTION],
		transports,
		onsaved: () => {},
		...props
	});
	return mounted;
}

const key = (k: string) =>
	new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });

describe('screen mode: the layer', () => {
	it('screen renders ONE dialog around the SAME .composer root; inline renders none (both directions)', async () => {
		const on = mountEdit({ screen: true, compact: true, oncancel: () => {} });
		await on.settle();
		expect(on.all('[role="dialog"].composer-screen')).toHaveLength(1);
		expect(on.all('.composer-screen[aria-modal="true"]')).toHaveLength(1);
		expect(on.all('.composer-screen .composer')).toHaveLength(1);
		expect(on.all('.composer')).toHaveLength(1);
		// `compact` is ignored in screen mode, even when handed in.
		expect(on.all('.composer.compact')).toHaveLength(0);
		expect(on.all('[data-testid="composer-screen-close"]')).toHaveLength(1);
		// The existing selectors every other spec uses still match inside it.
		expect(on.all('.composer-screen .composer-actions.top')).toHaveLength(1);
		expect(on.all('.composer-screen .attach-editor')).toHaveLength(1);
		expect(on.all('.composer-screen [data-testid="composer-publish-top"]')).toHaveLength(1);
		await on.stop();

		const off = mountEdit({ screen: false, compact: true, oncancel: () => {} });
		await off.settle();
		expect(off.all('[role="dialog"].composer-screen')).toHaveLength(0);
		expect(off.all('[data-testid="composer-screen-close"]')).toHaveLength(0);
		expect(off.all('.composer')).toHaveLength(1);
		expect(off.all('.composer.compact')).toHaveLength(1);
	});

	it('the heading names what is being edited and the dialog points at it', async () => {
		const m = mountEdit({ screen: true, oncancel: () => {} });
		await m.settle();
		const dialog = m.one<HTMLElement>('[role="dialog"].composer-screen');
		const heading = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
		expect(heading?.textContent?.trim()).toBe('Edit assignment');
	});

	it('Close and Escape both reach oncancel; inline mode ignores Escape', async () => {
		let cancels = 0;
		const m = mountEdit({ screen: true, oncancel: () => (cancels += 1) });
		await m.settle();
		m.one<HTMLButtonElement>('[data-testid="composer-screen-close"]').click();
		m.flush();
		expect(cancels).toBe(1);
		const esc = key('Escape');
		document.dispatchEvent(esc);
		m.flush();
		expect(cancels).toBe(2);
		expect(esc.defaultPrevented).toBe(true);
		await m.stop();

		let inlineCancels = 0;
		const inline = mountEdit({ screen: false, oncancel: () => (inlineCancels += 1) });
		await inline.settle();
		document.dispatchEvent(key('Escape'));
		inline.flush();
		expect(inlineCancels).toBe(0);
	});

	it('locks the body scroll while mounted and restores what was there', async () => {
		document.body.style.overflow = 'auto';
		const m = mountEdit({ screen: true, oncancel: () => {} });
		await m.settle();
		expect(document.body.style.overflow).toBe('hidden');
		await m.stop();
		expect(document.body.style.overflow).toBe('auto');
	});

	it('inline mode never touches the body scroll', async () => {
		document.body.style.overflow = 'auto';
		const m = mountEdit({ screen: false, oncancel: () => {} });
		await m.settle();
		expect(document.body.style.overflow).toBe('auto');
	});

	it('focus lands in the title on mount and returns to the opener on destroy', async () => {
		const opener = document.createElement('button');
		opener.textContent = 'Edit post';
		document.body.appendChild(opener);
		opener.focus();
		expect(document.activeElement).toBe(opener);
		const m = mountEdit({ screen: true, oncancel: () => {} });
		await m.settle();
		const title = m.one<HTMLInputElement>('.composer-screen input[type="text"]');
		expect(document.activeElement).toBe(title);
		await m.stop();
		expect(document.activeElement).toBe(opener);
		opener.remove();
	});
});

describe('an Escape a nested control already handled stays with that control', () => {
	/**
	 * THE ATTACHMENT RENAME INPUT cancels ITSELF on Escape and `preventDefault`s
	 * it; the layer's document-level listener hears the same keypress next.
	 * MEASURED before the fix: rename inputs after Escape 0, `oncancel` 1 --
	 * one keypress in a rename box closed the whole editor. The positive
	 * control is the same Escape on the document afterwards, which still
	 * reaches `oncancel` exactly once.
	 */
	it('Escape in the rename input cancels the rename (1 -> 0) and NOT the editor (oncancel 0), then a bare Escape does (1)', async () => {
		let cancels = 0;
		const { t } = layoutStub();
		const m = mountEdit({ screen: true, oncancel: () => (cancels += 1), layoutTransports: t });
		await m.settle();
		const starts = m.all<HTMLButtonElement>('.composer .attach-editor [data-testid="attach-rename-start"]');
		expect(starts.length).toBeGreaterThan(0);
		starts[0].click();
		m.flush();
		const input = m.one<HTMLInputElement>('[data-testid="attach-rename-input"]');
		expect(m.all('[data-testid="attach-rename-input"]')).toHaveLength(1);
		const esc = key('Escape');
		input.dispatchEvent(esc);
		m.flush();
		expect({
			renameInputs: m.all('[data-testid="attach-rename-input"]').length,
			handledByRename: esc.defaultPrevented,
			cancels
		}).toEqual({ renameInputs: 0, handledByRename: true, cancels: 0 });
		// Positive control: an Escape nobody else handled still closes the layer.
		document.dispatchEvent(key('Escape'));
		m.flush();
		expect(cancels).toBe(1);
	});
});

describe('the 0193 controls come and go with the transport', () => {
	it('present with a transport, absent with null, on the same fixture (counts both ways)', async () => {
		const { t } = layoutStub();
		const withT = mountEdit({ screen: true, oncancel: () => {}, layoutTransports: t });
		await withT.settle();
		expect(withT.all('[data-testid="place-files"]')).toHaveLength(1);
		expect(withT.all('[data-testid="place-links"]')).toHaveLength(1);
		expect(withT.all('[data-testid="place-files"] [role="radio"]')).toHaveLength(2);
		// One grip per link row, on the student-facing list (2 links in the fixture).
		expect(withT.all('.composer > .resources-editor .order-grip')).toHaveLength(2);
		expect(withT.all('.composer > .resources-editor .resource-row')).toHaveLength(2);
		// And one per EXISTING file row, which is what the transport gates.
		const fileRows = withT.all('.attach-row').length;
		expect(fileRows).toBeGreaterThan(0);
		expect(withT.all('[data-testid="attach-grip"]')).toHaveLength(fileRows);
		await withT.stop();

		const without = mountEdit({ screen: true, oncancel: () => {}, layoutTransports: null });
		await without.settle();
		expect(without.all('[data-testid="place-files"]')).toHaveLength(0);
		expect(without.all('[data-testid="place-links"]')).toHaveLength(0);
		// THE FILE order controls go with the transport (they need the 0193
		// write); the LINK order controls do NOT (a link's position is stored
		// by the save that has always existed), so the link grips are the
		// positive control here rather than a second absence.
		expect(without.all('[data-testid="attach-grip"]')).toHaveLength(0);
		expect(without.all('[data-testid="attach-move-up"]')).toHaveLength(0);
		expect(without.all('.composer > .resources-editor .order-grip')).toHaveLength(2);
		expect(without.all('.composer > .resources-editor .order-tools')).toHaveLength(2);
		// Positive controls: the rows the controls would have sat on are there.
		expect(without.all('.composer > .resources-editor .resource-row')).toHaveLength(2);
		expect(without.all('.composer-actions')).toHaveLength(2);
	});

	it('the placement seeds from what the item carries', async () => {
		const { t } = layoutStub();
		mounted = mountInto(Composer, {
			mode: 'edit',
			item: item({ files: 'top', links: 'bottom' }),
			sections: [SECTION],
			transports,
			onsaved: () => {},
			screen: true,
			oncancel: () => {},
			layoutTransports: t
		});
		await mounted.settle();
		const files = mounted.all<HTMLButtonElement>('[data-testid="place-files"] [role="radio"]');
		const links = mounted.all<HTMLButtonElement>('[data-testid="place-links"] [role="radio"]');
		expect(files.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
		expect(links.map((b) => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
		// COLOUR IS NEVER THE ONLY SIGNAL: the word is the same on both options,
		// so the checked one carries a glyph and the unchecked one does not --
		// one per group, both directions, and it follows the choice.
		expect(mounted.all('.place-opt[aria-checked="true"] svg.place-check')).toHaveLength(2);
		expect(mounted.all('.place-opt[aria-checked="false"] svg.place-check')).toHaveLength(0);
		files[1].click();
		mounted.flush();
		expect(files[0].querySelectorAll('svg.place-check')).toHaveLength(0);
		expect(files[1].querySelectorAll('svg.place-check')).toHaveLength(1);
	});
});

describe('the 0193 writes on save', () => {
	async function save(m: Mounted) {
		m.one<HTMLButtonElement>('[data-testid="composer-publish-top"]').click();
		// The save is a chain of awaited transports; give it real macrotasks.
		for (let i = 0; i < 4; i++) await m.settle();
	}

	it('an UNTOUCHED placement and order write nothing (the negative control)', async () => {
		const { t, calls } = layoutStub();
		const m = mountEdit({ screen: true, oncancel: () => {}, layoutTransports: t });
		await m.settle();
		await save(m);
		expect(calls).toEqual([]);
	});

	it('a placement moved off what the item carried reaches setItemLayout ONCE, with both groups', async () => {
		const { t, calls } = layoutStub();
		const m = mountEdit({ screen: true, oncancel: () => {}, layoutTransports: t });
		await m.settle();
		const above = m.all<HTMLButtonElement>('[data-testid="place-files"] [role="radio"]')[0];
		above.click();
		m.flush();
		expect(above.getAttribute('aria-checked')).toBe('true');
		await save(m);
		expect(calls.filter((c) => c.method === 'setItemLayout')).toEqual([
			{ method: 'setItemLayout', args: ['item-1', { files: 'top', links: 'bottom' }] }
		]);
		expect(calls.filter((c) => c.method === 'setAttachmentOrder')).toHaveLength(0);
		// And the second save, with nothing else moved, writes nothing again:
		// the saved copy advanced with the write.
		calls.length = 0;
		await save(m);
		expect(calls).toEqual([]);
	});

	it('a file order moved with the keyboard reaches setAttachmentOrder with the full new id array', async () => {
		const { t, calls } = layoutStub();
		const m = mountEdit({ screen: true, oncancel: () => {}, layoutTransports: t });
		await m.settle();
		const grips = m.all<HTMLElement>('.composer .attach-editor [data-sort-handle]');
		expect(grips).toHaveLength(2);
		grips[0].focus();
		grips[0].dispatchEvent(key('ArrowDown'));
		m.flush();
		await save(m);
		expect(calls.filter((c) => c.method === 'setAttachmentOrder')).toEqual([
			{ method: 'setAttachmentOrder', args: ['item-1', ['a-2', 'a-1']] }
		]);
		expect(calls.filter((c) => c.method === 'setItemLayout')).toHaveLength(0);
	});

	/**
	 * THE ORDER WRITE LANDS BEFORE THE UPLOADS, read off one array both
	 * transports record into. `classroom_set_attachment_order` refuses an
	 * array that is not exactly the item's attachment set, so it has to run
	 * while the set is still the rows the form opened on -- before an upload
	 * records a row the array could not name. A file is staged the way a
	 * teacher stages one, by pasting a screenshot into the form.
	 */
	it('a staged file uploads AFTER setAttachmentOrder, in one recorded sequence', async () => {
		const { t, calls } = layoutStub();
		const recording = {
			...transports,
			uploadAttachment: (id: string, file: File) => {
				calls.push({ method: 'uploadAttachment', args: [id, file.name] });
				return ok(undefined);
			}
		} as unknown as ClassroomComposerTransports;
		const m = mountEdit({
			screen: true,
			oncancel: () => {},
			layoutTransports: t,
			transports: recording,
			attachmentsEnabled: true
		});
		await m.settle();
		m.one<HTMLInputElement>('.composer-screen input[type="text"]').dispatchEvent(
			imagePasteEvent('shot.png')
		);
		m.flush();
		expect(m.all('.composer .fup[data-role="attachment"] .fup-name')).toHaveLength(1);
		const grips = m.all<HTMLElement>('.composer .attach-editor [data-sort-handle]');
		grips[0].focus();
		grips[0].dispatchEvent(key('ArrowDown'));
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="composer-publish-top"]').click();
		for (let i = 0; i < 8; i++) await m.settle();
		expect(calls.map((c) => c.method)).toEqual(['setAttachmentOrder', 'uploadAttachment']);
		expect(calls[1].args).toEqual(['item-1', 'shot.png']);
	});
});

describe('what the dirty signal counts as unsaved work', () => {
	/**
	 * REMOVING AN EXISTING FILE IS AN IMMEDIATE WRITE, already landed by the
	 * time the row is gone, so the guard must not ask about it. MEASURED
	 * before the fix: `ondirtychange` false,true on Remove alone, nothing else
	 * touched. A REORDER is the positive control: it is written only on save,
	 * so it IS unsaved work until then.
	 */
	it('Remove on a landed row does not dirty the form (rows 2 -> 1, dirty stays false)', async () => {
		const seen: boolean[] = [];
		const { t } = layoutStub();
		const m = mountEdit({
			screen: true,
			oncancel: () => {},
			layoutTransports: t,
			ondirtychange: (d: boolean) => seen.push(d)
		});
		await m.settle();
		const rowsBefore = m.all('.composer .attach-editor [data-sort-item]').length;
		const remove = m
			.all<HTMLButtonElement>('.composer .attach-editor button')
			.find((b) => (b.textContent ?? '').trim() === 'Remove');
		if (!remove) throw new Error('no Remove control on the existing-file list');
		remove.click();
		for (let i = 0; i < 3; i++) await m.settle();
		expect({
			rowsBefore,
			rowsAfter: m.all('.composer .attach-editor [data-sort-item]').length,
			everDirty: seen.includes(true),
			last: seen[seen.length - 1]
		}).toEqual({ rowsBefore: 2, rowsAfter: 1, everDirty: false, last: false });
	});

	it('a keyboard reorder DOES dirty the form (the positive control)', async () => {
		const seen: boolean[] = [];
		const { t } = layoutStub();
		const m = mountEdit({
			screen: true,
			oncancel: () => {},
			layoutTransports: t,
			ondirtychange: (d: boolean) => seen.push(d)
		});
		await m.settle();
		expect(seen[seen.length - 1]).toBe(false);
		const grips = m.all<HTMLElement>('.composer .attach-editor [data-sort-handle]');
		grips[0].focus();
		grips[0].dispatchEvent(key('ArrowDown'));
		m.flush();
		expect(seen[seen.length - 1]).toBe(true);
		// And back again: the original order is not unsaved work.
		grips[0].focus();
		m.all<HTMLElement>('.composer .attach-editor [data-sort-handle]')[1].dispatchEvent(key('ArrowUp'));
		m.flush();
		expect(seen[seen.length - 1]).toBe(false);
	});
});

/* ---------------------------------------------------------------------------
   ItemDetail: the other render path, and the guard on its edit composer.
   ------------------------------------------------------------------------ */

const CHECK_IN: ClassCheckIn = {
	session_id: 'ns-1',
	section_id: 'sec-1',
	unit_number: 2,
	session_date: '2026-08-20',
	session_label: 'Truss layout sketch',
	status: null,
	flag_reason: null,
	item_id: 'item-1',
	guidance_doc: null
};

/** The manage transports ItemDetail's own controls name, none of which this
 *  file drives; every one resolves. */
const manageTransports = {
	...transports,
	deleteItem: () => ok(undefined),
	duplicateItem: () => ok({ itemId: 'item-2' }),
	setPinned: () => ok(undefined),
	setPublished: () => ok(undefined),
	reorder: () => ok(undefined)
} as unknown as ClassroomComposerTransports;

/** `a` precedes `b` in document order. */
const precedes = (a: Element, b: Element) =>
	(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

function mountDetail(props: Record<string, unknown>) {
	mounted = mountInto(ItemDetail as unknown as Component<Record<string, unknown>>, {
		section: SECTION,
		item: item(),
		sections: [SECTION],
		canManage: false,
		checkIns: [CHECK_IN],
		...props
	});
	return mounted;
}

describe('ItemDetail: where the Links and Files cards sit', () => {
	it('placed ABOVE: after the check-in and before the body (top 1/1, bottom 0/0)', async () => {
		const m = mountDetail({ item: item({ files: 'top', links: 'top' }) });
		await m.settle();
		expect(m.all('[data-testid="item-links-card"][data-placement="top"]')).toHaveLength(1);
		expect(m.all('[data-testid="item-files-card"][data-placement="top"]')).toHaveLength(1);
		expect(m.all('[data-testid="item-links-card"][data-placement="bottom"]')).toHaveLength(0);
		expect(m.all('[data-testid="item-files-card"][data-placement="bottom"]')).toHaveLength(0);
		const checkIns = m.one('[data-testid="item-check-ins"]');
		const links = m.one('[data-testid="item-links-card"]');
		const files = m.one('[data-testid="item-files-card"]');
		const body = m.one('[data-testid="item-body-disclosure"]');
		expect([precedes(checkIns, links), precedes(links, files), precedes(files, body)]).toEqual([
			true,
			true,
			true
		]);
	});

	it('the default, and a row carrying no layout at all: BELOW the body (bottom 1/1, top 0/0)', async () => {
		for (const fixture of [item(), item(null)]) {
			const m = mountDetail({ item: fixture });
			await m.settle();
			expect(m.all('[data-testid="item-links-card"][data-placement="bottom"]')).toHaveLength(1);
			expect(m.all('[data-testid="item-files-card"][data-placement="bottom"]')).toHaveLength(1);
			expect(m.all('[data-testid="item-links-card"][data-placement="top"]')).toHaveLength(0);
			expect(m.all('[data-testid="item-files-card"][data-placement="top"]')).toHaveLength(0);
			const body = m.one('[data-testid="item-body-disclosure"]');
			const links = m.one('[data-testid="item-links-card"]');
			const files = m.one('[data-testid="item-files-card"]');
			expect([precedes(body, links), precedes(links, files)]).toEqual([true, true]);
			await m.stop();
		}
	});
});

describe('ItemDetail: the edit composer asks before discarding typed work', () => {
	const realConfirm = window.confirm;
	afterEach(() => {
		window.confirm = realConfirm;
	});

	/** Open the inspector strip, then press Edit post, and wait for the editor
	 *  to report its baseline (the seed arrives from the body editor's own
	 *  `onready`, a tick after mount). */
	async function openEditor(m: Mounted) {
		const strip = m
			.all<HTMLButtonElement>('button')
			.find((b) => (b.textContent ?? '').includes('Instructor tools'));
		if (!strip) throw new Error('no Instructor tools strip rendered');
		if (strip.getAttribute('aria-expanded') !== 'true') strip.click();
		m.flush();
		m.one<HTMLButtonElement>('[data-testid="item-edit-toggle"]').click();
		for (let i = 0; i < 3; i++) await m.settle();
		expect(m.all('[role="dialog"].composer-screen')).toHaveLength(1);
	}

	function typeTitle(m: Mounted, value: string) {
		const title = m.one<HTMLInputElement>('.composer-screen input[type="text"]');
		title.value = value;
		title.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
	}

	it('untouched: Escape closes with no question (dialog 1 -> 0, confirm 0)', async () => {
		const confirm = vi.fn(() => false);
		window.confirm = confirm as unknown as typeof window.confirm;
		const m = mountDetail({ canManage: true, transports: manageTransports });
		await openEditor(m);
		document.dispatchEvent(key('Escape'));
		m.flush();
		expect({ dialogs: m.all('[role="dialog"].composer-screen').length, asked: confirm.mock.calls.length }).toEqual({
			dialogs: 0,
			asked: 0
		});
	});

	it('typed: Escape, Close and the toggle each ask once and keep the editor on "no"; "yes" closes it', async () => {
		const confirm = vi.fn(() => false);
		window.confirm = confirm as unknown as typeof window.confirm;
		const m = mountDetail({ canManage: true, transports: manageTransports });
		await openEditor(m);
		typeTitle(m, 'Bridge stackup, revised');
		document.dispatchEvent(key('Escape'));
		m.flush();
		expect({ dialogs: m.all('[role="dialog"].composer-screen').length, asked: confirm.mock.calls.length }).toEqual({
			dialogs: 1,
			asked: 1
		});
		m.one<HTMLButtonElement>('[data-testid="composer-screen-close"]').click();
		m.flush();
		expect({ dialogs: m.all('[role="dialog"].composer-screen').length, asked: confirm.mock.calls.length }).toEqual({
			dialogs: 1,
			asked: 2
		});
		m.one<HTMLButtonElement>('[data-testid="item-edit-toggle"]').click();
		m.flush();
		expect({ dialogs: m.all('[role="dialog"].composer-screen').length, asked: confirm.mock.calls.length }).toEqual({
			dialogs: 1,
			asked: 3
		});
		confirm.mockReturnValue(true);
		document.dispatchEvent(key('Escape'));
		m.flush();
		expect({ dialogs: m.all('[role="dialog"].composer-screen').length, asked: confirm.mock.calls.length }).toEqual({
			dialogs: 0,
			asked: 4
		});
	});
});
