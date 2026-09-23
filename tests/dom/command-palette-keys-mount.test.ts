// tests/dom/command-palette-keys-mount.test.ts
//
// THE PALETTE'S KEYS NEVER FIRE INSIDE SOMETHING SOMEBODY IS TYPING IN.
//
// Ctrl+K is a rich-text editor's own "add a link" key, `?` is a character a
// student types into an answer and `/` is a character in a URL. A window
// listener that took any of them from a text field would steal a keystroke
// out of somebody's writing -- and it would do it silently, because the
// palette opening over an editor looks like a feature. So this mounts the REAL
// `CommandPalette` and dispatches real keyboard events from a text input, a
// textarea, a select and a contenteditable (each must leave the palette shut
// AND leave the event unprevented, so the field keeps its own key), with the
// same events from a button and the body as the positive control that opens
// it.
//
// It also pins the other two guards that are invisible when they regress:
// nothing opens while another dialog is open (the grading console's and the
// review console's own keys must never contend with this), and Escape closes
// the dialog and puts focus back on whatever opened it.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import CommandPalette from '$lib/shell/CommandPalette.svelte';
import { mountInto, type Mounted } from './mount';
import type { PaletteSources } from '$lib/shell/palette';

const Palette = CommandPalette as unknown as Component<Record<string, unknown>>;

const SOURCES: PaletteSources = { section: null, items: [], units: [], sections: [], checkIns: [] };
const ENV = {
	role: 'student',
	surface: 'classroom',
	sectionId: null,
	itemId: null,
	basePath: '/classroom'
};

let m: Mounted;
let scratch: HTMLElement;

beforeEach(() => {
	m = mountInto(Palette, { sources: SOURCES, env: ENV });
	scratch = document.createElement('div');
	document.body.appendChild(scratch);
});

afterEach(async () => {
	await m.stop();
	scratch.remove();
	for (const d of Array.from(document.querySelectorAll('dialog'))) d.remove();
});

const dialogs = () => document.querySelectorAll('[data-testid="command-palette"]').length;

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
	target.dispatchEvent(event);
	m.flush();
	return event;
}

function field(tag: 'input' | 'textarea' | 'select' | 'editor'): HTMLElement {
	const el =
		tag === 'editor'
			? Object.assign(document.createElement('div'), { contentEditable: 'true' })
			: document.createElement(tag);
	scratch.appendChild(el);
	el.focus();
	return el;
}

describe('the palette keys and what they refuse', () => {
	it('POSITIVE CONTROL: Ctrl+K from the page opens the search, and preventDefault is called', () => {
		expect(dialogs()).toBe(0);
		const event = press(document.body, { key: 'k', ctrlKey: true });
		expect(dialogs()).toBe(1);
		expect(document.querySelector('[data-testid="command-palette"]')!.getAttribute('data-mode')).toBe('search');
		expect(event.defaultPrevented).toBe(true);
	});

	it('Cmd+K from a button opens it too (a button is not somewhere a person types)', () => {
		const button = document.createElement('button');
		scratch.appendChild(button);
		press(button, { key: 'k', metaKey: true });
		expect(dialogs()).toBe(1);
	});

	it.each(['input', 'textarea', 'select', 'editor'] as const)(
		'Ctrl+K inside a %s does nothing and leaves the key to the field',
		(tag) => {
			const el = field(tag);
			const event = press(el, { key: 'k', ctrlKey: true });
			expect(dialogs()).toBe(0);
			expect(event.defaultPrevented).toBe(false);
		}
	);

	it('? opens the shortcut legend from the page, and is a character inside a field', () => {
		const input = field('input');
		const typed = press(input, { key: '?', shiftKey: true });
		expect(dialogs()).toBe(0);
		expect(typed.defaultPrevented).toBe(false);
		const opened = press(document.body, { key: '?', shiftKey: true });
		expect(dialogs()).toBe(1);
		expect(document.querySelector('[data-testid="command-palette"]')!.getAttribute('data-mode')).toBe('keys');
		expect(opened.defaultPrevented).toBe(true);
		expect(document.querySelector('[data-testid="shortcut-legend"]')).not.toBeNull();
	});

	it('/ is left alone when no class search is mounted, even from the page', () => {
		const event = press(document.body, { key: '/' });
		expect(event.defaultPrevented).toBe(false);
		expect(dialogs()).toBe(0);
	});

	it('nothing opens while another dialog is open', () => {
		const other = document.createElement('dialog');
		scratch.appendChild(other);
		other.showModal();
		press(document.body, { key: 'k', ctrlKey: true });
		expect(dialogs()).toBe(0);
		other.close();
		press(document.body, { key: 'k', ctrlKey: true });
		expect(dialogs()).toBe(1);
	});

	it('Escape closes it and gives focus back to whatever opened it', () => {
		const trigger = document.createElement('button');
		trigger.textContent = 'Search';
		scratch.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);
		press(trigger, { key: 'k', ctrlKey: true });
		expect(dialogs()).toBe(1);
		const input = document.querySelector<HTMLInputElement>('[data-testid="palette-input"]')!;
		expect(input).not.toBeNull();
		press(input, { key: 'Escape' });
		expect(dialogs()).toBe(0);
		expect(document.activeElement).toBe(trigger);
	});

	it('a key pressed while the palette is open never reopens or stacks it', () => {
		press(document.body, { key: 'k', ctrlKey: true });
		press(document.body, { key: 'k', ctrlKey: true });
		press(document.body, { key: '?', shiftKey: true });
		expect(dialogs()).toBe(1);
	});
});
