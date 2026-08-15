import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { itemBodyColumns } from '$lib/server/classroom-doc';
import type { RequestHandler } from './$types';

/**
 * Dev-only: runs the REAL item-body sanitizer for /dev/classroom.
 *
 * The harness fakes every save transport in memory, but the editor -> stored
 * document translation is server code and must not be re-implemented in a
 * harness -- a second copy of a sanitizer is exactly the kind of duplicate
 * that quietly stops matching. So the fake transports call this instead, and
 * what the harness stores and renders is what the real route would have
 * stored: real editor output, real normalization, real renderer.
 *
 * It returns the plain-text projection alongside the document for the same
 * reason the real route sends both -- the harness's own item rows carry the
 * two columns the table does.
 *
 * 404s in production like every other /dev route, and it writes nothing
 * anywhere -- it is a pure function behind a POST.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404);

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ ok: false, error: 'Expected a JSON body.' }, { status: 400 });
	}

	const result = itemBodyColumns(body.bodyDoc ?? null);
	return result.ok
		? json({ ok: true, body: result.body, doc: result.doc })
		: json({ ok: false, error: result.error }, { status: 400 });
};
