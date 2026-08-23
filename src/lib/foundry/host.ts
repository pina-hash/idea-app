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

/** `/r` and anything under it. */
export function isFoundryProxyPath(pathname: string): boolean {
	return (
		pathname === FOUNDRY_PROXY_PREFIX ||
		pathname.startsWith(FOUNDRY_PROXY_PREFIX + "/")
	);
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
