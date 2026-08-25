import { createServerClient } from '@supabase/ssr';
import { type Handle, type HandleServerError, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { env as publicEnv } from '$env/dynamic/public';
import {
	appsHostAllows,
	isFoundryAppsHost,
	isFoundryHostNamespace,
	redactProxyPath
} from '$lib/foundry/host';

/**
 * Redirects old GitHub Pages base-path links to their new homes. Scoped to the
 * exact directory paths only, so the mirrored `static/IDEA/<icon>.png` files
 * (which are served directly and never reach this hook) are not shadowed.
 *
 * KEYED WITHOUT THE TRAILING SLASH, WHICH IS THE WHOLE REASON THIS WORKS.
 * SvelteKit normalizes `/IDEA/` to `/IDEA` and issues its own redirect BEFORE
 * a hook ever sees the request, so a map keyed on `/IDEA/` could never match
 * and every one of these links 404'd: `/IDEA/` -> `/IDEA` -> 404, and
 * `/IDEA/coins/` -> `/coins/` -> `/coins` -> 404. Measured, not assumed.
 *
 * The targets carry the explicit `index.html` for the same reason the Ledger's
 * own nav does: the Vite dev server does not resolve a bare directory to its
 * index (404) even though Vercel does, so a bare `/coins/` target would have
 * moved the 404 rather than removed it.
 */
const legacyPaths: Record<string, string> = {
	'/IDEA': '/',
	'/IDEA/coins': '/coins/index.html'
	// `/IDEA/entry/` used to redirect to the Sheets-backed coin entry tool. That
	// tool is retired (see docs/coin-economy/archive/legacy-system/), so the old
	// link now falls through to a 404 rather than pointing at nothing.
};

const legacyRedirects: Handle = async ({ event, resolve }) => {
	// Tolerate either spelling: the with-slash form is what old printed links
	// actually carry, and it is only SvelteKit's own normalization that usually
	// strips it before this runs.
	const path = event.url.pathname.replace(/\/+$/, '') || '/';
	const target = legacyPaths[path];
	if (target) {
		redirect(308, target);
	}
	return resolve(event);
};

/**
 * Creates a request-specific Supabase client that reads the Auth token from
 * the request cookies and writes refreshed cookies back on the response.
 */
const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			/**
			 * SvelteKit's cookies API requires `path` to be explicitly set.
			 * Setting it to `/` replicates standard cookie behavior.
			 */
			setAll: (cookiesToSet, headers) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
				if (Object.keys(headers).length > 0) {
					event.setHeaders(headers);
				}
			}
		}
	});

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * Supabase libraries use these headers, so pass them through.
			 */
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validates the session and guards protected routes on the server.
 *
 * `getClaims` validates the JWT signature locally only for projects using
 * asymmetric signing keys. This project (like most Supabase projects, which
 * default to legacy HS256/shared-secret signing) doesn't have those, so
 * `getClaims` transparently falls back to `getUser()` -- a live round trip to
 * the Auth server -- on every call. That round trip can transiently fail
 * right after a fresh OAuth sign-in (back-to-back requests to the Auth
 * server, a cold serverless start, ...), which would otherwise read as
 * "not signed in" until the user retries or refreshes. A couple of quick
 * retries survive that blip; a clean "no session" result (no error) is never
 * retried, so anonymous requests (most of this public-first site's traffic)
 * pay no extra cost.
 */
async function resolveClaims(supabase: App.Locals['supabase']): Promise<App.Claims | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const { data, error } = await supabase.auth.getClaims();
		if (data?.claims) return data.claims as App.Claims;
		if (!error) return null;
		if (attempt < 2) await sleep(150);
	}
	return null;
}

/**
 * Route prefixes that require a signed-in user. `/dashboard` is additionally
 * teacher-gated in its own load; `/gauntlet` (the CAD skills dojo), `/frc`
 * (the FRC Training track), and `/greenline` (the combat-racing game) are open
 * to any authenticated user. GAUNTLET's teacher-only authoring page is gated in
 * that page's load; GREENLINE's tuning panel is teacher-gated in its own load.
 * `/coin-balance` and `/contracts` are deliberately ABSENT now: both 308 to
 * the IDEA Coin Ledger, which is public tier, so an anonymous visitor has to
 * reach the redirect rather than being bounced to `/` before it.
 */
const authedPrefixes = [
	'/dashboard',
	'/gauntlet',
	'/frc',
	'/greenline',
	'/notebook',
	'/classroom',
	// Foundry is the signed-in tier: any account may publish, and every surface
	// under it is about the caller's own work. A redirect is correct because
	// the section's existence is not the secret.
	'/foundry'
];

const authGuard: Handle = async ({ event, resolve }) => {
	event.locals.claims = await resolveClaims(event.locals.supabase);

	// Protected tier: only authenticated users may reach these sections.
	const { pathname } = event.url;
	const needsAuth = authedPrefixes.some((p) => pathname === p || pathname.startsWith(p + '/'));
	if (!event.locals.claims && needsAuth) {
		redirect(303, '/');
	}

	return resolve(event);
};

/**
 * EVERYTHING THE MAIN HOST NEEDS, AND NOTHING THE BUNDLE HOST MAY HAVE.
 *
 * Kept as its own sequence so that the apps-host branch below can decline to
 * enter it at all. A member added here is added to the SESSION-BEARING ORIGIN
 * only, which is what the origin split has always claimed and, until this
 * shape existed, only half enforced.
 */
const mainHostChain: Handle = sequence(legacyRedirects, supabase, authGuard);

/**
 * TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
 *
 * Production has answered 404 for a published bundle across several rounds of
 * this, and every round so far was settled by READING the source and reasoning
 * about what the deployment must therefore do. Production runs the built
 * adapter output, not `src/`, and each time the reading was wrong. This line
 * and the one at the top of the proxy handler measure the two facts that are
 * still open: whether the SvelteKit router matched the route at all, and what
 * status the hook's own `resolve(event)` handed back.
 *
 * THE PATHNAME IS REDACTED WITH `redactProxyPath`, the same one `handleError`
 * uses, because on this host the pathname CONTAINS a live bundle token. Its
 * RAW LENGTH is logged beside it unredacted -- a token segment is ~114
 * characters, longer than anything any local fixture has used, so a truncation
 * or a re-encode anywhere upstream would show up here as a length that does
 * not match what was requested and would explain a router miss on its own.
 *
 * The host is logged as received alongside the configured value, so the
 * `isFoundryAppsHost` comparison is measured rather than inferred.
 */
const foundryProbe = (stage: string, event: { url: URL }, detail: string) => {
	const { pathname } = event.url;
	console.log(
		`[foundry-probe] ${stage} host=${event.url.host}` +
			` configured=${publicEnv.PUBLIC_FOUNDRY_APPS_HOST ?? '<unset>'}` +
			` path=${redactProxyPath(pathname)} rawlen=${pathname.length} ${detail}`
	);
};

/** The one refusal the bundle host ever gives: bodyless, cacheable by nobody. */
const foundryHostRefusal = () =>
	new Response(null, {
		status: 404,
		headers: { 'cache-control': 'private, no-store' }
	});

/**
 * THE ORIGIN SPLIT, AND IT IS THE WHOLE POLICY ON THE APPS HOST.
 *
 * `apps.ideabosco.com` is the same Vercel project and the same deployment as
 * `ideabosco.com`, so without this branch it serves the whole app: every route,
 * every API endpoint, the auth callback. This is what makes it serve student
 * bundles and nothing else.
 *
 * IT IS AN ALLOWLIST, NOT A BLOCKLIST, which is the only version of this that
 * stays true. `appsHostAllows` names the two prefixes that exist on that host
 * and everything else is a bodyless 404 -- so a route added next month is
 * unreachable there by DEFAULT, rather than reachable until somebody remembers
 * to add it to a list. The 404 is answered HERE, so an unrecognised path is
 * never handed to the SvelteKit router at all.
 *
 * AN ALLOWED APPS-HOST REQUEST GOES STRAIGHT TO THE ROUTER, AND SKIPPING THE
 * REST OF THE SEQUENCE IS THE POINT RATHER THAN AN OPTIMIZATION. This used to
 * be `sequence(foundryHostBranch, legacyRedirects, supabase, authGuard)`, and
 * in that shape the host branch could only refuse: an ALLOWED path called
 * `resolve(event)`, which in a `sequence` member means "run the next member",
 * so every request the bundle host actually serves went on to have a Supabase
 * client created for it, bound to that origin's cookies, and then a live
 * session read performed against the Auth server by `authGuard`. The comment
 * above it claimed the opposite -- that sequencing first meant no code path on
 * that host could read a session -- and that claim held only for the paths
 * this branch REFUSED. It now holds for all of them, because there is no
 * "after" on this host: the allowlist decides, the router serves, and no other
 * member observes the request.
 *
 * That also removes the class of failure this exists to end. Twice now a
 * component downstream of the hook has quietly changed what the bundle host
 * does, and both times the hook looked correct in isolation. Naming `/r` in
 * some later middleware's exemption list would leave the next one free to do
 * it again; declining to run any of them cannot be forgotten.
 *
 * AND THE PROXY IS UNREACHABLE ON THE MAIN HOST. `/r/*` and `/_platform/*` 404
 * there, so there is no URL on the session-bearing origin that serves a
 * bundle. Without that half, the split would be a convention rather than a
 * boundary: the bundle would simply be available on both.
 *
 * THE TWO BRANCHES ASK DIFFERENT QUESTIONS AND USE DIFFERENT PREDICATES.
 * `appsHostAllows` is the SHAPE the proxy serves (`/r/{token}/{path}`), so on
 * the bundle host nothing else reaches the router. `isFoundryHostNamespace` is
 * the PREFIX, so on the main host the whole `/r` and `/_platform` namespace is
 * refused whether or not it names a file. See `$lib/foundry/host.ts` for why
 * one predicate could not do both jobs.
 *
 * EVERY PATH ON THE APPS HOST REACHES THIS FUNCTION, and that is no longer
 * true by luck. Vercel answers `static/` and `_app/immutable/*` off its
 * filesystem WITHOUT INVOKING the function, so this hook used to bind only the
 * subset of requests the platform happened to hand it -- measured against
 * production, `apps.ideabosco.com/coins/index.html` served 200 with 177,019
 * bytes of text/html. `scripts/foundry-edge-routes.mjs` now inserts a
 * host-matched route at the FRONT of the generated Build Output route table
 * that sends every apps-host request here first. It could not be done from
 * `vercel.json`; that script's header carries the measurements that settled
 * it.
 *
 * EXPORTED, because `tests/foundry-proxy.test.ts` drives THIS -- the real
 * top-level handle -- with the real route handler as its `resolve`. Driving a
 * single member instead is what hid the continuation above for a whole lane:
 * a test that supplies its own `resolve` cannot see which members the real
 * composition would have run in between.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	/**
	 * TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
	 *
	 * THE FIRST STATEMENT IN `handle`, BEFORE ANY BRANCH. The previous round
	 * logged four handler lines and ZERO hook lines, which was read as "the
	 * hook never ran" -- but the only hook line on the allowed path sits AFTER
	 * `await resolve(event)`, so its absence is equally consistent with the
	 * hook running, entering the apps branch, and `resolve` throwing or never
	 * returning. Those are different bugs and the old instrumentation could not
	 * tell them apart. This line fires before anything can throw, so its
	 * presence or absence answers "did `handle` run" on its own.
	 *
	 * It is gated to the Foundry namespace and the apps host so it cannot flood
	 * the log with every main-host request. Both halves are needed: with
	 * `PUBLIC_FOUNDRY_APPS_HOST` unreadable at runtime `isFoundryAppsHost` is
	 * false for a real apps-host request, and only the pathname test would
	 * catch it.
	 */
	const onAppsHost = isFoundryAppsHost(event.url.host, publicEnv.PUBLIC_FOUNDRY_APPS_HOST);
	if (onAppsHost || isFoundryHostNamespace(pathname)) {
		foundryProbe(
			'hook-enter',
			event,
			`appsHost=${onAppsHost ? 'yes' : 'no'} allow=${appsHostAllows(pathname) ? 'yes' : 'no'}`
		);
	}

	if (onAppsHost) {
		if (!appsHostAllows(pathname)) {
			foundryProbe('hook', event, 'branch=apps allow=no status=404-refusal');
			return foundryHostRefusal();
		}
		/**
		 * TEMPORARY PROBE. REMOVE IT IN THE LANE THAT FIXES THE CAUSE.
		 *
		 * `resolve` is wrapped only so a THROW is distinguishable from a
		 * response, which is the other reading of a missing post-resolve line.
		 * The error is re-thrown unchanged so `handleError` still mints its
		 * correlation id and the caller still gets exactly what it got before.
		 */
		let response: Response;
		try {
			response = await resolve(event);
		} catch (err) {
			foundryProbe(
				'hook-throw',
				event,
				`branch=apps allow=yes error=${err instanceof Error ? err.name : typeof err}`
			);
			throw err;
		}
		foundryProbe('hook', event, `branch=apps allow=yes status=${response.status}`);
		return response;
	}

	if (isFoundryHostNamespace(pathname)) {
		foundryProbe('hook', event, 'branch=main-namespace status=404-refusal');
		return foundryHostRefusal();
	}

	return mainHostChain({ event, resolve });
};

/**
 * THE MINIMUM THAT MAKES A SERVER ERROR AND A REPORT ABOUT IT THE SAME EVENT.
 *
 * Until this existed, an unexpected throw fell to SvelteKit's default error
 * page: outside the app's chrome, carrying nothing, with a log line on the
 * server that nobody could tie to the report a student filed ten minutes later
 * ("the notebook broke"). The correlation id is the whole feature. It is minted
 * here, logged beside the route and the stack, handed to the page as
 * `page.error.id`, shown on the error boundary, and captured into the `meta` of
 * any report filed from it -- so the two rows join on one string.
 *
 * WHAT IS NOT DONE HERE, deliberately: no reporting service, no database write,
 * no attempt to read the session. `handleError` runs on a request that has
 * already gone wrong, and a second thing that can fail inside it turns a 500
 * into a 500 with no log line at all. `console.error` reaches the Vercel
 * function log, which is where a server error is already looked for.
 *
 * The returned MESSAGE stays generic. An internal error's real text can carry a
 * query, a path or a token, and this value is rendered to the caller.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	const id = crypto.randomUUID();
	/**
	 * THE PATHNAME IS REDACTED BEFORE IT IS LOGGED, because on the bundle host
	 * it CONTAINS a credential: `/r/{token}/{path}`, and that token is 30
	 * minutes of read access to a student's app. A function log is not the
	 * place for one. `redactProxyPath` replaces the token segment with its
	 * length and leaves every other path untouched, so the route, the shape and
	 * the requested file all still read normally.
	 */
	console.error(
		`[error ${id}] ${status} ${event.request.method} ${redactProxyPath(event.url.pathname)}` +
			` route=${event.route.id ?? 'none'}`,
		error
	);
	// 404s and other expected statuses keep their own words; only a genuine
	// internal failure gets the generic line.
	return { message: status === 500 ? 'Something went wrong on our side.' : message, id };
};
