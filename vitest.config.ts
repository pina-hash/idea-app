import { defineConfig } from 'vitest/config';

/**
 * Deliberately standalone, NOT an extension of vite.config.ts: these are
 * database tests with no Svelte, no DOM and no SvelteKit involved, and loading
 * the app's plugin chain (which shells out to `git log` to build the changelog
 * substrate) would only add startup cost and failure modes.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Each file boots its own embedded Postgres (initdb + a migration pass),
		// so the setup hook needs far more than the 10s default.
		hookTimeout: 180_000,
		testTimeout: 30_000
	}
});
