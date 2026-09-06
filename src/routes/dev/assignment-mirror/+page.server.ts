import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase, no network -- the harness
 * mounts the REAL `AssignmentEngine` with in-memory transports.
 *
 * IT RETURNS A `claims.sub`, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 * `AssignmentEngine` reads the viewer's id off `page.data.claims.sub` -- the
 * `Disclosure` rule, so "per person" is one rule in one place and no caller
 * threads an identity -- and `page.data` on a route includes that route's own
 * load data. So the harness puts a viewer behind the read the shipping
 * component already makes, rather than being handed a prop the real page does
 * not pass.
 *
 * `?viewer=` picks WHICH one, which is what lets the page demonstrate the
 * thing a key exists for: two students at one shared school desktop, whose
 * mirrors must never meet. A PAGE load may read `url`; only a layout load may
 * not.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const viewer = url.searchParams.get('viewer') === 'b' ? 'student-b' : 'student-a';
	return { claims: { sub: viewer } };
};
