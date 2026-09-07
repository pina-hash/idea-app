// tests/classroom-check-in-refusal.test.ts
//
// THE DUPLICATE-DATE REFUSAL SAYS WHERE (prompt 0098, item J; the sentence is
// prompt 0081's and the destination prompt 0086's). Pinned because the defect
// was silent for two bundles: a refusal that read perfectly well and pointed
// nowhere. Three claims:
//
//   1. the sentence names the check-in manager (the class's Check-ins tab, which
//      does not render on the item page, so a link and not a "tab above"), and
//      the address it carries IS that tab's own href from `sectionTabs`;
//   2. it is NOT the Duplicates tab, which is about duplicate DRAFTS;
//   3. `ItemDetail` reads the helper and no longer carries a sentence of its
//      own -- the source sweep is the positive control, because the old
//      literal ("edit the existing one instead") is the exact text that said
//      nothing about where.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkInDuplicateRefusal, sectionTabs } from '../src/lib/classroom/nav';

describe('the duplicate-date refusal carries its destination', () => {
	it('names the Check-ins tab and links at that tab\'s own address', () => {
		const r = checkInDuplicateRefusal('sec-42');
		expect(r.message).toMatch(/edit the existing one in the check-in manager, which is this class's Check-ins tab\./);
		expect(r.message).toMatch(/^This item already has a check-in on that date\./);
		const tab = sectionTabs('sec-42').find((t) => t.id === 'check-ins')!;
		expect(r.href).toBe(tab.href);
		expect(r.href).toBe('/notebook/review?section=sec-42');
		expect(r.linkLabel).toBe('Open the check-in manager');
	});

	it('is the Check-ins tab and not the Duplicates tab (a duplicate check-in is not a duplicate draft)', () => {
		const r = checkInDuplicateRefusal('sec-42');
		const dup = sectionTabs('sec-42').find((t) => t.id === 'duplicates')!;
		expect(r.href).not.toBe(dup.href);
		expect(r.message).not.toMatch(/Duplicates/);
	});

	it('the section id is encoded into the address, whatever it holds', () => {
		expect(checkInDuplicateRefusal('a b/c').href).toBe('/notebook/review?section=a%20b%2Fc');
	});

	it('no em dash in the sentence (copy convention)', () => {
		expect(checkInDuplicateRefusal('x').message).not.toMatch(/—|--/);
	});
});

describe('ItemDetail reads the helper rather than carrying a sentence of its own', () => {
	const src = readFileSync(new URL('../src/lib/classroom/ItemDetail.svelte', import.meta.url), 'utf8');
	it('calls checkInDuplicateRefusal and renders its href', () => {
		expect(src).toMatch(/checkInDuplicateRefusal\(section\.id, basePath\)/);
		expect(src).toMatch(/data-testid="check-in-error-link"/);
	});
	it('the old sentence that said nothing about where is gone', () => {
		expect(src).not.toMatch(/edit the existing one instead/);
		expect(src).not.toMatch(/already has a check-in on that date/);
	});
});
