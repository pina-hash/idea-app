import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { devState } from '../../fixture';
import type { RequestHandler } from './$types';

/**
 * The harness's `/api/coin/me`. Whether the visitor is signed in (and whether
 * they are a student) comes from the cookies `/dev/coins` sets from its own
 * `?signedIn=` / `?student=` query, so the page's endpoint URLs stay exactly
 * what production's are apart from the path prefix.
 */
export const GET: RequestHandler = async ({ cookies, setHeaders }) => {
	if (!dev) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });

	devState.signedIn = cookies.get('dev_coins_signed_in') === '1';
	devState.isStudent = cookies.get('dev_coins_student') !== '0';

	if (!devState.signedIn) return json({ signedIn: false });
	return json({
		signedIn: true,
		isStudent: devState.isStudent,
		name: 'Lovelace, Ada',
		section: 'IDEA-113',
		studentId: 'aa11bb22cc33dd44ee55ff6600112233'
	});
};
