// tests/dom/tournament-tv-exit-mount.test.ts
//
// THE TWO CLAIMS THAT ONLY A REAL EVENT CAN SETTLE.
//
// `tests/tournament-tv-fullscreen.test.ts` proves the predicate is correct and
// that `TvStage` names it. Neither is the guarantee. The guarantee is that a
// keydown ARRIVING FROM A TEXTAREA leaves the character alone, and that the
// exit control renders and runs `exitFullscreen` when it is pressed -- and
// both live in a handler bound to `window` by a `svelte:window` that no source
// sweep and no `svelte/server` render can invoke.
//
// WHAT IS ASSERTED: `defaultPrevented` after a real dispatch, which node
// rendered, and which browser call a real click made. NOT geometry, NOT
// contrast, NOT a tap target -- happy-dom has no layout engine, so a box read
// here is zero and passes vacuously (`tests/dom/README.md`). The geometry
// claim -- that this control can never cover the live pair -- is measured in
// Chromium by `tools/browser-verify/routes/tournaments-view-tv-fullscreen-exit.mjs`.
//
// FULLSCREEN IS STUBBED THE WAY THE COMPONENT FEATURE-DETECTS IT. Measured in
// this environment: `document.fullscreenElement` is `undefined` and
// `Element.requestFullscreen` does not exist, which is also exactly what iOS
// Safari gives every viewer. `fullscreenActive` reads the document property,
// so installing one and firing `fullscreenchange` is the same path a real
// browser takes rather than a back door into component state.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import TvStage from '$lib/tournaments/TvStage.svelte';
import { mountInto, type Mounted } from './mount';

const Stage = TvStage as unknown as Component<Record<string, unknown>>;

const TOURNAMENT = {
	id: 't-1',
	name: 'IDEA100 Hook Design Competition',
	status: 'in_progress',
	champion_entry_id: null
};

/** Two ready matches, so the `between` view renders its up-next block: the
 *  state the projector spends most of an event in, and the one the exit
 *  control has to coexist with. */
const ENTRIES = [
	{ id: 'e1', display_name: 'Vortex', tagline: null },
	{ id: 'e2', display_name: 'Ratchet', tagline: null }
];
const MATCHES = [
	{
		id: 'm1',
		bracket: 'winners',
		round: 1,
		slot: 1,
		status: 'ready',
		entry_a_id: 'e1',
		entry_b_id: 'e2',
		winner_id: null,
		loser_id: null,
		loser_to_match_id: null,
		completed_at: null,
		started_at: null,
		best_of: 1,
		forfeit_reason: null
	}
];

let restore: Array<() => void> = [];
let mounted: Mounted | null = null;

/** Install a fullscreen element on the document and tell the page, the way a
 *  browser does. Returns nothing: every reader goes through the document. */
function setFullscreen(on: boolean) {
	Object.defineProperty(document, 'fullscreenElement', {
		configurable: true,
		get: () => (on ? document.documentElement : null)
	});
	document.dispatchEvent(new Event('fullscreenchange'));
}

beforeEach(() => {
	setFullscreen(false);
});

afterEach(async () => {
	for (const r of restore.splice(0)) r();
	await mounted?.stop();
	mounted = null;
});

function mountStage(props: Record<string, unknown> = {}) {
	mounted = mountInto(Stage, {
		tournament: TOURNAMENT,
		entries: ENTRIES,
		styles: {},
		matches: MATCHES,
		games: [],
		shareUrl: 'https://ideabosco.com/tournaments/t-1',
		showHint: false,
		...props
	});
	return mounted;
}

function keydown(key: string, target: EventTarget, extra: Partial<KeyboardEvent> = {}) {
	const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
	target.dispatchEvent(e);
	return e;
}

describe('the swallowed keystroke', () => {
	it('leaves `f` alone when it comes from a textarea, and still takes a bare one', () => {
		const m = mountStage();

		// THE POSITIVE CONTROL COMES FIRST. If the handler were simply not
		// bound -- a `svelte:window` typo, a component that failed to mount --
		// every "not prevented" assertion below would pass for the wrong
		// reason. This proves the key is genuinely being claimed on this page.
		const bare = keydown('f', document.body);
		expect(bare.defaultPrevented).toBe(true);

		const area = document.createElement('textarea');
		document.body.appendChild(area);
		restore.push(() => area.remove());
		const typed = keydown('f', area);
		expect(typed.defaultPrevented).toBe(false);

		const input = document.createElement('input');
		document.body.appendChild(input);
		restore.push(() => input.remove());
		expect(keydown('F', input).defaultPrevented).toBe(false);

		void m;
	});

	it('leaves Ctrl+F to the browser’s own find', () => {
		mountStage();
		expect(keydown('f', document.body, { ctrlKey: true } as Partial<KeyboardEvent>).defaultPrevented).toBe(
			false
		);
		expect(keydown('f', document.body, { metaKey: true } as Partial<KeyboardEvent>).defaultPrevented).toBe(
			false
		);
	});

	it('claims no key but f, so nothing else on the page loses one', () => {
		mountStage();
		for (const k of ['g', 'a', 'Enter', 'Escape', ' ']) {
			expect(keydown(k, document.body).defaultPrevented).toBe(false);
		}
	});
});

describe('the way back out', () => {
	it('renders no exit control when nothing is fullscreen', () => {
		const m = mountStage();
		expect(m.all('.tv-exit')).toHaveLength(0);
	});

	it('renders one, carrying a word, once the document goes fullscreen', () => {
		const m = mountStage();
		setFullscreen(true);
		m.flush();

		const control = m.all<HTMLButtonElement>('.tv-exit');
		expect(control).toHaveLength(1);
		expect(control[0].tagName).toBe('BUTTON');
		// A GLYPH IS NOT A CONTROL. A person who has never seen this page has
		// to be able to read what it does.
		expect(control[0].textContent).toContain('Exit full screen');
		// And it names the key that does the same thing, so the next person
		// needs the mouse once.
		expect(control[0].textContent).toContain('Esc');
	});

	it('calls exitFullscreen when it is pressed', () => {
		const m = mountStage();
		setFullscreen(true);
		m.flush();

		const calls: string[] = [];
		const doc = document as unknown as Record<string, unknown>;
		const had = Object.prototype.hasOwnProperty.call(doc, 'exitFullscreen');
		const prev = doc.exitFullscreen;
		doc.exitFullscreen = () => {
			calls.push('exit');
			return Promise.resolve();
		};
		restore.push(() => {
			if (had) doc.exitFullscreen = prev;
			else Reflect.deleteProperty(doc, 'exitFullscreen');
		});

		m.one<HTMLButtonElement>('.tv-exit').click();
		m.flush();
		expect(calls).toEqual(['exit']);
	});

	it('goes away again when the document leaves fullscreen by any route', () => {
		// Escape, F and the control are three ways out and the component reads
		// only `fullscreenchange`, so all three land here.
		const m = mountStage();
		setFullscreen(true);
		m.flush();
		expect(m.all('.tv-exit')).toHaveLength(1);
		setFullscreen(false);
		m.flush();
		expect(m.all('.tv-exit')).toHaveLength(0);
	});

	it('stands the "press F" hint down while somebody is already in', () => {
		const m = mountStage({ showHint: true });
		expect(m.all('.hint')).toHaveLength(1);
		setFullscreen(true);
		m.flush();
		expect(m.all('.hint')).toHaveLength(0);
		expect(m.all('.tv-exit')).toHaveLength(1);
	});
});
