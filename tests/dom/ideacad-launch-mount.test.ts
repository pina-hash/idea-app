// tests/dom/ideacad-launch-mount.test.ts
//
// THE LAUNCH PAGE, MOUNTED FOR REAL over the in-memory api the dev harness
// uses. What is asserted here is what a person can SEE and PRESS, which the
// pure tests cannot answer:
//
//   * a LINKED assignment row has NO trash control and shows decision 29's
//     sentence; an UNLINKED own row has the control and not the sentence; a
//     row that is not yours has neither (both directions on one fixture);
//   * the trash confirm NAMES the document and carries the trash sentence,
//     the archive block carries the archive sentence, and the two differ;
//   * confirming a trash calls the api, takes the card off the list and
//     leaves the acknowledgement ON THE LIST, with the purge day;
//   * the Trash view lists the row, restores it, and purges through a second
//     confirm that names it;
//   * the empty state is honest ("No models yet" plus a New model control)
//     and absent on a seeded mount;
//   * New model creates through the api and hands the id to `onopen`;
//   * a folder is created, then deleted behind a confirm that says its
//     models are unfiled, not deleted.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE (`tests/dom/README.md`); the 44px
// controls and the horizontal-scroll claim are measured in a real Chromium
// on `/dev/ideacad-launch`.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import LaunchPage from '$lib/ideacad/solid/launch/LaunchPage.svelte';
import { createMemoryLaunchApi, type MemoryLaunchApi } from '$lib/ideacad/solid/launch/memory';
import { FIXTURE_DOCUMENTS, FIXTURE_FOLDERS, FIXTURE_NOW, FIXTURE_TRASH } from '$lib/ideacad/solid/launch/fixture';
import { ARCHIVE_SENTENCE, EMPTY_LIBRARY, FOLDER_DELETE_SENTENCE, LINKED_KEPT_SENTENCE, PURGE_SENTENCE, TRASH_SENTENCE, purgeConfirm, trashConfirm } from '$lib/ideacad/solid/launch/wording';
import { mountInto, typeAt, type Mounted } from './mount';

const Page = LaunchPage as unknown as Component<Record<string, unknown>>;
const mounts: Mounted[] = [];
afterEach(async () => { for (const m of mounts.splice(0)) await m.stop(); });

function seeded(over: { documents?: typeof FIXTURE_DOCUMENTS; trash?: typeof FIXTURE_TRASH } = {}) {
	const api = createMemoryLaunchApi({ documents: over.documents ?? FIXTURE_DOCUMENTS, folders: FIXTURE_FOLDERS, trash: over.trash ?? FIXTURE_TRASH, now: () => FIXTURE_NOW });
	const opened: string[] = [];
	const m = mountInto(Page, { api, rows: api.state.documents, folders: api.state.folders, onopen: (id: string) => opened.push(id), now: () => FIXTURE_NOW });
	mounts.push(m);
	return { api, m, opened };
}
const card = (m: Mounted, id: string) => m.one<HTMLElement>(`[data-testid="model-card"][data-id="${id}"]`);
const cards = (m: Mounted, id: string) => m.all<HTMLElement>(`[data-testid="model-card"][data-id="${id}"]`);
const click = (el: Element | null) => { if (!el) throw new Error('no element to click'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const submit = (form: Element) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
async function manage(m: Mounted, id: string) { click(card(m, id).querySelector('[data-testid="manage"]')); await m.settle(); return card(m, id); }
async function settled(m: Mounted, times = 3) { for (let i = 0; i < times; i++) await m.settle(); }

describe('archive and trash are two controls, and a linked document has only one of them', () => {
	it('linked: decision 29 sentence and no trash control; unlinked own: trash control and no sentence; shared: neither', async () => {
		const { m } = seeded();
		const linked = await manage(m, 'doc-linked');
		expect(linked.querySelectorAll('[data-testid="trash"]')).toHaveLength(0);
		expect(linked.querySelectorAll('[data-testid="linked-kept"]')).toHaveLength(1);
		expect(linked.querySelector('[data-testid="linked-kept"]')!.textContent).toContain(LINKED_KEPT_SENTENCE);
		expect(linked.querySelectorAll('[data-testid="archive"]')).toHaveLength(1);

		const own = await manage(m, 'doc-spur');
		expect(own.querySelectorAll('[data-testid="trash"]')).toHaveLength(1);
		expect(own.querySelectorAll('[data-testid="linked-kept"]')).toHaveLength(0);
		expect(own.querySelectorAll('[data-testid="archive"]')).toHaveLength(1);

		const shared = await manage(m, 'doc-shared');
		expect(shared.querySelectorAll('[data-testid="trash"]')).toHaveLength(0);
		expect(shared.querySelectorAll('[data-testid="linked-kept"]')).toHaveLength(0);
		expect(shared.querySelectorAll('[data-testid="archive-block"]')).toHaveLength(0);
		expect(shared.querySelectorAll('[data-testid="duplicate"]')).toHaveLength(1);
		expect(shared.textContent).toContain('ana.reyes@boscotech.net');
		expect(own.textContent).not.toContain('you@boscotech.net');
	});
	it('the trash confirm names the document and the two sentences differ on one card', async () => {
		const { m } = seeded();
		const own = await manage(m, 'doc-spur');
		expect(own.querySelector('[data-testid="archive-block"]')!.textContent).toContain(ARCHIVE_SENTENCE);
		click(own.querySelector('[data-testid="trash"]'));
		await m.settle();
		const block = card(m, 'doc-spur').querySelector('[data-testid="trash-block"]')!;
		expect(block.textContent).toContain(trashConfirm('Spur gear 24T'));
		expect(block.textContent).toContain(TRASH_SENTENCE);
		expect(block.textContent).not.toContain(ARCHIVE_SENTENCE);
		expect(block.querySelectorAll('[data-testid="trash-confirm"]')).toHaveLength(1);
		expect(TRASH_SENTENCE).not.toBe(ARCHIVE_SENTENCE);
	});
	it('confirming moves the card off the list and leaves the acknowledgement on the list with the purge day', async () => {
		const { m, api } = seeded();
		const own = await manage(m, 'doc-spur');
		click(own.querySelector('[data-testid="trash"]')); await m.settle();
		click(card(m, 'doc-spur').querySelector('[data-testid="trash-confirm"]')); await settled(m);
		expect(api.calls).toContain('trash("doc-spur")');
		expect(cards(m, 'doc-spur')).toHaveLength(0);
		expect(cards(m, 'doc-bevel')).toHaveLength(1);
		const notice = m.one<HTMLElement>('[data-testid="notice"]').textContent ?? '';
		expect(notice).toContain('"Spur gear 24T" is in the trash.');
		expect(notice).toContain('Removed for good on Oct 21, 2026');
	});
	it('a refusal from the api renders on the card that was pressed, verbatim', async () => {
		const { m, api } = seeded();
		api.rename = async () => { throw new Error('You cannot edit this document.'); };
		const own = await manage(m, 'doc-spur');
		click([...own.querySelectorAll('button')].find((b) => b.textContent === 'Rename') ?? null); await m.settle();
		submit(card(m, 'doc-spur').querySelector('form.rename')!); await settled(m);
		expect(card(m, 'doc-spur').querySelector('[role="alert"]')!.textContent).toBe('You cannot edit this document.');
	});
});

describe('the Trash view', () => {
	it('lists trashed rows with the purge day, restores, and purges behind a confirm naming the document', async () => {
		const { m, api } = seeded();
		click(m.one('[data-testid="view-trash"]')); await settled(m);
		expect(m.all('[data-testid="trash-row"]')).toHaveLength(1);
		const row = m.one<HTMLElement>('[data-testid="trash-row"][data-id="doc-trashed"]');
		expect(row.textContent).toContain('Removed for good on Oct 19, 2026');
		expect(row.querySelectorAll('[data-testid="restore"]')).toHaveLength(1);
		click(row.querySelector('[data-testid="purge"]')); await m.settle();
		const armed = m.one<HTMLElement>('[data-testid="trash-row"][data-id="doc-trashed"]');
		expect(armed.textContent).toContain(purgeConfirm('Wrong scale test'));
		expect(armed.textContent).toContain(PURGE_SENTENCE);
		click(armed.querySelector('.cancel')); await m.settle();
		click(m.one('[data-testid="trash-row"][data-id="doc-trashed"] [data-testid="restore"]')); await settled(m);
		expect(api.calls).toContain('restore("doc-trashed")');
		expect(m.all('[data-testid="trash-row"]')).toHaveLength(0);
		expect(m.one('[data-testid="trash-empty"]').textContent).toBe('The trash is empty');
		click(m.one('[data-testid="view-live"]')); await settled(m);
		expect(cards(m, 'doc-trashed')).toHaveLength(1);
	});
	it('remove now really purges through the api', async () => {
		const { m, api } = seeded();
		click(m.one('[data-testid="view-trash"]')); await settled(m);
		click(m.one('[data-testid="trash-row"] [data-testid="purge"]')); await m.settle();
		click(m.one('[data-testid="purge-confirm"]')); await settled(m);
		expect(api.calls).toContain('purge("doc-trashed")');
		expect(api.state.trash).toHaveLength(0);
		expect(m.one('[data-testid="notice"]').textContent).toContain('"Wrong scale test" was removed for good.');
	});
});

describe('views, empty states and creation', () => {
	it('the live view hides archived rows and the archived view shows only them, with the word Archived', async () => {
		const { m } = seeded();
		expect(cards(m, 'doc-archived')).toHaveLength(0);
		expect(cards(m, 'doc-spur')).toHaveLength(1);
		click(m.one('[data-testid="view-archived"]')); await m.settle();
		expect(cards(m, 'doc-archived')).toHaveLength(1);
		expect(cards(m, 'doc-spur')).toHaveLength(0);
		expect(card(m, 'doc-archived').textContent).toContain('Archived');
		expect(card(m, 'doc-archived').textContent).toContain('4 features, 1 body');
	});
	it('an empty library says so and offers New model; a seeded one shows no empty state', async () => {
		const empty = seeded({ documents: [], trash: [] });
		expect(empty.m.one('[data-testid="empty"]').textContent).toContain(EMPTY_LIBRARY);
		expect(empty.m.all('[data-testid="new-model-empty"]')).toHaveLength(1);
		const full = seeded();
		expect(full.m.all('[data-testid="empty"]')).toHaveLength(0);
		expect(full.m.all('[data-testid="model-card"]')).toHaveLength(7);
	});
	it('New model creates through the api and opens the new id', async () => {
		const { m, api, opened } = seeded();
		click(m.one('[data-testid="new-model"]')); await m.settle();
		submit(m.one('form.new-form')); await settled(m);
		expect(api.calls).toContain('create("Untitled model")');
		expect(opened).toHaveLength(1);
		expect(api.state.documents.some((d) => d.id === opened[0])).toBe(true);
	});
	it('search narrows by owner, and a folder narrows to its own rows', async () => {
		const { m } = seeded();
		typeAt(m.one('input[type="search"]'), 'reyes'); await m.settle();
		expect(m.all('[data-testid="model-card"]')).toHaveLength(1);
		expect(cards(m, 'doc-shared')).toHaveLength(1);
		typeAt(m.one('input[type="search"]'), ''); await m.settle();
		click([...m.all<HTMLButtonElement>('[data-testid="folder"]')].find((b) => b.textContent?.includes('Gears')) ?? null); await m.settle();
		expect(m.all('[data-testid="model-card"]').map((c) => c.getAttribute('data-id')).sort()).toEqual(['doc-bevel', 'doc-spur']);
	});
	it('a folder is created and then deleted behind a confirm that says its models are unfiled, not deleted', async () => {
		const { m, api } = seeded();
		click(m.one('[data-testid="new-folder"]')); await m.settle();
		typeAt(m.one('form.folder-form input'), 'Chassis');
		submit(m.one('form.folder-form')); await settled(m);
		expect(api.calls).toContain('createFolder("Chassis")');
		const chassis = [...m.all<HTMLButtonElement>('[data-testid="folder"]')].find((b) => b.textContent?.includes('Chassis'));
		expect(chassis).toBeTruthy();
		click(chassis!); await m.settle();
		click(m.one('[data-testid="folder-delete"]')); await m.settle();
		const rail = m.one<HTMLElement>('aside');
		expect(rail.textContent).toContain('Delete the folder "Chassis"? 0 models are unfiled, not deleted.');
		expect(rail.textContent).toContain(FOLDER_DELETE_SENTENCE);
		click(m.one('[data-testid="folder-delete-confirm"]')); await settled(m);
		expect(api.calls.some((c) => c.startsWith('deleteFolder('))).toBe(true);
		expect([...m.all<HTMLButtonElement>('[data-testid="folder"]')].some((b) => b.textContent?.includes('Chassis'))).toBe(false);
		expect(m.one('[data-testid="notice"]').textContent).toContain('The folder "Chassis" was deleted.');
	});
});
