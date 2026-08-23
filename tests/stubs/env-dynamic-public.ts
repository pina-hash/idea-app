/**
 * Stands in for SvelteKit's `$env/dynamic/public` under vitest, aliased in
 * vitest.config.ts.
 *
 * Faithful rather than convenient, exactly like the private stand-in beside
 * it: the real module is a live read at call time, and the Foundry host branch
 * reads `PUBLIC_FOUNDRY_APPS_HOST` INSIDE each call, so a test can set
 * process.env before calling and get the behaviour a deployment would give.
 */
export const env = process.env as Record<string, string | undefined>;
