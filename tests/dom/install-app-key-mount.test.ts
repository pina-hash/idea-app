// tests/dom/install-app-key-mount.test.ts
//
// THE INSTALL APP KEY AND THE PHONE POP-UP, MOUNTED FOR REAL (ledger 0396),
// over the exact capture script `src/app.html` ships (read off disk and run in
// this document, as the browser runs it before any module):
//
//   - no install path: no key; a Chromium offer: a key, one press, one
//     `prompt()`; declined, the key stays and points at the browser's menu,
//     and a new offer puts it back on the browser's dialog;
//   - iPhone: the key opens the card, and Escape, a tap outside and Close each
//     shut it with focus back on the key;
//   - running installed hides the key with an offer waiting and on an iPhone,
//     against the same fixture showing it when not installed;
//   - the pop-up and the key share ONE event: pressing the pop-up's Install
//     (and the key straight after) prompts once, the key stops offering the
//     spent event, and dismissing the pop-up never hides the key;
//   - in the home header the card's layer is moved out of the header to the
//     room's root (the header's backdrop filter would otherwise be the fixed
//     card's containing block), the Tab key still walks key, Close, Take the
//     tour, and tearing the key down takes the layer and nothing else;
//   - while the card is open the iPhone pop-up steps aside without being
//     dismissed, and comes back when the card closes;
//   - and it steps aside the same way while the corner feedback window is
//     open (integration review: at 1000 it was drawn over the window's Cancel
//     and Send), coming back on Cancel and on Escape, and staying gone once
//     its own Got it dismissed it;
//   - and while the header's Quick note panel is open (integration review 3:
//     on a 320px phone it was drawn over Save, Open notebook and Hide this
//     button), coming back on Close and on Escape and when the panel is torn
//     down open.
//
// Structure, events, focus and storage only: happy-dom has no layout engine,
// so the key's 44px, its icon fit and the card's place in the window are
// `npm run verify:browser`'s (routes/home-order-*-install-*.mjs).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import InstallAppKey from '$lib/InstallAppKey.svelte';
import InstallPrompt from '$lib/InstallPrompt.svelte';
import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
import QuickNote from '$lib/notebook/QuickNote.svelte';
import { describeBuild } from '$lib/feedback/context';
import { INSTALL_MAILBOX, INSTALL_POPUP_DISMISSED_KEY } from '$lib/install-app';
import { mountInto, type Mounted } from './mount';

const Key = InstallAppKey as unknown as Component<Record<string, unknown>>;
const Popup = InstallPrompt as unknown as Component<Record<string, unknown>>;
const Feedback = SiteFeedback as unknown as Component<Record<string, unknown>>;
const Note = QuickNote as unknown as Component<Record<string, unknown>>;

const APP_HTML = readFileSync(join(__dirname, '..', '..', 'src', 'app.html'), 'utf8');
const CAPTURE = [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes(INSTALL_MAILBOX))!;

const UA = {
	chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
};

const realMatchMedia = window.matchMedia.bind(window);
let mounted: Mounted[] = [];

function device(ua: string, { standalone = false } = {}) {
	Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
	Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => (ua === UA.chrome ? 0 : 5) });
	window.matchMedia = ((q: string) =>
		q.includes('display-mode: standalone')
			? ({ matches: standalone, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList)
			: realMatchMedia(q)) as typeof window.matchMedia;
}

function bootDocument() {
	delete (window as unknown as Record<string, unknown>)[INSTALL_MAILBOX];
	new Function('window', CAPTURE)(window);
}

function offer() {
	const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<unknown>; calls: number };
	e.calls = 0;
	e.prompt = async () => {
		e.calls++;
		return { outcome: 'dismissed', platform: 'web' };
	};
	window.dispatchEvent(e);
	return e;
}

function open(component: Component<Record<string, unknown>>): Mounted {
	const m = mountInto(component, {});
	mounted.push(m);
	return m;
}

const key = () => document.querySelector<HTMLButtonElement>('[data-install="key"]');
const card = () => document.querySelector<HTMLElement>('[data-install="card"]');
const popup = () => document.querySelector<HTMLElement>('[data-install="popup"]');
const settle = async (m: Mounted) => {
	await m.settle();
	await m.settle();
};

beforeEach(() => {
	localStorage.clear();
	bootDocument();
	device(UA.chrome);
});

afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
	window.matchMedia = realMatchMedia as typeof window.matchMedia;
});

describe('Chromium', () => {
	it('no offer, no key; an offer, a key; one press, one prompt(); declined, the key points at the browser menu until the next offer', async () => {
		const m = open(Key);
		await settle(m);
		expect(key()).toBeNull();

		const first = offer();
		await settle(m);
		expect(first.defaultPrevented).toBe(true);
		expect(key()).not.toBeNull();
		expect(key()!.dataset.installMode).toBe('prompt');
		expect(key()!.hasAttribute('aria-expanded')).toBe(false);
		expect(key()!.textContent).toContain('Install app');

		const k = key()!;
		k.focus();
		k.click();
		k.click();
		await settle(m);
		expect(first.calls).toBe(1);
		// Declined: the same key stays, now pointing at the browser's own menu.
		expect(key()).toBe(k);
		expect(k.dataset.installMode).toBe('menu');
		expect(document.activeElement).toBe(k); // the key never left the header, so focus stayed on it
		k.click();
		await settle(m);
		expect(card()!.textContent).toContain('Your browser can still install IDEA');
		expect(card()!.querySelector('.is-share')).toBeNull();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(m);
		expect(card()).toBeNull();

		const second = offer();
		await settle(m);
		expect(key()!.dataset.installMode).toBe('prompt');
		key()!.click();
		await settle(m);
		expect([first.calls, second.calls]).toEqual([1, 1]);
	});

	it('an offer made before the key mounted is still there when it does', async () => {
		const early = offer();
		const m = open(Key);
		await settle(m);
		expect(early.defaultPrevented).toBe(true);
		expect(key()?.dataset.installMode).toBe('prompt');
	});

	it('a card open when the browser offers again closes, and does not come back on its own', async () => {
		const m = open(Key);
		offer();
		await settle(m);
		key()!.click(); // the dialog, declined
		await settle(m);
		key()!.click(); // the browser-menu card
		await settle(m);
		expect(card()).not.toBeNull();
		const again = offer();
		await settle(m);
		expect(card()).toBeNull();
		expect(key()!.dataset.installMode).toBe('prompt');
		key()!.click(); // the dialog again, declined again
		await settle(m);
		expect(again.calls).toBe(1);
		expect(key()!.dataset.installMode).toBe('menu');
		expect(card()).toBeNull();
	});

	it('appinstalled takes the key away', async () => {
		const m = open(Key);
		offer();
		await settle(m);
		expect(key()).not.toBeNull();
		window.dispatchEvent(new Event('appinstalled'));
		await settle(m);
		expect(key()).toBeNull();
	});
});

describe('iPhone', () => {
	beforeEach(() => device(UA.iphone));

	it('opens the card, and Escape shuts it with focus back on the key', async () => {
		const m = open(Key);
		await settle(m);
		const k = key()!;
		expect(k.dataset.installMode).toBe('ios');
		expect(k.getAttribute('aria-expanded')).toBe('false');
		expect(card()).toBeNull();

		k.click();
		await settle(m);
		expect(card()).not.toBeNull();
		expect(k.getAttribute('aria-expanded')).toBe('true');
		expect(k.getAttribute('aria-controls')).toBe(card()!.id);
		expect(card()!.getAttribute('role')).toBe('dialog');
		expect(card()!.textContent!.replace(/\s+/g, ' ')).toContain('Tap the Share icon, then "Add to Home Screen" to install IDEA on your device.');
		expect(card()!.contains(document.activeElement)).toBe(true);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(m);
		expect(card()).toBeNull();
		expect(document.activeElement).toBe(k);
		expect(k.getAttribute('aria-expanded')).toBe('false');
	});

	it('a tap outside and the Close key each shut it, focus back on the key', async () => {
		const m = open(Key);
		await settle(m);
		const k = key()!;

		k.click();
		await settle(m);
		expect(card()).not.toBeNull();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await settle(m);
		expect(card()).toBeNull();
		expect(document.activeElement).toBe(k);

		k.click();
		await settle(m);
		card()!.querySelector<HTMLButtonElement>('.ia-close')!.click();
		await settle(m);
		expect(card()).toBeNull();
		expect(document.activeElement).toBe(k);

		// A press inside the card does not count as outside.
		k.click();
		await settle(m);
		card()!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await settle(m);
		expect(card()).not.toBeNull();
	});
});

describe('running installed', () => {
	it('hides the key with an offer waiting, against the same offer showing it otherwise', async () => {
		device(UA.chrome, { standalone: true });
		const a = open(Key);
		offer();
		await settle(a);
		expect(key()).toBeNull();
		expect(Boolean((window as unknown as Record<string, { event: unknown }>)[INSTALL_MAILBOX].event)).toBe(true);
		await a.stop();
		mounted = [];

		device(UA.chrome, { standalone: false });
		const b = open(Key);
		await settle(b);
		expect(key()).not.toBeNull();
	});

	it('hides the key on an iPhone opened from the Home Screen', async () => {
		device(UA.iphone, { standalone: true });
		const a = open(Key);
		await settle(a);
		expect(key()).toBeNull();
		await a.stop();
		mounted = [];
		device(UA.iphone, { standalone: false });
		const b = open(Key);
		await settle(b);
		expect(key()).not.toBeNull();
	});
});

describe('the pop-up and the key', () => {
	it('share one event: the pop-up prompts once and the key stops offering it; the pop-up stays dismissed, the key takes the next offer', async () => {
		device(UA.android);
		const p = open(Popup);
		const k = open(Key);
		const first = offer();
		await settle(k);
		expect(popup()).not.toBeNull();
		expect(key()).not.toBeNull();

		popup()!.querySelector<HTMLButtonElement>('.ip-install')!.click();
		key()!.click();
		await settle(p);
		expect(first.calls).toBe(1);
		expect(popup()).toBeNull();
		// The event is spent: the key no longer offers the browser dialog.
		expect(key()!.dataset.installMode).toBe('menu');
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBe('1');

		offer();
		await settle(k);
		expect(key()!.dataset.installMode).toBe('prompt');
		expect(popup()).toBeNull();
	});

	it("dismissing the iPhone pop-up never hides the key", async () => {
		device(UA.iphone);
		const p = open(Popup);
		const k = open(Key);
		await settle(k);
		expect(popup()).not.toBeNull();
		expect(key()).not.toBeNull();
		popup()!.querySelector<HTMLButtonElement>('.ip-dismiss')!.click();
		await settle(p);
		expect(popup()).toBeNull();
		expect(key()).not.toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBe('1');
	});
});

/**
 * The home header as `src/routes/+page.svelte` draws it, around the real key:
 * `.legacy-index > header > .header-right > .header-tools`, with Take the tour
 * after the key and Sign in after the tools, and the hero after the header.
 */
function inHomeHeader() {
	const room = document.createElement('div');
	room.className = 'legacy-index';
	room.innerHTML =
		'<header><div class="header-left"><a class="logo" href="/">IDEA</a></div><div class="header-right"><div class="header-tools"><button class="tour-link" type="button">Take the tour</button></div><div class="auth-block"><button class="signin" type="button">Sign in</button></div></div></header><section class="hero"><a href="/x">Hero link</a></section>';
	document.body.appendChild(room);
	const header = room.querySelector('header')!;
	const tools = room.querySelector<HTMLElement>('.header-tools')!;
	const tour = room.querySelector<HTMLButtonElement>('.tour-link')!;
	const app = mount(Key, { target: tools, anchor: tour, props: {} });
	flushSync();
	const settleIt = async () => {
		flushSync();
		await new Promise((r) => setTimeout(r, 30));
		flushSync();
		flushSync();
		await new Promise((r) => setTimeout(r, 30));
		flushSync();
	};
	let stopped = false;
	const stop = async () => {
		if (stopped) return;
		stopped = true;
		await unmount(app);
		flushSync();
	};
	const cleanup = async () => {
		await stop();
		room.remove();
	};
	return { room, header, tools, tour, settle: settleIt, stop, cleanup };
}

const tab = (shift = false) =>
	(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true, cancelable: true }));

describe('in the home header', () => {
	beforeEach(() => device(UA.iphone));

	it('the card leaves the header for the room root, straight after the header, and the key stays in the row', async () => {
		const h = inHomeHeader();
		try {
			await h.settle();
			const k = key()!;
			expect(h.tools.contains(k)).toBe(true);
			expect(k.nextElementSibling?.classList.contains('ia-slot')).toBe(true);
			// The layer is already out of the header, before anything opens.
			const layer = h.room.querySelector('.ia-layer')!;
			expect(layer.parentElement).toBe(h.room);
			expect(layer.previousElementSibling).toBe(h.header);
			expect(h.header.querySelector('.ia-layer')).toBeNull();

			k.click();
			await h.settle();
			const c = card()!;
			expect(c).not.toBeNull();
			expect(h.header.contains(c)).toBe(false);
			expect(c.parentElement).toBe(layer);
			expect(k.getAttribute('aria-controls')).toBe(c.id);
			expect(c.contains(document.activeElement)).toBe(true);
		} finally {
			await h.cleanup();
		}
	});

	it('Tab walks the key, Close, then Take the tour; Shift+Tab from Close goes back to the key with the card still open', async () => {
		const h = inHomeHeader();
		try {
			await h.settle();
			const k = key()!;
			k.click();
			await h.settle();
			const close = card()!.querySelector<HTMLButtonElement>('.ia-close')!;
			expect(document.activeElement).toBe(close);

			// Shift+Tab: back to the key, the card stays.
			expect(tab(true)).toBe(false); // the handler took the key press
			await h.settle();
			expect(document.activeElement).toBe(k);
			expect(card()).not.toBeNull();

			// Tab from the key, the card open: into the card, which is no longer its neighbour.
			expect(tab()).toBe(false);
			await h.settle();
			expect(document.activeElement).toBe(close);

			// Tab from Close: on to Take the tour, and the card closes.
			expect(tab()).toBe(false);
			await h.settle();
			expect(document.activeElement).toBe(h.tour);
			expect(card()).toBeNull();
			expect(k.getAttribute('aria-expanded')).toBe('false');

			// With the card shut, Tab from the key is the browser's own (not taken).
			k.focus();
			expect(tab()).toBe(true);
		} finally {
			await h.cleanup();
		}
	});

	it('focus leaving the key and the card closes it and leaves focus where it went; Escape then moves nothing (review round 2)', async () => {
		const h = inHomeHeader();
		try {
			await h.settle();
			const k = key()!;
			const logo = h.room.querySelector<HTMLAnchorElement>('.logo')!;
			k.click();
			await h.settle();
			expect(document.activeElement).toBe(card()!.querySelector('.ia-close'));

			// Shift+Tab from Close lands on the key: the card stays (the positive control).
			tab(true);
			await h.settle();
			expect(document.activeElement).toBe(k);
			expect(card()).not.toBeNull();

			// Shift+Tab again is the browser's own move, past the key to the logo.
			k.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: logo }));
			logo.focus();
			await h.settle();
			expect(card()).toBeNull();
			expect(k.getAttribute('aria-expanded')).toBe('false');
			expect(document.activeElement).toBe(logo);

			// Escape now belongs to wherever focus is: nothing pulls it back to the key.
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await h.settle();
			expect(document.activeElement).toBe(logo);

			// Tab past the card's last key the same way: closed, focus where it went.
			k.click();
			await h.settle();
			const close = card()!.querySelector<HTMLButtonElement>('.ia-close')!;
			close.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: h.tour }));
			await h.settle();
			expect(card()).toBeNull();

			// Focus leaving the window (no relatedTarget) is not a choice: the card stays.
			k.click();
			await h.settle();
			card()!.querySelector('.ia-close')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
			await h.settle();
			expect(card()).not.toBeNull();
		} finally {
			await h.cleanup();
		}
	});

	it('Escape with focus on nothing (the page) shuts the card and gives focus to the key', async () => {
		const h = inHomeHeader();
		try {
			await h.settle();
			const k = key()!;
			k.click();
			await h.settle();
			(document.activeElement as HTMLElement).blur();
			await h.settle();
			expect(card()).not.toBeNull();
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await h.settle();
			expect(card()).toBeNull();
			expect(document.activeElement).toBe(k);
		} finally {
			await h.cleanup();
		}
	});

	it('the key scrolled out of the window closes the card and keeps focus on the key; in the window it stays open (review round 2)', async () => {
		// happy-dom's IntersectionObserver never reports, so a recording one stands in.
		const realIO = window.IntersectionObserver;
		const observers: { callback: IntersectionObserverCallback; targets: Element[]; disconnected: boolean }[] = [];
		class RecordingIO {
			record: (typeof observers)[number];
			constructor(callback: IntersectionObserverCallback) {
				this.record = { callback, targets: [], disconnected: false };
				observers.push(this.record);
			}
			observe(t: Element) {
				this.record.targets.push(t);
			}
			disconnect() {
				this.record.disconnected = true;
			}
			unobserve() {}
			takeRecords() {
				return [];
			}
		}
		(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = RecordingIO;
		const report = (o: (typeof observers)[number], isIntersecting: boolean) =>
			o.callback([{ isIntersecting, target: o.targets[0] } as unknown as IntersectionObserverEntry], {} as IntersectionObserver);
		const h = inHomeHeader();
		try {
			await h.settle();
			const k = key()!;
			expect(observers.length).toBe(0); // nothing is watched while the card is shut

			k.click();
			await h.settle();
			const live = observers.filter((o) => !o.disconnected);
			expect(live.length).toBe(1);
			expect(live[0].targets).toEqual([k]);

			report(live[0], true);
			await h.settle();
			expect(card()).not.toBeNull();

			report(live[0], false);
			await h.settle();
			expect(card()).toBeNull();
			expect(k.getAttribute('aria-expanded')).toBe('false');
			expect(document.activeElement).toBe(k);
			expect(observers.every((o) => o.disconnected)).toBe(true);
		} finally {
			(window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = realIO;
			await h.cleanup();
		}
	});

	it('tearing the key down takes the moved layer with it and leaves every header neighbour where it was', async () => {
		const h = inHomeHeader();
		await h.settle();
		key()!.click();
		await h.settle();
		expect(h.room.querySelector('.ia-layer')).not.toBeNull();
		await h.stop();
		expect(h.room.querySelector('.ia-layer')).toBeNull();
		expect(h.room.querySelector('[data-install]')).toBeNull();
		expect(h.room.querySelector('.tour-link')).toBe(h.tour);
		expect(h.room.querySelector('.signin')).not.toBeNull();
		expect(h.room.querySelector('.hero a')).not.toBeNull();
		expect(h.room.firstElementChild).toBe(h.header);
		await h.cleanup();
	});

	it('the iPhone pop-up steps aside while the card is open, undismissed, and comes back when it closes', async () => {
		const p = open(Popup);
		const h = inHomeHeader();
		try {
			await h.settle();
			expect(popup()).not.toBeNull();
			key()!.click();
			await h.settle();
			expect(card()).not.toBeNull();
			expect(popup()).toBeNull();
			expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();

			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await h.settle();
			expect(card()).toBeNull();
			expect(popup()).not.toBeNull();

			// The pop-up's own Got it is still the one thing that dismisses it.
			popup()!.querySelector<HTMLButtonElement>('.ip-dismiss')!.click();
			await p.settle();
			expect(popup()).toBeNull();
			key()!.click();
			await h.settle();
			window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			await h.settle();
			expect(popup()).toBeNull();
			expect(key()).not.toBeNull();
		} finally {
			await h.cleanup();
		}
	});

	it('a key torn down with its card open hands the pop-up back', async () => {
		open(Popup);
		const h = inHomeHeader();
		await h.settle();
		key()!.click();
		await h.settle();
		expect(popup()).toBeNull();
		await h.stop();
		await new Promise((r) => setTimeout(r, 30));
		flushSync();
		expect(popup()).not.toBeNull();
		await h.cleanup();
	});
});

describe('the feedback window', () => {
	beforeEach(() => device(UA.iphone));

	/** The corner button's real window, with a transport that records nothing. */
	function feedback(): Mounted {
		const m = mountInto(Feedback, {
			routeId: '/',
			pathname: '/',
			build: describeBuild({ sha: 'a1b2c3d', complete: true }, null),
			submit: async () => ({ error: null, retryable: false })
		});
		mounted.push(m);
		return m;
	}

	/** Press the button and wait for the box, which arrives on a dynamic import. */
	async function openWindow(f: Mounted) {
		f.one<HTMLButtonElement>('.sfb-trigger').click();
		for (let i = 0; i < 100; i++) {
			f.flush();
			if (f.all('#fb-msg').length) return;
			await new Promise((r) => setTimeout(r, 10));
		}
		throw new Error('the feedback window did not open within 1s of the press');
	}
	const windowOpen = (f: Mounted) => f.all('.fb-box').length === 1;

	it('the iPhone pop-up steps aside while the window is open, undismissed, and comes back on Cancel and on Escape', async () => {
		const p = open(Popup);
		const f = feedback();
		await settle(p);
		// POSITIVE CONTROL: the pop-up is on screen before the press, so its
		// absence below is the step aside and not a pop-up that never showed.
		expect(popup()).not.toBeNull();

		await openWindow(f);
		await settle(f);
		expect(windowOpen(f)).toBe(true);
		expect(popup()).toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();

		f.all<HTMLButtonElement>('.fb-box button').find((b) => b.textContent?.trim() === 'CANCEL')!.click();
		await settle(f);
		expect(windowOpen(f)).toBe(false);
		expect(popup()).not.toBeNull();

		await openWindow(f);
		await settle(f);
		expect(popup()).toBeNull();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(f);
		expect(windowOpen(f)).toBe(false);
		expect(popup()).not.toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();
	});

	it('a pop-up dismissed with its own Got it stays gone after the window closes', async () => {
		const p = open(Popup);
		const f = feedback();
		await settle(p);
		popup()!.querySelector<HTMLButtonElement>('.ip-dismiss')!.click();
		await settle(p);
		expect(popup()).toBeNull();

		await openWindow(f);
		await settle(f);
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(f);
		expect(windowOpen(f)).toBe(false);
		expect(popup()).toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBe('1');
	});

	it('a window torn down while open hands the pop-up back', async () => {
		const p = open(Popup);
		const f = feedback();
		await settle(p);
		await openWindow(f);
		await settle(f);
		expect(popup()).toBeNull();
		await f.stop();
		await settle(p);
		expect(popup()).not.toBeNull();
	});
});

describe('the Quick note panel', () => {
	beforeEach(() => device(UA.iphone));

	/** The header's real Quick note, with transports that are never reached by opening and closing it. */
	function note(): Mounted {
		const refuse = async () => ({ ok: false as const, error: 'not in this test', retryable: false });
		const m = mountInto(Note, {
			viewerId: 'viewer-1',
			filing: { sectionId: null, customLabel: null, where: 'your notebook Inbox' },
			notebookHref: '/classroom/notebook',
			transports: { createNote: refuse, editNote: refuse, addNote: refuse, sealNotes: refuse, draftOpen: async () => 'unknown' as const }
		});
		mounted.push(m);
		return m;
	}
	const panelOpen = (n: Mounted) => !n.one<HTMLElement>('[data-testid="qn-panel"]').hidden;

	it('the iPhone pop-up steps aside while the panel is open, undismissed, and comes back on Close and on Escape', async () => {
		const p = open(Popup);
		const n = note();
		await settle(p);
		// POSITIVE CONTROL: the pop-up is on screen before the panel opens.
		expect(popup()).not.toBeNull();

		n.one<HTMLButtonElement>('[data-testid="qn-trigger"]').click();
		await settle(n);
		expect(panelOpen(n)).toBe(true);
		expect(popup()).toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();

		n.one<HTMLButtonElement>('[data-testid="qn-close"]').click();
		await settle(n);
		expect(panelOpen(n)).toBe(false);
		expect(popup()).not.toBeNull();

		n.one<HTMLButtonElement>('[data-testid="qn-trigger"]').click();
		await settle(n);
		expect(popup()).toBeNull();
		n.one<HTMLElement>('[data-testid="qn-panel"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await settle(n);
		expect(panelOpen(n)).toBe(false);
		expect(popup()).not.toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();
	});

	it('a panel torn down while open hands the pop-up back', async () => {
		const p = open(Popup);
		const n = note();
		await settle(p);
		n.one<HTMLButtonElement>('[data-testid="qn-trigger"]').click();
		await settle(n);
		expect(popup()).toBeNull();
		await n.stop();
		await settle(p);
		expect(popup()).not.toBeNull();
	});
});
