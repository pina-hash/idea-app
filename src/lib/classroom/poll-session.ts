import { invalidate } from '$app/navigation';

/**
 * WHAT A POLL DOES WHEN IT LEARNS THE SESSION IS GONE (ledger 0357): it hands
 * over to the app's EXISTING signed-out handling, and invents none.
 *
 * That handling is the root layout's (`src/routes/+layout.svelte`): on every
 * auth state change it calls `invalidate('supabase:auth')`, which re-runs the
 * root load, re-reads the claims from the browser client, and puts `claims:
 * null` in `page.data` for every surface that reads it (the profile menu's Sign
 * in, among others); the next navigation into a signed-in area meets the server
 * guard in `hooks.server.ts` and is sent to `/`. A poll that is refused for want
 * of a session asks for exactly that, once, and stops -- the five widgets on a
 * class page all noticing at once must not become five invalidations, so the
 * call is folded to one per `SIGNED_OUT_FOLD_MS`.
 *
 * It never retries the request, and nothing here signs anybody in or out.
 */
export const SIGNED_OUT_FOLD_MS = 30_000;

let lastAt = -Infinity;

export function pollSignedOut(now: number = Date.now()): void {
	if (now - lastAt < SIGNED_OUT_FOLD_MS) return;
	lastAt = now;
	void invalidate('supabase:auth').catch(() => undefined);
}

/**
 * The session as a poller's `authChanged` wants it: a string that changes when
 * the token does (the subject and the expiry), or null when there is none.
 */
export function pollSessionKey(claims: unknown): string | null {
	if (!claims || typeof claims !== 'object') return null;
	const c = claims as { sub?: unknown; exp?: unknown };
	if (typeof c.sub !== 'string' || c.sub === '') return null;
	return `${c.sub}:${String(c.exp ?? '')}`;
}

/** Tests only. */
export function _resetPollSession(): void {
	lastAt = -Infinity;
}
