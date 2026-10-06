import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { installerDownload, streamArmoryReleaseFile } from '$lib/server/armory/releases';

/**
 * "GET THE WINDOWS APP" IS ONE CLICK (ledger 0366). In order: a public release
 * sends the browser straight to GitHub's own download; a private one is
 * streamed with the server's token, to a signed-in browser; and with neither,
 * the setup page says to ask for the flash drive. `x-armory-download` names
 * the branch taken, so production's choice is readable from one request.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const choice = await installerDownload();
	if (choice.branch === 'public') {
		return new Response(null, {
			status: 302,
			headers: { location: choice.url, 'x-armory-download': 'public', 'cache-control': 'no-store' }
		});
	}
	if (choice.branch === 'token') {
		if (!locals.claims) redirect(303, '/armory/start');
		const streamed = await streamArmoryReleaseFile(choice.name);
		const headers = new Headers(streamed.headers);
		headers.set('x-armory-download', 'token');
		return new Response(streamed.body, { status: streamed.status, headers });
	}
	return new Response(null, {
		status: 303,
		headers: { location: '/armory/start?download=none#step-download', 'x-armory-download': 'none', 'cache-control': 'no-store' }
	});
};
