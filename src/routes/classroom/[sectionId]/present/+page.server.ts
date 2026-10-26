import { error, redirect } from '@sveltejs/kit';
import { itemTitle } from '$lib/classroom/classroom';
import type { PageServerLoad } from './$types';

/**
 * PRESENTATION CHECK-OFF FROM THE PHONE (ledger 0438, 0310's list). A manager's
 * page only: anybody else reads the same 404 the other teacher tabs answer, so
 * the page's existence is not confirmed. The list itself is read in the
 * browser through `classroom_presentation_queue`, which asks the same question
 * of the database again.
 */
export const load: PageServerLoad = async ({ parent, locals: { claims } }) => {
	if (!claims) redirect(303, '/');
	const { canManage, items } = await parent();
	if (canManage !== true) error(404, 'Not found');
	return {
		assignments: items.filter((i) => i.kind === 'assignment').map((i) => ({ id: i.id, title: itemTitle(i) }))
	};
};
