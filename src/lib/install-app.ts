/**
 * INSTALLING THE SITE AS AN APP: ONE EVENT, ONE MAILBOX, TWO READERS (ledger 0396).
 *
 * Two surfaces offer to install IDEA: the one-time phone pop-up
 * (`InstallPrompt.svelte`, mounted once in the root layout) and the permanent
 * Install app key in the home header (`InstallAppKey.svelte`). Both read this
 * module and nothing else, so they cannot disagree about whether an install is
 * possible, and neither owns the browser event.
 *
 * THE EVENT IS CAUGHT IN `src/app.html`, NOT HERE, AND THAT IS FORCED. Chromium
 * fires `beforeinstallprompt` once per page load, after the load event and a
 * manifest check. A listener attached when a component mounts, or when this
 * module is first imported, can arrive after it on a slow machine, and the
 * event is then gone until the next full page load. So a few lines of inline
 * script in the document head are the ONE listener (for it and for
 * `appinstalled`), and they keep what they caught in `window.__ideaInstall`,
 * the mailbox below. This module adds no listener for either event: a second
 * one is the race this design exists to remove, and `tests/install-app.test.ts`
 * runs the real inline script and asserts that this module never listens.
 *
 * A STASHED EVENT CAN BE PROMPTED EXACTLY ONCE. `promptInstall` takes the event
 * out of the mailbox BEFORE it calls `prompt()`, so a second press (the key and
 * the pop-up both on screen, or a double click) finds nothing and answers
 * `unavailable` instead of calling `prompt()` twice, which the browser refuses
 * with an exception. If Chromium offers again later it fires a new event, the
 * inline listener stashes it, and both readers hear about it.
 *
 * THE DECISIONS ARE PURE (`installPlatform`, `installKeyMode`,
 * `installPopupMode`) and take plain values, so every branch is testable with
 * no browser. The runtime half is thin: read the mailbox and the environment,
 * and tell subscribers when either moves.
 */

/** Chromium's install event. Not in the DOM typings. */
export interface BeforeInstallPromptEvent extends Event {
	/** Opens the browser's own install dialog. Newer engines resolve it with the choice. */
	prompt: () => Promise<InstallChoice | void>;
	/** Resolves with what the person chose in that dialog. */
	userChoice?: Promise<InstallChoice>;
}

export interface InstallChoice {
	outcome: 'accepted' | 'dismissed';
	platform?: string;
}

/**
 * What `src/app.html`'s inline script keeps (its three fields), plus the one
 * this module writes: `prompted`, true once a stashed event has been shown and
 * the person said no in the browser's dialog.
 */
export interface InstallMailbox {
	event: BeforeInstallPromptEvent | null;
	installed: boolean;
	notify: (() => void) | null;
	prompted?: boolean;
}

/** The global the inline script writes. One spelling, read by the test as well. */
export const INSTALL_MAILBOX = '__ideaInstall';

/** The pop-up's own once-and-dismissed memory. The header key never reads it. */
export const INSTALL_POPUP_DISMISSED_KEY = 'idea_pwa_prompt_dismissed';

/**
 * THE WORDS, ONCE. The iOS sentence is the pop-up's original text, split at the
 * one place a picture of the Share icon is drawn inline, so the pop-up and the
 * key's card say the same thing and neither carries a copy. The Mac sentence
 * is its desktop twin, for Safari's own Add to Dock.
 */
export const INSTALL_COPY = {
	title: 'Install IDEA',
	key: 'Install app',
	androidBody: 'Add IDEA to your home screen for quick, full-screen access.',
	ios: {
		lead: 'Tap the Share icon',
		action: 'Add to Home Screen',
		tail: 'to install IDEA on your device.'
	},
	mac: {
		lead: 'Click the Share icon',
		action: 'Add to Dock',
		tail: 'to install IDEA on your Mac.'
	},
	/* After the browser's own dialog was shown and declined, the page cannot
	   open it again until the browser offers again (a new page load), but the
	   browser's own controls still can. */
	menu: 'Your browser can still install IDEA. Look for Install or Add to Home screen in its menu, or the install icon in the address bar.'
} as const;

export type InstallSteps = { lead: string; action: string; tail: string };

/** The sentence a step list reads as, with no glyph: what a screen reader and a test hear. */
export function installSentence(steps: InstallSteps): string {
	return `${steps.lead}, then "${steps.action}" ${steps.tail}`;
}

export type InstallPlatform = 'ios' | 'android' | 'mac-safari' | 'other';

export interface InstallEnv {
	userAgent: string;
	/** `navigator.maxTouchPoints`: how iPadOS, which reports a Mac, is told apart from one. */
	maxTouchPoints: number;
}

/**
 * The first Safari that only ships on a macOS with Add to Dock. Safari 17 and
 * 18 also run on macOS Ventura and Monterey, which have no Add to Dock, and the
 * user agent cannot tell them apart (it freezes the macOS version at 10_15_7).
 * Safari 26 runs only on Sonoma and later, so from 26 the menu item is certain.
 */
export const MAC_SAFARI_DOCK_VERSION = 26;

/**
 * WHICH KIND OF BROWSER THIS IS, for installing and nothing else.
 *
 * iPadOS 13 and later reports itself as a Mac, so a Mac user agent with touch
 * points is an iPad. Every browser on iOS can add to the Home Screen from its
 * Share sheet, so every iOS user agent is `ios`, as it was in the pop-up.
 */
export function installPlatform(env: InstallEnv): InstallPlatform {
	const ua = env.userAgent || '';
	if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
	if (/Macintosh/.test(ua) && env.maxTouchPoints > 1) return 'ios';
	if (/Android/.test(ua)) return 'android';
	if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(ua)) {
		const v = /Version\/(\d+)/.exec(ua);
		if (v && Number(v[1]) >= MAC_SAFARI_DOCK_VERSION) return 'mac-safari';
	}
	return 'other';
}

export interface InstallSnapshot {
	/** False during the server render, when nothing about the browser is known. */
	known: boolean;
	/** Running as the installed app (`display-mode: standalone`, or iOS's `navigator.standalone`). */
	standalone: boolean;
	/** `appinstalled` fired in this page, or the person accepted the browser's dialog. */
	installed: boolean;
	/** A stashed `beforeinstallprompt` is waiting to be prompted. */
	canPrompt: boolean;
	/** The browser's dialog was shown in this page and declined. */
	prompted: boolean;
	platform: InstallPlatform;
}

export const UNKNOWN_INSTALL: InstallSnapshot = {
	known: false,
	standalone: false,
	installed: false,
	canPrompt: false,
	prompted: false,
	platform: 'other'
};

/**
 * WHAT THE HEADER KEY DOES, or null for no key.
 *
 * - The browser's own dialog whenever an event is waiting (desktop Chrome and
 *   Edge, Android Chrome), on any platform.
 * - The Share steps on iPhone and iPad, and on a Safari that has Add to Dock.
 * - Once the browser's dialog has been shown and declined in this page, a
 *   card pointing at the browser's own install controls, so the key is still
 *   there for somebody who changes their mind (the page cannot reopen the
 *   dialog until the browser offers again, which is a new event and puts the
 *   key back on `prompt`).
 * - Nothing when already installed or running installed, before anything is
 *   known, and in a browser with no install path a page can reach (Firefox,
 *   an older desktop Safari, a Chromium that has not offered).
 */
export type InstallKeyMode = 'prompt' | 'ios' | 'mac-safari' | 'menu';

export function installKeyMode(s: InstallSnapshot): InstallKeyMode | null {
	if (!s.known || s.standalone || s.installed) return null;
	if (s.canPrompt) return 'prompt';
	if (s.platform === 'ios') return 'ios';
	if (s.platform === 'mac-safari') return 'mac-safari';
	if (s.prompted) return 'menu';
	return null;
}

/**
 * WHAT THE PHONE POP-UP SHOWS, or null. Its behaviour is the pop-up's as it
 * was before the key existed: phones only, once, gone for good when dismissed
 * or installed. Its dismissal is ITS OWN memory and never reaches the key.
 */
export type InstallPopupMode = 'ios' | 'android';

export function installPopupMode(s: InstallSnapshot, dismissed: boolean): InstallPopupMode | null {
	if (!s.known || dismissed || s.standalone || s.installed) return null;
	if (s.platform === 'ios') return 'ios';
	if (s.platform === 'android' && s.canPrompt) return 'android';
	return null;
}

/* ------------------------------------------------------------------ runtime */

type InstallWindow = Window & { [INSTALL_MAILBOX]?: InstallMailbox };

function currentWindow(): InstallWindow | null {
	return typeof window === 'undefined' ? null : (window as InstallWindow);
}

function mailbox(win: InstallWindow | null): InstallMailbox | null {
	const box = win?.[INSTALL_MAILBOX];
	return box && typeof box === 'object' ? box : null;
}

function isStandalone(win: InstallWindow): boolean {
	let display = false;
	try {
		display = typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches;
	} catch {
		display = false;
	}
	const ios = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
	return display || ios;
}

/** Everything both readers need, read fresh every time. */
export function readInstall(win: InstallWindow | null = currentWindow()): InstallSnapshot {
	if (!win) return UNKNOWN_INSTALL;
	const box = mailbox(win);
	return {
		known: true,
		standalone: isStandalone(win),
		installed: box?.installed === true,
		canPrompt: !!box?.event,
		prompted: box?.prompted === true,
		platform: installPlatform({
			userAgent: win.navigator?.userAgent ?? '',
			maxTouchPoints: win.navigator?.maxTouchPoints ?? 0
		})
	};
}

const subscribers = new Set<() => void>();
let wiredWindow: InstallWindow | null = null;
let displayQuery: MediaQueryList | null = null;

function broadcast() {
	for (const fn of [...subscribers]) {
		try {
			fn();
		} catch {
			// One reader throwing must not stop the other hearing about it.
		}
	}
}

function onDisplayChange() {
	broadcast();
}

function wire(win: InstallWindow) {
	if (wiredWindow === win) return;
	wiredWindow = win;
	const box = mailbox(win);
	if (box) box.notify = broadcast;
	/* Chrome moves a tab into the app's own window after an install from the
	   address bar, and `display-mode` then changes under the same document. */
	try {
		displayQuery = typeof win.matchMedia === 'function' ? win.matchMedia('(display-mode: standalone)') : null;
		displayQuery?.addEventListener?.('change', onDisplayChange);
	} catch {
		displayQuery = null;
	}
}

function unwire() {
	const box = mailbox(wiredWindow);
	if (box && box.notify === broadcast) box.notify = null;
	try {
		displayQuery?.removeEventListener?.('change', onDisplayChange);
	} catch {
		// Nothing to undo.
	}
	displayQuery = null;
	wiredWindow = null;
}

/**
 * Hear about every change: an event stashed or used, an install, a move into
 * the app window. Returns the unsubscribe. The mailbox's `notify` points here
 * while anybody is listening, and is handed back when the last one leaves.
 */
export function subscribeInstall(fn: () => void, win: InstallWindow | null = currentWindow()): () => void {
	if (!win) return () => {};
	subscribers.add(fn);
	wire(win);
	return () => {
		subscribers.delete(fn);
		if (subscribers.size === 0) unwire();
	};
}

/**
 * THE HEADER KEY'S CARD IS OPEN, and the phone pop-up steps aside while it is,
 * so the same Share steps are never on screen twice (review round 1: on a first
 * iPhone visit the card at the top and the pop-up at the bottom said the same
 * sentence together). It is page state, not the pop-up's memory: nothing is
 * stored, and the pop-up comes back when the card closes unless it was
 * dismissed. The key is its one writer; the pop-up reads it on every change.
 */
let cardOpen = false;

export function setInstallCardOpen(open: boolean) {
	if (cardOpen === open) return;
	cardOpen = open;
	broadcast();
}

export function installCardOpen(): boolean {
	return cardOpen;
}

/**
 * A PANEL A PERSON OPENS OVER THE PAGE ASKS THE POP-UP TO STEP ASIDE WHILE IT
 * IS OPEN, by the same rule as the key's card: page state, nothing stored,
 * back the moment the last asker lets go unless it was dismissed. The askers
 * are the feedback window (integration review, ledger 0396) and the header's
 * Quick note panel (integration review 3): the pop-up floats at 1000 over
 * everything, so with either on screen it was drawn OVER their controls
 * (Cancel and Send on an iPad, the contact field on an iPhone, Dictate on a
 * phone on its side; the note's Save, Open notebook and Hide this button on a
 * 320px phone). A new panel of that kind, one somebody opened to work in, is
 * a third asker; a tooltip or a menu passing by is not. Stepping aside rather than painting
 * the window higher, because the window is a modal and a toast has no
 * business on screen beside one, and because a higher window would also bury
 * what is meant to sit over it (GAUNTLET's own cursor layer is drawn at 900,
 * over the window, while the native cursor is hidden there).
 *
 * Returns the release; releasing twice is a no-op. Subscribers hear only a
 * change in the answer `installPopupAside` gives.
 */
const asides = new Set<object>();

export function stepInstallPopupAside(): () => void {
	const token = {};
	const was = installPopupAside();
	asides.add(token);
	if (installPopupAside() !== was) broadcast();
	return () => {
		const before = installPopupAside();
		if (!asides.delete(token)) return;
		if (installPopupAside() !== before) broadcast();
	};
}

/** Whether the phone pop-up is stepped aside: the key's card, or any other asker. */
export function installPopupAside(): boolean {
	return cardOpen || asides.size > 0;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/**
 * Open the browser's own install dialog with the stashed event.
 *
 * The event leaves the mailbox before `prompt()` is called, so a second caller
 * gets `unavailable` and the browser never sees `prompt()` twice. `accepted`
 * marks the mailbox installed at once (the browser's `appinstalled` follows and
 * says the same thing), so both readers drop their offer straight away.
 * The mailbox is marked `prompted` as the event is taken, so while the dialog
 * is up and after it is declined the key points at the browser's own install
 * controls (`installKeyMode`) instead of leaving the header.
 */
export async function promptInstall(win: InstallWindow | null = currentWindow()): Promise<InstallOutcome> {
	const box = mailbox(win);
	const event = box?.event;
	if (!box || !event) return 'unavailable';
	/* Taken out, and marked shown, in one step: the key never blinks out of
	   the header while the browser's dialog is up. */
	box.event = null;
	box.prompted = true;
	broadcast();
	let choice: InstallChoice | null = null;
	try {
		const answered = await event.prompt();
		choice = answered && typeof answered === 'object' && 'outcome' in answered ? answered : null;
		if (!choice && event.userChoice) choice = await event.userChoice;
	} catch {
		choice = null;
	}
	if (choice?.outcome === 'accepted') {
		box.installed = true;
		broadcast();
		return 'accepted';
	}
	return 'dismissed';
}
