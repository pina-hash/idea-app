// tests/dom/feedback-load-failure-mount.test.ts
//
// A FEEDBACK WINDOW WHOSE CODE NEVER ARRIVES LEAVES NOTHING HELD (ledger 0396,
// integration review 3).
//
// The corner button's window is a separate chunk, fetched at mount and again on
// a press. A press set `open` before that chunk arrived, and a fetch that
// FAILED left `open` true with no window on screen: the phone install pop-up
// stayed stepped aside and a deploy reload stayed held for the rest of the
// visit, with nothing to close. Measured in the browser with the chunk's
// requests aborted: the pop-up gone after the press, after Escape, after five
// seconds and after a second press.
//
// The chunk is made to fail here by mocking the module the component imports
// dynamically with a factory that throws, which is what a failed fetch looks
// like to the `import()` (a rejection). Structure and state only, as
// everywhere in this directory.
//
// INTEGRATION REVIEW 4 MOVED TWO OF THESE ANSWERS. The sentence told the
// person to press the button again, and Chromium keeps a failed dynamic import
// (no request on either press once the network was back), so it now says to
// reload the page and carries the key that does. And the sentence sits just
// above the button, under the pop-up's layer, so on a first phone visit the
// pop-up hid the whole of it: the pop-up now steps aside WHILE THE SENTENCE IS
// ON SCREEN, and comes back when it goes. The deploy hold still lets go.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import InstallPrompt from '$lib/InstallPrompt.svelte';
import SiteFeedback from '$lib/feedback/SiteFeedback.svelte';
import { describeBuild, FEEDBACK_LOAD_FAILED, FEEDBACK_RELOAD } from '$lib/feedback/context';
import { INSTALL_MAILBOX, INSTALL_POPUP_DISMISSED_KEY } from '$lib/install-app';
import { activeDeployHolds } from '$lib/shell/deploy-safety';
import { mountInto, type Mounted } from './mount';

vi.mock('../../src/lib/feedback/FeedbackBox.svelte', () => {
	throw new Error('Failed to fetch dynamically imported module: FeedbackBox.svelte');
});

const Popup = InstallPrompt as unknown as Component<Record<string, unknown>>;
const Feedback = SiteFeedback as unknown as Component<Record<string, unknown>>;

const APP_HTML = readFileSync(join(__dirname, '..', '..', 'src', 'app.html'), 'utf8');
const CAPTURE = [...APP_HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => s.includes(INSTALL_MAILBOX))!;
const IPHONE =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

let mounted: Mounted[] = [];
const popup = () => document.querySelector<HTMLElement>('[data-install="popup"]');
const settle = async (m: Mounted) => {
	for (let i = 0; i < 4; i++) await m.settle();
};

beforeEach(() => {
	localStorage.clear();
	delete (window as unknown as Record<string, unknown>)[INSTALL_MAILBOX];
	new Function('window', CAPTURE)(window);
	Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => IPHONE });
	Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, get: () => 5 });
});

afterEach(async () => {
	for (const m of mounted) await m.stop();
	mounted = [];
});

function mountBoth(): { p: Mounted; f: Mounted } {
	const p = mountInto(Popup, {});
	const f = mountInto(Feedback, {
		routeId: '/',
		pathname: '/',
		build: describeBuild({ sha: 'a1b2c3d', complete: true }, null),
		submit: async () => ({ error: null, retryable: false })
	});
	mounted.push(p, f);
	return { p, f };
}

describe('a feedback window whose code fails to load', () => {
	it('says so with a Reload page key, holds no deploy reload, and keeps the install pop-up aside only while the sentence is up', async () => {
		const { p, f } = mountBoth();
		await settle(p);
		await settle(f);
		// The mount-time fetch has already failed: the sentence is up before any press, and the
		// pop-up is aside for it.
		expect(f.target.textContent).toContain('did not load');
		expect(popup(), 'the pop-up while the sentence is up at mount').toBeNull();

		const trigger = f.one<HTMLButtonElement>('.sfb-trigger');
		for (const press of ['first', 'second']) {
			trigger.click();
			await settle(f);
			await settle(p);
			// No window arrived, and the trigger says so in words, with the remedy that works.
			expect(f.all('.fb-box').length, `${press} press: a window`).toBe(0);
			expect(f.one('.sfb-load-failed .sfb-load-words').textContent).toBe(FEEDBACK_LOAD_FAILED);
			expect(FEEDBACK_LOAD_FAILED).toContain('reload the page');
			expect(FEEDBACK_LOAD_FAILED).not.toContain('press it again');
			const keys = f.all<HTMLButtonElement>('.sfb-load-failed button.sfb-reload');
			expect(keys.length, `${press} press: the Reload page key`).toBe(1);
			expect(keys[0].textContent?.trim()).toBe(FEEDBACK_RELOAD);
			// The pop-up stays aside while the sentence is on screen, and nothing else is held.
			expect(popup(), `${press} press: the pop-up over the sentence`).toBeNull();
			expect(activeDeployHolds(), `${press} press: a deploy hold`).not.toContain('a feedback box is open');
			expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();
		}

		// THE POSITIVE CONTROL: the sentence goes (the control with it), and the pop-up comes back,
		// never dismissed.
		await f.stop();
		await settle(p);
		expect(popup(), 'the pop-up once the sentence has gone').not.toBeNull();
		expect(localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY)).toBeNull();
	});
});
