// tests/dom/html-link-check-mount.test.ts
//
// LEDGER 0360: THE STUDENT'S OWN CHECK ON A PRESENTATION LINK HAND-IN.
//
// Mounts the REAL `HtmlLinkCheck`. Both directions on one manifest: a value
// that is not a link gives the note and no anchor; a link gives the host and a
// Test it anchor and no note; an empty field, and a worksheet that declares no
// link field, give nothing at all -- an existing worksheet renders exactly as
// it did.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import HtmlLinkCheck from '$lib/classroom/html-assignment/HtmlLinkCheck.svelte';
import { mountInto, type Mounted } from './mount';

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

const WITH_LINK = {
	schemaVersion: 3,
	kind: 'html-assignment',
	title: 'Pitch',
	course: 'IDEA100',
	points: 0,
	modules: [
		{
			id: 'm1',
			title: 'Deck',
			points: 0,
			blocks: [
				{ id: 'm1-link', field: 'deck', type: 'text', link: 'presentation', prompt: 'Link to your deck' },
				{ id: 'm1-notes', field: 'notes', type: 'longText' }
			],
			criteria: []
		}
	]
};
const WITHOUT = {
	...WITH_LINK,
	modules: [{ ...WITH_LINK.modules[0], blocks: [{ id: 'm1-deck', field: 'deck', type: 'text' }] }]
};

function mountWith(manifest: unknown, values: Record<string, string | boolean>): Mounted {
	return mountInto(HtmlLinkCheck as unknown as Component<Record<string, unknown>>, { manifest, values });
}

describe('HtmlLinkCheck', () => {
	it('words that are not a link: 1 note, 0 anchors', async () => {
		mounted = mountWith(WITH_LINK, { deck: 'my slides' });
		await mounted.settle();
		expect(mounted.all('[data-testid="html-link-bad"]')).toHaveLength(1);
		expect(mounted.one('[data-testid="html-link-bad"]').getAttribute('role')).toBe('status');
		expect(mounted.one('[data-testid="html-link-bad"]').textContent).toContain('does not look like a link yet');
		expect(mounted.all('a')).toHaveLength(0);
	});

	it('a link: the host and 1 Test it anchor, 0 notes', async () => {
		mounted = mountWith(WITH_LINK, { deck: 'https://docs.google.com/presentation/d/x/edit' });
		await mounted.settle();
		expect(mounted.all('[data-testid="html-link-bad"]')).toHaveLength(0);
		expect(mounted.one('[data-testid="html-link-ok"]').textContent).toContain('Google Slides');
		const a = mounted.all<HTMLAnchorElement>('[data-testid="html-link-test"]');
		expect(a).toHaveLength(1);
		expect(a[0].getAttribute('href')).toBe('https://docs.google.com/presentation/d/x/edit');
		expect(a[0].getAttribute('target')).toBe('_blank');
		expect(a[0].getAttribute('rel')).toContain('noopener');
		expect(a[0].getAttribute('rel')).toContain('noreferrer');
	});

	it('a hostile value is a note, never an anchor', async () => {
		mounted = mountWith(WITH_LINK, { deck: 'javascript:alert(1)' });
		await mounted.settle();
		expect(mounted.all('a')).toHaveLength(0);
		expect(mounted.all('[data-testid="html-link-bad"]')).toHaveLength(1);
	});

	it('an empty field, and a worksheet with no link field, render nothing at all', async () => {
		mounted = mountWith(WITH_LINK, { deck: '   ', notes: 'https://example.org' });
		await mounted.settle();
		expect(mounted.target.children).toHaveLength(0);
		await mounted.stop();
		// A link written in an ordinary answer on a worksheet with no link field:
		// the student surface says nothing (existing worksheets are unchanged).
		mounted = mountWith(WITHOUT, { deck: 'https://docs.google.com/presentation/d/x' });
		await mounted.settle();
		expect(mounted.target.children).toHaveLength(0);
	});
});
