// tests/tournament-tv-fullscreen.test.ts
//
// TWO GUARANTEES THAT FAIL SILENTLY, WHICH IS THE WHOLE REASON EITHER IS HERE.
//
// 1. THE SWALLOWED KEYSTROKE. `TvStage` binds a `svelte:window` keydown for
//    the projector's F key. `SiteFeedback` is mounted in the ROOT LAYOUT and
//    `/tournaments/[id]/tv` carries no exclusion, so the report box is on this
//    page like every other -- and the handler used to call `preventDefault()`
//    on `f` unconditionally, from a window listener, which ate the character
//    out of whatever anybody was typing. Two window listeners sit on the SAME
//    node here, and `FeedbackBox`'s own `stopPropagation()` cannot stop a
//    sibling listener on that node (only `stopImmediatePropagation()` would),
//    so nothing downstream could have saved it.
//
//    It is not hypothetical and it is not reconstructed. Mr. Pina typed the
//    report INTO that box, ON this screen, on 2026-09-06:
//        "ullscreen ormatting is poor. missing button to go back to last page"
//    Both dropped letters are `f`. Reproduced in Chromium against the real
//    component: typing "Fullscreen formatting is poor" produced exactly
//    "ullscreen ormatting is poor".
//
//    The regression is silent because nothing on screen reports a dropped
//    character. The page renders, the key does its job, and the only symptom
//    is somebody's sentence quietly missing a letter -- which reads as a typo.
//
// 2. THE EXIT CONTROL EXISTS AT ALL. The Fullscreen API's exit is Escape and
//    browsers deliberately paint no chrome for it, so a projector page that
//    offers fullscreen with no visible way back has stranded whoever is
//    driving it in front of a room. A control that quietly stops rendering
//    breaks nothing a type check or a render can see: the page still paints.
//
// WHAT THIS FILE DOES NOT ASSERT: geometry. That the control never covers the
// live pair is a LAYOUT claim, so it is measured in a real browser by
// `tools/browser-verify/routes/tournaments-view-tv-fullscreen-exit.mjs`, which
// carries its own positive control. Nothing here reads a box.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
	EXIT_CONTROL_IDLE_MS,
	fullscreenActive,
	keyHasModifier,
	keyTargetIsTextEntry,
	toggleFullscreen
} from '../src/lib/tournaments/fullscreen';

const SOURCE = readFileSync(
	fileURLToPath(new URL('../src/lib/tournaments/TvStage.svelte', import.meta.url)),
	'utf-8'
);

const el = (tagName: string, extra: Record<string, unknown> = {}) =>
	({ tagName, ...extra }) as unknown as EventTarget;

describe('keyTargetIsTextEntry -- the one place "is somebody typing" is asked', () => {
	// THE POSITIVE HALF FIRST. Without these the predicate could answer false
	// for everything and every absence assertion below would pass vacuously.
	it.each([['INPUT'], ['TEXTAREA'], ['SELECT'], ['input'], ['textarea']])(
		'claims <%s>',
		(tag) => {
			expect(keyTargetIsTextEntry(el(tag))).toBe(true);
		}
	);

	it('claims a contenteditable host, which is the shape rich text arrives in', () => {
		expect(keyTargetIsTextEntry(el('DIV', { isContentEditable: true }))).toBe(true);
	});

	it('leaves the page itself alone, so the projector keeps its key', () => {
		expect(keyTargetIsTextEntry(el('DIV'))).toBe(false);
		expect(keyTargetIsTextEntry(el('BODY'))).toBe(false);
		expect(keyTargetIsTextEntry(el('BUTTON'))).toBe(false);
		expect(keyTargetIsTextEntry(el('DIV', { isContentEditable: false }))).toBe(false);
	});

	it('answers false rather than throwing for a target that is not an element', () => {
		// A handler that throws on one synthetic event is a handler that stops
		// working for every real key after it.
		expect(keyTargetIsTextEntry(null)).toBe(false);
		expect(keyTargetIsTextEntry({} as EventTarget)).toBe(false);
		expect(keyTargetIsTextEntry('not an element' as unknown as EventTarget)).toBe(false);
		expect(keyTargetIsTextEntry(el('DIV', { tagName: undefined }))).toBe(false);
	});
});

describe('keyHasModifier -- Ctrl+F is the browser’s find, not ours', () => {
	const base = { ctrlKey: false, metaKey: false, altKey: false };
	it('is false for a bare key', () => expect(keyHasModifier(base)).toBe(false));
	it.each(['ctrlKey', 'metaKey', 'altKey'] as const)('is true with %s', (k) => {
		expect(keyHasModifier({ ...base, [k]: true })).toBe(true);
	});
});

describe('fullscreenActive', () => {
	it('is false with no document at all', () => {
		expect(fullscreenActive(null)).toBe(false);
		expect(fullscreenActive(undefined)).toBe(false);
	});
	it('reads the standard property and the webkit one', () => {
		expect(fullscreenActive({ fullscreenElement: null } as unknown as Document)).toBe(false);
		expect(fullscreenActive({ fullscreenElement: {} } as unknown as Document)).toBe(true);
		expect(
			fullscreenActive({ fullscreenElement: null, webkitFullscreenElement: {} } as unknown as Document)
		).toBe(true);
	});
});

describe('toggleFullscreen', () => {
	it('requests when nothing is fullscreen, and exits when something is', () => {
		const calls: string[] = [];
		const target = { requestFullscreen: () => (calls.push('request'), Promise.resolve()) };
		const doc = {
			fullscreenElement: null,
			exitFullscreen: () => (calls.push('exit'), Promise.resolve())
		} as unknown as Document;
		toggleFullscreen(target as unknown as Element, doc);
		expect(calls).toEqual(['request']);

		const docFull = {
			fullscreenElement: {},
			exitFullscreen: () => (calls.push('exit'), Promise.resolve())
		} as unknown as Document;
		toggleFullscreen(target as unknown as Element, docFull);
		expect(calls).toEqual(['request', 'exit']);
	});

	it('swallows a rejection rather than letting it reach handleError', async () => {
		// Every engine refuses without a gesture and iOS has no element
		// fullscreen, so a rejection is an ordinary outcome. An unhandled one
		// on a screen nobody is standing at mints a correlation id and logs a
		// 500-shaped line for a keypress that did nothing.
		const target = { requestFullscreen: () => Promise.reject(new Error('no gesture')) };
		const doc = { fullscreenElement: null } as unknown as Document;
		expect(() => toggleFullscreen(target as unknown as Element, doc)).not.toThrow();
		await new Promise((r) => setTimeout(r, 5));
	});

	it('does nothing at all where the API is absent', () => {
		expect(() => toggleFullscreen({} as Element, { fullscreenElement: null } as Document)).not.toThrow();
		expect(() => toggleFullscreen(null, null)).not.toThrow();
	});

	it('states the idle delay once, as a number a person would recognise', () => {
		expect(EXIT_CONTROL_IDLE_MS).toBeGreaterThanOrEqual(2000);
		expect(EXIT_CONTROL_IDLE_MS).toBeLessThanOrEqual(10_000);
	});
});

describe('TvStage source contract', () => {
	// A SOURCE SWEEP, DELIBERATELY, and its limit is stated rather than hidden:
	// it proves the guard is WIRED, never that it fires. That it fires is the
	// mount test in `tests/dom/tournament-tv-exit-mount.test.ts`, and that a
	// real Chromium honours it is in this bundle's history entry.
	it('asks the shared predicate before it touches a key', () => {
		expect(SOURCE).toContain('keyTargetIsTextEntry(e.target)');
	});

	it('never reads document.fullscreenElement directly -- one implementation', () => {
		// A second reading of the fullscreen state is the one that stops
		// agreeing with the control it is supposed to be driving.
		expect(SOURCE).not.toMatch(/document\.fullscreenElement/);
		expect(SOURCE).not.toMatch(/document\.exitFullscreen/);
		expect(SOURCE).toContain('fullscreenActive(document)');
	});

	it('renders an exit control, with a WORD in it, gated on being fullscreen', () => {
		expect(SOURCE).toContain('class="tv-exit"');
		expect(SOURCE).toContain('Exit full screen');
		expect(SOURCE).toMatch(/\{#if isFull\}/);
	});

	it('overrides the global 880px `main` cap, because this element is a wall', () => {
		// `src/app.css` caps every `main` at 880px, which is right for a
		// reading surface and wrong for a projector: it rendered a 1920-wide
		// stage in an 880px centred column and laid the up-next names out at
		// zero pixels wide. The override is inside `.tv-body`'s own rule.
		const body = SOURCE.slice(SOURCE.indexOf('.tv-body {'));
		const rule = body.slice(0, body.indexOf('\n\t}'));
		expect(rule).toMatch(/max-width:\s*none/);
		expect(rule).toMatch(/margin:\s*0/);
	});
});
