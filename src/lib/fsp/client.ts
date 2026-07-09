/**
 * FSP tech-selection Apps Script client. The tool writes DIRECTLY to a Google
 * Apps Script web app (no Supabase for this route). The endpoint URL is read at
 * RUNTIME from `$env/dynamic/public` so a missing value never breaks the build:
 * before the Apps Script is deployed the page still loads and the picker still
 * works, it just cannot persist (the UI says so).
 *
 * Contract the deployed Apps Script must honor (upsert keyed by email, current
 * state only, no history):
 *   GET  <exec>?email=<email>
 *        -> JSON { found: boolean, lastName, firstName, studentId,
 *                  choices: string[] }   (choices are tech ids, ordered 1..4)
 *   POST <exec>   body: JSON { email, lastName, firstName, studentId, choices }
 *        -> 2xx on success. The script UPSERTS on email so a returning student
 *           over FSP days 1-3 overwrites their own row; only current state is kept.
 *
 * POST uses Content-Type text/plain to stay a CORS "simple request" (no
 * preflight against the Apps Script origin); Apps Script reads the raw body via
 * `e.postData.contents`. The native <form> fallback in the component posts the
 * same fields as urlencoded params (`e.parameter.*`) for the JS-disabled path.
 */

import { env } from '$env/dynamic/public';

export interface FspSelection {
	lastName: string;
	firstName: string;
	studentId: string;
	/** Ordered tech ids, 1st through 4th choice. */
	choices: string[];
}

export interface FspPayload extends FspSelection {
	email: string;
}

/** The configured Apps Script /exec URL, or null when the placeholder is unset. */
export function execUrl(): string | null {
	const u = env.PUBLIC_FSP_APPS_SCRIPT_URL?.trim();
	return u ? u : null;
}

/**
 * Fetches a student's existing selection to prefill the form. Returns null when
 * nothing is on file (or on any error): prefill is best-effort, a returning
 * student who cannot be read simply starts fresh, they are never blocked.
 */
export async function fetchSelection(
	url: string,
	email: string,
	fetchFn: typeof fetch = fetch
): Promise<FspSelection | null> {
	const res = await fetchFn(`${url}?email=${encodeURIComponent(email)}`, {
		method: 'GET',
		redirect: 'follow'
	});
	if (!res.ok) return null;
	const data = (await res.json()) as Partial<FspSelection> & { found?: boolean };
	if (!data || data.found === false) return null;
	return {
		lastName: typeof data.lastName === 'string' ? data.lastName : '',
		firstName: typeof data.firstName === 'string' ? data.firstName : '',
		studentId: typeof data.studentId === 'string' ? data.studentId : '',
		choices: Array.isArray(data.choices) ? data.choices.filter((c) => typeof c === 'string') : []
	};
}

/**
 * Posts the full current selection (single attempt; the caller owns retry and
 * backoff). Throws on a non-2xx response or a network failure so the caller can
 * surface an error and retry, never a silent success.
 */
export async function postSelection(
	url: string,
	payload: FspPayload,
	fetchFn: typeof fetch = fetch
): Promise<void> {
	const res = await fetchFn(url, {
		method: 'POST',
		// text/plain keeps this a CORS simple request (no preflight); Apps Script
		// reads it from e.postData.contents.
		headers: { 'Content-Type': 'text/plain;charset=utf-8' },
		body: JSON.stringify(payload),
		redirect: 'follow'
	});
	if (!res.ok) {
		throw new Error(`Save failed: HTTP ${res.status}`);
	}
}
