import { json } from '@sveltejs/kit';
import { downloadDriveFile, driveConfigured } from '$lib/server/notebook-drive';
import { deckPathOk } from '$lib/server/classroom-decks';
import { UUID_RE } from '$lib/server/notebook-upload';
import type { RequestHandler } from './$types';

/**
 * Serves ONE file out of ONE deck, by its path relative to the deck root.
 *
 * WHY THE URL LOOKS LIKE THIS. Every reference inside a Claude Design export is
 * relative and already correct, so the whole tree is served under one prefix and
 * the browser's own resolution does the rest: an iframe at
 * /api/classroom/deck/<id>/index.html asks for
 * /api/classroom/deck/<id>/_ds/.../styles.css and
 * /api/classroom/deck/<id>/.image-slots.state.json entirely on its own. No path
 * inside the deck is ever rewritten, and nothing here needs to know what any of
 * them mean.
 *
 * THE HIDDEN FILE IS AN ORDINARY REQUEST HERE, and it has to be: image-slot.js
 * fetches `.image-slots.state.json` by that exact relative name and applies the
 * per-image scale and pan it finds. Serve everything but that and every image
 * silently renders uncropped -- which looks plausible, not broken. Nothing in
 * this route treats a leading dot specially.
 *
 * RESOLVED THROUGH THE MANIFEST, NEVER BY LISTING DRIVE. The (deck_id, path)
 * pair is a unique index on classroom_deck_files (0101), so a served file costs
 * ONE indexed row read -- which is also the authorization -- and zero Drive
 * metadata calls. A deck pulls roughly thirty files per view; a directory
 * listing per file would be thirty round trips to Google for information the
 * database already holds.
 *
 * AUTHORIZATION IS A REAL QUERY, NOT A CHECK WRITTEN HERE. The row is read
 * under the CALLER'S OWN cookie session, so the policy decides:
 * classroom_deck_files delegates to classroom_can_read_deck -> the deck's item
 * -> classroom_can_read_item (0085), which admits the manager of any class the
 * item is posted to, and an ACTIVELY ENROLLED student looking at PUBLISHED
 * content. A draft's deck is therefore unreachable for a student by
 * construction, and so is another section's.
 *
 * AN EMPTY RESULT IS 404, NEVER 403: RLS returning nothing is indistinguishable
 * from the row not existing, and a 403 would confirm a real deck id to a
 * stranger. A traversing path is the same 404 -- it is not information either.
 *
 * SAME-ORIGIN HTML, AND THE TRUST THAT PAYS FOR IT. A deck is HTML and
 * JavaScript, and it is served from this app's own origin (it has to be: the
 * relative fetch of the state file must not be a cross-origin request, and the
 * viewer's iframe needs same-origin to focus it for the deck's own keyboard
 * navigation). So a deck's scripts run with the viewer's session. The trust
 * boundary that makes that acceptable is the one already governing every other
 * thing a teacher puts in front of a class: only the teacher of record for
 * EVERY class an item is posted to (or an admin) can upload one --
 * classroom_replace_deck enforces exactly that. The CSP below narrows where a
 * deck can send anything without pretending to be a boundary: it is a
 * blast-radius reduction, not a sandbox.
 */

/**
 * A deck file is immutable -- replacing a deck mints a NEW deck id, so every
 * URL here changes -- but WHO may read it is not (an item can be unpublished,
 * a student unenrolled). Ten minutes is the compromise: long enough that
 * flipping back to a deck mid-lesson costs nothing, short enough that revoked
 * access reasserts itself while the class is still running.
 */
const CACHE_CONTROL = 'private, max-age=600';

/**
 * What a Claude Design deck genuinely needs, and nothing else. Google Fonts and
 * a CDN'd QR library are expected (the decks load both); `unsafe-inline` and
 * `unsafe-eval` are what an exported single-page deck is built out of. The line
 * that earns its place is `connect-src 'self'`: a deck cannot post anywhere
 * off-origin.
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

/** Everything the proxy will echo back under its own stored type. */
const SERVABLE = new Set([
	'text/html',
	'text/css',
	'text/javascript',
	'application/javascript',
	'application/json',
	'text/plain',
	'text/csv',
	'application/xml',
	'application/manifest+json',
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'image/avif',
	'image/svg+xml',
	'image/bmp',
	'image/x-icon',
	'video/mp4',
	'video/webm',
	'audio/mpeg',
	'audio/wav',
	'audio/ogg',
	'font/woff',
	'font/woff2',
	'font/ttf',
	'font/otf',
	'application/vnd.ms-fontobject',
	'application/pdf',
	'application/octet-stream'
]);

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) {
		return json({ error: 'You must be signed in.' }, { status: 401 });
	}
	if (!driveConfigured()) {
		return json({ error: 'Decks are not configured on this deployment.' }, { status: 503 });
	}

	const deckId = params.deck_id;
	if (!deckId || !UUID_RE.test(deckId)) {
		return new Response('Not found', { status: 404 });
	}

	/**
	 * The third independent refusal of an escaping path (the unpacker was the
	 * first, the CHECK constraint + write RPC the second). It cannot matter --
	 * a traversing path can never have been STORED, so the lookup below would
	 * miss anyway -- and that is exactly why it is cheap to keep: it means this
	 * route does not depend on the other two having been right.
	 */
	const path = params.path ?? '';
	if (!deckPathOk(path)) {
		return new Response('Not found', { status: 404 });
	}

	const { data, error } = await supabase
		.from('classroom_deck_files')
		.select('drive_file_id, mime_type')
		.eq('deck_id', deckId)
		.eq('path', path)
		.maybeSingle();

	if (error || !data) {
		return new Response('Not found', { status: 404 });
	}

	const row = data as { drive_file_id?: string; mime_type?: string };
	if (!row.drive_file_id) {
		return new Response('Not found', { status: 404 });
	}

	let file;
	try {
		file = await downloadDriveFile(row.drive_file_id, SERVABLE);
	} catch (e) {
		// The caller IS allowed to see this file; Drive just did not give it to
		// us. 502 rather than 404 so the two stay distinguishable in logs.
		return json({ error: (e as Error).message || 'Drive download failed.' }, { status: 502 });
	}

	/**
	 * THE STORED TYPE WINS. It was derived from the file's own extension at
	 * ingest and carries the charset an export needs; Drive reports whatever it
	 * happened to store the upload as, which for a .js or a .json is routinely
	 * text/plain or octet-stream -- and a stylesheet or module served as
	 * text/plain is a deck that does not render. Nothing here is client-supplied.
	 */
	const stored = (row.mime_type ?? '').trim();
	const contentType = stored || file.contentType;
	const isHtml = contentType.toLowerCase().startsWith('text/html');

	const headers = new Headers({
		'content-type': contentType,
		'cache-control': CACHE_CONTROL,
		'x-content-type-options': 'nosniff',
		// Deck pages are framed by the viewer on this same origin; nothing here
		// is ever a download.
		'content-disposition': 'inline'
	});
	if (file.contentLength) headers.set('content-length', file.contentLength);
	if (isHtml) headers.set('content-security-policy', DECK_CSP);

	return new Response(file.body, { headers });
};
