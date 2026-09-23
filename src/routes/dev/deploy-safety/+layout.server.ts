import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * DEV ONLY. 404 in production, no auth, no Supabase: every page of the deploy
 * safety harness sits under this layout, so the gate is stated once.
 *
 * IT RETURNS A `claims.sub` for the reason `/dev/assignment-mirror` does: the
 * real `AssignmentEngine` keys its draft mirror on the viewer it reads off
 * `page.data`, so the harness puts a viewer behind the read the shipping
 * component already makes. It reads no `url` (a layout load that did would
 * re-run on every navigation inside the harness).
 */
export const load: LayoutServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return { claims: { sub: 'student-deploy' } };
};
