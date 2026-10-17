// tests/dom/class-view-toolbar-mount.test.ts
//
// THE CLASS PAGE'S TOOLBAR ROW, DRIVEN ON THE REAL ClassView (ledger 0396,
// part 7). What regresses silently, and so what this mounts the component to
// hold:
//   - THE SEARCH FIELD IS NEVER REBUILT WHILE SOMEBODY TYPES. The Videos key is
//     derived from what the search leaves showing, so typing can take it out of
//     the row and clearing can put it back; with the Videos key arranged FIRST,
//     a row keyed on its first member would rebuild the field in another slot
//     and drop the caret mid-word (`classToolbars`' header). The same <input>
//     must survive both, focused.
//   - SELECT ALL IS NEVER REBUILT BY THE FIRST TICK, and stays the row's last
//     control, so the key a teacher may press next is the element that was
//     there.
//   - WHILE ANYTHING IS TICKED THE FILTERS MAKE WAY (review round 2): the
//     row is `.selecting` and the selection's tray leads it; the search field
//     and the kind picker are the SAME elements throughout, so ending the
//     selection hands back a half-typed word; the count of a narrowed list
//     stays; asking for the search ends the selection. At rest there is no
//     tray and nothing held in reserve.
//   - CLEAR SELECTION PUTS THE FOCUS ON SELECT ALL (review round 3), in the
//     toolbar and in the bulk row alike, rather than dropping it to the page;
//     CLEAR PUTS IT BACK IN THE SEARCH FIELD, from a key, a mouse or a tap
//     (polish rounds 1 and 2), never on the kind filter.
//   - The Videos key opens and closes its list in place.
// Geometry (one line at 1440, the gap to the first unit, the band under the
// row, the list kept under the pointer) is `npm run verify:browser`'s:
// happy-dom lays nothing out.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ClassView from '$lib/classroom/ClassView.svelte';
import { CLOCK, ITEMS, SECTION } from '../classroom-panel-layout-render-cases';
import { mountInto, type Mounted } from './mount';
import { runCommand } from '$lib/shell/command-handlers';

const View = ClassView as unknown as Component<Record<string, unknown>>;

const mounted: Mounted[] = [];
afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

function mountView(extra: Record<string, unknown> = {}): Mounted {
	const m = mountInto(View, { section: SECTION, items: ITEMS, clock: CLOCK, basePath: '/classroom', ...extra });
	mounted.push(m);
	return m;
}

const row = (m: Mounted) => m.one<HTMLElement>('.class-toolbar');

function type(input: HTMLInputElement, value: string) {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('the search field survives the Videos key coming and going', () => {
	for (const [name, layout] of [
		['nothing stored', null],
		['the Videos key arranged first', { order: ['banner', 'teams', 'videos', 'find', 'stream'], hidden: [] }]
	] as const) {
		it(`${name}: the same focused <input> before, during and after`, async () => {
			const m = mountView({ canManage: false, panelLayout: layout });
			const input = m.one<HTMLInputElement>('[data-testid="stream-search"]');
			const lead = layout ? 'videos find' : 'find videos';
			expect(row(m).dataset.toolbar).toBe(lead);
			input.focus();
			expect(document.activeElement).toBe(input);
			// "gear" leaves the two gear posts showing and not the post with the video.
			type(input, 'gear');
			await m.settle();
			expect(row(m).dataset.toolbar).toBe('find');
			expect(m.all('[data-testid="class-videos"]')).toHaveLength(0);
			expect(m.one('[data-testid="stream-search"]')).toBe(input);
			expect(document.activeElement).toBe(input);
			expect(input.value).toBe('gear');
			// POSITIVE CONTROL: the search did narrow the list, so the key's absence is the search's doing.
			expect(m.one('[data-testid="stream-find-result"]').textContent).toMatch(/2 of \d+ shown/);
			type(input, '');
			await m.settle();
			expect(row(m).dataset.toolbar).toBe(lead);
			expect(m.all('[data-testid="class-videos"]')).toHaveLength(1);
			expect(m.one('[data-testid="stream-search"]')).toBe(input);
			expect(document.activeElement).toBe(input);
		});
	}
});

describe('Select all, the first tick and the tray', () => {
	it('a teacher: the first tick puts the tray at the head of the row and the filters make way; Clear selection brings them back as they were', async () => {
		const m = mountView({ canManage: true, transports: {}, unitTransports: {} });
		const r = row(m);
		const all = m.one<HTMLButtonElement>('[data-testid="bulk-select-all"]');
		const input = m.one<HTMLInputElement>('[data-testid="stream-search"]');
		const kind = m.one<HTMLElement>('.class-toolbar .find-kind');
		const controls = () => [...r.querySelectorAll('button, select, input, a')];
		// AT REST: Select all is the row's last control and the only bulk one.
		// POSITIVE CONTROL for the absences: the filters and Select all are here.
		expect(r.classList.contains('selecting')).toBe(false);
		expect(all.textContent?.trim()).toMatch(/^Select all \(\d+\)$/);
		expect(controls().at(-1)).toBe(all);
		expect(m.all('[data-testid="bulk-bar"], [data-testid="bulk-publish"], [data-testid="bulk-count"], [data-testid="bulk-row"]')).toHaveLength(0);
		expect(r.querySelectorAll('[inert]')).toHaveLength(0);

		const box = m.one<HTMLInputElement>('[data-testid="row-select-ws"]');
		box.click();
		await m.settle();
		// TICKED: the row is selecting, so the stylesheet hides the search,
		// the kind filter, the chips and the duplicates door (`.selecting`);
		// the tray LEADS the row, ahead of every member, and Select all is the
		// same element, still last.
		expect(r.classList.contains('selecting')).toBe(true);
		const tray = m.one<HTMLElement>('.class-toolbar [data-testid="bulk-bar"]');
		expect(r.firstElementChild).toBe(tray);
		expect(m.one('[data-testid="bulk-count"]').textContent?.trim()).toBe('1 selected');
		for (const id of ['bulk-publish', 'bulk-unit-select', 'bulk-delete', 'bulk-clear']) {
			expect(tray.querySelectorAll(`[data-testid="${id}"]`), id).toHaveLength(1);
		}
		expect(m.one('[data-testid="bulk-select-all"]')).toBe(all);
		expect(controls().at(-1)).toBe(all);
		expect(tray.contains(all)).toBe(false);
		// THE FILTERS ARE KEPT, NOT REBUILT: the same search field and kind
		// picker, so ending the selection hands them back as they were.
		expect(m.one('[data-testid="stream-search"]')).toBe(input);
		expect(m.one('.class-toolbar .find-kind')).toBe(kind);
		// Each label that changes carries the room of its longest form, sized
		// by the class's own count, never as words a reader meets.
		expect(m.one<HTMLElement>('.bulk-slot').dataset.reserve).toBe('00 selected');
		const delLabel = m.one<HTMLElement>('[data-testid="bulk-delete"] .bulk-label');
		// Delete's armed words wrap to two lines inside its key, so its room is
		// the longer line ("Really delete"), not the whole sentence.
		expect(delLabel.dataset.reserve).toBe('Really delete');
		expect(delLabel.classList.contains('bulk-wraps')).toBe(true);
		expect(all.querySelector<HTMLElement>('.bulk-label')?.dataset.reserve).toBe('Deselect all (00)');

		// ARMED: Delete names the count; nothing else in the tray changes.
		const del = m.one<HTMLButtonElement>('[data-testid="bulk-delete"]');
		del.click();
		await m.settle();
		expect(del.textContent?.trim()).toBe('Really delete 1 item?');
		expect(m.one('[data-testid="bulk-bar"]')).toBe(tray);
		expect(m.one('[data-testid="bulk-count"]').textContent?.trim()).toBe('1 selected');

		all.click();
		await m.settle();
		expect(all.textContent?.trim()).toMatch(/^Deselect all \(\d+\)$/);
		expect(m.one('[data-testid="bulk-bar"]')).toBe(tray);

		// CLEAR SELECTION FROM THE KEYBOARD'S POSITION (review round 3): the key
		// goes with its tray, and the focus lands on Select all, which stays.
		const clear = m.one<HTMLButtonElement>('[data-testid="bulk-clear"]');
		clear.focus();
		expect(document.activeElement).toBe(clear);
		clear.click();
		await m.settle();
		expect(r.classList.contains('selecting')).toBe(false);
		expect(m.all('[data-testid="bulk-bar"], [data-testid="bulk-count"]')).toHaveLength(0);
		expect(m.one('[data-testid="bulk-select-all"]')).toBe(all);
		expect(document.activeElement).toBe(all);
		expect(m.one('[data-testid="stream-search"]')).toBe(input);
		// No layout here, so the line planner measured nothing and wrote
		// nothing: the row is the plain flex wrap (`balanceToolbar`).
		expect(r.querySelectorAll('[style*="margin-inline-end"], [style*="flex-basis"]')).toHaveLength(0);
	});

	it('a narrowed list: the count of what is shown stays while the filters make way, and the half-typed word comes back', async () => {
		const m = mountView({ canManage: true, transports: {}, unitTransports: {} });
		const r = row(m);
		const input = m.one<HTMLInputElement>('[data-testid="stream-search"]');
		type(input, 'gear');
		await m.settle();
		expect(m.one('[data-testid="stream-find-result"]').textContent).toMatch(/2 of \d+ shown/);
		// THE COUNT IS A LINE OF ITS OWN AFTER EVERY KEY (review round 4), Select
		// all included, so it never takes width from the field being typed in.
		const all = m.one('[data-testid="bulk-select-all"]');
		expect(!!(all.compareDocumentPosition(m.one('[data-testid="stream-find-result"]')) & 4)).toBe(true);
		m.one<HTMLInputElement>('[data-testid^="row-select-"]').click();
		await m.settle();
		expect(r.classList.contains('selecting')).toBe(true);
		// The count is the one filter element the selection does not hide
		// (`.find-result` is not in the `.selecting` list), so a filtered class
		// never passes for one that lost its items.
		const result = m.one<HTMLElement>('[data-testid="stream-find-result"]');
		expect(result.closest('.class-toolbar')).toBe(r);
		expect(result.textContent).toMatch(/2 of \d+ shown/);
		expect(m.one('[data-testid="stream-search"]')).toBe(input);
		expect(input.value).toBe('gear');
		m.one<HTMLButtonElement>('[data-testid="bulk-clear"]').click();
		await m.settle();
		expect(r.classList.contains('selecting')).toBe(false);
		expect(m.one('[data-testid="stream-search"]')).toBe(input);
		expect(input.value).toBe('gear');
	});

	it('asking for the search while anything is ticked ends the selection and focuses the field', async () => {
		const m = mountView({ canManage: true, transports: {}, unitTransports: {} });
		const r = row(m);
		const input = m.one<HTMLInputElement>('[data-testid="stream-search"]');
		m.one<HTMLInputElement>('[data-testid="row-select-ws"]').click();
		await m.settle();
		expect(r.classList.contains('selecting')).toBe(true);
		expect(runCommand('class.search')).toBe(true);
		await m.settle();
		expect(r.classList.contains('selecting')).toBe(false);
		expect(m.all('[data-testid="bulk-count"]')).toHaveLength(0);
		expect(document.activeElement).toBe(input);
	});

	it('the toolbar moved below the posts: the bulk row at the top of the posts holds the tray once ticked, Select all last', async () => {
		const m = mountView({
			canManage: true,
			transports: {},
			unitTransports: {},
			panelLayout: { order: ['stream', 'banner', 'teams', 'find', 'videos'], hidden: [] }
		});
		const bulk = m.one<HTMLElement>('[data-testid="bulk-row"]');
		const all = m.one<HTMLButtonElement>('[data-testid="bulk-select-all"]');
		expect(bulk.contains(all)).toBe(true);
		expect(m.all('[data-testid="bulk-bar"]')).toHaveLength(0);
		m.one<HTMLInputElement>('[data-testid="row-select-ws"]').click();
		await m.settle();
		const tray = m.one<HTMLElement>('[data-testid="bulk-bar"]');
		expect(bulk.firstElementChild).toBe(tray);
		expect(bulk.lastElementChild).toBe(all);
		expect(m.one('[data-testid="bulk-select-all"]')).toBe(all);
		// The toolbar there is not selecting: its filters are not the ones in the way.
		expect(row(m).classList.contains('selecting')).toBe(false);
		// Clear selection here too puts the focus on this row's Select all.
		const clear = m.one<HTMLButtonElement>('[data-testid="bulk-clear"]');
		clear.focus();
		clear.click();
		await m.settle();
		expect(m.all('[data-testid="bulk-bar"]')).toHaveLength(0);
		expect(document.activeElement).toBe(all);
	});

	// A mouse press or a tap is a click with a count of one (`detail`); a
	// keyboard's Enter or Space on a button is a click with none.
	const pointerClick = (b: HTMLButtonElement) => b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
	/** A touch screen: `(pointer: coarse)` answers true, everything else as it was. */
	function coarseScreen(): () => void {
		const real = window.matchMedia;
		window.matchMedia = ((query: string) =>
			query.includes('pointer: coarse') ? ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList) : real.call(window, query)) as typeof window.matchMedia;
		return () => {
			window.matchMedia = real;
		};
	}
	for (const [how, press, touch] of [
		['from the keyboard', (b: HTMLButtonElement) => b.click(), false],
		['with a mouse', pointerClick, false],
		// Polish round 1 sent a tap on a touch screen to the kind filter, lit.
		['with a tap on a touch screen', pointerClick, true]
	] as const) {
		it(`CLEAR HANDS THE FOCUS BACK TO THE SEARCH FIELD ${how} (polish rounds 1 and 2), from the count line and from the "No items match" card, never to the kind filter or the page`, async () => {
			const restore = touch ? coarseScreen() : () => {};
			try {
				const m = mountView({ canManage: false });
				const input = m.one<HTMLInputElement>('[data-testid="stream-search"]');
				const kinds = m.one<HTMLSelectElement>('[data-testid="stream-kind"]');
				type(input, 'gear');
				await m.settle();
				const clear = m.one<HTMLButtonElement>('[data-testid="stream-clear"]');
				clear.focus();
				// POSITIVE CONTROL: the focus is on Clear, inside the line that is about to go.
				expect(document.activeElement).toBe(clear);
				press(clear);
				await m.settle();
				expect(m.all('[data-testid="stream-find-result"]')).toHaveLength(0);
				expect(input.value).toBe('');
				expect(document.activeElement).toBe(input);
				expect(document.activeElement).not.toBe(kinds);
				// A word that matches nothing: the card under the posts has its own Clear.
				type(input, 'nothing-at-all-zzz');
				await m.settle();
				const card = m.one<HTMLButtonElement>('[data-testid="stream-find-none"] .find-clear');
				card.focus();
				expect(document.activeElement).toBe(card);
				press(card);
				await m.settle();
				expect(m.all('[data-testid="stream-find-none"]')).toHaveLength(0);
				expect(document.activeElement).toBe(input);
			} finally {
				restore();
			}
		});

		it(`the search row hidden: Clear ${how} hands the focus to the first key after the count, a button or a link, never the page`, async () => {
			const restore = touch ? coarseScreen() : () => {};
			try {
				const m = mountView({ canManage: false, panelLayout: { order: [], hidden: ['find'] }, opensOn: 'todo' });
				expect(m.all('[data-testid="stream-search"]')).toHaveLength(0);
				const clear = m.one<HTMLButtonElement>('[data-testid="stream-clear"]');
				clear.focus();
				press(clear);
				await m.settle();
				expect(m.all('[data-testid="stream-find-result"]')).toHaveLength(0);
				const active = document.activeElement as HTMLElement | null;
				expect(active && active !== document.body && m.target.contains(active)).toBe(true);
				expect(active!.matches('button, a[href]')).toBe(true);
			} finally {
				restore();
			}
		});
	}

	it('a student: no Select all and no tray in the row (the teacher test above is the positive control)', () => {
		const m = mountView({ canManage: false });
		expect(row(m).querySelectorAll('[data-testid="bulk-bar"], [data-testid="bulk-select-all"]')).toHaveLength(0);
		expect(m.all('[data-testid^="row-select-"]')).toHaveLength(0);
	});
});

describe('the Videos key opens its list in place', () => {
	it('closed on arrival, open on a press, closed again; the list is in the row the whole time', async () => {
		const m = mountView({ canManage: false });
		const key = m.trigger('class-videos-toggle')!;
		const body = m.one<HTMLElement>('.class-toolbar .cvid-body');
		expect(key.getAttribute('aria-expanded')).toBe('false');
		expect(body.dataset.open).toBe('false');
		expect(key.getAttribute('aria-controls')).toBe(body.id);
		key.click();
		await m.settle();
		expect(key.getAttribute('aria-expanded')).toBe('true');
		expect(key.classList.contains('on')).toBe(true);
		expect(body.dataset.open).toBe('true');
		expect(body.querySelectorAll('[data-testid="class-video"]')).toHaveLength(1);
		key.click();
		await m.settle();
		expect(key.getAttribute('aria-expanded')).toBe('false');
		expect(body.dataset.open).toBe('false');
	});
});
