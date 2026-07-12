/**
 * FSP Pulse Apps Script client. Forked from `$lib/fsp/client.ts`. This tool
 * writes DIRECTLY to its OWN Google Apps Script web app (a separate deployment
 * from the original fsp-tech-selection tool; no Supabase). The endpoint URL is
 * read at RUNTIME from `$env/dynamic/public` so a missing value never breaks
 * the build: before the Apps Script is deployed the page still loads and the
 * picker still works, it just cannot persist (the UI says so).
 *
 * Contract the deployed Apps Script must honor (upsert keyed by email, current
 * state only, no history):
 *   GET  <exec>?email=<email>
 *        -> JSON { ok: true, lastName, firstName, studentId, choices, complete,
 *           frcInterest }, where `choices` is the ordered tech-id array (1..6)
 *           or null when the student has no row yet, `complete` is the
 *           server's verdict on whether all 6 slots are filled (used only to
 *           seed the ranked-count indicator's first paint for a returning
 *           student; see FspPulse.svelte), and `frcInterest` is one of
 *           'yes' | 'maybe' | 'unsure' | 'no' | null. (An `ok: false` or
 *           missing row reads as "no prior selection".)
 *   POST <exec>   body: JSON { email, lastName, firstName, studentId, choices,
 *           frcInterest }
 *        -> JSON { ok: true, complete } on success (2xx). `choices` may hold 1
 *           to 6 entries: a partial ranking (a student only considering one or
 *           two pathways) is a valid save, a full 6-pick ranking is never
 *           required. The script UPSERTS on email so a returning student over
 *           FSP days 1-3 overwrites their own row; only current state is kept.
 *
 * POST uses Content-Type text/plain to stay a CORS "simple request" (no
 * preflight against the Apps Script origin); Apps Script reads the raw body via
 * `e.postData.contents`. The native <form> fallback in the component posts the
 * same fields as urlencoded params (`e.parameter.*`) for the JS-disabled path.
 */

import { env } from '$env/dynamic/public';

export type FrcInterest = 'yes' | 'maybe' | 'unsure' | 'no' | null;

export interface FspSelection {
	lastName: string;
	firstName: string;
	studentId: string;
	/** Ordered tech ids, 1st choice first. 1 to 6 entries; a partial ranking is valid. */
	choices: string[];
	/** Interest in joining FRC. Null means not yet answered. */
	frcInterest: FrcInterest;
	/**
	 * The server's verdict on whether all 6 slots are filled, from the GET
	 * prefill. Undefined when unknown (e.g. no prior row). Used only to seed the
	 * ranked-count indicator's very first paint for a returning student; every
	 * live edit afterward is computed from the actual `choices` array instead.
	 */
	complete?: boolean;
}

export interface FspPayload extends FspSelection {
	email: string;
}

/** The configured Apps Script /exec URL, or null when the placeholder is unset. */
export function execUrl(): string | null {
	const u = env.PUBLIC_FSP_PULSE_APPS_SCRIPT_URL?.trim();
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
	const data = (await res.json()) as Partial<FspSelection> & {
		ok?: boolean;
		found?: boolean;
	};
	// No row / explicit failure reads as "no prior selection" (start fresh).
	if (!data || data.ok === false || data.found === false) return null;
	const choices = Array.isArray(data.choices)
		? data.choices.filter((c) => typeof c === 'string')
		: [];
	const frcInterest: FrcInterest =
		data.frcInterest === 'yes' ||
		data.frcInterest === 'maybe' ||
		data.frcInterest === 'unsure' ||
		data.frcInterest === 'no'
			? data.frcInterest
			: null;
	// Nothing on file at all: let the caller treat it as a first-time student.
	if (!choices.length && !data.lastName && !data.firstName && !data.studentId && !frcInterest) {
		return null;
	}
	return {
		lastName: typeof data.lastName === 'string' ? data.lastName : '',
		firstName: typeof data.firstName === 'string' ? data.firstName : '',
		studentId: typeof data.studentId === 'string' ? data.studentId : '',
		choices,
		frcInterest,
		complete: typeof data.complete === 'boolean' ? data.complete : undefined
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
