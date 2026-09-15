// tests/ideacad-chooser-render.test.ts
//
// THE CHOOSER, RENDERED, mounting the REAL `IdeaCadApp` rather than a copy of
// its markup. What is pinned here is what the pure layer cannot see: which
// controls reach the page, and which do NOT.
//
// WHY AN SSR RENDER AND NOT A `tests/dom/` MOUNT. Every claim below is about
// the FIRST FRAME -- a control present or absent, an owner line drawn or not --
// and none of them needs an event to have run. `vitest.config.ts`'s own header
// says to prefer the `node` project when either would do; a mount of this
// component additionally drags the whole viewport and three.js in to answer a
// question about a `{#if}`.
//
// NO GEOMETRY, NO CONTRAST, NO TAP TARGET IS ASSERTED HERE. There is no layout
// engine on this path at all, so a measurement would read zero and pass
// vacuously. Those belong to `npm run verify:browser` against
// `/ideacad/preview/chooser`.
//
// ABSENCE IS THE MECHANISM AND IT IS COUNTED BOTH WAYS. Every "the control is
// not there" assertion is paired with the same fixture that DOES have it
// reading a non-zero count, so an absence can never be a page that failed to
// render.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { Component } from 'svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import IdeaCadApp from '../src/lib/ideacad/app/IdeaCadApp.svelte';
import {
	IDEACAD_CHOOSER_ARCHIVED_CHIP,
	IDEACAD_CHOOSER_CONTROLS_AT,
	type IdeaCadDocumentSummary
} from '../src/lib/ideacad/app/types';

const App = IdeaCadApp as unknown as Component<Record<string, unknown>>;

/* No transport runs before a document is chosen, and `createIdeacadLive` builds
   its channels lazily, so an inert client is enough to render the chooser --
   the same client `/ideacad/preview/chooser` mounts it with. */
const supabase = {} as SupabaseClient;

const doc = (over: Partial<IdeaCadDocumentSummary> & { id: string }): IdeaCadDocumentSummary => ({
	itemId: 'item-1',
	title: 'Competition blade study',
	updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
	ownerEmail: 'reyes.ana@boscotech.net',
	isOwn: false,
	archivedAt: null,
	conceptCount: 2,
	profile: { stations: [{ r: 0, z: 0 }, { r: 1.2, z: 3 }, { r: 0.4, z: 5 }], bladeCount: 6 },
	canArchive: false,
	...over
});

function html(
	documents: IdeaCadDocumentSummary[],
	sources: { itemId: string; title: string }[] = [{ itemId: 's1', title: 'Blade design workspace' }]
): string {
	return render(App, {
		props: {
			supabase,
			userId: 'viewer',
			documents,
			sources,
			initialLayout: { left: 260, right: 240, leftOpen: true, rightOpen: true }
		}
	}).body;
}

/** Count non-overlapping occurrences of a literal, so a claim is a NUMBER. */
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('the archive control is present for a manager and ABSENT for everyone else', () => {
	it('draws one per manageable row, and none at all when the caller manages nothing', () => {
		const manageable = [doc({ id: 'a', canArchive: true }), doc({ id: 'b', canArchive: true })];
		const plain = manageable.map((row) => ({ ...row, canArchive: false }));

		const withControl = html(manageable);
		const without = html(plain);

		// The positive control: the same two rows render either way, so a zero
		// below can never be a page that did not render.
		expect(count(withControl, 'Competition blade study')).toBe(2);
		expect(count(without, 'Competition blade study')).toBe(2);

		expect(count(withControl, '>Archive<')).toBe(2);
		expect(count(without, '>Archive<')).toBe(0);
		expect(count(without, '>Restore<')).toBe(0);
	});

	it('offers Restore rather than Archive on a row that is already archived', () => {
		const archived = html([doc({ id: 'a', canArchive: true, archivedAt: '2026-09-10T00:00:00Z' })]);
		expect(count(archived, '>Restore<')).toBe(1);
		expect(count(archived, '>Archive<')).toBe(0);
		// The chip is a WORD, never only a hue.
		expect(archived).toContain(IDEACAD_CHOOSER_ARCHIVED_CHIP);
	});

	it('draws no confirmation until one is armed', () => {
		// The two-step confirm: nothing destructive-looking is one press away.
		expect(html([doc({ id: 'a', canArchive: true })])).not.toContain('Nothing is deleted');
	});
});

describe('an owner line is drawn on somebody else’s work and on nothing else', () => {
	it('names the other student and says nothing on the caller’s own rows', () => {
		const mixed = html([
			doc({ id: 'mine', isOwn: true, ownerEmail: 'you@boscotech.net' }),
			doc({ id: 'theirs', isOwn: false, ownerEmail: 'reyes.ana@boscotech.net' })
		]);
		expect(count(mixed, 'reyes.ana@boscotech.net')).toBeGreaterThan(0);
		expect(count(mixed, 'you@boscotech.net')).toBe(0);
		// Positive control: both rows are on the page.
		expect(count(mixed, 'Competition blade study')).toBe(2);
	});
});

describe('the search, filters and sort appear only once the list needs them', () => {
	const many = Array.from({ length: IDEACAD_CHOOSER_CONTROLS_AT }, (_, i) => doc({ id: `d${i}` }));

	it('draws them at the threshold and withholds them below it', () => {
		const wide = html(many);
		const narrow = html(many.slice(1));
		expect(count(wide, 'type="search"')).toBe(1);
		expect(count(wide, 'Shared with me')).toBe(1);
		expect(count(narrow, 'type="search"')).toBe(0);
		expect(count(narrow, 'Shared with me')).toBe(0);
		// Positive control: the rows themselves are on both pages.
		expect(count(wide, 'Competition blade study')).toBe(IDEACAD_CHOOSER_CONTROLS_AT);
		expect(count(narrow, 'Competition blade study')).toBe(IDEACAD_CHOOSER_CONTROLS_AT - 1);
	});
});

describe('the empty state leads with New document, composed in place', () => {
	it('offers the real starters rather than a button that goes somewhere else', () => {
		const empty = html([]);
		expect(empty).toContain('Start your first document');
		expect(count(empty, 'Blade design workspace')).toBe(1);
		expect(count(empty, 'NEW DOCUMENT')).toBe(1);
		// With nothing started there is no documents section to head.
		expect(count(empty, '>Documents</h2>')).toBe(0);
	});

	it('allows an empty standalone document without assignment starters', () => {
		const nothing = html([], []);
		expect(nothing).toContain('New document');
		expect(nothing).not.toContain('No starters available');
		expect(count(nothing, 'NEW DOCUMENT')).toBe(0);
	});
});

describe('the document title in the command bar reads as a title', () => {
	it('is absent until a document is chosen, which is the chooser’s own first frame', () => {
		// `documentChosen` is a local gate the chooser sets; on the first frame
		// nothing is open, so the bar carries no document name at all.
		expect(html([doc({ id: 'a' })])).not.toContain('data-testid="ideacad-document-title"');
	});
});

describe('a thumbnail is drawn from a readable tree and never faked for an unreadable one', () => {
	it('draws a polyline for one and says so in words for the other', () => {
		const drawn = html([doc({ id: 'a' })]);
		const blank = html([doc({ id: 'a', profile: null })]);
		expect(count(drawn, '<polyline')).toBe(1);
		expect(count(blank, '<polyline')).toBe(0);
		// An absent picture SAYS it is absent rather than leaving a hole.
		expect(blank).toContain('PROFILE');
		// The blade count rides the picture, not the row.
		expect(drawn).toContain('6×');
	});
});
