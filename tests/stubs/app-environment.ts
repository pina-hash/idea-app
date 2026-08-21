/**
 * A stand-in for SvelteKit's `$app/environment`, aliased in vitest.config.ts.
 *
 * WHY IT EXISTS AT ALL: three renderers now branch on `dev` to show a
 * diagnostic for a block type they do not know (SpecRenderer, ReferenceBlock,
 * MarkdownText). Without this module none of them can be imported under
 * `environment: 'node'`, which would take the existing SpecRenderer render
 * tests down with them.
 *
 * WHY IT IS A MUTABLE LIVE BINDING rather than a constant: the whole claim
 * worth testing about that branch is that it differs between dev and
 * production, and a constant can only ever prove one of the two. `export let`
 * is a live ESM binding, so a component that captured `dev` at import time
 * still reads the current value when it renders. `withDev()` below is the only
 * intended way to move it, because it restores the previous value in a
 * `finally` -- a test that threw mid-assertion would otherwise leave every
 * later test in this run on the other branch, which is the kind of harness
 * defect that makes a suite report things that are not true.
 *
 * `building` and `browser` are here only so the alias is a faithful stand-in
 * for the real module's shape; nothing under test reads them today.
 */
export let dev = false;
export const browser = false;
export const building = false;

export function setDev(value: boolean): void {
	dev = value;
}

/** Run `fn` with `dev` forced, and put it back however `fn` ends. */
export function withDev<T>(value: boolean, fn: () => T): T {
	const previous = dev;
	dev = value;
	try {
		return fn();
	} finally {
		dev = previous;
	}
}
