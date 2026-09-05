import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { foundryClosedResponse } from '$lib/foundry/serve-gate';
import type { RequestHandler } from './$types';

/**
 * THE REFUSAL A CLOSED STUDENT READS WHEN THEY PRESS PREVIEW, SERVED SO IT CAN
 * BE MEASURED.
 *
 * WHY IT NEEDS A HARNESS AT ALL, when every other Foundry surface is a
 * component the `/dev/foundry-admin` page can mount: this refusal is not a
 * component. `foundryClosedResponse` builds a whole `Response` -- its own
 * document, its own stylesheet, its own CSP -- because it answers a request
 * for a FILE on a route with no layout, so there is nothing of the portal's
 * chrome around it to inherit type, colour or measure from. A harness that
 * mounted the same sentences inside the portal shell would be measuring a
 * page that does not exist.
 *
 * SO IT SERVES THE REAL BYTES. Same function, same fixture shape the panel
 * harness uses, at 375 and 1440 in `tools/browser-verify/routes/foundry-admin-refusal.mjs`.
 * A colour, a measure or a tap target read here is read off exactly what a
 * student's browser receives.
 *
 * 404 IN PRODUCTION, like every `/dev` route. This one is worth stating twice
 * because it is an endpoint rather than a page and no layout guard covers it:
 * the check is in the handler itself.
 *
 * THE FIXTURE IS TWO CLASSES, ONE WITH A NOTE AND ONE WITHOUT, which is the
 * same pairing `/dev/foundry-admin` uses -- the plural join in
 * `foundryClosedSentence` and the optionality of a note are both only visible
 * with two, and a one-class fixture renders the branch nobody ships into.
 */
export const GET: RequestHandler = async () => {
	if (!dev) error(404, 'Not found');
	return foundryClosedResponse([
		{
			section_id: '00000000-0000-4000-8000-000000000001',
			label: 'Block 3',
			course_title: 'Engineering I Honors',
			note: 'Bench work today. Ask me if you need the Foundry back.',
			closed_at: '2026-09-05T15:00:00.000Z'
		},
		{
			section_id: '00000000-0000-4000-8000-000000000002',
			label: 'Block 6',
			course_title: 'Engineering Design and Development',
			note: null,
			closed_at: '2026-09-05T15:02:00.000Z'
		}
	]);
};
