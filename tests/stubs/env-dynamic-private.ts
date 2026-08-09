/**
 * Stands in for SvelteKit's `$env/dynamic/private` under vitest.
 *
 * Faithful rather than convenient: the real module is a live read of the
 * process environment at call time, which is exactly what this is. The
 * notebook Drive module reads its credentials through `env.X` INSIDE each
 * function (never at import time), so a test can set process.env before
 * calling and get the behaviour production would give.
 */
export const env = process.env as Record<string, string | undefined>;
