import type { LayoutServerLoad } from './$types';
import { signedInEmail } from '$lib/certifications/student/load';

/**
 * THE PORTAL'S LAYOUT LOAD (ledger 0391, DECISIONS D13 and D14): who is signed
 * in and whether they may reach the desk. `/certifications` is NOT in
 * `hooks.server.ts`'s `authedPrefixes`, because `/certifications/verify` is
 * public under the same prefix, so the layout renders its own sign-in panel
 * for a signed-out visitor on every other page.
 *
 * `cert_is_certifier` is the desk gate (0260). A `PGRST202` (the migration
 * not applied yet) reads as false, as does any other failure: a Desk key
 * offered to somebody the desk would 404 is a control whose only answer is a
 * refusal. The desk's own layout re-checks the gate on the server regardless.
 *
 * No `url` read, so nothing here reruns on a query change.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	const email = signedInEmail(locals.claims);
	let isCertifier = false;
	if (locals.claims) {
		try {
			const { data, error } = await locals.supabase.rpc('cert_is_certifier');
			isCertifier = !error && data === true;
		} catch {
			isCertifier = false;
		}
	}
	return { signedIn: !!locals.claims, email, isCertifier };
};
