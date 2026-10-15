// tests/cert-student-catalog.test.ts
//
// THE CATALOG, RENDERED (ledger 0391, surface c). `cert_catalog` answers a
// flat list; the page groups it by category and gives every card ONE key.
// Each claim is asserted in both directions with counts, over the harness's
// own fixtures (which is what /dev/cert-catalog mounts), through the REAL
// `CatalogGrid` server-rendered:
//
//   - grouping keeps the function's order and never re-sorts;
//   - a locked card names the missing prerequisite in words ("Needs MILL-1
//     first") and its Start is `aria-disabled`, never `disabled`;
//   - the four state keys land on exactly the cards that earn them, and a
//     person holding nothing gets no Continue and no Earned;
//   - Earned carries the serial's tail only when a serial is known;
//   - an empty catalog is one notice and zero cards.
//
// `catalogKey`, `needsWords` and `groupCatalog` are also put to a corpus
// directly, because the markup assertions above can only count what the
// fixture holds.
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import CatalogGrid from '$lib/certifications/student/CatalogGrid.svelte';
import { catalogKey, completionWords, definitionLead, groupCatalog, holdersWords, needsWords, serialTail } from '$lib/certifications/student/catalog';
import type { CertSummary } from '$lib/certifications/types';
import { CATALOG, CATALOG_LOCKED, SERIALS } from '../src/routes/dev/cert-certification/fixtures';

const strip = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const renderGrid = (items: CertSummary[], serials: Record<string, string> = {}) =>
	strip(render(CatalogGrid, { props: { items, serials, post: null } }).body);

describe('the catalog groups by category in the order the function answered', () => {
	it('four groups, seven cards, Safety first and Team roles last', () => {
		const groups = groupCatalog(CATALOG);
		expect(groups.map((g) => g.category)).toEqual(['Safety', 'Machining', 'Software', 'Team roles']);
		expect(groups.map((g) => g.items.length)).toEqual([1, 3, 2, 1]);
		const html = renderGrid(CATALOG, SERIALS);
		expect(count(html, /data-testid="cert-catalog-group"/g)).toBe(4);
		expect(count(html, /data-testid="cert-catalog-card"/g)).toBe(7);
		// Never re-sorted: a later category's earlier sort_order does not pull it up.
		const shuffled = [CATALOG[6], CATALOG[0], CATALOG[1]];
		expect(groupCatalog(shuffled).map((g) => g.category)).toEqual(['Team roles', 'Safety', 'Machining']);
	});

	it('a blank category is "Other", and nothing is dropped', () => {
		const items = [{ ...CATALOG[0], category: '  ' }, CATALOG[1]];
		const groups = groupCatalog(items);
		expect(groups.map((g) => g.category)).toEqual(['Other', 'Machining']);
		expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(2);
	});
});

describe('every card carries exactly one state key', () => {
	it('on the full catalog: 2 Continue, 2 Earned, 2 Start, 1 Withdrawn', () => {
		const keys = CATALOG.map((c) => catalogKey(c, SERIALS));
		expect(keys.map((k) => k.kind)).toEqual(['earned', 'continue', 'start', 'start', 'withdrawn', 'continue', 'earned']);
		const html = renderGrid(CATALOG, SERIALS);
		expect(count(html, /data-key="continue"/g)).toBe(2);
		expect(count(html, /data-key="earned"/g)).toBe(2);
		expect(count(html, /data-key="start"/g)).toBe(2);
		expect(count(html, /data-key="withdrawn"/g)).toBe(1);
		expect(count(html, /data-testid="cert-card-continue"/g)).toBe(2);
		expect(count(html, /data-testid="cert-card-earned"/g)).toBe(2);
		// Start keys render for `start` and `withdrawn`: three forms.
		expect(count(html, /data-testid="cert-card-start"/g)).toBe(3);
		expect(count(html, /data-testid="cert-card-dormant"/g)).toBe(1);
		expect(html).toContain('Withdrawn: start again');
	});

	it('the dormant attempt still gets Continue and says Dormant', () => {
		const cad = CATALOG.find((c) => c.code === 'CAD-1')!;
		expect(catalogKey(cad)).toEqual({ kind: 'continue', label: 'Continue', dormant: true });
		const active = catalogKey(CATALOG.find((c) => c.code === 'MILL-1')!);
		expect(active).toEqual({ kind: 'continue', label: 'Continue', dormant: false });
	});

	it('an expired award is a fresh Start again, never Earned', () => {
		const safe = CATALOG.find((c) => c.code === 'SAFE-1')!;
		const expired = { ...safe, my: { ...safe.my, expired: true } };
		expect(catalogKey(expired, SERIALS)).toEqual({ kind: 'start', label: 'Start again', enabled: true, missing: [] });
		expect(catalogKey(safe, SERIALS).kind).toBe('earned');
	});
});

describe('a locked card names what it needs, in words, and its Start is dark', () => {
	it('on the full catalog MILL-2 alone is locked', () => {
		const html = renderGrid(CATALOG, SERIALS);
		expect(count(html, /data-testid="cert-card-needs"/g)).toBe(1);
		expect(html).toContain('Needs MILL-1 first');
		expect(count(html, /data-testid="cert-card-start"[^>]*data-enabled="no"/g)).toBe(1);
		expect(count(html, /data-testid="cert-card-start"[^>]*data-enabled="yes"/g)).toBe(2);
		// aria-disabled, and NEVER the disabled attribute, on every Start.
		expect(count(html, /aria-disabled="true"[^>]*data-testid="cert-card-start"/g)).toBe(1);
		expect(count(html, /aria-disabled="false"[^>]*data-testid="cert-card-start"/g)).toBe(2);
		expect(html).not.toMatch(/<button[^>]*\sdisabled[\s>=]/);
	});

	it('holding nothing: every card with a prerequisite is locked and nothing is in progress or earned', () => {
		const html = renderGrid(CATALOG_LOCKED);
		expect(count(html, /data-testid="cert-card-needs"/g)).toBe(3);
		expect(html).toContain('Needs SAFE-1 first');
		expect(html).toContain('Needs MILL-1 first');
		expect(count(html, /data-enabled="no"/g)).toBe(3);
		expect(count(html, /data-enabled="yes"/g)).toBe(4);
		expect(count(html, /data-testid="cert-card-continue"/g)).toBe(0);
		expect(count(html, /data-testid="cert-card-earned"/g)).toBe(0);
		// The positive control for the two absences: the same markup on the full catalog has both.
		const full = renderGrid(CATALOG, SERIALS);
		expect(count(full, /data-testid="cert-card-continue"/g)).toBe(2);
		expect(count(full, /data-testid="cert-card-earned"/g)).toBe(2);
	});

	it('needsWords spells one, two and three codes', () => {
		expect(needsWords([])).toBe('');
		expect(needsWords(['SAFE-1'])).toBe('Needs SAFE-1 first');
		expect(needsWords(['SAFE-1', 'MILL-1'])).toBe('Needs SAFE-1 and MILL-1 first');
		expect(needsWords(['SAFE-1', 'MILL-1', 'LATHE-1'])).toBe('Needs SAFE-1, MILL-1 and LATHE-1 first');
	});
});

describe('Earned shows the serial tail only when a serial is known', () => {
	it('with serials: W4PB and 6G7H; without: Earned alone', () => {
		const withTail = renderGrid(CATALOG, SERIALS);
		expect(withTail).toContain('W4PB');
		expect(withTail).toContain('6G7H');
		const without = renderGrid(CATALOG);
		expect(without).not.toContain('W4PB');
		expect(count(without, /data-testid="cert-card-earned"/g)).toBe(2);
		expect(serialTail('IDEA-7K3Q-M9XD-2HTR-W4PB')).toBe('W4PB');
		expect(serialTail(null)).toBeNull();
		expect(serialTail('nonsense')).toBeNull();
	});
});

describe('the readouts and the empty state', () => {
	it('holders and completion words; null completion renders nothing', () => {
		expect(holdersWords(0)).toBe('No holders yet');
		expect(holdersWords(1)).toBe('1 holder');
		expect(holdersWords(12)).toBe('12 holders');
		expect(completionWords(null)).toBeNull();
		expect(completionWords(21)).toBe('About 21 days to earn');
		expect(completionWords(0.4)).toBe('About 1 day to earn');
		const html = renderGrid(CATALOG, SERIALS);
		expect(html).toContain('48 holders');
		expect(html).toContain('About 3 days to earn');
		// MILL-2 has null completion and three holders: the figure is absent for it.
		const mill2 = html.slice(html.indexOf('data-code="MILL-2"'), html.indexOf('data-code="LATHE-1"'));
		expect(mill2).toContain('3 holders');
		expect(mill2).not.toContain('days to earn');
	});

	it('the definition lead is two sentences, the rest behind a Disclosure', () => {
		const lead = definitionLead('One. Two. Three. Four.');
		expect(lead.lead).toBe('One. Two.');
		expect(lead.rest).toBe('Three. Four.');
		expect(definitionLead('Only one.')).toEqual({ lead: 'Only one.', rest: '' });
		expect(definitionLead('')).toEqual({ lead: '', rest: '' });
	});

	it('an empty catalog is one notice and no card; a full one has no notice', () => {
		const empty = renderGrid([]);
		expect(count(empty, /data-testid="cert-catalog-empty"/g)).toBe(1);
		expect(count(empty, /data-testid="cert-catalog-card"/g)).toBe(0);
		expect(empty).toContain('No certification is published yet.');
		const full = renderGrid(CATALOG, SERIALS);
		expect(count(full, /data-testid="cert-catalog-empty"/g)).toBe(0);
	});

	it('no address and no em dash reaches the markup', () => {
		const html = renderGrid(CATALOG, SERIALS);
		expect(html).not.toContain('@boscotech');
		expect(html).not.toContain('—');
	});
});
