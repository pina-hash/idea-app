/**
 * THE TWO TRANSPORT SHAPES EVERY STUDENT COMPONENT TAKES (ledger 0391).
 *
 * Components fetch nothing and write nothing: the route owns the load and the
 * transports (CLAUDE.md, "Server calls are INJECTED as a transports object"),
 * so `/dev/cert-*` mounts the IDENTICAL component over in-memory answers.
 *
 *   `CertActionPost`  a SvelteKit form action, by name, with its fields. The
 *                     route builds one on `fetch` + `deserialize` (see
 *                     `action-post.ts`, which imports `$app/forms` and is
 *                     therefore kept out of this client-safe module); a
 *                     harness answers in memory. Every form in the portal
 *                     still carries `method="POST" action="?/<name>"`, so with
 *                     scripting off the native post reaches the same action.
 *   `CertRpc`         a browser RPC that notifies nobody (a watch report, a
 *                     quick-check result, a lesson completion), DATA_MODEL's
 *                     own division: those are called from the browser
 *                     directly; everything that notifies goes through an
 *                     action.
 *
 * A refusal is a VALUE, never a throw, because it is rendered where the person
 * was working, verbatim from the function's message.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { isRefusal } from '$lib/certifications/types';

export type ActionAnswer =
	| { ok: true; data?: Record<string, unknown> }
	| { ok: false; message: string; reason?: string };

export type CertActionPost = (action: string, fields: Record<string, string>) => Promise<ActionAnswer>;

export interface RpcAnswer<T = unknown> {
	data: T | null;
	error: { message: string; code?: string | null } | null;
}

export type CertRpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcAnswer>;

/** The production `CertRpc`: `supabase.rpc`, with its answer narrowed to the two fields a component reads. */
export function rpcFrom(supabase: SupabaseClient | null | undefined): CertRpc | null {
	if (!supabase) return null;
	return async (fn, args) => {
		try {
			const { data, error } = args === undefined ? await supabase.rpc(fn) : await supabase.rpc(fn, args);
			return { data: (data ?? null) as unknown, error: error ? { message: error.message, code: error.code } : null };
		} catch (e) {
			return { data: null, error: { message: (e as Error)?.message || 'The request could not be sent.', code: null } };
		}
	};
}

/**
 * One reading of a function's jsonb answer: a `{ ok: false, message }` is the
 * refusal to show, a PostgREST error is its own message, and anything else is
 * success. The message reaches the screen VERBATIM.
 */
export function answerOf(result: RpcAnswer): ActionAnswer {
	if (result.error) return { ok: false, message: result.error.message, reason: result.error.code ?? undefined };
	if (isRefusal(result.data)) {
		return { ok: false, message: result.data.message || 'Refused.', reason: result.data.reason };
	}
	return { ok: true, data: (result.data && typeof result.data === 'object' ? (result.data as Record<string, unknown>) : undefined) };
}

/** A sentence for a thrown or malformed failure, never a stack. */
export const GENERIC_FAILURE = 'That did not go through. Check the connection and try again.';
