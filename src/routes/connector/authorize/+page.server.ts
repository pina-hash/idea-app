/**
 * THE CONSENT STEP: the site's own session is the sign-in. Not under
 * `authedPrefixes` (the prefix guard's redirect would drop the query), so a
 * signed-out visitor gets the site's sign-in panel and comes back to this same
 * address. A signed-in account that is not a site admin gets 404, the same
 * answer as a page that does not exist. An admin gets the consent card.
 */
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isAdmin } from '$lib/server/admin';
import { connectorDeps } from '$lib/server/connector/deps';
import { denyRedirect, issueCode, validateAuthorize } from '$lib/server/connector/oauth';

function signedIn(claims: App.Claims | null): { id: string; email: string } | null {
	const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
	return claims?.sub && email ? { id: claims.sub, email } : null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const deps = await connectorDeps();
	const check = await validateAuthorize(url.searchParams, url.origin, deps);
	if (!check.ok && check.redirect) redirect(303, check.redirect);
	const user = signedIn(locals.claims);
	if (user && !(await isAdmin(locals.supabase, user.id))) error(404, 'Not found');
	return {
		signedIn: user !== null,
		email: user?.email ?? null,
		query: url.searchParams.toString(),
		problem: check.ok ? null : check.problem,
		request: check.ok
			? { clientName: check.request.clientName, redirectHost: check.request.redirectHost, clientId: check.request.clientId }
			: null
	};
};

async function decide(url: URL, request: Request, locals: App.Locals) {
	const form = await request.formData();
	const query = String(form.get('q') ?? '');
	const deps = await connectorDeps();
	const check = await validateAuthorize(new URLSearchParams(query), url.origin, deps);
	if (!check.ok) return { check: null as null, problem: check.problem, deps, user: null };
	const user = signedIn(locals.claims);
	if (!user || !(await isAdmin(locals.supabase, user.id))) error(404, 'Not found');
	return { check, problem: null, deps, user };
}

export const actions: Actions = {
	connect: async ({ url, request, locals }) => {
		const d = await decide(url, request, locals);
		if (!d.check || !d.user) return fail(400, { problem: d.problem });
		const to = await issueCode(d.user, d.check.request, d.deps);
		redirect(303, to);
	},
	deny: async ({ url, request, locals }) => {
		const d = await decide(url, request, locals);
		if (!d.check) return fail(400, { problem: d.problem });
		redirect(303, denyRedirect(d.check.request));
	}
};
