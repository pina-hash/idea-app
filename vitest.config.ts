import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Deliberately standalone, NOT an extension of vite.config.ts: these are
 * database tests with no Svelte, no DOM and no SvelteKit involved, and loading
 * the app's plugin chain (which shells out to `git log` to build the changelog
 * substrate) would only add startup cost and failure modes.
 *
 * The two aliases below are the minimum needed to import a REAL server route
 * handler (rather than a copy of it) into a test: SvelteKit's `$lib` path and
 * its `$env/dynamic/private` module. Nothing else from the app's build is
 * pulled in.
 */
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/private': fileURLToPath(
				new URL('./tests/stubs/env-dynamic-private.ts', import.meta.url)
			)
		}
	},
	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Each file boots its own embedded Postgres (initdb + a migration pass),
		// so the setup hook needs far more than the 10s default.
		hookTimeout: 180_000,
		testTimeout: 30_000
	}
});
