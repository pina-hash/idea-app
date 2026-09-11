import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * OAuth (PKCE) callback. Google redirects here with a `code` query param,
 * which we exchange for a session. The session cookies are written by the
 * server Supabase client configured in hooks.server.ts.
 */

/** Where a caller who asked for nothing, or for something refused, is sent. */
const DEFAULT_NEXT = '/dashboard';

/**
 * The base `?next=` is resolved against. It is deliberately a name that can
 * never resolve: the only question being asked is whether the value MOVES the
 * origin, and a real hostname here would make the answer depend on which
 * deployment is running.
 */
const RELATIVE_BASE = 'https://idea-app.invalid';

/**
 * `?next=` IS A REDIRECT TARGET AND WAS UNVALIDATED, WHICH MADE THIS AN OPEN
 * REDIRECT ON THE ONE ROUTE WHERE ONE IS WORTH THE MOST. The hop happens
 * immediately AFTER a successful sign-in, from a link that is genuinely on our
 * own domain, to a student who has just signed in to a Google page -- so
 * `?next=https://evil.example` lands them somewhere else at the exact moment
 * the flow has taught them it is safe.
 *
 * The rule is: a SAME-ORIGIN RELATIVE PATH, or `/dashboard`. There is no
 * allowlist of external hosts and there must not be one -- the callback exists
 * to put somebody back where they were on this site, and every legitimate value
 * it has ever carried is a path.
 *
 * Exported under the `_` prefix SvelteKit requires of a non-method export from
 * a `+server.ts`, so each refusal can be asserted by name. A redirect validator
 * whose only test is the happy path is a validator nobody has tested.
 */
export function _safeNext(raw: string | null | undefined): string {
	if (!raw) return DEFAULT_NEXT;

	// A browser STRIPS tab, newline and carriage return from a URL before
	// resolving it, so a tab between the slashes reads as a path here and leaves
	// the browser as `//evil.example` -- protocol-relative, somebody else's
	// host. Refused rather than stripped: stripping is how this function's idea
	// of what the string says and the browser's come to differ.
	if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_NEXT;

	// A backslash is a forward slash to a URL parser, so `\/\/host`, `/\host`
	// and `\\host` are all protocol-relative in a browser and none of them looks
	// like it here.
	if (raw.includes('\\')) return DEFAULT_NEXT;

	// One leading slash, never two. Two is protocol-relative (`//evil.example`),
	// which inherits our scheme and goes off-site; a scheme (`https:`,
	// `javascript:`, `data:`) has no leading slash at all, so the same line
	// refuses it.
	if (!raw.startsWith('/') || raw.startsWith('//')) return DEFAULT_NEXT;

	// Belt to those braces: resolve it and confirm the origin did not move. The
	// parse is what catches a form nobody above thought of.
	let resolved: URL;
	try {
		resolved = new URL(raw, RELATIVE_BASE);
	} catch {
		return DEFAULT_NEXT;
	}
	if (resolved.origin !== RELATIVE_BASE) return DEFAULT_NEXT;

	return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export const GET: RequestHandler = async ({ url, locals: { supabase } }) => {
	const code = url.searchParams.get('code');
	const next = _safeNext(url.searchParams.get('next'));

	if (code) {
		const { error } = await supabase.auth.exchangeCodeForSession(code);
		if (!error) {
			redirect(303, next);
		}
	}

	redirect(303, '/auth/error');
};
