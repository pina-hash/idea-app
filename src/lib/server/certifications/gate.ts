import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { isAdmin } from '$lib/server/admin';
import { CERT_SITE_ORIGIN } from '$lib/certifications/nav';

/**
 * THE CERTIFICATION PORTAL'S TWO SERVER GATES, ONCE (ledger 0391).
 *
 * The shape is `requireFeedbackConsole` in `$lib/server/feedback-console.ts`:
 * a function a load or an API route calls as its first statement, which throws
 * SvelteKit's 404 for anybody it refuses. A non-certifier gets "Not found" and
 * never a 403 or a redirect, because the existence of the desk is not public
 * (CLAUDE.md, "Probing must reveal nothing"), and an anonymous caller gets the
 * same answer as a signed-in student.
 *
 * CONVENIENCE, NOT THE BOUNDARY. Every `cert_*` write re-checks the caller
 * inside its own body (`_cert_can_certify`, `is_admin()`), so a hand-rolled
 * PostgREST call is refused by the database whatever this answers. What the
 * gates buy is that a route never half-runs for somebody whose every call would
 * fail, and that the signing key is never read for a caller who may not award.
 *
 * BOTH FAIL CLOSED: an RPC error of any kind, a missing function included, is a
 * refusal. There is no pre-migration fallback here because there is nothing to
 * fall back to; before 0260 the portal has no certifiers.
 */

type Gate = Pick<App.Locals, 'supabase' | 'claims'>;

/** Admin, or any live row in `cert_authority` (`cert_is_certifier`, 0260). */
export async function requireCertifier({ supabase, claims }: Gate): Promise<void> {
	if (!claims) error(404, 'Not found');
	let allowed = false;
	try {
		const { data, error: rpcError } = await supabase.rpc('cert_is_certifier');
		allowed = !rpcError && data === true;
	} catch {
		allowed = false;
	}
	if (!allowed) error(404, 'Not found');
}

/** Site admin only (`is_admin()`, through the one server helper). */
export async function requireCertAdmin({ supabase, claims }: Gate): Promise<void> {
	if (!claims) error(404, 'Not found');
	let allowed = false;
	try {
		allowed = await isAdmin(supabase, claims.sub);
	} catch {
		allowed = false;
	}
	if (!allowed) error(404, 'Not found');
}

/**
 * The origin every absolute link a server module writes starts from: the
 * canonical production host, or the request's own origin while developing, so
 * an email sent from a dev server opens the dev server. A preview deployment
 * links to production on purpose: the links in an email outlive the preview.
 */
export function certSiteOrigin(url: URL): string {
	return dev ? url.origin : CERT_SITE_ORIGIN;
}
