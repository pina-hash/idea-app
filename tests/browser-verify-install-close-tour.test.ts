/**
 * THE INSTALL SPECS' CLOSE_TOUR STEP SETTLES ONLY ONCE THE TOUR IT CLOSES HAS
 * COME (ledger 0396, integration review 3).
 *
 * `tools/browser-verify/routes/_install-key.mjs`'s CLOSE_TOUR called the page
 * settled after ten quiet polls (about a second) with no tour on screen. Under
 * load that was met before the signed-out orientation tour had mounted: "1 OF
 * 1 Sign in with Google" arrived about 2s later and stayed, so the install
 * specs' hit tests ran under its callout and its dimmed page, and nothing
 * reported it. The step now reads HomeTour's own rule off the page: a signed-out
 * page (the Google sign-in control the tour points at is in the header) with no
 * `TOUR_SEEN_KEY` record still has a tour coming, however quiet it has been.
 *
 * A TEST BECAUSE THE HARNESS IS OUTSIDE `npm test` (its README), and a step that
 * settles early prints `ok` and reads exactly like one that waited. The
 * predicate's SOURCE is evaluated here against a stub page, poll by poll, as
 * the runner evaluates it; the literals it carries are pinned against the app's
 * own constants so the two cannot drift.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { SIGNIN_STEP, TOUR_SEEN_KEY } from '../src/lib/tour/orientation';

/* Through a computed URL, never a literal specifier: a literal pulls the
   harness JS into svelte-check's program (CLAUDE.md, Testing). */
let CLOSE_TOUR: { waitFor: string };
beforeAll(async () => {
	const mod = await import(/* @vite-ignore */ new URL('../tools/browser-verify/routes/_install-key.mjs', import.meta.url).href);
	CLOSE_TOUR = mod.CLOSE_TOUR;
});

/** A stub page: whether it is signed out, whether a tour is on screen, and the visitor's storage. */
function stubPage({ signedOut, hydrated = true }: { signedOut: boolean; hydrated?: boolean }) {
	const store = new Map<string, string>();
	const state = { tour: false, closes: 0 };
	const tourX = {
		click() {
			// The tour's X: the tour closes and HomeTour records it as seen.
			state.tour = false;
			state.closes += 1;
			store.set(TOUR_SEEN_KEY, 'close');
		}
	};
	const document = {
		querySelector(sel: string) {
			if (sel === '[data-testid="tour-close"]') return state.tour ? tourX : null;
			if (sel === SIGNIN_STEP.target) return signedOut ? {} : null;
			return null;
		}
	};
	const window: Record<string, unknown> = { __ideaInstall: hydrated ? { notify() {} } : {} };
	const localStorage = { getItem: (k: string) => store.get(k) ?? null };
	const poll = (src: string) => new Function('document', 'window', 'localStorage', `return (${src})();`)(document, window, localStorage) === true;
	return { state, poll, store };
}

describe('CLOSE_TOUR', () => {
	it('carries the app\'s own seen key and sign-in hook', () => {
		expect(CLOSE_TOUR.waitFor).toContain(`'${TOUR_SEEN_KEY}'`);
		expect(CLOSE_TOUR.waitFor).toContain(SIGNIN_STEP.target);
	});

	it('is never settled on a signed-out first visit before its tour has come, however long the page is quiet', () => {
		const page = stubPage({ signedOut: true });
		let settled = 0;
		for (let i = 0; i < 40; i++) if (page.poll(CLOSE_TOUR.waitFor)) settled += 1;
		// The old step settled on poll 10 here: that is the defect.
		expect(settled).toBe(0);

		// The tour mounts (about 2s in, under load); the step closes it with its X.
		page.state.tour = true;
		expect(page.poll(CLOSE_TOUR.waitFor)).toBe(false);
		expect(page.state.closes).toBe(1);
		const after: boolean[] = [];
		for (let i = 0; i < 12; i++) after.push(page.poll(CLOSE_TOUR.waitFor));
		// A quiet second after the close, and then settled.
		expect(after.indexOf(true)).toBe(9);
	});

	it('keeps the quiet second for a signed-in page, which this rule sends no tour, and for a visitor who has seen it', () => {
		const signedIn = stubPage({ signedOut: false });
		const polls: boolean[] = [];
		for (let i = 0; i < 12; i++) polls.push(signedIn.poll(CLOSE_TOUR.waitFor));
		expect(polls.indexOf(true)).toBe(9);

		const returning = stubPage({ signedOut: true });
		returning.store.set(TOUR_SEEN_KEY, 'finish');
		const polls2: boolean[] = [];
		for (let i = 0; i < 12; i++) polls2.push(returning.poll(CLOSE_TOUR.waitFor));
		expect(polls2.indexOf(true)).toBe(9);
	});

	it('waits for the app to hydrate first', () => {
		const page = stubPage({ signedOut: false, hydrated: false });
		for (let i = 0; i < 20; i++) expect(page.poll(CLOSE_TOUR.waitFor)).toBe(false);
	});
});
