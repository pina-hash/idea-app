import { configDefaults, defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import IdeaSequencer from './tests/db/sequencer';

/**
 * Deliberately standalone, NOT an extension of vite.config.ts: loading the
 * app's plugin chain (which shells out to `git log` to build the changelog
 * substrate) would only add startup cost and failure modes.
 *
 * THE SVELTE PLUGIN IS HERE FOR TWO JOBS NOW, AND THEY NEED DIFFERENT BUILDS
 * OF SVELTE, WHICH IS THE WHOLE REASON THIS FILE HAS PROJECTS IN IT.
 *
 *  1. Server-rendering a real component into an HTML string, so a test can
 *     assert what a student's browser actually receives rather than asserting
 *     the data structure a renderer is given and hoping. `svelte/server`'s
 *     `render()` needs no DOM and no browser. Twenty-two files do this today.
 *  2. MOUNTING a real component so its `$effect`s actually run, which is the
 *     only way to prove a reactivity claim behaviourally. `mount()` lives in
 *     svelte's CLIENT build and needs a DOM.
 *
 * `svelte`'s export map is `{ browser: './src/index-client.js', default:
 * './src/index-server.js' }`, so which of those two a test gets is decided by
 * ONE resolve condition. Setting `browser` repo-wide would silently move all
 * twenty-two SSR files onto the client build as a side effect -- the exact
 * failure this file is meant to make impossible -- so the two live in separate
 * PROJECTS instead, and each project asserts which build it got (see
 * `tests/vitest-project-node.test.ts` and `tests/dom/vitest-project-dom.test.ts`).
 *
 * ROUTING IS BY DIRECTORY, AND IT IS OPT-IN. `tests/dom/**` is the DOM project;
 * everything else under `tests/` is the node project and resolves EXACTLY as it
 * did before this split existed. No existing file moved and no existing file
 * changed meaning. A future file lands in the right project because putting it
 * somewhere is the act of choosing, not a rule to remember: a mount test written
 * outside `tests/dom/` fails on its first run with `lifecycle_function_unavailable`
 * naming `mount`, which is loud and self-correcting. The silent direction -- a
 * non-DOM test written INSIDE `tests/dom/` -- is what the two identity files
 * above exist to catch. See `tests/dom/README.md`.
 *
 * The aliases below are the minimum needed to import a REAL server route
 * handler (rather than a copy of it) into a test: SvelteKit's `$lib` path and
 * its `$env/dynamic/private` module. `$app/environment` joins them because three
 * renderers branch on `dev` for a diagnostic, and without a stand-in none of
 * them can be imported here at all. Nothing else from the app's build is pulled
 * in.
 *
 * `virtual:site-versions` is the third, and it is here for the same reason as
 * the svelte plugin: the two surfaces that render the build stamp import that
 * id, so without a stand-in neither can be imported and the one thing worth
 * asserting about them -- that they render the SAME stamp -- cannot be
 * asserted. The stub derives its data from the real `buildSiteVersions` rather
 * than hard-coding a shape; see its own note.
 *
 * Both projects get the SAME aliases and the SAME plugin options, from the two
 * factories below, so the only thing that differs between them is the DOM and
 * the resolve condition. A second alias list is a second thing to keep in step.
 */

const alias = {
	$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
	'$env/dynamic/private': fileURLToPath(
		new URL('./tests/stubs/env-dynamic-private.ts', import.meta.url)
	),
	// The Foundry host branch and the bundle proxy read the apps host and
	// the app origin at call time through this module, so without a
	// stand-in neither the real hook helper nor the real route handler can
	// be imported here.
	'$env/dynamic/public': fileURLToPath(
		new URL('./tests/stubs/env-dynamic-public.ts', import.meta.url)
	),
	'$app/environment': fileURLToPath(new URL('./tests/stubs/app-environment.ts', import.meta.url)),
	// The shared Disclosure reads the viewer's id off `page.data` so that
	// a remembered panel is remembered per person, in ONE place rather
	// than through every caller's props. Two components already covered
	// by render tests mount it, so without this stand-in those tests
	// cannot import them.
	'$app/state': fileURLToPath(new URL('./tests/stubs/app-state.ts', import.meta.url)),
	// Both of these are reached by server-rendering the REAL home page:
	// Avatar -> profile.ts reads the storage URL at import time, and
	// ProfileMenu imports invalidateAll for its sign-out path. Without them
	// the page cannot be imported here and its section order cannot be
	// asserted against the shipping component.
	'$env/static/public': fileURLToPath(
		new URL('./tests/stubs/env-static-public.ts', import.meta.url)
	),
	'$app/navigation': fileURLToPath(new URL('./tests/stubs/app-navigation.ts', import.meta.url)),
	'virtual:site-versions': fileURLToPath(new URL('./tests/stubs/site-versions.ts', import.meta.url))
};

/**
 * A FRESH plugin instance per project. vite-plugin-svelte keeps per-instance
 * state (its compile cache among it), and the two projects compile the same
 * `.svelte` files to DIFFERENT output -- server-generated for one, client for
 * the other -- so handing both projects one shared instance is asking a single
 * cache to hold two answers for one key.
 */
const sveltePlugin = () => svelte({ compilerOptions: { hmr: false } });

export default defineConfig({
	test: {
		/**
		 * ORDERING IS A ROOT CONCERN AND MUST STAY HERE, NOT INSIDE A PROJECT.
		 *
		 * Measured: with `sequence.sequencer` declared on the node project
		 * instead, vitest IGNORED it -- `db-isolation-b` ran BEFORE
		 * `db-isolation-a` and B's positive control reported 0 neighbouring
		 * databases, failing. That is the isolation proof's own tripwire doing
		 * its job, and it is the reason `tests/db/sequencer.ts` exists at all:
		 * the pair only means something in order. Sequencing spans the whole
		 * run, so vitest reads it from the root config; a per-project copy is
		 * silently inert.
		 *
		 * See tests/db/sequencer.ts. Nothing else about the default order moves.
		 */
		sequence: { sequencer: IdeaSequencer },
		projects: [
			{
				plugins: [sveltePlugin()],
				resolve: { alias },
				test: {
					name: 'node',
					environment: 'node',
					include: ['tests/**/*.test.ts'],
					// `tests/dom/**` is the OTHER project. Spelled on top of vitest's
					// own defaults rather than replacing them, so node_modules and the
					// build output stay excluded too.
					exclude: [...configDefaults.exclude, 'tests/dom/**'],
					// ONE embedded Postgres for the whole run, booted here rather than in
					// each file's beforeAll. See tests/db/cluster.ts for why this is
					// globalSetup and not a module-level cache. It is on THIS project
					// alone: nothing in `tests/dom/` touches a database, and a second
					// project asking for the cluster would boot a second one.
					globalSetup: ['./tests/db/cluster.ts'],
					// Each file creates its own DATABASE on the shared cluster and applies
					// the migration chain to it (~0.3s), but the hook budget stays generous:
					// the first file also waits on the one-time cluster boot.
					hookTimeout: 180_000,
					testTimeout: 30_000
				}
			},
			{
				plugins: [sveltePlugin()],
				resolve: {
					alias,
					/**
					 * THE ONE LINE THE WHOLE SPLIT EXISTS FOR. `browser` is what makes
					 * `svelte` resolve to `src/index-client.js`, which is where `mount`,
					 * `flushSync` and a real effect scheduler live. Scoped to this
					 * project so the twenty-two SSR files resolve exactly as they always
					 * have.
					 *
					 * `svelte/server` is unaffected either way -- its export map has a
					 * `default` and no `browser` key -- so a `render()` call means the
					 * same thing in both projects. Measured, not assumed; both identity
					 * files assert it.
					 */
					conditions: ['browser']
				},
				test: {
					name: 'dom',
					environment: 'happy-dom',
					include: ['tests/dom/**/*.test.ts'],
					testTimeout: 30_000
				}
			}
		]
	}
});
