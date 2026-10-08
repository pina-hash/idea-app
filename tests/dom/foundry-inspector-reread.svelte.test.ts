// tests/dom/foundry-inspector-reread.svelte.test.ts
//
// A RE-READ OF THE SAME APP IS NOT A CHANGE OF APP.
//
// Every write on /foundry/review ends in `invalidateAll()` -- inside the
// transport, and again through the route's `onDecided` -- and a reload hands
// the inspector a NEW `app` object and a NEW `version` object carrying the
// SAME ids. The inspector's two reset effects read `app.id` and `version.id`,
// which also subscribes them to the props themselves, so until this was fixed
// a reload re-ran both resets:
//
//   - "Marked as a major release" (and the metadata editor's "Saved at ...")
//     appeared and then vanished one page load later (CLAUDE.md: a success
//     message set before a refresh that clears it flashes and vanishes);
//   - pressing Mark (or Hide, or Save) closed the source file a reviewer was
//     reading and threw away a half-typed review note.
//
// THE RE-READ IS THE ROUTE'S, REPRODUCED: `onDecided` swaps both props for
// shallow copies with the same ids, after the acknowledgement was set, which
// is the order on the real route. Each claim carries a positive control that
// the re-read actually landed (the re-read app's new field is on screen),
// and the last case asserts the other direction: a REAL change of app and of
// version still clears everything.
//
// WHAT IS NOT HERE: geometry and contrast (happy-dom has no layout engine).
// The browser half is `tools/browser-verify/routes/foundry-gallery-state-major.mjs`,
// whose harness now re-derives the selected app on `onDecided` the same way.

import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FoundryInspector from '../../src/lib/foundry/FoundryInspector.svelte';
import type { FoundryApp, FoundryReviewTransports } from '../../src/lib/foundry/transports';

const MARKED = '2026-10-07T18:00:00Z';

function app(over: Partial<FoundryApp> = {}, n = 99): FoundryApp {
	const id = `00000000-0000-4000-8000-0000000000${n}`;
	return {
		id,
		slug: `tide-pool-${n}`,
		title: 'Tide Pool',
		tagline: null,
		description: null,
		cover_path: null,
		build_notes: 'By hand.',
		owner: 'owner-uuid',
		owner_display_name: null,
		owner_full_name: 'Noor Haddad',
		owner_class: null,
		published_version_id: `ver-${n}`,
		metadata_flagged_at: null,
		hidden_at: null,
		major_release_at: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		versions: [
			{
				id: `ver-${n}`,
				ordinal: 1,
				status: 'submitted',
				byte_size: 10,
				file_count: 1,
				created_at: '2026-09-01T00:00:00Z',
				reviewed_at: null,
				review_note: null,
				reject_reason: null,
				manifest: {}
			} as never
		],
		...over
	};
}

/** What a reload hands the inspector: fresh objects, the SAME ids. */
function reread(a: FoundryApp, over: Partial<FoundryApp> = {}): FoundryApp {
	return { ...a, ...over, versions: a.versions.map((v) => ({ ...v })) };
}

interface Live {
	target: HTMLElement;
	props: { app: FoundryApp; version: FoundryApp['versions'][number]; transports: FoundryReviewTransports; onDecided: () => void };
	rereads: number;
	stop(): Promise<void>;
}

let live: Live | null = null;
afterEach(async () => {
	await live?.stop();
	live = null;
});

/**
 * Mount the real inspector over `$state` props, with an `onDecided` that does
 * what the route's `invalidateAll()` does to them. `change` is the re-read
 * row's new state (the write's own effect), so a positive control can see it.
 */
function mountReread(
	first: FoundryApp,
	transports: FoundryReviewTransports,
	change: Partial<FoundryApp> = {}
): Live {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const props = $state({
		app: first,
		version: first.versions[0],
		transports,
		onDecided: () => {}
	});
	const box = {
		target,
		props,
		rereads: 0,
		async stop() {
			await unmount(handle);
			target.remove();
		}
	};
	props.onDecided = () => {
		box.rereads += 1;
		const next = reread(props.app, change);
		props.app = next;
		props.version = next.versions[0];
	};
	const handle = mount(FoundryInspector as never, { target, props });
	flushSync();
	return box;
}

async function settle() {
	flushSync();
	await new Promise((resolve) => setTimeout(resolve, 30));
	flushSync();
}

const said = (t: HTMLElement) =>
	t.querySelector('[data-testid="foundry-major-said"]')?.textContent?.trim() ?? null;

describe('a re-read of the same app after a write', () => {
	it('keeps "Marked as a major release" on screen, and the re-read is really there', async () => {
		live = mountReread(app(), { setMajor: async () => ({ ok: true, changed: true }) }, { major_release_at: MARKED });
		const t = live.target;
		(t.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await settle();
		// POSITIVE CONTROL: the reload landed and the inspector drew from it.
		expect(live.rereads).toBe(1);
		expect(t.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(1);
		expect(t.querySelectorAll('[data-testid="foundry-major-mark"]')).toHaveLength(0);
		// THE CLAIM: the acknowledgement survived it.
		expect(said(t)).toMatch(/^Marked as a major release/);
	});

	it('keeps "It was already a major release." through the re-read too (a second tab marked it first)', async () => {
		// The page still offers Mark; the server answers that nothing changed,
		// and the re-read brings the other tab's mark onto this screen.
		live = mountReread(
			app(),
			{ setMajor: async () => ({ ok: true, changed: false }) },
			{ major_release_at: MARKED }
		);
		(live.target.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await settle();
		expect(live.rereads).toBe(1);
		expect(live.target.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(1);
		expect(said(live.target)).toBe('It was already a major release.');
	});

	it('keeps the metadata editor\'s "Saved at" through the re-read', async () => {
		let saved: [string, string] | null = null;
		live = mountReread(
			app(),
			{
				saveField: async (_id: string, field: string, value: string) => {
					saved = [field, value];
					return { ok: true };
				}
			},
			{ title: 'Tide Pool Deluxe' }
		);
		const t = live.target;
		const editTitle = [...t.querySelectorAll('[data-testid="foundry-metadata-edit"] .fdy-meta-row')]
			.find((row) => row.querySelector('.fdy-meta-value')?.textContent?.trim() === 'Tide Pool')
			?.querySelector('button') as HTMLButtonElement;
		editTitle.click();
		flushSync();
		const input = t.querySelector('[data-testid="foundry-metadata-edit"] input.fdy-meta-input') as HTMLInputElement;
		input.value = 'Tide Pool Deluxe';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		const save = [...t.querySelectorAll('[data-testid="foundry-metadata-edit"] button')].find(
			(b) => b.textContent?.trim() === 'Save'
		) as HTMLButtonElement;
		save.click();
		await settle();
		expect(saved).toEqual(['title', 'Tide Pool Deluxe']);
		// POSITIVE CONTROL: the re-read title is what the panel now shows.
		expect(live.rereads).toBe(1);
		expect(
			[...t.querySelectorAll('[data-testid="foundry-metadata-edit"] .fdy-meta-value')].some(
				(p) => p.textContent?.trim() === 'Tide Pool Deluxe'
			)
		).toBe(true);
		expect(t.querySelector('.fdy-meta-said')?.textContent).toMatch(/^Saved at /);
	});

	it('keeps the open source file and a half-typed review note, and does not re-list the files', async () => {
		let listed = 0;
		live = mountReread(
			app(),
			{
				listFiles: async () => {
					listed += 1;
					return { ok: true, files: [{ path: 'index.html', contentType: 'text/html', byteSize: 20 }] };
				},
				readFile: async (_v: string, path: string) => ({ ok: true, path, text: '<h1>tide</h1>', byteSize: 13 }),
				decide: async () => ({ ok: true }),
				setMajor: async () => ({ ok: true, changed: true })
			},
			{ major_release_at: MARKED }
		);
		const t = live.target;
		await settle();
		(t.querySelector('[data-path="index.html"]') as HTMLButtonElement).click();
		await settle();
		expect(t.querySelector('[data-testid="foundry-source"]')?.textContent).toBe('<h1>tide</h1>');
		(t.querySelector('input[name="fdy-decision"][value="reject"]') as HTMLInputElement).click();
		flushSync();
		const note = t.querySelector('textarea.fdy-note') as HTMLTextAreaElement;
		note.value = 'The score never resets after a round';
		note.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();

		(t.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await settle();
		// POSITIVE CONTROL: the re-read landed.
		expect(live.rereads).toBe(1);
		expect(t.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(1);
		// THE CLAIM, three ways.
		expect(t.querySelector('[data-testid="foundry-source"]')?.textContent).toBe('<h1>tide</h1>');
		expect((t.querySelector('textarea.fdy-note') as HTMLTextAreaElement | null)?.value).toBe(
			'The score never resets after a round'
		);
		expect(listed).toBe(1);
	});
});

describe('a REAL change of app and version, the other direction', () => {
	it('still clears the acknowledgement, the open file and the note, and lists the new version', async () => {
		let listed = 0;
		live = mountReread(
			app(),
			{
				listFiles: async () => {
					listed += 1;
					return { ok: true, files: [{ path: 'index.html', contentType: 'text/html', byteSize: 20 }] };
				},
				readFile: async (_v: string, path: string) => ({ ok: true, path, text: '<h1>tide</h1>', byteSize: 13 }),
				decide: async () => ({ ok: true }),
				setMajor: async () => ({ ok: true, changed: true })
			},
			{ major_release_at: MARKED }
		);
		const t = live.target;
		await settle();
		(t.querySelector('[data-path="index.html"]') as HTMLButtonElement).click();
		await settle();
		(t.querySelector('input[name="fdy-decision"][value="reject"]') as HTMLInputElement).click();
		flushSync();
		(t.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await settle();
		expect(said(t)).toMatch(/^Marked as a major release/);
		expect(t.querySelectorAll('[data-testid="foundry-source"]')).toHaveLength(1);

		const other = app({}, 42);
		live.props.app = other;
		live.props.version = other.versions[0];
		await settle();
		expect(said(t)).toBe('');
		expect(t.querySelectorAll('[data-testid="foundry-source"]')).toHaveLength(0);
		expect(t.querySelectorAll('textarea.fdy-note')).toHaveLength(0);
		expect(t.querySelectorAll('[data-testid="foundry-major-mark"]')).toHaveLength(1);
		expect(listed).toBe(2);
	});
});
