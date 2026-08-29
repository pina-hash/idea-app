// tests/classroom-upload-picker-parity.test.ts
//
// Drag, drop and paste were added to every classroom upload surface
// (FileUploadPanel, DeckPanel) as an ADDITION over the existing picker, never
// a replacement -- requirement 4 of the bundle that added them. This is the
// regression guard for that: the real shipped components, server-rendered
// (`svelte/server`, the classroom-manager-spec-visibility.test.ts pattern).
// This header used to add "this repo has no DOM/event-dispatch harness, so an
// SSR structural assertion is the strongest claim available without one".
// There is one now: `tests/dom/classroom-upload-picker-parity-mount.test.ts`
// mounts FileUploadPanel and fires a real drag, drop and paste at it. Every
// claim below stays -- an SSR render is what the browser RECEIVES, and the
// three surfaces asserted here are three separate mounts of the picker that a
// single mounted panel says nothing about.
//
// What is asserted, both directions:
//   - the picker `<input type="file">` is still there, unchanged (no
//     `accept`, `multiple` present, not disabled by default) -- nothing here
//     may cost the plain click-to-pick path;
//   - a NEW keyboard trap is not: the drop feedback overlay is absent from the
//     default render, so it adds nothing to the tab order and nothing
//     reachable only by pointer. (That it APPEARS during a drag, and is
//     `aria-hidden` when it does, is the mount file's -- one frame of SSR
//     cannot show a state that only exists mid-drag.)
//   - the panel states its new drag/paste capability in words, not only
//     through a listener nobody is told about.

import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import FileUploadPanel from '$lib/classroom/FileUploadPanel.svelte';
import DeckPanel from '$lib/classroom/DeckPanel.svelte';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import type { ClassroomComposerTransports } from '$lib/classroom/classroom';
import type { DeckTransports } from '$lib/classroom/deck';

function strip(html: string): string {
	return html.replace(/<!--[\s\S]*?-->/g, '');
}

/** Every method call in this file's SSR renders is unreached (no interaction
 *  happens during a server render); this stands in for a full transports
 *  object so TypeScript is satisfied without enumerating every method. */
function stubTransports<T extends object>(): T {
	return new Proxy(
		{},
		{ get: () => async () => ({ ok: false, message: 'not called during SSR' }) }
	) as T;
}

const noopUpload = async () => ({ ok: true as const, storageKey: '' });

describe('FileUploadPanel: the picker survives the drop target', () => {
	const html = strip(
		render(FileUploadPanel, {
			props: { role: 'attachment' as const, itemId: 'item-1', upload: noopUpload }
		}).body
	);

	it('still renders the plain file input, unfiltered', () => {
		expect(html).toContain('type="file"');
		expect(html).toContain('multiple');
	});

	it('still carries NO accept attribute on the plain picker', () => {
		// The camera input (offerCamera) is the one documented exception; it is
		// not offered here, so no accept anywhere in this render is correct.
		expect(html).not.toContain('accept=');
	});

	it('the plain picker is not disabled by default', () => {
		const inputTag = html.match(/<input[^>]*type="file"[^>]*>/)?.[0] ?? '';
		expect(inputTag).not.toContain('disabled');
	});

	it('states the new drag/paste capability in words', () => {
		expect(html).toMatch(/drag files here.*paste an image/i);
	});

	it('renders no drop-active class or overlay before any drag happens', () => {
		expect(html).not.toContain('is-drop-active');
		expect(html).not.toContain('Drop files here');
	});

	it('offering the camera button keeps its own accept + capture, unaffected', () => {
		const withCamera = strip(
			render(FileUploadPanel, {
				props: {
					role: 'submission' as const,
					itemId: 'item-1',
					upload: noopUpload,
					offerCamera: true
				}
			}).body
		);
		expect(withCamera).toContain('accept="image/*"');
		expect(withCamera).toContain('capture="environment"');
	});
});

describe('DeckPanel: the upload control survives the drop target', () => {
	const html = strip(
		render(DeckPanel, {
			props: {
				itemId: 'item-1',
				sectionId: 'sec-1',
				canManage: true,
				mode: 'manage' as const,
				transports: {
					uploadDeck: async () => ({ ok: true as const, message: '', fileCount: 0 }),
					deleteDeck: async () => ({ ok: true as const, message: '' })
				}
			}
		}).body
	);

	it('still renders the zip picker, unchanged', () => {
		expect(html).toContain('type="file"');
		expect(html).toContain('.zip');
	});

	it('renders no drop-active class or overlay before any drag happens', () => {
		expect(html).not.toContain('is-drop-active');
		expect(html).not.toContain('Drop files here');
	});

	it('a view-only mount (no manage rights) renders no upload surface to drop onto', () => {
		const viewHtml = strip(
			render(DeckPanel, {
				props: {
					itemId: 'item-1',
					sectionId: 'sec-1',
					canManage: false,
					mode: 'view' as const,
					deck: {
						id: 'd1',
						item_id: 'item-1',
						title: 'Bridge deck',
						entry_path: 'index.html',
						thumbnail_path: null,
						file_count: 3,
						slides: [],
						has_state_file: true,
						total_bytes: 1024
					}
				}
			}).body
		);
		expect(viewHtml).not.toContain('type="file"');
	});
});

describe('ContentComposer: the staged-deck picker (create mode) survives the drop target', () => {
	const html = strip(
		render(ContentComposer, {
			props: {
				mode: 'create' as const,
				kind: 'assignment' as const,
				transports: stubTransports<ClassroomComposerTransports>(),
				deckTransports: stubTransports<DeckTransports>(),
				onsaved: () => {}
			}
		}).body
	);

	it('still renders the staged-deck zip picker, unchanged', () => {
		expect(html).toContain('data-testid="staged-deck-input"');
		expect(html).toContain('.zip');
	});

	it('renders no drop-active class or overlay before any drag happens', () => {
		expect(html).not.toContain('is-drop-active');
		expect(html).not.toContain('Drop files here');
	});
});
