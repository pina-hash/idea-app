/**
 * THE ORIGIN SPLIT: which host is this request on, and what may that host serve.
 *
 * Student bundles must never execute on the origin that holds a signed-in
 * student's session. They are served from a SECOND HOST instead
 * (`PUBLIC_FOUNDRY_APPS_HOST`, `apps.ideabosco.com` in production), which is
 * the same Vercel project and therefore the same deployment.
 *
 * TWO ORIGINS RATHER THAN ONE HOST PLUS A HEADER, and the difference is
 * subresource cookies. A header governs scripting and document origin; it does
 * not govern whether a subresource request carries credentials. A bundle
 * containing `<img src="/api/whatever">` served same-host reaches the real
 * backend with the viewer's cookies attached. Served cross-site it reaches a
 * host that reaches nothing.
 *
 * THE HOST IS SAFE TO BRANCH ON, AND THAT WAS MEASURED RATHER THAN ASSUMED.
 * Against the live deployment, using SvelteKit's own pre-routing CSRF check as
 * the probe (it compares the `Origin` header against `event.url.origin`, so a
 * 403 vs a 405 reports what `event.url.origin` actually is):
 *
 *   POST apps.ideabosco.com, Origin: apps.ideabosco.com  -> 405 (reached routing)
 *   POST apps.ideabosco.com, Origin: ideabosco.com       -> 403 Cross-site
 *   POST ideabosco.com,      Origin: ideabosco.com       -> 405
 *   POST ideabosco.com,      Origin: apps.ideabosco.com  -> 403 Cross-site
 *
 * So `event.url.host` tracks the host the client actually asked for, and is not
 * rewritten upstream. It is also NOT FORGEABLE by a header, which was the
 * second measurement: sending `X-Forwarded-Host: apps.ideabosco.com` to
 * ideabosco.com left `url.origin` on the main host (403 for an apps Origin,
 * 405 for a main one), and the reverse was true too. Vercel overwrites the
 * forwarding header with the real host before the function sees it.
 *
 * `event.url.host` is therefore the value this module is fed, and it is the
 * same value SvelteKit's own CSRF boundary trusts. A browser pins the `Host`
 * header to the URL it navigated to, so it is the browser's own idea of which
 * origin it is on.
 *
 * This module is PURE and client-safe: it reads no environment and imports
 * nothing, so the harness, the tests and the hook all judge a host with one
 * copy of the rule.
 */

/** The token-prefixed bundle proxy. Apps host ONLY. */
export const FOUNDRY_PROXY_PREFIX = "/r";

/**
 * Platform assets: the fonts a bundle is allowed to reference by absolute
 * path. Apps host ONLY -- on the main host this 404s like the proxy does, so
 * the one absolute path in the build contract has exactly one meaning.
 */
export const FOUNDRY_PLATFORM_PREFIX = "/_platform";

/**
 * A host is compared lowercased and without a trailing dot (`example.com.` is
 * the same name as `example.com` and a browser will send either). The PORT IS
 * PART OF THE COMPARISON and is deliberately not stripped: locally the two
 * origins are `localhost:5173` and `127.0.0.1:5173`, which differ only in the
 * host part, but a configured value carrying a port must still match exactly.
 */
export function normalizeHost(host: string | null | undefined): string {
	return (host ?? "").trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Whether this request is on the bundle host.
 *
 * FAILS CLOSED ON AN UNCONFIGURED DEPLOYMENT. With `PUBLIC_FOUNDRY_APPS_HOST`
 * unset there is no second origin, so nothing is the apps host -- and because
 * the proxy is reachable only on the apps host, an unconfigured deployment
 * serves no bundles at all rather than serving them from the main origin.
 */
export function isFoundryAppsHost(
	requestHost: string | null | undefined,
	configuredHost: string | null | undefined,
): boolean {
	const configured = normalizeHost(configuredHost);
	if (!configured) return false;
	return normalizeHost(requestHost) === configured;
}

/**
 * THE SHAPE THE PROXY ACTUALLY SERVES, NOT THE PREFIX IT SITS UNDER.
 *
 * `/r/{token}/{path}`, where `{path}` may be empty -- the bundle ROOT
 * (`/r/{token}/`) is the entry file. So a proxy path is a `/r` with a
 * non-empty token segment AND the slash that follows it. Nothing else.
 *
 * THIS USED TO BE A PREFIX TEST, AND THAT WAS A HOLE, measured on production
 * rather than reasoned about. `pathname === "/r"` passed the allowlist, the
 * apps host handed it to the SvelteKit router, the router has no route at
 * `/r`, and SvelteKit answered with the root `+error.svelte` -- the whole
 * portal, booting on the bundle origin: 33 client modules fetched from
 * `apps.ideabosco.com`, and `userProfile` in the inlined payload, which is the
 * root `+layout.server.ts` key and therefore proof that a session read was
 * attempted on the one origin that exists so that cannot happen.
 *
 * MATCHING THE SERVED SHAPE IS WHAT CLOSES IT, rather than naming `/r` as a
 * special case. The hook now refuses every `/r` that is not a request for a
 * file in a bundle, so the router is never reached and there is no shape left
 * for a future route under `/r` to become reachable through.
 *
 * IT IS A SHAPE TEST AND NOT A TOKEN TEST, deliberately. The token's charset,
 * its signature and its expiry are `$lib/server/foundry-token`'s to judge, and
 * a second copy of "what a valid token looks like" here is the copy that stops
 * matching. This asks only whether the URL could name a bundle file; the proxy
 * decides whether it does, and refuses identically either way.
 *
 * THE SLASHLESS `/r/{token}` IS ALLOWED THROUGH, AND REFUSING IT WAS A BUG
 * THAT BLANKED EVERY PUBLISHED APP. It used to be refused here on the grounds
 * that it closed a small oracle -- the route verified the token BEFORE
 * redirecting to the slash form, so a good token answered 307 where a bad one
 * answered 404. The oracle was real; refusing the path was the wrong lever.
 *
 * The frame requests the bundle ROOT and nothing else, so anything that
 * normalizes a trailing slash anywhere between the browser and this function
 * delivers `/r/{token}` -- and this predicate then answered a BODYLESS 404
 * before the route's own 307 could run. Measured against the real adapter
 * output: `/r/{token}/` and `/r/{token}/index.html` both serve 200, and
 * `/r/{token}` answered 404 with the database never consulted, which is this
 * line and only this line.
 *
 * THE ORACLE IS CLOSED WHERE IT WAS OPENED INSTEAD: the route now redirects
 * the slashless form to the slash form BEFORE it verifies anything, so a good
 * token and a garbage one both answer 307 and the redirect discloses nothing.
 * See `src/routes/r/[token]/[...path]/+server.ts`.
 *
 * What stays refused is every shape that names no token at all: `/r`, `/r/`
 * and `/r//...`. Those are the shapes that used to reach the router and get
 * answered by the portal's own error page.
 */
export function isFoundryProxyPath(pathname: string): boolean {
	const prefix = FOUNDRY_PROXY_PREFIX + "/";
	if (!pathname.startsWith(prefix)) return false;
	const afterPrefix = pathname.slice(prefix.length);
	const slash = afterPrefix.indexOf("/");
	// `/r/{token}` with nothing after it: the bundle root, spelled without its
	// slash. Allowed so the route can redirect it; refused when the token
	// segment is empty, which is the bare `/r/`.
	if (slash === -1) return afterPrefix.length > 0;
	// `/r/{token}/...`: the token segment must be non-empty, so `/r//...`
	// falls out here.
	return slash > 0;
}

/** `/_platform` and anything under it. */
export function isFoundryPlatformPath(pathname: string): boolean {
	return (
		pathname === FOUNDRY_PLATFORM_PREFIX ||
		pathname.startsWith(FOUNDRY_PLATFORM_PREFIX + "/")
	);
}

/**
 * THE WHOLE APPS-HOST ALLOWLIST, in one expression.
 *
 * Everything else on that host is a 404 -- the app's own routes, its API, its
 * auth endpoints. An unrecognised path is never handed to the SvelteKit
 * router: the hook answers it, so a route added later cannot ship reachable on
 * the bundle origin by forgetting anything.
 */
export function appsHostAllows(pathname: string): boolean {
	return isFoundryProxyPath(pathname) || isFoundryPlatformPath(pathname);
}

/**
 * THE MAIN HOST ASKS A DIFFERENT QUESTION, AND IT IS THE BROADER ONE.
 *
 * `appsHostAllows` asks "does this URL name a file the proxy serves", because
 * on the bundle host anything else must never reach the router. Here the
 * question is "does this path belong to the bundle host AT ALL", because on
 * the session-bearing origin the whole `/r` and `/_platform` namespace is
 * somebody else's -- so it is answered by PREFIX, and the prefix is wider than
 * the served shape on purpose.
 *
 * TWO PREDICATES IS NOT TWO COPIES OF ONE RULE. Tying the main-host denial to
 * the served shape was measured to open exactly one path: narrowing
 * `isFoundryProxyPath` to `/r/{token}/` left a bare `/r` matching no route on
 * either host, so on the main host it stopped being intercepted and rendered
 * the ordinary 404 page (171,045 bytes in dev) instead of the bodyless refusal
 * it had always given. Harmless in itself -- `/nope` renders the same 171,048
 * bytes -- but it means a route added at `/r/<anything>` later would ship
 * REACHABLE on the main host, which is the half of the split that makes it a
 * boundary rather than a convention.
 *
 * So each host gets the predicate its own job needs, and both are strictly
 * tighter than the single prefix test that used to serve both.
 */
export function isFoundryHostNamespace(pathname: string): boolean {
	return (
		pathname === FOUNDRY_PROXY_PREFIX ||
		pathname.startsWith(FOUNDRY_PROXY_PREFIX + "/") ||
		isFoundryPlatformPath(pathname)
	);
}
