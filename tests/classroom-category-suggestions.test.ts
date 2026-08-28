// tests/classroom-category-suggestions.test.ts
//
// The grading-category field on `classroom_items` (0085) is free text with a
// length check, typed into a bare `<input type="text">`. This is the
// suggestion list ContentComposer now offers over it -- a `datalist`, never a
// table and never a pinned constant (unlike the coin economy's
// EXTRA_CREDIT_GRADING_CATEGORIES, which is NOT this vocabulary and stays
// unconnected to it):
//
//   - `courseCategorySuggestions` is the pure ranking/dedupe function, which
//     needs no migration and no server round trip to test;
//   - the SSR render below is the structural guarantee that the control stays
//     a plain free-text field -- never narrowed into something that can
//     reject a typed value -- with and without suggestions on hand.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import { courseCategorySuggestions, type ClassroomComposerTransports } from '$lib/classroom/classroom';
import type { DeckTransports } from '$lib/classroom/deck';

function strip(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

function stubTransports<T extends object>(over: Partial<T> = {}): T {
	return new Proxy(over, {
		get: (target, prop) =>
			prop in target
				? (target as Record<string | symbol, unknown>)[prop]
				: async () => ({ ok: false, message: 'not called during SSR' })
	}) as T;
}

describe('courseCategorySuggestions: ranking and de-duplication', () => {
	it('is distinct, case- and whitespace-insensitively', () => {
		const out = courseCategorySuggestions(['Unit Labs', 'unit labs ', '  Unit   Labs', 'Unit Labs']);
		expect(out).toEqual(['Unit Labs']);
	});

	it('orders most-used first', () => {
		const out = courseCategorySuggestions([
			'Documentation',
			'Unit Labs',
			'Unit Labs',
			'Homework',
			'Unit Labs'
		]);
		expect(out).toEqual(['Unit Labs', 'Documentation', 'Homework']);
	});

	it('breaks a tie in use count on first-seen order, not alphabetically', () => {
		const out = courseCategorySuggestions(['Zebra Work', 'Aardvark Work']);
		expect(out).toEqual(['Zebra Work', 'Aardvark Work']);
	});

	it('offers one of the REAL raw spellings on record, never a rewritten casing', () => {
		const out = courseCategorySuggestions(['unit labs', 'Unit Labs']);
		// The first spelling seen is the one offered; nothing here invents a
		// third casing that was never actually typed by a teacher.
		expect(out).toEqual(['unit labs']);
	});

	it('drops null, empty and whitespace-only values without erroring', () => {
		const out = courseCategorySuggestions([null, undefined, '', '   ', 'Homework']);
		expect(out).toEqual(['Homework']);
	});

	it('is not itself sorted alphabetically -- ordering is purely by use count', () => {
		// A regression here would be swapping the comparator back to a plain
		// localeCompare, which reads as "fine" until a teacher who uses one
		// category thirty times has to scroll past twenty-nine alphabetically
		// earlier ones they used once.
		const out = courseCategorySuggestions(['B', 'B', 'B', 'A']);
		expect(out).toEqual(['B', 'A']);
	});
});

describe('ContentComposer: the grading-category field stays free text', () => {
	function renderComposer(transports: ClassroomComposerTransports) {
		return strip(
			render(ContentComposer, {
				props: {
					mode: 'create' as const,
					kind: 'assignment' as const,
					transports,
					deckTransports: stubTransports<DeckTransports>(),
					onsaved: () => {}
				}
			}).body
		);
	}

	it('renders a plain text input for the category, with no transport wired', () => {
		const html = renderComposer(stubTransports<ClassroomComposerTransports>());
		expect(html).toContain('Grading category');
		const inputTag = html.match(/<input[^>]*placeholder="Unit Labs"[^>]*>/)?.[0] ?? '';
		expect(inputTag).toContain('type="text"');
	});

	it('renders no datalist before any suggestion has loaded (SSR never runs the fetch effect)', () => {
		const html = renderComposer(
			stubTransports<ClassroomComposerTransports>({
				loadCategorySuggestions: async () => ({ ok: true, data: ['Unit Labs', 'Homework'] })
			})
		);
		expect(html).not.toContain('<datalist');
	});

	it('the category input never gains a required/select-shaped constraint', () => {
		const html = renderComposer(stubTransports<ClassroomComposerTransports>());
		const inputTag = html.match(/<input[^>]*placeholder="Unit Labs"[^>]*>/)?.[0] ?? '';
		expect(inputTag).not.toContain('required');
		expect(html).not.toMatch(/<select[^>]*>\s*<option[^>]*>Unit Labs/);
	});
});
