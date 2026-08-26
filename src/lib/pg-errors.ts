/**
 * WHICH POSTGRES FAILURES ARE WORTH SENDING AGAIN.
 *
 * Pure, client-safe, no Supabase and no Svelte, because the same partition has
 * to be read by a browser uploader classifying an RPC error and by a server
 * route choosing a status code for one -- and two lists of SQLSTATEs is two
 * lists that quietly stop matching.
 *
 * THE LIST IS A WHITELIST, ON PURPOSE, and the asymmetry is the whole design.
 * Almost every failure on a write path IS a considered refusal: the RPC read
 * the payload and raised (`P0001`), or a constraint said no. Retrying one of
 * those is how a UI asks the same question five times over twelve seconds and
 * lands on the same answer. Only a NAMED transient is retryable; everything
 * else is reported once, verbatim.
 *
 * MOVED HERE UNCHANGED from `$lib/classroom/upload-errors.ts`, which found the
 * codes in a real browser (nine concurrent `classroom_open_submission` calls,
 * two of them stranded on a raw 23505 with no Retry offered) and still holds
 * the vocabulary for saying so to a person. Not a member has been added or
 * removed by the move: this is one statement of the rule in one place, not a
 * new rule.
 */
const TRANSIENT_SQLSTATES = new Set([
  "23505", // unique_violation      -- two writers raced an upsert
  "40001", // serialization_failure
  "40P01", // deadlock_detected
  "55P03", // lock_not_available
  "57014", // query_canceled (statement timeout)
  "53300", // too_many_connections
]);

/**
 * Is this SQLSTATE a transient the database expects a caller to retry?
 *
 * A PostgREST-level code (`PGRST202` and friends) is not one, and neither is
 * an absent code: both mean something other than "the same call may work in a
 * moment", and defaulting them to retryable is how a considered refusal ends
 * up being asked five times.
 */
export function isTransientSqlstate(code?: string | null): boolean {
  return TRANSIENT_SQLSTATES.has((code ?? "").trim());
}

/**
 * THE STATUS AN RPC FAILURE IS REPORTED WITH, and it is the whole of how a
 * route tells a refusal from a failure to deliver.
 *
 * `json({ error: error.message }, { status: 400 })` for every RPC error was
 * the shape these routes shipped with, and it was harmless until the composer
 * gained a retry curve keyed on the status: from that point a deadlock or a
 * `too_many_connections` -- neither of which is a decision about the payload --
 * was being reported as a considered refusal and dropped after one attempt,
 * with a student's writing in it.
 *
 * 503 rather than 500: this says the database was busy, not that the handler
 * broke, and it is the status a caller reads as "come back". Both are 5xx, so
 * `retryableStatus` on the client side is untouched -- there is one rule about
 * what a status means and this only makes the route tell the truth to it.
 */
export function rpcErrorStatus(code?: string | null): 400 | 503 {
  return isTransientSqlstate(code) ? 503 : 400;
}
