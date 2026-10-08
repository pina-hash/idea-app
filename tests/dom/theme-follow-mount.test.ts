// tests/dom/theme-follow-mount.test.ts
//
// THE THEME FOLLOWS ANOTHER WINDOW'S CHOICE (bug 145c0352).
//
// The classroom projector is a second window with no theme control of its own,
// and a deploy never reloads it (PROJECTOR_ROUTES), so before this fix a
// teacher who switched to Space White on the control view kept a dark wall.
// The REAL `ThemeRoot` is mounted here and a `storage` event is dispatched on
// the window, which is what a write in any other window of the origin fires.
// What is asserted is structure and effects only (the attribute on <html>),
// which happy-dom runs for real; no box and no colour is read.
//
// Both directions: a signed-in page on an in-scope path follows the theme on
// and off; an unrelated key moves nothing; a signed-out page ADOPTS the value
// (the state moves) but paints nothing (the session gate); and after teardown
// the listener is gone. The real two-window drive, in Chromium with two pages
// of one context, is `tools/browser-verify/_theme-follow.mjs`.
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import type { Component } from 'svelte';
import { page } from '$app/state';
import ThemeRoot from '../../src/lib/design-system/themes/ThemeRoot.svelte';
import { siteTheme } from '../../src/lib/theme.svelte';
import { SITE_THEME_KEY } from '../../src/lib/theme';
import { mountInto, type Mounted } from './mount';

type PageStub = { data: Record<string, unknown>; url?: URL };
const stub = page as unknown as PageStub;

let mounted: Mounted | null = null;
const previous = { data: stub.data, url: stub.url };

afterEach(async () => {
	await mounted?.stop();
	mounted = null;
	stub.data = previous.data;
	stub.url = previous.url;
	document.documentElement.removeAttribute('data-theme');
});

function mountAs(signedIn: boolean, path = '/classroom/s-1/live/projector'): Mounted {
	stub.data = signedIn ? { claims: { sub: 'teacher-1' } } : {};
	stub.url = new URL(`http://localhost${path}`);
	mounted = mountInto(ThemeRoot as unknown as Component<Record<string, unknown>>, {});
	return mounted;
}

/** What another window's write delivers here. */
function otherWindowWrites(key: string | null, newValue: string | null) {
	window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
	flushSync();
}

const attr = () => document.documentElement.getAttribute('data-theme');

describe("another window's theme choice", () => {
	it('a signed-in projector follows Space White on, ignores another key, and follows it off', () => {
		const m = mountAs(true);
		m.flush();
		expect(attr()).toBeNull();

		otherWindowWrites(SITE_THEME_KEY, 'space-white');
		expect(siteTheme()).toBe('space-white');
		expect(attr()).toBe('space-white');

		// NEGATIVE CONTROL: the projector's own frame key fires the same event.
		otherWindowWrites('idea_live_projector:harness-teacher:s-live', '{"v":1}');
		expect(attr()).toBe('space-white');

		// Turning the theme off is a REMOVAL in the other window: newValue null.
		otherWindowWrites(SITE_THEME_KEY, null);
		expect(siteTheme()).toBe('idea');
		expect(attr()).toBeNull();
	});

	it('a page outside the scope adopts the value and paints nothing (Space White is scoped)', () => {
		mountAs(true, '/gauntlet');
		otherWindowWrites(SITE_THEME_KEY, 'space-white');
		expect(siteTheme()).toBe('space-white');
		expect(attr()).toBeNull();
		otherWindowWrites(SITE_THEME_KEY, null);
		expect(siteTheme()).toBe('idea');
	});

	it('a signed-out page adopts the value but the session gate keeps the attribute off', () => {
		mountAs(false);
		otherWindowWrites(SITE_THEME_KEY, 'space-white');
		expect(siteTheme()).toBe('space-white');
		expect(attr()).toBeNull();
		otherWindowWrites(null, null);
		expect(siteTheme()).toBe('idea');
	});

	it('adopting writes nothing to this window: the other window owns the store', () => {
		localStorage.removeItem(SITE_THEME_KEY);
		mountAs(true);
		otherWindowWrites(SITE_THEME_KEY, 'space-white');
		expect(attr()).toBe('space-white');
		// The event alone moved the page; this window's store was never written.
		expect(localStorage.getItem(SITE_THEME_KEY)).toBeNull();
		otherWindowWrites(SITE_THEME_KEY, null);
	});

	it('after teardown the listener is gone', async () => {
		const m = mountAs(true);
		await m.stop();
		mounted = null;
		otherWindowWrites(SITE_THEME_KEY, 'space-white');
		expect(siteTheme()).toBe('idea');
		expect(attr()).toBeNull();
	});
});
