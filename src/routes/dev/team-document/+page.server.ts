import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { STUDENTS } from './_fake';
import type { PageServerLoad } from './$types';

/**
 * THE TWO-TEAMMATE HARNESS (ledger 0436). `?as=s1` is a student's page, the
 * real session, gate, bar and frame over the team fixture document;
 * `?as=teacher` is the control panel (post, unpost, move) a browser pass uses
 * as the People tab. Dev only.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const as = url.searchParams.get('as') ?? 's1';
	const student = STUDENTS.find((s) => s.id === as) ?? null;
	return { as, student, students: STUDENTS };
};
