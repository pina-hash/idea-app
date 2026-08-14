import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { deckPathOk } from '$lib/server/classroom-decks';
import { storedDeck } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production). The in-memory twin of
 * /api/classroom/deck/[deck_id]/[...path]: same URL SHAPE, same path rule, same
 * content types, same CSP -- so a deck's own relative fetches (including the
 * hidden `.image-slots.state.json`) resolve here exactly as they do in
 * production, and the viewer under test is the real one.
 *
 * What it deliberately does NOT have is the authorization half: there is no
 * session and no database here. That is covered by tests/classroom-decks.test.ts
 * driving the REAL route handler against real policies.
 */

const DECK_CSP = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
	"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
	"font-src 'self' data: https://fonts.gstatic.com",
	"img-src 'self' data: blob: https:",
	"media-src 'self' data: blob:",
	"connect-src 'self'",
	"frame-ancestors 'self'",
	"base-uri 'none'",
	"form-action 'none'"
].join('; ');

export const GET: RequestHandler = async ({ params }) => {
	if (!dev) error(404, 'Not found');

	const path = params.path ?? '';
	if (!deckPathOk(path)) return new Response('Not found', { status: 404 });

	const deck = storedDeck(params.deck_id);
	const file = deck?.byPath.get(path);
	if (!file) return new Response('Not found', { status: 404 });

	const headers = new Headers({
		'content-type': file.mimeType,
		'cache-control': 'private, max-age=600',
		'x-content-type-options': 'nosniff',
		'content-disposition': 'inline'
	});
	if (file.mimeType.toLowerCase().startsWith('text/html')) {
		headers.set('content-security-policy', DECK_CSP);
	}
	return new Response(file.bytes as unknown as BodyInit, { headers });
};
