import { json } from '@sveltejs/kit';
import { rpcErrorStatus } from '$lib/pg-errors';
import { CERT_SIGNING_INVALID_MESSAGE, CERT_SIGNING_UNSET_MESSAGE } from '$lib/certifications/copy';
import type { SigningKey } from './signing';

/**
 * What every `/api/certifications/*` route says the same way (ledger 0391): a
 * JSON body read without a throw, a database function's structured refusal
 * passed through AS IT STANDS (never translated: the reason reaches the client
 * as the function spelled it and the words are chosen once, in the function),
 * a PostgREST error answered by its SQLSTATE through `$lib/pg-errors` (a named
 * transient is 503 and retryable, everything else 400), and the one refusal a
 * route makes itself: no signing key.
 *
 * A `+server.ts` may export only HTTP methods, which is why these live here
 * and not beside the handlers.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = { 'cache-control': 'no-store' };

export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const parsed: unknown = await request.json();
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

export function stringField(body: Record<string, unknown>, key: string): string {
	const v = body[key];
	return typeof v === 'string' ? v.trim() : '';
}

/** A considered refusal of the route's own: `{ ok: false, reason, message }`. */
export function refuse(reason: string, message: string, status: number, extra: Record<string, unknown> = {}): Response {
	return json({ ok: false, reason, message, ...extra }, { status, headers: NO_STORE });
}

/** A function's own `{ ok: false, ... }` jsonb, passed through at `status`. */
export function passRefusal(refusal: Record<string, unknown>, status = 409): Response {
	return json({ ...refusal, ok: false }, { status, headers: NO_STORE });
}

/** A PostgREST error: the SQLSTATE decides whether it is worth retrying. */
export function rpcFailure(error: { code?: string | null; message?: string | null }): Response {
	const status = rpcErrorStatus(error.code ?? null);
	return json(
		{
			ok: false,
			reason: status === 503 ? 'transient' : 'rpc_error',
			code: error.code ?? null,
			message: error.message ?? 'The database refused this request.'
		},
		{ status, headers: NO_STORE }
	);
}

/** The award and correct routes' first refusal: nothing is signed without a key. */
export function signingRefusal(key: SigningKey): Response | null {
	if (key.ok) return null;
	return key.reason === 'unset'
		? refuse('signing_unset', CERT_SIGNING_UNSET_MESSAGE, 409)
		: refuse('signing_invalid', CERT_SIGNING_INVALID_MESSAGE, 409);
}

export function okJson(body: Record<string, unknown>, status = 200): Response {
	return json({ ...body, ok: true }, { status, headers: NO_STORE });
}

export function isRefusalObject(value: unknown): value is Record<string, unknown> & { ok: false } {
	return !!value && typeof value === 'object' && (value as { ok?: unknown }).ok === false;
}
