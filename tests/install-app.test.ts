/**
 * THE INSTALL APP KEY AND THE PHONE POP-UP SHARE ONE EVENT (ledger 0396).
 *
 * What is pinned here, and why each one is silent when it breaks:
 *
 * - THE ONE LISTENER IS THE INLINE SCRIPT IN `src/app.html`, and this file runs
 *   that exact script (read off disk, not retyped) in a stand-in window. An
 *   event fired before any module subscribes is still there afterwards, and
 *   `preventDefault` was called on it. Remove the script and the event is
 *   simply never seen: the key quietly never appears in Chrome and nothing
 *   anywhere reports it.
 * - NOTHING ELSE LISTENS. Two listeners racing for one event is the defect this
 *   design exists to prevent, so the module is asserted to add none, and `src/`
 *   is swept for any other `beforeinstallprompt` listener (positive control:
 *   the sweep finds the one in app.html).
 * - ONE EVENT IS PROMPTED ONCE. Two readers pressing at once reach `prompt()`
 *   exactly one time; the browser throws on a second call.
 * - THE DECISIONS (`installPlatform`, `installKeyMode`, `installPopupMode`) in
 *   both directions, including that the pop-up's dismissal cannot reach the key.
 * - THE WORDS: the iOS sentence is the pop-up's original text, byte for byte.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
	INSTALL_COPY,
	INSTALL_MAILBOX,
	UNKNOWN_INSTALL,
	installCardOpen,
	installKeyMode,
	installPlatform,
	installPopupMode,
	installSentence,
	promptInstall,
	readInstall,
	setInstallCardOpen,
	subscribeInstall,
	type InstallSnapshot
} from '../src/lib/install-app';

const ROOT = join(__dirname, '..');
const APP_HTML = readFileSync(join(ROOT, 'src', 'app.html'), 'utf8');

/** The inline capture script, exactly as app.html ships it. */
function captureScript(html = APP_HTML): string {
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
	const hits = scripts.filter((s) => s.includes(INSTALL_MAILBOX));
	expect(hits, 'app.html carries exactly one install capture script').toHaveLength(1);
	return hits[0];
}

const UA = {
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0.0.0 Mobile/15E148 Safari/604.1',
	macSafari26:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
	macSafari18:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
	macChrome:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
	edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
	android:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
	firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0'
};

/** A window stand-in: a real EventTarget that counts who listens, plus what the module reads. */
function fakeWindow({ userAgent = UA.edge, maxTouchPoints = 0, standalone = false } = {}) {
	const target = new EventTarget();
	const listeners: Record<string, number> = {};
	const win = {
		navigator: { userAgent, maxTouchPoints },
		matchMedia: (q: string) => ({
			matches: standalone && q.includes('display-mode: standalone'),
			media: q,
			addEventListener: () => {},
			removeEventListener: () => {}
		}),
		addEventListener(type: string, fn: EventListener) {
			listeners[type] = (listeners[type] ?? 0) + 1;
			target.addEventListener(type, fn);
		},
		removeEventListener(type: string, fn: EventListener) {
			listeners[type] = (listeners[type] ?? 0) - 1;
			target.removeEventListener(type, fn);
		},
		dispatchEvent: (e: Event) => target.dispatchEvent(e)
	};
	return { win: win as unknown as Window, listeners };
}

function boot(w: Window, script = captureScript()) {
	new Function('window', script)(w);
}

/** A synthetic beforeinstallprompt whose prompt() is counted. */
function bip(outcome: 'accepted' | 'dismissed' = 'dismissed') {
	const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
		prompt: () => Promise<unknown>;
		userChoice: Promise<{ outcome: string }>;
		calls: number;
	};
	e.calls = 0;
	e.prompt = async () => {
		e.calls++;
		await new Promise((r) => setTimeout(r, 5));
		return { outcome, platform: 'web' };
	};
	e.userChoice = Promise.resolve({ outcome });
	return e;
}

const snap = (over: Partial<InstallSnapshot>): InstallSnapshot => ({ ...UNKNOWN_INSTALL, known: true, ...over });

describe('installPlatform', () => {
	it('names every family the key branches on', () => {
		const cases: Array<[string, number, string]> = [
			[UA.iphone, 5, 'ios'],
			[UA.iphoneChrome, 5, 'ios'],
			[UA.macSafari18, 5, 'ios'], // iPadOS reports a Mac, with touch points
			[UA.android, 5, 'android'],
			[UA.macSafari26, 0, 'mac-safari'],
			[UA.macSafari18, 0, 'other'], // may be Ventura, which has no Add to Dock
			[UA.macChrome, 0, 'other'],
			[UA.edge, 0, 'other'],
			[UA.firefox, 0, 'other'],
			['', 0, 'other']
		];
		for (const [userAgent, maxTouchPoints, want] of cases) {
			expect(installPlatform({ userAgent, maxTouchPoints }), userAgent.slice(0, 60)).toBe(want);
		}
		expect(cases.length).toBe(10);
	});
});

describe('installKeyMode', () => {
	it('shows the key for every install path, in both directions', () => {
		expect(installKeyMode(snap({ canPrompt: true }))).toBe('prompt');
		expect(installKeyMode(snap({ canPrompt: true, platform: 'android' }))).toBe('prompt');
		expect(installKeyMode(snap({ platform: 'ios' }))).toBe('ios');
		expect(installKeyMode(snap({ platform: 'mac-safari' }))).toBe('mac-safari');
		// Hidden: installed, running installed, nothing known, no path.
		expect(installKeyMode(snap({ canPrompt: true, standalone: true }))).toBeNull();
		expect(installKeyMode(snap({ platform: 'ios', standalone: true }))).toBeNull();
		expect(installKeyMode(snap({ canPrompt: true, installed: true }))).toBeNull();
		expect(installKeyMode({ ...UNKNOWN_INSTALL, canPrompt: true })).toBeNull();
		expect(installKeyMode(snap({ platform: 'other' }))).toBeNull();
		expect(installKeyMode(snap({ platform: 'android' }))).toBeNull();
	});

	it('after a declined dialog the key points at the browser menu, until the browser offers again', () => {
		expect(installKeyMode(snap({ prompted: true }))).toBe('menu');
		expect(installKeyMode(snap({ prompted: true, canPrompt: true }))).toBe('prompt');
		expect(installKeyMode(snap({ prompted: true, standalone: true }))).toBeNull();
		expect(installKeyMode(snap({ prompted: true, installed: true }))).toBeNull();
		expect(installKeyMode(snap({ prompted: false }))).toBeNull();
	});

	it('takes no dismissal at all: the pop-up saying no can never hide the key', () => {
		expect(installKeyMode.length).toBe(1);
		const s = snap({ platform: 'ios' });
		expect(installPopupMode(s, true)).toBeNull();
		expect(installKeyMode(s)).toBe('ios');
	});
});

describe('installPopupMode', () => {
	it('keeps the pop-up phone-only and once-and-done', () => {
		expect(installPopupMode(snap({ platform: 'ios' }), false)).toBe('ios');
		expect(installPopupMode(snap({ platform: 'android', canPrompt: true }), false)).toBe('android');
		expect(installPopupMode(snap({ platform: 'android' }), false)).toBeNull();
		expect(installPopupMode(snap({ platform: 'other', canPrompt: true }), false)).toBeNull(); // desktop Chrome
		expect(installPopupMode(snap({ platform: 'mac-safari' }), false)).toBeNull();
		expect(installPopupMode(snap({ platform: 'ios' }), true)).toBeNull();
		expect(installPopupMode(snap({ platform: 'ios', standalone: true }), false)).toBeNull();
		expect(installPopupMode(snap({ platform: 'android', canPrompt: true, installed: true }), false)).toBeNull();
	});
});

describe('the words', () => {
	it('the iOS sentence is the pop-up text it was before ledger 0396', () => {
		expect(installSentence(INSTALL_COPY.ios)).toBe('Tap the Share icon, then "Add to Home Screen" to install IDEA on your device.');
		expect(INSTALL_COPY.androidBody).toBe('Add IDEA to your home screen for quick, full-screen access.');
		expect(INSTALL_COPY.key).toBe('Install app');
	});
	it('no em dash in any of it', () => {
		expect(JSON.stringify(INSTALL_COPY)).not.toMatch(/—/);
	});
});

describe('the one listener, in app.html', () => {
	it('keeps an event fired before anything subscribed, and prevents the browser banner', () => {
		const { win, listeners } = fakeWindow();
		boot(win);
		const e = bip();
		win.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
		// Nothing has subscribed yet: this is the moment a mount-time listener misses.
		expect(readInstall(win).canPrompt).toBe(true);
		expect(listeners.beforeinstallprompt).toBe(1);
		expect(listeners.appinstalled).toBe(1);
	});

	it('positive control: without the script the same event is never seen', () => {
		const { win } = fakeWindow();
		win.dispatchEvent(bip());
		expect(readInstall(win).canPrompt).toBe(false);
	});

	it('the module adds no listener of its own, however many readers subscribe', () => {
		const { win, listeners } = fakeWindow();
		boot(win);
		const offA = subscribeInstall(() => {}, win as never);
		const offB = subscribeInstall(() => {}, win as never);
		expect(listeners.beforeinstallprompt).toBe(1);
		expect(listeners.appinstalled).toBe(1);
		offA();
		offB();
	});

	it('runs once even if the document carried it twice', () => {
		const { win, listeners } = fakeWindow();
		boot(win);
		boot(win);
		expect(listeners.beforeinstallprompt).toBe(1);
	});

	it('tells both readers about every change, and hands notify back when they leave', async () => {
		const { win } = fakeWindow();
		boot(win);
		const seen = { a: 0, b: 0 };
		const offA = subscribeInstall(() => seen.a++, win as never);
		const offB = subscribeInstall(() => seen.b++, win as never);
		win.dispatchEvent(bip());
		expect(seen).toEqual({ a: 1, b: 1 });
		win.dispatchEvent(new Event('appinstalled'));
		expect(seen).toEqual({ a: 2, b: 2 });
		expect(readInstall(win)).toMatchObject({ installed: true, canPrompt: false });
		offA();
		offB();
		const box = (win as unknown as Record<string, { notify: unknown }>)[INSTALL_MAILBOX];
		expect(box.notify).toBeNull();
	});

	it("the key's card opening and closing reaches the pop-up, once per change, and stores nothing", () => {
		const { win } = fakeWindow();
		boot(win);
		let heard = 0;
		const off = subscribeInstall(() => heard++, win as never);
		expect(installCardOpen()).toBe(false);
		setInstallCardOpen(true);
		setInstallCardOpen(true);
		expect([installCardOpen(), heard]).toEqual([true, 1]);
		setInstallCardOpen(false);
		expect([installCardOpen(), heard]).toEqual([false, 2]);
		// Page state, not the pop-up's memory and not the snapshot either reader decides from.
		expect(readInstall(win)).not.toHaveProperty('cardOpen');
		off();
	});
});

describe('promptInstall', () => {
	it('two presses at once reach prompt() exactly once', async () => {
		const { win } = fakeWindow();
		boot(win);
		const e = bip();
		win.dispatchEvent(e);
		const [first, second] = await Promise.all([promptInstall(win as never), promptInstall(win as never)]);
		expect(e.calls).toBe(1);
		expect([first, second].sort()).toEqual(['dismissed', 'unavailable']);
		expect(readInstall(win)).toMatchObject({ canPrompt: false, prompted: true });
		expect(installKeyMode(readInstall(win))).toBe('menu');
	});

	it('a later offer is a new event and can be prompted again', async () => {
		const { win } = fakeWindow();
		boot(win);
		const first = bip();
		win.dispatchEvent(first);
		await promptInstall(win as never);
		const second = bip();
		win.dispatchEvent(second);
		expect(readInstall(win).canPrompt).toBe(true);
		expect(await promptInstall(win as never)).toBe('dismissed');
		expect([first.calls, second.calls]).toEqual([1, 1]);
	});

	it('accepted marks the mailbox installed at once', async () => {
		const { win } = fakeWindow();
		boot(win);
		win.dispatchEvent(bip('accepted'));
		expect(await promptInstall(win as never)).toBe('accepted');
		expect(readInstall(win).installed).toBe(true);
		expect(installKeyMode(readInstall(win))).toBeNull();
	});

	it('answers unavailable with nothing stashed, and with no mailbox at all', async () => {
		const { win } = fakeWindow();
		expect(await promptInstall(win as never)).toBe('unavailable');
		boot(win);
		expect(await promptInstall(win as never)).toBe('unavailable');
	});
});

describe('readInstall', () => {
	it('reads standalone from display-mode and from iOS navigator.standalone', () => {
		const { win } = fakeWindow({ standalone: true });
		boot(win);
		expect(readInstall(win).standalone).toBe(true);
		const ios = fakeWindow({ userAgent: UA.iphone, maxTouchPoints: 5 });
		(ios.win.navigator as unknown as { standalone: boolean }).standalone = true;
		expect(readInstall(ios.win)).toMatchObject({ standalone: true, platform: 'ios' });
		expect(installKeyMode(readInstall(ios.win))).toBeNull();
	});

	it('knows nothing on the server', () => {
		expect(readInstall(null)).toEqual(UNKNOWN_INSTALL);
	});
});

describe('nothing else in src/ listens for the event', () => {
	const files: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) walk(p);
			else if (/\.(ts|js|svelte|html)$/.test(name)) files.push(p);
		}
	};
	walk(join(ROOT, 'src'));
	const listening = files.filter((f) =>
		/addEventListener\(\s*['"]beforeinstallprompt['"]|onbeforeinstallprompt/.test(readFileSync(f, 'utf8'))
	);

	it('the sweep finds the one listener there is (positive control)', () => {
		expect(listening.map((f) => relative(ROOT, f))).toEqual([join('src', 'app.html')]);
		expect(files.length).toBeGreaterThan(500);
	});
});
