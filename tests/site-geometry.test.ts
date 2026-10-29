// tests/site-geometry.test.ts
//
// LEDGER 0468: ONE PAGE HEADER AND ONE APP SUB-NAV ACROSS THE APPS.
//
// What a reader would not notice going wrong:
//   - a page shell quietly growing its own title treatment again (the site had
//     several before this; one header means every app page mounts the one
//     component);
//   - a sub-nav lighting two places, or none, while still rendering pads;
//   - the stream's continued-unit marker landing on the wrong row (a label
//     over the wrong part of a unit reads as a fact about the wrong unit).
// Both directions are asserted, with positive controls.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import PageHeader from '$lib/shell/PageHeader.svelte';
import AppSubNav from '$lib/shell/AppSubNav.svelte';
import AdminSubNav, { ADMIN_PLACES, adminPlaceFor } from '$lib/shell/AdminSubNav.svelte';
import { continuedRows, continuesLabel } from '$lib/classroom/unit-continues';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

/** Every app page shell this lane put on the one header. */
const SHELLS = [
	'src/lib/coin-bar/CoinHomePage.svelte',
	'src/lib/coin-market/MarketPage.svelte',
	'src/lib/coin-stocks/StocksPage.svelte',
	'src/lib/coin-stocks/StockDetailPage.svelte',
	'src/lib/coin-balance/CoinPageView.svelte',
	'src/lib/coin-balance/CoinRolePortal.svelte',
	'src/routes/coin/(staff)/+layout.svelte',
	'src/lib/foundry/FoundryPage.svelte',
	'src/lib/foundry/FoundryContract.svelte',
	'src/lib/foundry/FoundryAuthorPage.svelte',
	'src/routes/foundry/submit/+page.svelte',
	'src/lib/maps/viewer/MapsViewer.svelte',
	'src/lib/maps/MapsEditorShell.svelte',
	'src/lib/certifications/student/CertShell.svelte',
	'src/routes/dashboard/+page.svelte',
	'src/routes/admin/test-accounts/+page.svelte',
	'src/routes/admin/avatars/+page.svelte',
	'src/routes/admin/links/+page.svelte',
	'src/routes/admin/view-as/+page.svelte',
	'src/routes/admin/connector/+page.svelte',
	'src/routes/admin/html-assignments/+page.svelte',
	'src/routes/admin/ideacad-materials/+page.svelte',
	'src/routes/admin/notebook-drive-test/+page.svelte',
	'src/routes/admin/feedback/connector/+page.svelte',
	'src/lib/calendar/CalendarPage.svelte',
	'src/lib/notebook/NotebookHead.svelte',
	'src/lib/notebook/NotebookTimeline.svelte'
];

describe('every app page shell mounts the one page header', () => {
	it('each shell mounts PageHeader and writes no h1 of its own', () => {
		for (const f of SHELLS) {
			const src = read(f);
			expect(src, f).toMatch(/<PageHeader\b/);
			// Markup only: a comment may still say "h1".
			const markup = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
			expect(markup, f).not.toMatch(/<h1\b/);
		}
		// POSITIVE CONTROL: the matcher sees an h1 where there is one.
		expect('<main><h1>x</h1></main>').toMatch(/<h1\b/);
	});

	it('draws the eyebrow, the title bar and the meta line, and nothing it was not given', () => {
		const full = render(PageHeader as never, { props: { eyebrow: 'IDEA Coins', title: 'Coin home', meta: 'One line.' } as never }).body;
		expect(full).toContain('class="idea-eyebrow idea-eyebrow--info ph-eyebrow');
		expect(full).toMatch(/<h1 class="idea-titlebar ph-title[^"]*"[^>]*>Coin home<\/h1>/);
		expect(full).toContain('One line.');
		const bare = render(PageHeader as never, { props: { title: 'Only a title' } as never }).body;
		expect(bare).not.toContain('idea-eyebrow');
		expect(bare).not.toContain('ph-meta');
		expect(bare.match(/<h1\b/g)).toHaveLength(1);
	});
});

describe('the app sub-nav lights exactly the current place', () => {
	const items = [
		{ id: 'a', label: 'Alpha', href: '/a' },
		{ id: 'b', label: 'Beta', href: '/b', current: true },
		{ id: 'c', label: 'Gamma', href: '/c', count: 3, hot: true }
	];

	it('one pad per place, one lit, links when there is an address', () => {
		const html = render(AppSubNav as never, { props: { label: 'Test', items } as never }).body;
		expect(html.match(/class="idea-pad"/g)).toHaveLength(3);
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html).toMatch(/href="\/b"[^>]*aria-current="page"/);
		expect(html.match(/<a\b/g)).toHaveLength(3);
		expect(html).not.toMatch(/<button\b/);
		expect(html).toMatch(/idea-pad-count[^>]*data-hot="true"[^>]*>3</);
		expect(html).toContain('aria-label="Test"');
	});

	it('no place lit when none is current, and buttons when there is no address', () => {
		const html = render(AppSubNav as never, {
			props: { label: 'Test', items: items.map((i) => ({ id: i.id, label: i.label })), onselect: () => {} } as never
		}).body;
		expect(html).not.toContain('aria-current');
		expect(html.match(/<button\b/g)).toHaveLength(3);
		expect(html).not.toMatch(/<a\b/);
	});

	it('the admin area names its places once and lights the one it is on', () => {
		expect(adminPlaceFor('/dashboard')).toBe('console');
		expect(adminPlaceFor('/admin/feedback/connector')).toBe('feedback');
		expect(adminPlaceFor('/admin/linksx')).toBeNull();
		expect(adminPlaceFor('/dev/portal-admin')).toBeNull();
		const html = render(AdminSubNav as never, { props: { current: 'links' } as never }).body;
		expect(html.match(/class="idea-pad"/g)).toHaveLength(ADMIN_PLACES.length);
		expect(html.match(/aria-current="page"/g)).toHaveLength(1);
		expect(html).toMatch(/href="\/admin\/links"[^>]*aria-current="page"/);
	});
});

describe('a unit continued into the next column names itself there', () => {
	it('marks each row whose left edge moved right, and nothing else', () => {
		expect(continuedRows([10, 10, 10, 400, 400, 790])).toEqual([3, 5]);
		expect(continuedRows([10, 10, 10])).toEqual([]);
		// A sub-pixel wobble is not a new column.
		expect(continuedRows([10, 11.5, 10.2])).toEqual([]);
		// Back to the left (a new unit card) is not a continuation either.
		expect(continuedRows([400, 400, 10])).toEqual([]);
	});

	it('says which unit, in words', () => {
		expect(continuesLabel('  Unit 3: Gears  ')).toBe('Unit 3: Gears, continued');
		expect(continuesLabel('')).toBe('Continued');
	});

	it('the stream mounts the marker and draws it as a label that cannot move a row', () => {
		const src = read('src/lib/classroom/ClassView.svelte');
		expect(src).toMatch(/class="stream"[\s\S]{0,400}use:unitContinues/);
		expect(src).toMatch(/\.row-wrap\[data-continues\]\)::after \{[\s\S]*?position: absolute;/);
	});
});

describe('the landing offers its tour instead of starting it', () => {
	it('a signed-out visitor gets the inline row, and the spotlight starts only for a signed-in first run', () => {
		const tour = read('src/lib/tour/HomeTour.svelte');
		const offer = read('src/lib/tour/HomeTourOffer.svelte');
		expect(tour).not.toMatch(/phase = 'signin'/);
		expect(tour).toMatch(/homeTourPlan\(profile\.tour_completed_at\) === 'run'/);
		expect(offer).toMatch(/localStorage\.getItem\(TOUR_SEEN_KEY\)/);
		expect(offer).toContain('Show me around');
	});
});
