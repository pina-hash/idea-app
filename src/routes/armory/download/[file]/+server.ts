import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { streamArmoryReleaseFile } from '$lib/server/armory/releases';

/**
 * Streams one file of the latest Armory agent release from the private
 * pina-hash/idea-armory repository to a signed-in browser. The token is the
 * server's (`$lib/server/armory/releases.ts`) and never reaches the browser.
 */
export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.claims) redirect(303, '/armory/download');
	return streamArmoryReleaseFile(params.file);
};
