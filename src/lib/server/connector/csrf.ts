/**
 * SVELTEKIT'S CROSS-SITE FORM CHECK, RESTATED WITH TWO EXEMPTIONS, because the
 * connector's OAuth token and revocation endpoints are form-urlencoded POSTs
 * from Claude's servers, which send no Origin header -- and SvelteKit's
 * built-in check refuses exactly that, in production only, with no per-route
 * switch. `svelte.config.js` therefore turns the built-in check off
 * (`csrf.trustedOrigins: ['*']`) and `hooks.server.ts` runs this guard FIRST,
 * which is the built-in rule byte for byte (a POST, PUT, PATCH or DELETE whose
 * content type is a form type and whose Origin is not this origin is refused
 * 403) except for the paths in `CSRF_EXEMPT_PATHS`.
 *
 * WHY THE EXEMPTION IS SAFE, AND WHY A BLANKET ONE WOULD NOT BE. The token and
 * revocation endpoints read no cookie and act on no session: they act on a
 * code or a token in the body, which a cross-site page does not have. Every
 * other route keeps the check, which matters here because a student bundle on
 * apps.ideabosco.com is SAME-SITE with ideabosco.com, so the session cookies
 * (SameSite=Lax) would ride a cross-origin form post from it; the origin check
 * is what refuses that. tests/connector-csrf.test.ts holds both directions.
 */
import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';

export const CSRF_EXEMPT_PATHS: readonly string[] = ['/connector/token', '/connector/revoke'];

const FORM_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/x-sveltekit-formdata'];

function isFormContentType(request: Request): boolean {
	const type = (request.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
	return FORM_TYPES.includes(type);
}

export function csrfForbidden(request: Request, url: URL): boolean {
	if (CSRF_EXEMPT_PATHS.includes(url.pathname)) return false;
	return (
		isFormContentType(request) &&
		['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
		request.headers.get('origin') !== url.origin
	);
}

export const connectorCsrfGuard: Handle = async ({ event, resolve }) => {
	if (!dev && csrfForbidden(event.request, event.url)) {
		const message = `Cross-site ${event.request.method} form submissions are forbidden`;
		if (event.request.headers.get('accept') === 'application/json') {
			return new Response(JSON.stringify({ message }), { status: 403, headers: { 'content-type': 'application/json' } });
		}
		return new Response(message, { status: 403, headers: { 'content-type': 'text/plain' } });
	}
	return resolve(event);
};
