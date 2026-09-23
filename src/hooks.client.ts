import type { HandleClientError } from '@sveltejs/kit';
import {
	CHUNK_LOAD_MESSAGE,
	isChunkLoadError,
	requestVersionCheck
} from '$lib/shell/deploy-safety';

/**
 * THE CLIENT HALF OF `handleError`, AND WHY IT EXISTS AT ALL.
 *
 * Without it a failure that happens in the browser -- a load function that
 * throws during an in-app navigation, a chunk of code that failed to download
 * -- reached `+error.svelte` as SvelteKit's default `{ message: 'Internal
 * Error' }`: no reference to quote, and a sentence that says nothing. The
 * server half (`hooks.server.ts`) has minted a correlation id since the error
 * boundary existed; this mints one the same way, so the Reference row and the
 * report control's prefilled id work for a client failure too. The id is
 * logged to the browser console beside the error, which is where a client
 * failure's detail lives -- it never reached a server log.
 *
 * A CHUNK THAT FAILED TO DOWNLOAD IS NAMED, NOT GENERIC. It is almost always a
 * deploy that renamed the site's files under an open tab (or a network blip),
 * and the one thing that fixes it is loading the page again, which the error
 * page offers as Try again when it sees `chunk: true`. It also asks, unthrottled,
 * whether a new version is live, so the next navigation takes it. SvelteKit has
 * already asked once by the time this runs and reloads natively when the answer
 * is yes, so reaching here with a chunk error mostly means "same version, the
 * download failed", which is exactly when trying again is right.
 *
 * It does nothing else on purpose, for the reason its server twin gives: it
 * runs on a page that has already gone wrong, and a second thing that can fail
 * in here turns a failure into one with no record at all.
 */
export const handleError: HandleClientError = ({ error, event, status, message }) => {
	const id =
		typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
			? crypto.randomUUID()
			: `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	const chunk = isChunkLoadError(error);
	console.error(
		`[error ${id}] ${status} ${event.url.pathname} route=${event.route.id ?? 'none'}` +
			(chunk ? ' chunk-load' : ''),
		error
	);
	if (chunk) {
		requestVersionCheck({ force: true });
		return { message: CHUNK_LOAD_MESSAGE, id, chunk: true };
	}
	// 404s and other expected statuses keep their own words; only a genuine
	// internal failure gets the generic line, as on the server.
	return { message: status === 500 ? 'The page could not be loaded.' : message, id };
};
