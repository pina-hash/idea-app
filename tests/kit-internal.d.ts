/**
 * A TYPE STAND-IN FOR ONE SVELTEKIT INTERNAL, AND NOTHING ELSE.
 *
 * `tests/foundry-proxy.test.ts` drives the REAL exported `handle`, which
 * composes the main-host members with SvelteKit's own `sequence()`. `sequence`
 * reads the per-request store that `respond.js` installs around
 * `hooks.handle`, so a test driving the real thing has to install it too --
 * and the only way to do that is the same import `sequence.js` itself uses.
 *
 * The package ships that entry point with `types` pointing at a file that is
 * not a module, so TypeScript cannot read its shape. This declares the one
 * function used, faithfully: a store, a callback, the callback's result. It is
 * a d.ts and emits nothing, so it cannot change what runs.
 */
declare module '@sveltejs/kit/internal/server' {
	export function with_request_store<T>(store: unknown, fn: () => T): T;
}
