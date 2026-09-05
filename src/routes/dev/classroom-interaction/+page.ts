import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the CLASSROOM TYPING COLLAPSE (prompt 0012). It mounts
 * the REAL `ItemDetail` -- and through it the real `AssignmentEngine`,
 * `SpecRenderer` and `Disclosure` -- against in-memory rows. No auth, no
 * Supabase, no network. 404s in production.
 *
 * WHY IT HAS TO BE A BROWSER: the defect is a `display: none` landing on an
 * ancestor of the focused element. `svelte-check` cannot see it, and
 * `tests/dom/` cannot either -- happy-dom has no layout engine, so nothing
 * there blurs on a hide and nothing there has a scroll position to lose. The
 * three things that go wrong (the panel shuts, focus is dropped, the viewport
 * jumps) are all only observable in a real engine.
 *
 * THE PAGE REPORTS RAW DOM FACTS AND DECIDES NOTHING. `#probe-*` reads
 * `document.activeElement`, `window.scrollY` and the real `aria-expanded`
 * attributes back out of the document. The pass/fail judgement is the browser
 * spec's (`tools/browser-verify/routes/classroom-interaction-*.mjs`), so the
 * harness cannot satisfy an assertion by agreeing with itself.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
