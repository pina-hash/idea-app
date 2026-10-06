import type { PageServerLoad } from './$types';
import { validateConnect } from '$lib/armory/connect';
import { signedInEmail } from '$lib/server/armory/page-loads';

/** Contract 3b. The query is the agent's; it is checked here by the same rules the start route uses. */
export const load: PageServerLoad = async ({ locals, url }) => {
	const q = url.searchParams;
	const checked = validateConnect(q.get('port') ?? '', q.get('state'), q.get('challenge'), q.get('device'));
	return {
		email: signedInEmail(locals.claims),
		request: checked.ok ? checked.request : null,
		problem: checked.ok ? null : checked.problem
	};
};
