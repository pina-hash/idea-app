/**
 * What every desk route's server half shares (ledger 0391, surface d). Not a
 * `+` file, so SvelteKit ignores it as a route; imported by every
 * `+page.server.ts` under `/certifications/desk`.
 *
 * THE READ: `loadRpc` calls a `cert_*` function on the CALLER'S client and
 * answers one of two shapes. `PGRST202` (the function is not on this database
 * yet: migrations are applied by hand, one at a time) is "not available yet",
 * and the page renders one `.cert-notice` saying so instead of a broken page.
 * Any other error is thrown to the error boundary, because a database that
 * refuses a read it knows is a real failure worth a correlation id.
 *
 * THE WRITE: `runAction` is the one shape of every desk form action. The RPC
 * runs on `locals.supabase` (the caller's own client, never a service-role
 * one, so `is_admin()` and `_cert_can_certify` are the real thing); a
 * `PGRST202` answers the not-available sentence; a PostgREST error answers its
 * message; a structured refusal (`{ ok: false, message }`) is passed through
 * VERBATIM as a `fail(400)` so the page renders the function's own words where
 * the person was working; and a success sends the notifications the function
 * returned and, where the write changed the catalog, fires the FRC mirror,
 * each wrapped so a delivery problem never fails a committed write.
 */
import { error, fail, type ActionFailure } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { certSiteOrigin } from '$lib/server/certifications/gate';
import { sendCertNotifications } from '$lib/server/certifications/notify';
import { sendMirror } from '$lib/server/certifications/mirror';
import type { DeskFormResult } from '$lib/certifications/desk/desk';
import { isRefusal } from '$lib/certifications/types';

export const NOT_AVAILABLE = 'This part of IDEA Certifications is not available yet.';
export const UNDEFINED_FUNCTION = 'PGRST202';

export type Loaded<T> = { ok: true; data: T } | { ok: false; unavailable: true };

export async function loadRpc<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<Loaded<T>> {
	const { data, error: rpcError } = await supabase.rpc(fn, args);
	if (rpcError) {
		if (rpcError.code === UNDEFINED_FUNCTION) return { ok: false, unavailable: true };
		error(500, `${fn} failed: ${rpcError.message}`);
	}
	return { ok: true, data: data as T };
}

/** A read that answers data, or null for not-available AND for a structured refusal (the page says which). */
export function dataOrNull<T>(loaded: Loaded<T>): T | null {
	if (!loaded.ok) return null;
	return isRefusal(loaded.data) ? null : loaded.data;
}

export const str = (form: FormData, key: string): string => String(form.get(key) ?? '').trim();
export const num = (form: FormData, key: string, fallback: number): number => {
	const n = Number(str(form, key));
	return Number.isFinite(n) ? n : fallback;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_RE.test(value);

export type ActionAnswer = DeskFormResult | ActionFailure<DeskFormResult>;

export interface RunActionInput {
	supabase: SupabaseClient;
	url: URL;
	action: string;
	fn: string;
	args: Record<string, unknown>;
	/** The sentence shown on success, from the function's answer. */
	okMessage: (data: Record<string, unknown>) => string;
	/** Anything the page needs back beside the sentence. */
	extra?: (data: Record<string, unknown>) => Record<string, unknown>;
	/** The write changed the catalog or an award: fire the FRC mirror after it. */
	mirror?: 'catalog' | 'award' | null;
}

export function refuseAction(action: string, message: string, status = 400, data?: Record<string, unknown>): ActionFailure<DeskFormResult> {
	return fail(status, { action, ok: false, message, data });
}

export async function runAction(input: RunActionInput): Promise<ActionAnswer> {
	const { data, error: rpcError } = await input.supabase.rpc(input.fn, input.args);
	if (rpcError) {
		if (rpcError.code === UNDEFINED_FUNCTION) return refuseAction(input.action, NOT_AVAILABLE);
		return refuseAction(input.action, rpcError.message || 'The database refused this request.');
	}
	const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
	if (isRefusal(body)) {
		const problems = Array.isArray(body.problems) ? (body.problems as string[]) : undefined;
		return refuseAction(input.action, body.message || 'The request was refused.', 400, problems ? { problems, reason: body.reason } : { reason: body.reason });
	}
	// Committed. Everything from here is best effort and never fails the write.
	if (Array.isArray(body.notify) && body.notify.length) {
		try {
			await sendCertNotifications(body.notify, certSiteOrigin(input.url), input.supabase);
		} catch {
			// A delivery problem must not make a committed write read as failed.
		}
	}
	if (input.mirror) {
		try {
			await sendMirror(input.mirror, input.supabase);
		} catch {
			// The mirror is logged by its own module; nothing to do here.
		}
	}
	return { action: input.action, ok: true, message: input.okMessage(body), data: input.extra?.(body) };
}
