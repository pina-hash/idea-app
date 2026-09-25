import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * The harness's stand-in for `GET /api/assignment-feedback`: one boolean, from
 * the cookie the harness page set, or a 503 for the "could not check" branch.
 * Same shape and the same `private, no-store` the real answer carries.
 */
export const GET: RequestHandler = ({ cookies }) => {
	if (!dev) error(404, 'Not found');
	const mode = cookies.get('dev_assignment_report');
	if (mode === 'fail') return json({ ok: false }, { status: 503, headers: { 'cache-control': 'no-store' } });
	return json({ signedIn: mode === '1' }, { headers: { 'cache-control': 'private, no-store' } });
};
