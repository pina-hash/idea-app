// tests/dom/ideacad-share-panel-mount.test.ts
//
// LEDGER 0470: the share panel on a model's card, MOUNTED FOR REAL inside the
// real `LaunchPage` over the in-memory api the dev harness uses. LEDGER 0471:
// every person shows their name AND their school email (decision 72,
// ideacad-sharing-shows-name-and-email), in the picker, in who has it and on
// a shared model's owner line. What a person can see and press, both
// directions:
//
//   * the panel is on your own model and absent on one shared with you, and
//     absent everywhere when the api carries no sharing transports;
//   * who already has the model is listed by name, with Can view or Can edit
//     and a Remove, before anything is typed;
//   * focusing the box suggests teammates; picking several people stages them,
//     each with its own access; one Share sends them in ONE call;
//   * every change is confirmed in words and offers Undo, and Undo puts it
//     back; a change of access and a removal confirm the same way;
//   * a typed address nobody has signed in with stays in the list with the
//     refusal beside it while everyone else lands.
//
// No geometry here (tests/dom/README.md); the 44px controls are measured in a
// real Chromium on `/dev/ideacad-launch`.
import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import LaunchPage from '$lib/ideacad/solid/launch/LaunchPage.svelte';
import { createMemoryLaunchApi } from '$lib/ideacad/solid/launch/memory';
import { FIXTURE_DOCUMENTS, FIXTURE_FOLDERS, FIXTURE_GRANTS, FIXTURE_NOW, FIXTURE_PEOPLE, FIXTURE_TRASH } from '$lib/ideacad/solid/launch/fixture';
import { NOBODY_YET, UNDONE_SENTENCE } from '$lib/ideacad/solid/launch/share';
import { mountInto, typeAt, type Mounted } from './mount';

const Page = LaunchPage as unknown as Component<Record<string, unknown>>;
const mounts: Mounted[] = [];
afterEach(async () => { for (const m of mounts.splice(0)) await m.stop(); });

function seeded(sharing = true) {
	const api = createMemoryLaunchApi({ documents: FIXTURE_DOCUMENTS, folders: FIXTURE_FOLDERS, trash: FIXTURE_TRASH, now: () => FIXTURE_NOW, ...(sharing ? { people: FIXTURE_PEOPLE, grants: FIXTURE_GRANTS } : {}) });
	const m = mountInto(Page, { api, rows: api.state.documents, folders: api.state.folders, onopen: () => {}, now: () => FIXTURE_NOW });
	mounts.push(m);
	return { api, m };
}
const card = (m: Mounted, id: string) => m.one<HTMLElement>(`[data-testid="model-card"][data-id="${id}"]`);
const click = (el: Element | null) => { if (!el) throw new Error('no element to click'); el.dispatchEvent(new MouseEvent('click', { bubbles: true })); };
const press = (el: Element | null) => { if (!el) throw new Error('no option to press'); el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function settled(m: Mounted, times = 3) { for (let i = 0; i < times; i++) await m.settle(); }
async function manage(m: Mounted, id: string) { click(card(m, id).querySelector('[data-testid="manage"]')); await settled(m); return card(m, id); }
const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
async function search(m: Mounted, box: HTMLInputElement, q: string) { typeAt(box, q); await pause(260); await settled(m); }
const options = (scope: Element) => Array.from(scope.querySelectorAll('[data-testid="person-option"]'));

describe('where the share panel is', () => {
	it('on your own model, not on one shared with you, and nowhere without the sharing transports', async () => {
		const { m } = seeded();
		expect((await manage(m, 'doc-spur')).querySelectorAll('[data-testid="share-panel"]')).toHaveLength(1);
		expect((await manage(m, 'doc-shared')).querySelectorAll('[data-testid="share-panel"]')).toHaveLength(0);
		const bare = seeded(false).m;
		expect((await manage(bare, 'doc-spur')).querySelectorAll('[data-testid="share-panel"]')).toHaveLength(0);
		// The retired one-address form is gone everywhere.
		expect(m.target.querySelectorAll('input[type="email"]')).toHaveLength(0);
	});
});

describe('who has it', () => {
	it('lists the existing grant by name with its access and a Remove, and says nobody on an unshared model', async () => {
		const { m } = seeded();
		const spur = await manage(m, 'doc-spur');
		const rows = spur.querySelectorAll('[data-testid="share-access-row"]');
		expect(rows).toHaveLength(1);
		expect(text(rows[0])).toContain('Ana Reyes');
		expect((rows[0].querySelector('[data-testid="share-role"]') as HTMLSelectElement).value).toBe('viewer');
		expect(rows[0].querySelectorAll('[data-testid="share-remove"]')).toHaveLength(1);
		expect(text(spur.querySelector('[data-testid="share-count"]'))).toBe('Shared with 1 person');
		// Name and email on the one row; the owner's own card names no owner.
		expect(Array.from(spur.querySelectorAll('[data-testid="share-access-email"]')).map(text)).toEqual(['ana.reyes@boscotech.net']);
		expect(spur.querySelectorAll('[data-testid="model-owner"]')).toHaveLength(0);
		const bracket = await manage(m, 'doc-bracket');
		expect(text(bracket.querySelector('[data-testid="share-count"]'))).toBe(NOBODY_YET);
		expect(bracket.querySelectorAll('[data-testid="share-access-row"]')).toHaveLength(0);
	});
});

describe("a shared model's owner line", () => {
	it('names the owner and their email on a model shared with you, and on none of your own', async () => {
		const { m } = seeded();
		expect(text(card(m, 'doc-shared').querySelector('[data-testid="model-owner"]'))).toBe('by Ana Reyes ana.reyes@boscotech.net');
		expect(text(card(m, 'doc-managed').querySelector('[data-testid="model-owner"]'))).toBe('by Daniel Okonkwo daniel.okonkwo@boscotech.net');
		const owned = FIXTURE_DOCUMENTS.filter((d) => d.isOwn).length;
		expect(owned).toBeGreaterThan(0);
		expect(m.target.querySelectorAll('[data-testid="model-owner"]')).toHaveLength(FIXTURE_DOCUMENTS.length - owned);
	});
});

describe('pick and share', () => {
	it('suggests teammates, stages several picks, shares them in one call, confirms, and undoes', async () => {
		const { api, m } = seeded();
		const spur = await manage(m, 'doc-spur');
		const box = spur.querySelector('[data-testid="share-picker"] input') as HTMLInputElement;
		box.dispatchEvent(new FocusEvent('focus'));
		await settled(m);
		expect(options(spur).map(text)).toEqual([expect.stringContaining('Lena Park'), expect.stringContaining('Mateo Ruiz')]);
		expect(Array.from(spur.querySelectorAll('[data-testid="person-email"]')).map(text)).toEqual(['lena.park@boscotech.net', 'mateo.ruiz@boscotech.net']);
		press(options(spur).find((o) => text(o).includes('Mateo Ruiz'))!);
		await settled(m);
		// The list comes straight back, less the person just picked.
		expect(options(spur).map(text)).toEqual([expect.stringContaining('Lena Park')]);
		// Found by part of an email as well as part of a name.
		await search(m, box, 'okonkwo@');
		expect(options(spur).map(text)).toEqual([expect.stringContaining('daniel.okonkwo@boscotech.net')]);
		await search(m, box, 'dan');
		expect(options(spur).map(text)).toEqual([expect.stringContaining('Daniel Okonkwo')]);
		press(options(spur)[0]);
		await settled(m);
		const staged = spur.querySelectorAll('[data-testid="share-staged-row"]');
		expect(staged).toHaveLength(2);
		const daniel = Array.from(staged).find((r) => text(r).includes('Daniel'))!;
		expect(text(daniel)).toContain('daniel.okonkwo@boscotech.net');
		const role = daniel.querySelector('[data-testid="share-staged-role"]') as HTMLSelectElement;
		role.value = 'editor'; role.dispatchEvent(new Event('change', { bubbles: true }));
		await settled(m);
		expect(text(spur.querySelector('[data-testid="share-submit"]'))).toBe('Share with 2 people');
		const before = api.calls.filter((c) => c.startsWith('setAccess')).length;
		spur.querySelector('[data-testid="share-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settled(m, 5);
		const sends = api.calls.filter((c) => c.startsWith('setAccess'));
		expect(sends.length - before).toBe(1);
		expect(sends.at(-1)).toContain('"key":"p-mateo","role":"viewer"');
		expect(sends.at(-1)).toContain('"key":"p-daniel","role":"editor"');
		expect(text(spur.querySelector('[data-testid="share-notice"]'))).toContain('Shared with Mateo Ruiz and Daniel Okonkwo.');
		expect(spur.querySelectorAll('[data-testid="share-staged-row"]')).toHaveLength(0);
		expect(spur.querySelectorAll('[data-testid="share-access-row"]')).toHaveLength(3);
		expect(text(spur.querySelector('[data-testid="share-count"]'))).toBe('Shared with 3 people');
		click(spur.querySelector('[data-testid="share-undo"]'));
		await settled(m, 5);
		expect(text(spur.querySelector('[data-testid="share-notice"]'))).toContain(UNDONE_SENTENCE);
		expect(spur.querySelectorAll('[data-testid="share-undo"]')).toHaveLength(0);
		expect(spur.querySelectorAll('[data-testid="share-access-row"]')).toHaveLength(1);
		expect(api.state.grants['doc-spur']).toEqual({ 'p-ana': 'viewer' });
	});
	it('changes access and removes in place, each confirmed with Undo', async () => {
		const { api, m } = seeded();
		const spur = await manage(m, 'doc-spur');
		const select = spur.querySelector('[data-testid="share-role"]') as HTMLSelectElement;
		select.value = 'editor'; select.dispatchEvent(new Event('change', { bubbles: true }));
		await settled(m, 5);
		expect(text(spur.querySelector('[data-testid="share-notice"]'))).toContain('Ana Reyes can now edit.');
		expect(spur.querySelectorAll('[data-testid="share-undo"]')).toHaveLength(1);
		click(spur.querySelector('[data-testid="share-remove"]'));
		await settled(m, 5);
		expect(text(spur.querySelector('[data-testid="share-notice"]'))).toContain('Removed Ana Reyes.');
		expect(spur.querySelectorAll('[data-testid="share-access-row"]')).toHaveLength(0);
		click(spur.querySelector('[data-testid="share-undo"]'));
		await settled(m, 5);
		expect(api.state.grants['doc-spur']).toEqual({ 'p-ana': 'editor' });
	});
	it('keeps a refused typed address in the list with its reason while the rest lands', async () => {
		const { m } = seeded();
		const spur = await manage(m, 'doc-spur');
		const box = spur.querySelector('[data-testid="share-picker"] input') as HTMLInputElement;
		await search(m, box, 'sam');
		press(options(spur)[0]);
		await settled(m);
		typeAt(box, 'nobody.here@boscotech.net');
		box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		await settled(m);
		expect(spur.querySelectorAll('[data-testid="share-staged-row"]')).toHaveLength(2);
		spur.querySelector('[data-testid="share-form"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		await settled(m, 5);
		const left = spur.querySelectorAll('[data-testid="share-staged-row"]');
		expect(left).toHaveLength(1);
		expect(text(left[0])).toContain('nobody.here@boscotech.net');
		expect(text(left[0])).toContain('Choose the email address of someone who has signed in.');
		expect(text(spur.querySelector('[data-testid="share-notice"]'))).toContain('Shared with Sam Ortiz.');
	});
});
