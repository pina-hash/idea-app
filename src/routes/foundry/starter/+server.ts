import { foundryStarterFile } from '$lib/foundry/preflight';
import type { RequestHandler } from './$types';

/**
 * THE STARTER FILE, HANDED OVER AS A DOWNLOAD.
 *
 * A `+server.ts` rather than a page, because the thing being delivered IS a
 * file: a student saves it, opens it in whatever tool they are working in, and
 * pastes their component into the marked spot. Rendering it as a page and
 * asking them to select-all would be the same bytes and a worse handover.
 *
 * IT IS GENERATED, NEVER STORED. `foundryStarterFile()` builds it from the same
 * registry the preflight enforces and the contract prints, so the tags in the
 * downloaded file are the paths this deployment actually serves. A committed
 * copy would be a second statement of the rules and would go stale on the first
 * version bump -- and go stale silently, because a starter that no longer
 * matches still looks like a starter.
 *
 * AUTHORIZATION IS THE PREFIX GUARD, and that is worth stating because the
 * usual rule here is that a `+server.ts` re-checks for itself: a route group's
 * LAYOUT load does not run for an endpoint. The `authedPrefixes` guard in
 * `hooks.server.ts` is not a layout load -- it is a hook, it runs for every
 * request including this one, and `/foundry` is on the list. Nothing in this
 * response is about the caller in any case: it is the same public document for
 * everyone, and the contract at `/foundry/contract` already prints its
 * contents.
 *
 * `no-store` because the file is generated per request from constants that move
 * with a deploy, and it costs a few kilobytes to always be right.
 */
export const GET: RequestHandler = async () => {
	const body = foundryStarterFile();
	return new Response(body, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			// `attachment` rather than the `download` attribute alone: the
			// attribute is a request the browser may ignore, and this is the
			// header that makes a save happen wherever the link is followed
			// from -- including a right-click, and including a paste of the URL.
			'content-disposition': 'attachment; filename="index.html"',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff'
		}
	});
};
