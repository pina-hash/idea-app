// tests/dom/deploy-safety-editor-fallback-mount.test.ts
//
// WHEN THE EDITOR CANNOT BE DOWNLOADED, TYPING STILL SAVES.
//
// Both rich-text editors arrive as a separate chunk, and after a deploy renames
// the site's files an open tab can ask for one that no longer exists. Measured
// before this bundle: a 716x240 body with nothing editable in it, eight dead
// toolbar buttons, and 33 typed characters that landed nowhere, under a note
// promising the body "will save as plain text". The fix is a plain textarea in
// the editor's place whose text reaches the caller through the SAME `onchange`.
//
// WHY THIS IS A TEST AND NOT ONLY A HARNESS: the fallback shows only on the day
// a deploy lands under an open tab, which nobody sees, so a regression in it is
// silent until a teacher's post body disappears. The browser half (the real
// download aborted, both editors typed into at 375 and 1440) is in the F6
// report; this pins the contract with the chunk made to fail the way a missing
// file fails, by the import rejecting.
//
// HOW THE IMPORT IS MADE TO FAIL: `@tiptap/starter-kit` is mocked to THROW, so
// both editors' `Promise.all([...import()])` rejects exactly as a 404'd chunk
// does. Nothing about either component is stubbed.
//
// THE EXPECTED DOCUMENTS ARE TYPED OUT, not produced by `docFromPlainText`:
// a check derived from the function under test cannot fail.
//
// Structure, events and callbacks only. No geometry: happy-dom lays nothing out.

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tiptap/starter-kit', () => {
	throw new TypeError(
		'Failed to fetch dynamically imported module: https://ideabosco.com/_app/immutable/chunks/starter-kit.js'
	);
});

import { flushSync, mount, unmount } from 'svelte';
import RichTextEditor from '$lib/classroom/RichTextEditor.svelte';
import NoteEditor from '$lib/notebook/NoteEditor.svelte';
import { registerVersionCheck } from '$lib/shell/deploy-safety';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import type { NoteDoc, TiptapNode } from '$lib/notebook-notes';

const mounted: { component: unknown; target: HTMLElement }[] = [];
const unregister: (() => void)[] = [];

afterEach(() => {
	for (const m of mounted.splice(0)) {
		void unmount(m.component as never);
		m.target.remove();
	}
	for (const u of unregister.splice(0)) u();
});

async function settle(times = 10) {
	for (let i = 0; i < times; i += 1) {
		await new Promise((r) => setTimeout(r, 20));
		flushSync();
	}
}

function type(textarea: HTMLTextAreaElement, text: string) {
	textarea.value = text;
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	flushSync();
}

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

describe('the classroom body editor, with its download failed', () => {
	const BODY: ItemDoc = [
		{ type: 'p', runs: [{ text: 'Measure the span before you cut.' }] },
		{ type: 'p', runs: [{ text: 'Photograph the joint.', bold: true }] }
	];

	async function open() {
		const check = vi.fn(async () => true);
		unregister.push(registerVersionCheck(check));
		const ready: TiptapNode[] = [];
		const changes: TiptapNode[] = [];
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(RichTextEditor, {
			target,
			props: {
				value: BODY,
				onchange: (d: TiptapNode) => changes.push(d),
				onready: (d: TiptapNode) => ready.push(d)
			}
		});
		mounted.push({ component, target });
		await settle();
		return { target, ready, changes, check };
	}

	it('puts a working textarea where the editor would be, seeded with the body text', async () => {
		const { target } = await open();
		const plain = target.querySelectorAll<HTMLTextAreaElement>('[data-testid="classroom-body-plain"]');
		// The positive and the negative in one reading: one textarea, no editor.
		expect(plain.length).toBe(1);
		expect(target.querySelectorAll('[data-testid="classroom-body-editor"]').length).toBe(0);
		expect(plain[0].disabled).toBe(false);
		expect(plain[0].getAttribute('aria-label')).toBe('Instructions');
		expect(plain[0].value).toBe('Measure the span before you cut.\n\nPhotograph the joint.');
		expect(target.querySelector('.rt-note')?.textContent).toMatch(/save as plain text/);
	});

	it('reports ready with the STORED body, so a save without typing changes nothing', async () => {
		const { ready, changes } = await open();
		expect(ready).toEqual([
			{
				type: 'doc',
				content: [
					para('Measure the span before you cut.'),
					{ type: 'paragraph', content: [{ type: 'text', text: 'Photograph the joint.', marks: [{ type: 'bold' }] }] }
				]
			}
		]);
		expect(changes).toEqual([]);
	});

	it('hands what is typed to onchange as paragraphs of plain text', async () => {
		const { target, changes } = await open();
		const plain = target.querySelector('[data-testid="classroom-body-plain"]') as HTMLTextAreaElement;
		type(plain, 'First line\nsame paragraph\n\nSecond paragraph');
		expect(changes.at(-1)).toEqual({
			type: 'doc',
			content: [para('First line same paragraph'), para('Second paragraph')]
		});
		type(plain, '');
		expect(changes.at(-1)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
	});

	it('asks, unthrottled, whether a new version of the site is live', async () => {
		const { check } = await open();
		expect(check).toHaveBeenCalled();
	});
});

describe('the notebook note editor, with its download failed', () => {
	const NOTE: NoteDoc = [
		{ type: 'p', runs: [{ text: 'The glue line failed first.' }] },
		{ type: 'p', runs: [{ text: 'Clamp it overnight.' }] }
	];

	async function open(props: Record<string, unknown>) {
		const check = vi.fn(async () => true);
		unregister.push(registerVersionCheck(check));
		const ready: TiptapNode[] = [];
		const changes: TiptapNode[] = [];
		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(NoteEditor, {
			target,
			props: {
				...props,
				onchange: (d: TiptapNode) => changes.push(d),
				onready: (d: TiptapNode) => ready.push(d)
			}
		});
		mounted.push({ component, target });
		await settle();
		return { target, ready, changes, check };
	}

	it('puts a working textarea where the editor would be, seeded with the note text', async () => {
		const { target, ready, check } = await open({ value: NOTE });
		const plain = target.querySelectorAll<HTMLTextAreaElement>('[data-testid="note-editor-plain"]');
		expect(plain.length).toBe(1);
		expect(target.querySelectorAll('[data-testid="note-editor-input"]').length).toBe(0);
		expect(plain[0].value).toBe('The glue line failed first.\n\nClamp it overnight.');
		expect(ready).toEqual([
			{ type: 'doc', content: [para('The glue line failed first.'), para('Clamp it overnight.')] }
		]);
		expect(check).toHaveBeenCalled();
	});

	it('hands what is typed to onchange as paragraphs of plain text', async () => {
		const { target, changes } = await open({ value: NOTE });
		const plain = target.querySelector('[data-testid="note-editor-plain"]') as HTMLTextAreaElement;
		type(plain, 'It held.\n\nForty newtons.');
		expect(changes.at(-1)).toEqual({ type: 'doc', content: [para('It held.'), para('Forty newtons.')] });
	});

	it('seeds from a restored draft, a grid included, and reports that draft as ready untouched', async () => {
		const draft: TiptapNode = {
			type: 'doc',
			content: [
				para('Before the grid.'),
				{ type: 'notebookGrid', attrs: { rows: [['Load', '40'], ['', 'N']] } },
				{ type: 'bulletList', content: [{ type: 'listItem', content: [para('A listed point')] }] }
			]
		};
		const { target, ready, changes } = await open({ initialDoc: draft });
		const plain = target.querySelector('[data-testid="note-editor-plain"]') as HTMLTextAreaElement;
		expect(plain.value).toBe('Before the grid.\n\nLoad 40\n\nN\n\nA listed point');
		// The draft itself is what the caller and the mirror keep until someone
		// types here: nothing about it was rewritten by the fallback.
		expect(ready).toEqual([draft]);
		expect(changes).toEqual([]);
	});
});
