import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

/**
 * Deliberately standalone, NOT an extension of vite.config.ts: loading the
 * app's plugin chain (which shells out to `git log` to build the changelog
 * substrate) would only add startup cost and failure modes.
 *
 * THE SVELTE PLUGIN IS HERE FOR EXACTLY ONE JOB: server-rendering a real
 * component into an HTML string, so a test can assert what a student's browser
 * actually receives rather than asserting the data structure a renderer is
 * given and hoping. `svelte/server`'s `render()` needs no DOM and no browser,
 * so nothing about the `environment: 'node'` setup changes and no new
 * dependency was added -- `svelte` and this plugin were already here. Compiling
 * .svelte files for every run costs a few hundred milliseconds against the
 * ~7 seconds each DB file already spends booting Postgres.
 *
 * The aliases below are the minimum needed to import a REAL server route
 * handler (rather than a copy of it) into a test: SvelteKit's `$lib` path and
 * its `$env/dynamic/private` module. Nothing else from the app's build is
 * pulled in.
 *
 * `virtual:site-versions` is the third, and it is here for the same reason as
 * the svelte plugin: the two surfaces that render the build stamp import that
 * id, so without a stand-in neither can be imported and the one thing worth
 * asserting about them -- that they render the SAME stamp -- cannot be
 * asserted. The stub derives its data from the real `buildSiteVersions` rather
 * than hard-coding a shape; see its own note.
 */
export default defineConfig({
	plugins: [svelte({ compilerOptions: { hmr: false } })],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
			'$env/dynamic/private': fileURLToPath(
				new URL('./tests/stubs/env-dynamic-private.ts', import.meta.url)
			),
			'virtual:site-versions': fileURLToPath(
				new URL('./tests/stubs/site-versions.ts', import.meta.url)
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
