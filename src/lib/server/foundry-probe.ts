/**
 * TEMPORARY DIAGNOSTIC INSTRUMENTATION FOR THE BUNDLE PROXY.
 *
 * DELETE THIS FILE AND EVERY CALL TO IT once the production 404 is diagnosed.
 * It exists for exactly one measurement and is not a logging convention.
 *
 * WHY IT HAS TO EXIST AT ALL. Every refusal on the apps host is the same
 * bodyless 404 -- a wrong host, a missing secret, a bad signature, an expired
 * token, a row that is not there and a storage read that failed are all
 * indistinguishable from outside, which is the correct behaviour and is
 * exactly why the production failure cannot be diagnosed by request. The
 * response does not change; the server log gains a line saying which branch
 * answered.
 *
 * WHAT IT MUST NEVER LOG, and the redaction is enforced here rather than
 * remembered at each call site:
 *
 *   - the token. `event.url.pathname` CONTAINS it (`/r/<token>/<path>`), so a
 *     pathname must never be logged raw. `redactProxyPath` is what a call site
 *     logs instead.
 *   - the token secret, the service-role key, any signature material, or any
 *     part of a key. A secret is reported as PRESENCE AND LENGTH ONLY
 *     (`presence`), which is enough to tell "unset in this environment" from
 *     "set", and carries none of the value.
 *
 * IT CANNOT AFFECT WHAT IT MEASURES. Every call is wrapped: a throw inside the
 * instrumentation would turn the thing being diagnosed into a different
 * failure, which is the one outcome that would make this useless.
 */

/** One structured line, greppable in the Vercel function log as `FOUNDRY_PROBE`. */
export function foundryProbe(stage: string, fields: Record<string, unknown>): void {
	try {
		console.log(`FOUNDRY_PROBE ${JSON.stringify({ stage, ...fields })}`);
	} catch {
		/* instrumentation never affects the thing it measures */
	}
}

/**
 * A secret, reported as the only two facts about it that are safe to write
 * down: whether the deployment has one, and how long it is. The length is what
 * separates "unset" from "set to an empty string" from "set to something
 * truncated by a paste".
 */
export function presence(value: string | null | undefined): { set: boolean; len: number } {
	const v = typeof value === 'string' ? value : '';
	return { set: v.length > 0, len: v.length };
}

/**
 * A proxy pathname with the token replaced by its LENGTH.
 *
 * `/r/<token>/assets/app.js` -> `/r/<token:85>/assets/app.js`. The shape, the
 * trailing slash and the file path all survive -- which is the whole question
 * being asked here -- and the credential does not.
 */
export function redactProxyPath(pathname: string): string {
	const m = /^\/r\/([^/]*)(\/.*)?$/.exec(pathname);
	if (!m) return pathname;
	const rest = m[2] ?? '';
	return `/r/<token:${m[1].length}>${rest}`;
}
