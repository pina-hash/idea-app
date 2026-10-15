/**
 * What every student route's server load and action does the same way
 * (ledger 0391). The migrations are applied by hand, one at a time, so a
 * `cert_*` function may not exist yet on a deployment: a `PGRST202` reads as
 * "not available yet" and the page renders one notice instead of a broken
 * page; any other error is thrown to the error boundary. A function's
 * structured refusal becomes a `fail(409)` carrying the message VERBATIM and
 * the section the person was working in, so the page can render it there.
 *
 * Isomorphic (`@sveltejs/kit`'s `error` and `fail` run anywhere), but only
 * routes call it.
 */
import { error, fail } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRefusal } from '$lib/certifications/types';
import { CERT_UNAVAILABLE_SENTENCE, certNotAvailable } from './shell';

export type CertRead<T> = { ok: true; data: T } | { ok: false; unavailable: true };

/** A read: the function's answer, or "not available yet". Anything else is a 500. */
export async function readCert<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<CertRead<T>> {
	const { data, error: e } = args === undefined ? await supabase.rpc(fn) : await supabase.rpc(fn, args);
	if (e) {
		if (certNotAvailable(e)) return { ok: false, unavailable: true };
		error(500, `${fn} could not be read.`);
	}
	return { ok: true, data: (data ?? null) as T };
}

/** A read whose absence is ordinary (settings beside a page): null on any failure. */
export async function readCertOrNull<T>(supabase: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T | null> {
	try {
		const { data, error: e } = args === undefined ? await supabase.rpc(fn) : await supabase.rpc(fn, args);
		if (e) return null;
		return (data ?? null) as T;
	} catch {
		return null;
	}
}

export interface ActionRefusal {
	ok: false;
	section: string;
	message: string;
	reason: string | null;
}

export type CallOutcome<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; refusal: ActionRefusal };

const refused = (section: string, message: string, reason: string | null): CallOutcome<never> => ({
	ok: false,
	refusal: { ok: false, section, message, reason }
});

/**
 * A write: the function's `{ ok: true, ... }`, or its refusal in its own
 * words. A PostgREST error is a refusal in the error's words (a transient one
 * says so through its SQLSTATE elsewhere; here the person reads the sentence
 * and presses again). Misuse (a malformed argument) raises in the database and
 * arrives as an error message too, never as a thrown 500 over somebody's form.
 */
export async function callCert<T = Record<string, unknown>>(
	supabase: SupabaseClient,
	fn: string,
	args: Record<string, unknown>,
	section: string
): Promise<CallOutcome<T>> {
	let answer: { data: unknown; error: { message: string; code?: string | null } | null };
	try {
		answer = await supabase.rpc(fn, args);
	} catch (e) {
		return refused(section, (e as Error)?.message || 'The request could not be sent.', null);
	}
	if (answer.error) {
		if (certNotAvailable(answer.error)) return refused(section, CERT_UNAVAILABLE_SENTENCE, 'unavailable');
		return refused(section, answer.error.message, answer.error.code ?? null);
	}
	if (isRefusal(answer.data)) return refused(section, answer.data.message || 'Refused.', answer.data.reason ?? null);
	return { ok: true, data: (answer.data ?? {}) as T };
}

/** A refusal as SvelteKit's `fail(409)`, carrying the section and the message VERBATIM. */
export function refusalFail(refusal: ActionRefusal) {
	return fail(409, refusal);
}

/** The one-line action: the function's answer spread under `ok: true`, or the `fail`. */
export async function certAction(supabase: SupabaseClient, fn: string, args: Record<string, unknown>, section: string) {
	const out = await callCert<Record<string, unknown>>(supabase, fn, args, section);
	if (!out.ok) return refusalFail(out.refusal);
	return { ok: true as const, ...out.data };
}

export function formString(form: FormData, key: string): string {
	const v = form.get(key);
	return typeof v === 'string' ? v.trim() : '';
}

export function formJson(form: FormData, key: string): unknown {
	const raw = formString(form, key);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

/** The one line that decides who is signed in, from the validated claims. */
export function signedInEmail(claims: App.Claims | null): string | null {
	const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
	return claims && email ? email : null;
}
