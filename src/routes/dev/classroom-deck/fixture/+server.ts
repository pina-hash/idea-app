import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { buildFixtureZip } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production): hands the browser a REAL deck zip so it
 * can upload one.
 *
 * The harness's whole point is that the bytes make the round trip -- built from
 * the committed deck at static/fsp/day2, downloaded, uploaded back in chunks
 * through the shipping uploader, and unpacked from what actually arrived. A
 * harness that rebuilt the fixture server-side at ingest time would prove the
 * unpacker and nothing about the transport.
 */
export const GET: RequestHandler = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const pad = Number(url.searchParams.get('pad') ?? 0);
	const zip = buildFixtureZip({
		withoutStateFile: url.searchParams.get('state') === 'off',
		ambiguous: url.searchParams.get('ambiguous') === '1',
		traversal: url.searchParams.get('traversal') === '1',
		padBytes: Number.isFinite(pad) && pad > 0 ? Math.min(pad, 120 * 1024 * 1024) : 0
	});

	return new Response(zip as unknown as BodyInit, {
		headers: {
			'content-type': 'application/zip',
			'content-length': String(zip.length),
			'cache-control': 'no-store'
		}
	});
};
