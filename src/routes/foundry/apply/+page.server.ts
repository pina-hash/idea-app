import { publisherRead, type FoundryPublisherStatus } from '$lib/foundry/publisher';
import type { PageServerLoad } from './$types';

/**
 * THE TRUSTED-PUBLISHER APPLICATION, THE STUDENT'S HALF (report 6d076258,
 * ledger 0360).
 *
 * ONE READ, AS THE CALLER, with no identity parameter: `foundry_publisher_status`
 * answers about `auth.uid()` and nobody else, and carries the prompts but never
 * which ones are tricks or which answers are red flags.
 *
 * IT LOCATES TO `mine` (`$lib/foundry/nav`), so a class closure does not reach
 * it -- applying to publish is about the student's own standing, not about a
 * game running during somebody's lesson. The whole-Foundry switch still does:
 * the layout renders its panel in place of this page, and the RPC refuses
 * `foundry_off` on its own.
 *
 * `PGRST202` IS A DEPLOYMENT WITHOUT 0230, a real state for the few minutes
 * between the deploy and the apply; the page then says the feature is not on
 * yet instead of failing.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const { data, error } = await locals.supabase.rpc('foundry_publisher_status');
	return { publisher: publisherRead<FoundryPublisherStatus>(data, error) };
};
