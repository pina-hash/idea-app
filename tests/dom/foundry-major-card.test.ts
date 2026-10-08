// tests/dom/foundry-major-card.test.ts
//
// MAJOR RELEASES ON THE REAL COMPONENTS (report 927b1c69). The structural
// claims that would fail SILENTLY, each paired with its positive control:
//
//   - a badge drawn inside a card whose `aria-label` does not carry its word
//     is a fact a screen reader never hears (the label overrides the link's
//     contents);
//   - the section must never REPLACE the full list: the list keeps every app,
//     the marked ones included;
//   - a gallery with nothing marked and no house cards must render exactly as
//     it did, so the section and the "All apps" heading are absent there;
//   - the house cards alone must not draw the section over an empty gallery;
//   - a search hides the section;
//   - the inspector offers the control only with a transport AND a payload
//     that can tell, and says why where it cannot mark.
//
// WHAT IS NOT HERE: geometry, contrast, tap targets. happy-dom has no layout
// engine (see tests/dom/README.md); those are
// `tools/browser-verify/routes/foundry-boards-fixture-major*.mjs` and
// `foundry-gallery-state-major.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import FoundryCard from '../../src/lib/foundry/FoundryCard.svelte';
import FoundryDetail from '../../src/lib/foundry/FoundryDetail.svelte';
import FoundryGallery from '../../src/lib/foundry/FoundryGallery.svelte';
import FoundryInspector from '../../src/lib/foundry/FoundryInspector.svelte';
import {
	FOUNDRY_ALL_APPS_TITLE,
	FOUNDRY_MAJOR_NOT_READY,
	FOUNDRY_MAJOR_SECTION_TITLE,
	foundryHouseReleases
} from '../../src/lib/foundry/major';
import type { FoundryApp, FoundryAppSummary } from '../../src/lib/foundry/transports';
import { mountInto, type Mounted } from './mount';

let live: Mounted | null = null;
afterEach(async () => {
	await live?.stop();
	live = null;
});

const MARKED = '2026-10-07T18:00:00Z';

function summary(i: number, over: Partial<FoundryAppSummary> = {}): FoundryAppSummary {
	return {
		id: `00000000-0000-4000-8000-0000000000${String(10 + i)}`,
		slug: `app-${i}`,
		title: `App ${i}`,
		tagline: null,
		cover_path: null,
		published_version_id: `ver-${i}`,
		published_ordinal: 1,
		version_count: 1,
		submitted_version_id: null,
		metadata_flagged_at: null,
		hidden_at: null,
		major_release_at: null,
		owner_display_name: null,
		owner_full_name: 'Ana Reyes',
		owner_class: null,
		updated_at: '2026-09-20T09:00:00Z',
		...over
	};
}

const FIVE = [0, 1, 2, 3, 4].map((i) => summary(i, i === 1 || i === 3 ? { major_release_at: MARKED } : {}));
const NONE_MARKED = [0, 1, 2].map((i) => summary(i));

function gallery(props: Record<string, unknown>) {
	live = mountInto(FoundryGallery as never, {
		apps: FIVE,
		selected: null,
		onSelect: () => {},
		...props
	});
	return live.target;
}

describe('the card', () => {
	const app = { id: 'x', slug: 'x', title: 'Tide Pool', cover_path: null, owner_display_name: null, owner_full_name: 'Noor Haddad', owner_class: null };

	it('a major card carries the badge and says it in its name; an ordinary one carries neither', () => {
		live = mountInto(FoundryCard as never, { app, href: '/foundry?app=x', major: true });
		const link = live.target.querySelector('[data-testid="fdy-card"]')!;
		expect(live.target.querySelectorAll('[data-testid="fdy-card-major"]')).toHaveLength(1);
		expect(link.getAttribute('aria-label')).toBe('Tide Pool, by Noor Haddad, major release');
		expect(link.querySelector('[data-testid="fdy-card-major"]')?.textContent).toContain('Major release');
	});

	it('without the prop the label is exactly what it always was', async () => {
		live = mountInto(FoundryCard as never, { app, href: '/foundry?app=x' });
		const link = live.target.querySelector('[data-testid="fdy-card"]')!;
		expect(live.target.querySelectorAll('[data-testid="fdy-card-major"]')).toHaveLength(0);
		expect(link.getAttribute('aria-label')).toBe('Tide Pool, by Noor Haddad');
		await live.stop();
		live = mountInto(FoundryCard as never, { app: { ...app, owner_full_name: null }, href: '/foundry?app=x' });
		expect(live.target.querySelector('[data-testid="fdy-card"]')!.getAttribute('aria-label')).toBe('Tide Pool');
	});
});

describe('the gallery section', () => {
	it('two marked apps and two house cards: a section of four, and the full list still holds all five', () => {
		const c = gallery({ houseReleases: foundryHouseReleases() });
		const section = c.querySelectorAll('[data-testid="foundry-gallery-major-section"]');
		expect(section).toHaveLength(1);
		expect(section[0].querySelector('h3')?.textContent?.trim()).toBe(FOUNDRY_MAJOR_SECTION_TITLE);
		const grid = c.querySelector('[data-testid="foundry-gallery-major"]')!;
		expect(grid.querySelectorAll(':scope > li')).toHaveLength(4);
		expect(grid.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(2);
		expect(grid.querySelectorAll('[data-testid="fdy-house-card"]')).toHaveLength(2);
		// The section's cards are not badged: the heading says it.
		expect(grid.querySelectorAll('[data-testid="fdy-card-major"]')).toHaveLength(0);
		// Its own list class, so `.fdy-gal-mosaic` still means the full list alone.
		expect(grid.classList.contains('fdy-gal-mosaic')).toBe(false);
		expect(c.querySelectorAll('.fdy-gal-mosaic')).toHaveLength(1);
		// And its own column arithmetic: four cards, four columns at most.
		expect(grid.getAttribute('style')).toContain('--fdy-cols: 4');

		const list = c.querySelector('[data-testid="foundry-gallery-grid"]')!;
		expect(list.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(5);
		expect(list.querySelectorAll('[data-testid="fdy-card-major"]')).toHaveLength(2);
		expect(list.querySelectorAll('[data-testid="fdy-house-card"]')).toHaveLength(0);
		expect(c.querySelector('[data-testid="foundry-gallery-all-heading"]')?.textContent?.trim()).toBe(
			FOUNDRY_ALL_APPS_TITLE
		);
		// The decision 39 exclusions still hold beside it.
		expect(c.querySelectorAll('[data-testid="foundry-gallery-boards"]')).toHaveLength(0);
		expect(c.querySelectorAll('.fdy-gal-board')).toHaveLength(0);
		expect(c.querySelectorAll('select[data-testid="foundry-gallery-sort"]')).toHaveLength(1);
	});

	it('the house cards are the registry entries, linking out with their own names', () => {
		const c = gallery({ houseReleases: foundryHouseReleases() });
		const cards = [...c.querySelectorAll('[data-testid="fdy-house-card"]')];
		expect(cards.map((a) => a.getAttribute('href'))).toEqual(['/greenline', '/vanguard/']);
		expect(cards.map((a) => a.getAttribute('aria-label'))).toEqual([
			'IDEA // GREENLINE, an IDEA original game',
			'IDEA // VANGUARD, an IDEA original game'
		]);
		// Each card draws ITS OWN game's mark, read off the mark's own viewBox
		// (GREENLINE's is 32 units square, VANGUARD's 40): one mark on both cards
		// would still pass the two checks above.
		expect(cards.map((a) => a.querySelector('.fdy-house-mark svg')?.getAttribute('viewBox'))).toEqual([
			'0 0 32 32',
			'0 0 40 40'
		]);
	});

	it('the section follows the one sort control: Newest puts the newer marked app first', () => {
		const apps = [
			summary(0, { major_release_at: MARKED, created_at: '2026-01-01T00:00:00Z' }),
			summary(1, { major_release_at: MARKED, created_at: '2026-09-01T00:00:00Z' }),
			summary(2)
		];
		const c = gallery({ apps });
		const slugs = () =>
			[...c.querySelectorAll('[data-testid="foundry-gallery-major"] [data-testid="fdy-card"]')].map((a) =>
				a.getAttribute('data-app-slug')
			);
		const sel = c.querySelector('[data-testid="foundry-gallery-sort"]') as HTMLSelectElement;
		sel.value = 'new';
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		live!.flush();
		expect(slugs()).toEqual(['app-1', 'app-0']);
		sel.value = 'recent';
		sel.dispatchEvent(new Event('change', { bubbles: true }));
		live!.flush();
		// Recent keeps the list's own order, which here is the order handed in.
		expect(slugs()).toEqual(['app-0', 'app-1']);
	});

	it('nothing marked and no house cards: no section and no heading, the list as it always was', () => {
		const c = gallery({ apps: NONE_MARKED });
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major-section"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="foundry-gallery-all-heading"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="fdy-card-major"]')).toHaveLength(0);
		expect(c.querySelector('[data-testid="foundry-gallery-grid"]')!.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(3);
	});

	it('a payload from before 0233 (no key at all) renders no section and no badge', () => {
		const old = NONE_MARKED.map((a) => {
			const { major_release_at: _drop, ...rest } = a;
			return rest;
		});
		expect('major_release_at' in old[0]).toBe(false);
		const c = gallery({ apps: old });
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major-section"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="fdy-card"]')).toHaveLength(3);
	});

	it('house cards alone draw the section on a gallery with apps, and never on an empty one', async () => {
		let c = gallery({ apps: NONE_MARKED, houseReleases: foundryHouseReleases() });
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major"] > li')).toHaveLength(2);
		await live!.stop();
		c = gallery({ apps: [], houseReleases: foundryHouseReleases() });
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major-section"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="fdy-house-card"]')).toHaveLength(0);
		expect(c.textContent).toContain('Nothing has been published yet.');
	});

	it('searching hides the section and its heading; clearing brings them back', () => {
		const c = gallery({ houseReleases: foundryHouseReleases() });
		const input = c.querySelector('[data-testid="foundry-gallery-search"]') as HTMLInputElement;
		input.value = 'App 1';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		live!.flush();
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major-section"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="foundry-gallery-all-heading"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="foundry-gallery-grid"] [data-testid="fdy-card"]').length).toBeGreaterThan(0);
		input.value = '';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		live!.flush();
		expect(c.querySelectorAll('[data-testid="foundry-gallery-major-section"]')).toHaveLength(1);
	});
});

function detailApp(over: Partial<FoundryApp> = {}): FoundryApp {
	return {
		id: '00000000-0000-4000-8000-000000000099',
		slug: 'tide-pool',
		title: 'Tide Pool',
		tagline: null,
		description: null,
		cover_path: null,
		build_notes: 'By hand.',
		owner: 'owner-uuid',
		owner_display_name: null,
		owner_full_name: 'Noor Haddad',
		owner_class: null,
		published_version_id: 'ver-1',
		metadata_flagged_at: null,
		hidden_at: null,
		major_release_at: null,
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z',
		versions: [
			{
				id: 'ver-1',
				ordinal: 1,
				status: 'approved',
				byte_size: 10,
				file_count: 1,
				created_at: '2026-09-01T00:00:00Z',
				reviewed_at: '2026-09-02T00:00:00Z',
				review_note: null,
				reject_reason: null,
				manifest: {}
			} as never
		],
		...over
	};
}

describe('the detail pane', () => {
	it('a major release says so under its title, for any reader; an ordinary app does not', async () => {
		live = mountInto(FoundryDetail as never, { app: detailApp({ major_release_at: MARKED }), appsOrigin: '' });
		expect(live.target.querySelectorAll('[data-testid="foundry-detail-major"]')).toHaveLength(1);
		await live.stop();
		live = mountInto(FoundryDetail as never, { app: detailApp(), appsOrigin: '' });
		expect(live.target.querySelectorAll('[data-testid="foundry-detail-major"]')).toHaveLength(0);
		expect(live.target.querySelector('.fdy-detail-title')?.textContent).toBe('Tide Pool');
	});
});

describe('the inspector control', () => {
	function inspector(app: FoundryApp, transports: Record<string, unknown>) {
		live = mountInto(FoundryInspector as never, { app, version: app.versions[0], transports });
		return live.target;
	}
	const calls: [string, boolean][] = [];
	const setMajor = async (id: string, major: boolean) => {
		calls.push([id, major]);
		return { ok: true, changed: true };
	};

	it('no transport, no section; with one, Mark is offered on a published, unhidden app', async () => {
		let c = inspector(detailApp(), {});
		expect(c.querySelectorAll('[data-testid="foundry-major-release"]')).toHaveLength(0);
		await live!.stop();
		c = inspector(detailApp(), { setMajor });
		expect(c.querySelectorAll('[data-testid="foundry-major-release"]')).toHaveLength(1);
		expect(c.querySelectorAll('[data-testid="foundry-major-mark"]')).toHaveLength(1);
		expect(c.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(0);
	});

	it('a payload that cannot tell offers no control and says so', () => {
		const { major_release_at: _drop, ...old } = detailApp();
		const c = inspector(old as FoundryApp, { setMajor });
		expect(c.querySelector('[data-testid="foundry-major-not-ready"]')?.textContent?.trim()).toBe(FOUNDRY_MAJOR_NOT_READY);
		expect(c.querySelectorAll('[data-testid="foundry-major-mark"]')).toHaveLength(0);
		expect(c.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(0);
	});

	it('a hidden app and an unpublished one say why instead of offering Mark', async () => {
		let c = inspector(detailApp({ hidden_at: '2026-10-01T00:00:00Z' }), { setMajor });
		expect(c.querySelector('[data-testid="foundry-major-blocked"]')?.textContent).toMatch(/hidden/);
		expect(c.querySelectorAll('[data-testid="foundry-major-mark"]')).toHaveLength(0);
		await live!.stop();
		c = inspector(detailApp({ published_version_id: null }), { setMajor });
		expect(c.querySelector('[data-testid="foundry-major-blocked"]')?.textContent).toMatch(/Nothing is published/);
	});

	it('a marked app, hidden or not, offers Remove', async () => {
		let c = inspector(detailApp({ major_release_at: MARKED }), { setMajor });
		expect(c.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(1);
		await live!.stop();
		c = inspector(detailApp({ major_release_at: MARKED, hidden_at: '2026-10-01T00:00:00Z' }), { setMajor });
		expect(c.querySelectorAll('[data-testid="foundry-major-remove"]')).toHaveLength(1);
	});

	it('a press calls the transport once with this app and acknowledges the landed write', async () => {
		calls.length = 0;
		const c = inspector(detailApp(), { setMajor });
		(c.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await live!.settle();
		expect(calls).toEqual([['00000000-0000-4000-8000-000000000099', true]]);
		expect(c.querySelector('[data-testid="foundry-major-said"]')?.textContent).toMatch(/Marked as a major release/);
		expect(c.querySelector('[data-testid="foundry-major-said"]')?.getAttribute('role')).toBe('status');
	});

	it('a refusal is shown verbatim as an alert', async () => {
		const c = inspector(detailApp(), {
			setMajor: async () => ({ ok: false, message: 'Major releases are not switched on for this deployment yet.' })
		});
		(c.querySelector('[data-testid="foundry-major-mark"]') as HTMLButtonElement).click();
		await live!.settle();
		const alert = c.querySelector('.fdy-major-sec [role="alert"]');
		expect(alert?.textContent).toBe('Major releases are not switched on for this deployment yet.');
	});
});
