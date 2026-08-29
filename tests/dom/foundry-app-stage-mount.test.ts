// tests/dom/foundry-app-stage-mount.test.ts
//
// THE CLAIM SSR CANNOT EXPRESS AT ALL: A RUNNING APP SURVIVES FULL SCREEN.
//
// `AppStage`'s header states it as a design constraint -- "the <iframe> is
// never unmounted and its src is never rewritten, so the running app keeps its
// state across the transition. Anything that swapped the frame would restart
// every app anybody maximised" -- and `AppFrame`'s `fill` prop repeats it. Both
// sentences describe DOM IDENTITY ACROSS A STATE CHANGE, which is not a
// property of any one render: it is a property of the relationship between two
// renders, and `svelte/server`'s `render()` produces one string per call with
// no node in it to be identical to anything.
//
// So `tests/foundry-gallery.test.ts` does not assert it, and nothing else did
// either. The regression is silent in the worst way this repo cares about: a
// remount renders a PIXEL-IDENTICAL full-screen app. What is lost is the
// student's half-finished game, their timer and their audio, at the moment they
// asked for more room -- and the person who notices is a student mid-lesson,
// who reads it as the app crashing.
//
// WHAT IS ASSERTED HERE, AND WHAT IS NOT. Node identity, attributes, classes,
// element counts and which handler a real click ran. NOT geometry, NOT contrast
// and NOT a tap target: happy-dom has no layout engine, so those read zero and
// pass vacuously (see `tests/dom/README.md`). Nothing here reads a box or a
// colour. That full screen actually FILLS a viewport is `verify:browser`'s
// claim and stays there; this file's claim is that the same app is still
// running inside it.
//
// THE IDENTITY INSTRUMENT HAS ITS OWN POSITIVE CONTROL, which matters more
// here than usual. `expect(after).toBe(before)` on a node passes if the
// component is correct AND passes if the test never actually re-rendered
// anything. So one test presses Stop and Launch again and asserts the node
// comes back DIFFERENT -- proving `toBe` on these nodes can tell a survivor
// from a replacement, on this component, through this instrument.
//
// FULL SCREEN IN happy-dom IS THE OVERLAY PATH, WHICH IS THE FLOOR AND NOT A
// LIMITATION. Measured: `Element.requestFullscreen` is `undefined` and
// `document.fullscreenElement` is `undefined` here. `enterFull` sets the class
// FIRST and asks the API SECOND precisely so a browser that refuses still ends
// up in the same layout, so the environment reproduces the exact configuration
// iOS Safari gives every viewer. The NATIVE path is driven separately by
// installing a `requestFullscreen` on the stage element -- the same hook the
// component itself feature-detects with (`typeof el.requestFullscreen !==
// 'function'`), so the branch is entered the way a real browser enters it.

import { beforeAll, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';

import AppStage from '$lib/foundry/AppStage.svelte';
import { foundryBundleUrl } from '$lib/foundry/bundle-url';
import { mountInto, type Mounted } from './mount';
import { reactiveProps } from './reactive-props.svelte';

const Stage = AppStage as unknown as Component<Record<string, unknown>>;

/**
 * THE FRAME MUST NOT ACTUALLY GO AND FETCH THE BUNDLE.
 *
 * happy-dom implements <iframe> navigation for real: mounting a frame whose
 * `src` is an absolute https URL makes it fetch that URL over the network.
 * Measured before this was here -- every mount in this file opened a request to
 * `apps.ideabosco.com`, and the teardown aborted it, printing a page of
 * `AsyncTaskManager` and `NetworkError` traces per run.
 *
 * That is worth refusing on its own terms rather than for tidiness. A suite
 * that reaches a production host is one whose result depends on that host being
 * up, and NOTHING in this file is a claim about what a bundle serves: every
 * assertion here is about the element -- its identity, its attributes, and
 * whether it is in the document -- all of which hold for a frame that loaded
 * nothing.
 *
 * A FETCH INTERCEPTOR RATHER THAN `disableIframePageLoading`, WHICH WAS THE
 * OBVIOUS SETTING AND IS THE WRONG ONE. Measured: disabling iframe page loading
 * does stop the network, but happy-dom then reports every blocked navigation to
 * the page console -- 12 `NotSupportedError` traces for the tests below -- and
 * its `handleDisabledFileLoadingAsSuccess` setting is not read on the iframe
 * path (only by script and link elements). The interceptor answers the frame
 * from memory instead: no socket, no console output, and the element behaves
 * the way the component expects.
 */
beforeAll(() => {
	const w = window as unknown as {
		happyDOM: { settings: { fetch: { interceptor: unknown } } };
	};
	w.happyDOM.settings.fetch.interceptor = {
		beforeAsyncRequest: async () =>
			new Response('<!doctype html><title>bundle fixture</title>', {
				headers: { 'content-type': 'text/html' }
			})
	};
});

/* ------------------------------------------------------------- fixtures */

const APPS = 'https://apps.ideabosco.com';
const APP_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
/** A second subject, for the change-of-subject teardown. */
const OTHER_VERSION = '33333333-3333-4333-8333-333333333333';

/**
 * THE EXPECTED SRC COMES FROM THE SHIPPED BUILDER, not from a literal retyped
 * here -- but it is built from the fixture ids ABOVE rather than read back off
 * the element, so it is still an independent expectation. The one thing this
 * file must not do is ask the component what it rendered and then assert it
 * rendered that.
 */
const SRC = foundryBundleUrl(APPS, APP_ID, VERSION_ID)!;

function stageOf(m: Mounted): HTMLElement {
	return m.one('.fdy-stage');
}

function frames(m: Mounted): HTMLIFrameElement[] {
	return m.all<HTMLIFrameElement>('iframe');
}

/** The single frame on screen, or a failure naming how many there really were. */
function frame(m: Mounted): HTMLIFrameElement {
	const all = frames(m);
	expect(all).toHaveLength(1);
	return all[0];
}

/** A real click, the way a person produces one. */
function click(el: Element): void {
	el.dispatchEvent(new Event('click', { bubbles: true }));
}

/** The bar button whose visible word is exactly this. Words, never glyphs. */
function button(m: Mounted, word: string): HTMLButtonElement {
	const hit = m
		.all<HTMLButtonElement>('button')
		.filter((b) => (b.textContent ?? '').trim() === word);
	expect(hit, `expected exactly one button reading ${JSON.stringify(word)}`).toHaveLength(1);
	return hit[0];
}

/**
 * Mount the real stage on a REACTIVE props object, and hand back both -- so a
 * test can change what the stage is pointed at the way its two real parents do,
 * without remounting it. See `reactive-props.svelte.ts`.
 */
function mountStage(over: Record<string, unknown> = {}): {
	m: Mounted;
	props: Record<string, unknown>;
} {
	const props = reactiveProps<Record<string, unknown>>({
		appId: APP_ID,
		versionId: VERSION_ID,
		title: 'Tide Clock',
		appsOrigin: APPS,
		...over
	});
	return { m: mountInto(Stage, props), props };
}

/** Mount, press Launch, and hand back the stage with one frame running. */
function launched(over: Record<string, unknown> = {}): {
	m: Mounted;
	props: Record<string, unknown>;
} {
	const s = mountStage(over);
	click(button(s.m, 'Launch app'));
	s.m.flush();
	return s;
}

/* ------------------------------------------------------- the lifecycle */

describe('nothing runs until somebody launches it', () => {
	it('frames no bundle on mount, and frames exactly one on the press', async () => {
		const { m } = mountStage();
		try {
			// A gallery that framed on mount would start every app in the list.
			expect(frames(m)).toHaveLength(0);
			expect(button(m, 'Launch app')).toBeTruthy();

			click(button(m, 'Launch app'));
			m.flush();

			// POSITIVE CONTROL for every absence in this file: this component
			// really does emit an <iframe>, and it points at the built URL.
			expect(frames(m)).toHaveLength(1);
			expect(frame(m).getAttribute('src')).toBe(SRC);
		} finally {
			await m.stop();
		}
	});

	it('renders no launch control at all when there is nothing to point at', async () => {
		// ABSENCE IS THE MECHANISM: no apps origin, no URL, no button -- rather
		// than a button that opens about:blank.
		const { m } = mountStage({ appsOrigin: '' });
		try {
			expect(m.all('button')).toHaveLength(0);
			expect(frames(m)).toHaveLength(0);
			expect(m.target.textContent).toContain('This app cannot be started from here');
		} finally {
			await m.stop();
		}
	});
});

/* ------------------------- THE HEADLINE: the frame survives full screen */

describe('full screen is a class on the stage, never a second frame', () => {
	it('keeps the SAME iframe node, with the SAME src, across enter and exit', async () => {
		const { m } = launched();
		try {
			const before = frame(m);
			const srcBefore = before.getAttribute('src');
			expect(srcBefore).toBe(SRC);
			// The frame is sized by an inline height while it is in the pane.
			expect(before.getAttribute('style')).toContain('height:');

			click(button(m, 'Full screen'));
			m.flush();

			// (a) THE STATE REALLY CHANGED. Without this the identity assertion
			// below would be satisfied by a press that did nothing at all.
			const stage = stageOf(m);
			expect(stage.classList.contains('is-full')).toBe(true);
			expect(stage.getAttribute('data-full')).toBe('overlay');
			expect(button(m, 'Exit full screen')).toBeTruthy();

			// (b) AND THE FRAME IS THE SAME OBJECT. Not "an iframe with the same
			// attributes" -- the same node. A remount is what loses the running
			// app, and only identity can tell the two apart.
			const during = frame(m);
			expect(during).toBe(before);
			expect(during.isConnected).toBe(true);
			expect(during.getAttribute('src')).toBe(srcBefore);

			// (c) `fill` reached the frame: the inline height is dropped so the
			// box can grow. An ATTRIBUTE read, not a measurement -- this file
			// makes no claim about how tall anything actually is.
			expect(during.getAttribute('style') ?? '').not.toContain('height:');
			expect(m.one('.fdy-frame-wrap').classList.contains('is-fill')).toBe(true);

			click(button(m, 'Exit full screen'));
			m.flush();

			// AND BACK. Coming out is the same transition in reverse, and it is
			// the one a viewer makes with the app still running.
			const after = frame(m);
			expect(after).toBe(before);
			expect(after.getAttribute('src')).toBe(srcBefore);
			expect(stageOf(m).classList.contains('is-full')).toBe(false);
			expect(stageOf(m).getAttribute('data-full')).toBe('no');
			expect(after.getAttribute('style')).toContain('height:');
		} finally {
			await m.stop();
		}
	});

	it('THE POSITIVE CONTROL: a stop and a relaunch really do produce a different node', async () => {
		// The whole file rests on `toBe` distinguishing a surviving node from a
		// replacement. This is the case where a replacement is CORRECT, so it is
		// what proves the instrument can see one.
		const { m } = launched();
		try {
			const first = frame(m);

			click(button(m, 'Stop app'));
			m.flush();
			expect(frames(m)).toHaveLength(0);

			click(button(m, 'Launch app'));
			m.flush();
			const second = frame(m);

			expect(second).not.toBe(first);
			// Same URL, different node -- which is exactly why the identity
			// assertion above cannot be replaced by comparing `src` strings.
			expect(second.getAttribute('src')).toBe(first.getAttribute('src'));
			expect(first.isConnected).toBe(false);
		} finally {
			await m.stop();
		}
	});

	it('takes the native path when the engine offers one, and still keeps the node', async () => {
		const { m } = launched();
		try {
			const before = frame(m);
			const stage = stageOf(m);
			// The component feature-detects with `typeof el.requestFullscreen !==
			// 'function'`, so installing one is how a browser that HAS the API
			// presents itself. happy-dom has none: measured `undefined`.
			expect(
				typeof (stage as unknown as { requestFullscreen?: unknown }).requestFullscreen
			).toBe('undefined');
			let asked = 0;
			(stage as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen =
				() => {
					asked += 1;
					return Promise.resolve();
				};

			click(button(m, 'Full screen'));
			await m.settle();

			expect(asked).toBe(1);
			expect(stageOf(m).getAttribute('data-full')).toBe('native');
			// The class is the SAME class on both paths: one layout, two escapes.
			expect(stageOf(m).classList.contains('is-full')).toBe(true);
			expect(frame(m)).toBe(before);
			expect(frame(m).getAttribute('src')).toBe(SRC);
		} finally {
			await m.stop();
		}
	});

	it('says which Escape this viewer actually has, and only while full', async () => {
		const { m } = launched();
		try {
			expect(m.all('[data-testid="fullscreen-hint"]')).toHaveLength(0);

			click(button(m, 'Full screen'));
			m.flush();
			const overlayHint = m.one('[data-testid="fullscreen-hint"]').textContent ?? '';
			// The overlay's Escape is a window keydown a focused cross-origin
			// frame never delivers, so the sentence promises the BUTTON.
			expect(overlayHint).toContain('Use Exit full screen to come back');
			expect(overlayHint).toContain('Escape works when the app does not have focus');

			click(button(m, 'Exit full screen'));
			m.flush();
			expect(m.all('[data-testid="fullscreen-hint"]')).toHaveLength(0);

			// AND THE OTHER SENTENCE, on the native path, where the browser really
			// does handle the key above the document.
			const stage = stageOf(m);
			(stage as unknown as { requestFullscreen: () => Promise<void> }).requestFullscreen = () =>
				Promise.resolve();
			click(button(m, 'Full screen'));
			await m.settle();
			const nativeHint = m.one('[data-testid="fullscreen-hint"]').textContent ?? '';
			expect(nativeHint).toContain('Press Escape');
			expect(nativeHint).not.toBe(overlayHint);
		} finally {
			await m.stop();
		}
	});
});

/* --------------------------------------------- THE STOP CONTROL TEARS DOWN */

describe('stop app unmounts the frame', () => {
	it('removes the element rather than blanking or hiding it', async () => {
		const { m } = launched();
		try {
			const running = frame(m);
			expect(running.isConnected).toBe(true);

			click(button(m, 'Stop app'));
			m.flush();

			// DESTROYED, not navigated to about:blank and not hidden: removing the
			// element is what kills a wedged bundle's browsing context.
			expect(frames(m)).toHaveLength(0);
			expect(running.isConnected).toBe(false);
			// There is no leftover frame anywhere in the document either, which a
			// query scoped to the mount target could otherwise miss.
			expect(m.target.querySelector('iframe')).toBeNull();
			// And the surface is back to offering a launch.
			expect(button(m, 'Launch app')).toBeTruthy();
		} finally {
			await m.stop();
		}
	});

	it('leaves full screen on the way out, so no empty overlay is left behind', async () => {
		// A stop taken while full would otherwise hand the viewer a black
		// viewport with a Launch button in the corner of it.
		const { m } = launched();
		try {
			click(button(m, 'Full screen'));
			m.flush();
			expect(stageOf(m).classList.contains('is-full')).toBe(true);

			click(button(m, 'Stop app'));
			m.flush();

			expect(stageOf(m).classList.contains('is-full')).toBe(false);
			expect(stageOf(m).getAttribute('data-full')).toBe('no');
			expect(frames(m)).toHaveLength(0);
		} finally {
			await m.stop();
		}
	});

	it('is still on screen while full, because an app can wedge in full screen too', async () => {
		const { m } = launched();
		try {
			click(button(m, 'Full screen'));
			m.flush();
			// Both controls, with words on them, in the state where the viewport
			// holds nothing else to find them by.
			expect(button(m, 'Stop app')).toBeTruthy();
			expect(button(m, 'Exit full screen')).toBeTruthy();
		} finally {
			await m.stop();
		}
	});
});

/* ------------------------------------------ a change of subject is an ending */

describe('changing what the stage is pointed at stops what is running', () => {
	it('tears the frame down and leaves full screen when the version moves', async () => {
		const { m, props } = launched();
		try {
			click(button(m, 'Full screen'));
			m.flush();
			const before = frame(m);
			expect(stageOf(m).classList.contains('is-full')).toBe(true);

			// The gallery and the review queue keep this component mounted and
			// swap what it points at, so this is the ordinary path rather than an
			// edge case.
			props.versionId = OTHER_VERSION;
			m.flush();

			expect(frames(m)).toHaveLength(0);
			expect(before.isConnected).toBe(false);
			expect(stageOf(m).classList.contains('is-full')).toBe(false);
			// The stage now NAMES the new version, before anything is running.
			expect(stageOf(m).getAttribute('data-version')).toBe(OTHER_VERSION);

			// POSITIVE CONTROL: the new subject is launchable, so the teardown
			// above left a working surface rather than a dead one.
			click(button(m, 'Launch app'));
			m.flush();
			expect(frame(m).getAttribute('src')).toBe(
				foundryBundleUrl(APPS, APP_ID, OTHER_VERSION)!
			);
		} finally {
			await m.stop();
		}
	});
});
