// tests/dom/tab-icon-live.test.ts
//
// The live tab icon's painter against a real (happy-dom) <head> (ledger 0396).
//
// WHY HERE. Everything the painter does is a DOM side effect nobody sees in a
// screenshot of the page: the SVG icon link's href, the document title, the
// timers it keeps. A wrong one is silent -- a title reading "(3) (3) Grades",
// a timer left running on every page, or a product's own icon overwritten --
// so each rule is asserted here, in both directions, with the timer faked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	clear,
	clearAllTabStatuses,
	frameFor,
	mountTabIcon,
	raise,
	setTabPath,
	TAB_ICON_FRAME_MS,
	TAB_ICON_RESTING
} from '../../src/lib/tab-icon/live';
import { DONE_CLEAR_MS } from '../../src/lib/tab-icon/status';
import { icon, url } from '../../src/lib/tab-icon/geometry';

const SVG_HREF = '/IDEA/favicon.svg';
const ICO_HREF = '/IDEA/favicon.ico';

let unmount: (() => void) | null = null;
let hrefWrites = 0;

function svgLink(): HTMLLinkElement {
	return document.head.querySelector('link[rel="icon"][type="image/svg+xml"]') as HTMLLinkElement;
}
function icoLink(): HTMLLinkElement {
	return document.head.querySelector('link[rel="icon"][sizes]') as HTMLLinkElement;
}
/** The resolved URL, which is what the painter compares (SvelteKit's router
 *  rewrites icon hrefs to absolute URLs when it starts). */
const href = () => svgLink().href;
const STATIC_SVG = () => new URL(SVG_HREF, document.baseURI).href;
/** Lets the head's MutationObserver deliver. */
const settle = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await new Promise((r) => queueMicrotask(() => r(null)));
};

function stubMatchMedia(matching: string[]) {
	window.matchMedia = ((q: string) => ({
		matches: matching.includes(q),
		media: q,
		onchange: null,
		addEventListener() {},
		removeEventListener() {},
		addListener() {},
		removeListener() {},
		dispatchEvent: () => false
	})) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
	document.head.innerHTML =
		`<link rel="icon" href="${ICO_HREF}" sizes="32x32">` +
		`<link rel="icon" type="image/svg+xml" href="${SVG_HREF}">` +
		`<link rel="apple-touch-icon" href="/IDEA/apple-touch-icon.png">` +
		`<title>IDEA</title>`;
	document.title = 'IDEA';
	stubMatchMedia([]);
	clearAllTabStatuses();
	setTabPath('/');
	hrefWrites = 0;
	const link = svgLink();
	const original = link.setAttribute.bind(link);
	link.setAttribute = (name: string, value: string) => {
		if (name === 'href') hrefWrites++;
		original(name, value);
	};
});

afterEach(() => {
	unmount?.();
	unmount = null;
	clearAllTabStatuses();
	vi.useRealTimers();
});

describe('section from the route', () => {
	it('resting on Home leaves the static file in place and writes nothing', () => {
		unmount = mountTabIcon();
		expect(href()).toBe(STATIC_SVG());
		expect(hrefWrites).toBe(0);
		expect(TAB_ICON_RESTING).toBe(icon('gearkey', 'home', null));
	});

	it("agrees with SvelteKit's router, which rewrites icon hrefs to absolute URLs, and writes nothing for it", () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		// What `_start_router` does to every icon link when the client starts.
		svgLink().href = svgLink().href;
		hrefWrites = 0;
		setTabPath('/archive');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS * 4);
		expect(hrefWrites).toBe(0);
		const e = raise('error');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		e.clear();
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		// One write out to the error drawing and one back to the file: no more.
		expect(hrefWrites).toBe(2);
		expect(href()).toBe(STATIC_SVG());
	});

	it('/ to /maps to /classroom/notebook changes the section each time, and back to / restores the file', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const seen: string[] = [];
		for (const path of ['/maps', '/classroom/notebook', '/']) {
			setTabPath(path);
			vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
			seen.push(href() as string);
		}
		expect(seen[0]).toBe(url(icon('gearkey', 'maps', { kind: 'none' })));
		expect(seen[1]).toBe(url(icon('gearkey', 'notebook', { kind: 'none' })));
		expect(seen[2]).toBe(STATIC_SVG());
		expect(new Set(seen).size).toBe(3);
	});

	it('never touches the ICO link and never adds or removes a link', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const before = document.head.querySelectorAll('link').length;
		setTabPath('/gauntlet');
		const h = raise('error');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS * 4);
		expect(icoLink().getAttribute('href')).toBe(ICO_HREF);
		expect(document.head.querySelectorAll('link').length).toBe(before);
		h.clear();
	});
});

describe('status', () => {
	it('error and live paint two different icons, and both differ from resting', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const resting = href();
		const err = raise('error');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		const errorHref = href();
		err.clear();
		const live = raise('live');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		const liveHref = href();
		live.clear();
		expect(errorHref).not.toBe(resting);
		expect(liveHref).not.toBe(resting);
		expect(errorHref).not.toBe(liveHref);
		expect(errorHref).toBe(url(icon('gearkey', 'home', { kind: 'error' })));
	});

	it('the highest priority shows when several are raised', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		setTabPath('/classroom');
		const s = raise('saving');
		const u = raise('unread', { n: 2 });
		const e = raise('error');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(icon('gearkey', 'classroom', { kind: 'error' })));
		clear(e);
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(icon('gearkey', 'classroom', { kind: 'unread', n: 2 })));
		clear(u);
		clear(s);
	});

	it('done clears itself after four seconds and error stays until cleared', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		raise('done');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(icon('gearkey', 'home', { kind: 'done' })));
		vi.advanceTimersByTime(DONE_CLEAR_MS);
		expect(href()).toBe(STATIC_SVG());
		const e = raise('error');
		vi.advanceTimersByTime(DONE_CLEAR_MS * 10);
		expect(href()).toBe(url(icon('gearkey', 'home', { kind: 'error' })));
		e.clear();
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(STATIC_SVG());
	});

	it('offline follows the browser events', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		window.dispatchEvent(new Event('offline'));
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(icon('gearkey', 'home', { kind: 'offline' })));
		window.dispatchEvent(new Event('online'));
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(STATIC_SVG());
	});
});

describe('motion', () => {
	it('live repaints on a timer, at most four times a second, never repeating a frame, and the timer stops with it', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const live = raise('live');
		hrefWrites = 0;
		vi.advanceTimersByTime(2000);
		// Two distinct frames, half a second each: one write per change.
		expect(hrefWrites).toBeGreaterThanOrEqual(3);
		expect(hrefWrites).toBeLessThanOrEqual(2000 / TAB_ICON_FRAME_MS);
		live.clear();
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(STATIC_SVG());
		expect(vi.getTimerCount()).toBe(0);
	});

	it('saving blinks at four frames a second; a still state keeps no timer', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const s = raise('saving');
		hrefWrites = 0;
		vi.advanceTimersByTime(1000);
		expect(hrefWrites).toBe(4);
		s.clear();
		raise('attention');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		hrefWrites = 0;
		vi.advanceTimersByTime(3000);
		expect(hrefWrites).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('under reduced motion live and saving each paint their lit still frame once and never repaint on a timer', () => {
		stubMatchMedia(['(prefers-reduced-motion: reduce)']);
		vi.useFakeTimers();
		unmount = mountTabIcon();
		setTabPath('/maps');
		const live = raise('live');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(frameFor('maps', { kind: 'live' }, 0, true)));
		expect(decodeURIComponent(href())).toContain('cy="25" r="3.4" fill="#FF3355"');
		hrefWrites = 0;
		vi.advanceTimersByTime(5000);
		expect(hrefWrites).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
		live.clear();
		raise('saving');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		// The mint lamp, held: a reduced-motion reader sees saving as lit.
		expect(href()).toBe(url(frameFor('maps', { kind: 'saving' }, 0, true)));
		expect(decodeURIComponent(href())).toContain('cy="25" r="3.4" fill="#8FE08A"');
		hrefWrites = 0;
		vi.advanceTimersByTime(5000);
		expect(hrefWrites).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('saving opens on its lit frame, and so does a saving the tab falls back to when live ends', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		setTabPath('/maps');
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		const savingLit = url(frameFor('maps', { kind: 'saving' }, 0, false));
		const s = raise('saving');
		expect(href()).toBe(savingLit);
		const live = raise('live');
		// Three frames into live's cycle: a carried-over frame count would land
		// saving on its dark beat.
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS * 3);
		expect(href()).not.toBe(savingLit);
		live.clear();
		expect(href()).toBe(savingLit);
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).not.toBe(savingLit);
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(savingLit);
		s.clear();
	});

	it('progress repaints as p moves, throttled to four a second', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		const up = raise('progress', { p: 0 });
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		hrefWrites = 0;
		for (let i = 1; i <= 100; i++) {
			up.update({ p: i / 100 });
			vi.advanceTimersByTime(10);
		}
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		// 1000ms of updates every 10ms: no more than one write per frame, and
		// the last write is the final fraction.
		expect(hrefWrites).toBeLessThanOrEqual(1000 / TAB_ICON_FRAME_MS + 1);
		expect(hrefWrites).toBeGreaterThan(0);
		expect(href()).toBe(url(icon('gearkey', 'home', { kind: 'progress', p: 1 })));
		up.clear();
	});
});

describe('the unread title', () => {
	it('prefixes the title, survives three title changes without doubling, and clearing restores it', async () => {
		unmount = mountTabIcon();
		const u = raise('unread', { n: 3 });
		expect(document.title).toBe('(3) IDEA');
		for (const t of ['Classroom', 'Grades', 'People']) {
			document.title = t;
			await settle();
			expect(document.title).toBe(`(3) ${t}`);
		}
		u.update({ n: 4 });
		expect(document.title).toBe('(4) People');
		u.clear();
		expect(document.title).toBe('People');
		document.title = 'Home';
		await settle();
		expect(document.title).toBe('Home');
	});

	it('a page re-setting the prefixed title does not double the prefix', async () => {
		unmount = mountTabIcon();
		raise('unread', { n: 2 });
		document.title = document.title + ' - draft';
		await settle();
		expect(document.title).toBe('(2) IDEA - draft');
	});

	it('the installed app badge follows unread only in standalone mode', () => {
		const calls: Array<number | 'clear'> = [];
		const nav = window.navigator as unknown as Record<string, unknown>;
		nav.setAppBadge = (n: number) => {
			calls.push(n);
			return Promise.resolve();
		};
		nav.clearAppBadge = () => {
			calls.push('clear');
			return Promise.resolve();
		};
		try {
			unmount = mountTabIcon();
			const a = raise('unread', { n: 2 });
			a.clear();
			expect(calls).toEqual([]);
			unmount();
			stubMatchMedia(['(display-mode: standalone)']);
			unmount = mountTabIcon();
			const b = raise('unread', { n: 5 });
			b.clear();
			expect(calls).toEqual(['clear', 5, 'clear']);
		} finally {
			delete nav.setAppBadge;
			delete nav.clearAppBadge;
		}
	});
});

describe('a product that sets its own icon keeps it', () => {
	it('a third icon link stands the painter down, restores the file and drops the prefix; removing it resumes', async () => {
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
		unmount = mountTabIcon();
		setTabPath('/tournaments');
		const u = raise('unread', { n: 1 });
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).not.toBe(STATIC_SVG());
		expect(document.title).toBe('(1) IDEA');

		const own = document.createElement('link');
		own.rel = 'icon';
		own.href = '/product.png';
		document.head.appendChild(own);
		await settle();
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS * 4);
		expect(href()).toBe(STATIC_SVG());
		expect(document.title).toBe('IDEA');
		expect(own.getAttribute('href')).toBe('/product.png');

		own.remove();
		await settle();
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).toBe(url(icon('gearkey', 'tournaments', { kind: 'unread', n: 1 })));
		expect(document.title).toBe('(1) IDEA');
		u.clear();
	});

	it('unmounting puts the static file and the plain title back', () => {
		vi.useFakeTimers();
		unmount = mountTabIcon();
		setTabPath('/frc');
		raise('unread', { n: 9 });
		vi.advanceTimersByTime(TAB_ICON_FRAME_MS);
		expect(href()).not.toBe(STATIC_SVG());
		unmount();
		unmount = null;
		expect(href()).toBe(STATIC_SVG());
		expect(document.title).toBe('IDEA');
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe('the API on a page with nothing mounted', () => {
	it('raise and clear still work and paint on mount', () => {
		vi.useFakeTimers();
		const e = raise('error');
		unmount = mountTabIcon();
		expect(href()).toBe(url(icon('gearkey', 'home', { kind: 'error' })));
		e.clear();
	});
});
