/**
 * A stand-in for SvelteKit's `$app/state`, aliased in vitest.config.ts.
 *
 * WHY IT EXISTS: `Disclosure.svelte` reads the signed-in viewer's id off
 * `page.data` so a remembered panel is remembered PER PERSON, keyed in one
 * place rather than threaded through every caller. SpecRenderer and ItemDetail
 * both mount it, and both are server-rendered by tests in this suite, so
 * without a stand-in for this module neither can be imported here at all --
 * which would take the existing SpecRenderer render tests down with them.
 *
 * IT IS DELIBERATELY EMPTY. The tests that render through it are asserting the
 * DEFAULT state of a disclosure, which is what a first visit gets: no viewer,
 * nothing stored, nothing remembered. `setPageData` is here so a test that
 * needs a viewer can put one in and restore it, on the `withDev` pattern from
 * the `$app/environment` stub -- nothing needs it yet.
 */

export const page: { data: Record<string, unknown> } = { data: {} };

/** Run `fn` with `page.data` replaced, and put it back however `fn` ends. */
export function withPageData<T>(data: Record<string, unknown>, fn: () => T): T {
	const previous = page.data;
	page.data = data;
	try {
		return fn();
	} finally {
		page.data = previous;
	}
}
