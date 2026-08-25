// src/lib/dev-routes.ts
//
// WHICH ROUTES ARE HARNESSES, AND WHAT A PRODUCTION BUILD PUTS THERE INSTEAD.
//
// THE RULE LIVES HERE, NOT IN `vite.config.ts`, for the reason the site-version
// rules do: a build config is the one file a test cannot reach, so it holds
// nothing worth testing. `vite.config.ts` only wires these two functions to a
// plugin hook.
//
// WHAT THIS IS FOR. `/dev/*` is ~50 harness routes that mount real components
// with sample data so interactive work can be verified without auth, without
// Supabase and without the network. Two of them go further: `/dev/login` is a
// PASSWORD sign-in against whatever project `.env` points at, and
// `/dev/classroom-upload` drives the real upload panel. They live in the repo
// that deploys ideabosco.com.
//
// THEY ALREADY 404 IN PRODUCTION, and it is worth being exact about why, because
// the reason is better than it looks: each one calls `if (!dev) error(404)`, and
// `dev` from `$app/environment` is not an environment variable -- SvelteKit
// replaces it with the literal `false` during `vite build`, so the compiled
// output is an unconditional `error(404, "Not found")` with the branch folded
// away. Nothing about that can be misconfigured on a deploy.
//
// WHAT WAS STILL WRONG. The guard fires at RUNTIME, which means the module has
// to exist to fire it: a production build compiled 105 dev route entry files
// totalling 720,149 bytes of harness code, fixtures and components into the
// server bundle, all of it unreachable. A guard that has to run is a guard that
// can be edited, forgotten on a new harness, or reached by anything that routes
// around the load function. So the harnesses are not compiled at all now: this
// module replaces each route entry's SOURCE with a 404 stub before the compiler
// sees it, and the replacement is keyed on `vite build` rather than on any value
// read at runtime.
//
// SVELTEKIT 2 HAS NO ROUTE-FILTER CONFIG (there is no `kit.routes` and no
// `excludeRoutes` in 2.66), so the route PATH still appears in the manifest.
// What is removed is everything behind it. The path answering 404 with an empty
// stub and the path not existing are the same answer to a caller, and the
// difference -- a few hundred bytes of manifest string -- is not worth mutating
// the working tree mid-build to erase.

/** Every route under this prefix is a dev harness. Slash-terminated on purpose. */
export const DEV_ROUTE_PREFIX = 'src/routes/dev/';

/**
 * The route ENTRY files SvelteKit loads for a route. Only these are replaced:
 * anything else under `src/routes/dev/` (a fixture, a helper, a sample module)
 * is reached only THROUGH one of these, so stubbing the entry drops it from the
 * module graph on its own. Stubbing a helper directly would be the one way to
 * break something outside `/dev` that happened to import it.
 */
const ENTRY_FILES = [
	'+page.svelte',
	'+page.ts',
	'+page.js',
	'+page.server.ts',
	'+page.server.js',
	'+layout.svelte',
	'+layout.ts',
	'+layout.js',
	'+layout.server.ts',
	'+layout.server.js',
	'+error.svelte',
	'+server.ts',
	'+server.js'
] as const;

/** Windows gives back backslashes; every comparison here is on forward slashes. */
const normalize = (id: string): string => id.replace(/\\/g, '/');

/** Is this module id a route entry file belonging to a dev harness? */
export function isDevRouteEntry(id: string): boolean {
	const path = normalize(id).split('?')[0];
	if (!path.includes(DEV_ROUTE_PREFIX)) return false;
	const name = path.slice(path.lastIndexOf('/') + 1);
	return (ENTRY_FILES as readonly string[]).includes(name);
}

/**
 * The source a production build compiles instead. Returns null for anything
 * that is not a dev route entry, so the caller can hand back `null` to Vite and
 * leave the module alone.
 *
 * A REAL MODULE, NOT AN EMPTY ONE. SvelteKit reads named exports off these, so
 * the stub exports exactly what the route kind needs and nothing else --
 * `.svelte` compiles to an empty component (vite-plugin-svelte still transforms
 * it, because this runs at `enforce: 'pre'`), and every load/handler answers
 * 404 the way the runtime guard used to.
 */
export function devRouteStub(id: string): string | null {
	if (!isDevRouteEntry(id)) return null;
	const path = normalize(id).split('?')[0];
	const name = path.slice(path.lastIndexOf('/') + 1);

	if (name.endsWith('.svelte')) {
		// An empty component. The load beside it answers 404 first, so this is
		// only ever the thing that is not rendered.
		return '<!-- dev-only harness, not built into production -->\n';
	}

	if (name.startsWith('+server.')) {
		// `fallback` catches every method, so there is no verb that answers 405
		// and thereby confirms the endpoint exists.
		return [
			"import { error } from '@sveltejs/kit';",
			'export const prerender = false;',
			"export const fallback = () => error(404, 'Not found');",
			''
		].join('\n');
	}

	return [
		"import { error } from '@sveltejs/kit';",
		'export const prerender = false;',
		"export const load = () => error(404, 'Not found');",
		''
	].join('\n');
}
