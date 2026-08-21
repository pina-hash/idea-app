/**
 * A stand-in for SvelteKit's `$app/navigation`, aliased in vitest.config.ts.
 *
 * WHY IT EXISTS: server-rendering the real home page reaches ProfileMenu, which
 * imports `invalidateAll` for its sign-out path. Without a stand-in the whole
 * page cannot be imported here, so the section-order assertions could not be
 * made against the shipping component at all.
 *
 * EVERY EXPORT IS A NO-OP THAT RECORDS ITSELF. Nothing under test navigates
 * during SSR; `calls` is here so a future test that expects one can assert it
 * happened rather than assuming, and `reset()` keeps that honest between tests.
 */

export const calls: { fn: string; args: unknown[] }[] = [];

export function reset(): void {
	calls.length = 0;
}

const record =
	(fn: string) =>
	async (...args: unknown[]) => {
		calls.push({ fn, args });
	};

export const invalidateAll = record('invalidateAll');
export const invalidate = record('invalidate');
export const goto = record('goto');
export const preloadData = record('preloadData');
export const preloadCode = record('preloadCode');
