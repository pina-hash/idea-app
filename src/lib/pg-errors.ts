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

/**
 * THE CONSTRAINT A POSTGRES ERROR NAMES, or null when it named none.
 *
 * THIS IS THE PIECE THAT MAKES THE PARTITION ABOVE FINISHABLE AT A CALL SITE,
 * and it is here rather than in one subsystem because it is knowledge about
 * Postgres and PostgREST, not about any feature: a `23505` is transient or
 * permanent depending on WHICH uniqueness said no, and the only thing that
 * distinguishes them is the constraint's name.
 *
 * `23505` sits on the transient whitelist because the case it was found in was
 * a genuine race -- nine concurrent `classroom_open_submission` calls, two of
 * them stranded on a lost upsert -- and for that case retrying is right. But
 * the SAME code arrives from a unique index that encodes a RULE ("one
 * placement per item type per container", "one published compartment per
 * elevation slot"), where every retry loses in exactly the way the first
 * attempt did. Widening or narrowing the whitelist cannot tell those apart,
 * because the difference is not in the code. **So the whitelist stays exactly
 * as it is, and a caller that has permanent uniqueness of its own names those
 * constraints and asks this.**
 *
 * The name is read from `message` first and `details` second, because
 * PostgREST forwards Postgres's own `duplicate key value violates unique
 * constraint "<name>"` as the message and its `Key (a, b)=(...) already
 * exists.` as the details, and a driver that swaps them is not worth a second
 * failure mode. Quotes are the only delimiter Postgres uses here.
 */
export function constraintNameOf(
  error?: { message?: string | null; details?: string | null } | null,
): string | null {
  for (const field of [error?.message, error?.details]) {
    const found = (field ?? "").match(
      /(?:unique|check|exclusion|foreign key) constraint "([^"]+)"/i,
    );
    if (found) return found[1];
  }
  return null;
}

/**
 * Is this failure worth sending again, given that the caller knows some of its
 * own constraints are RULES rather than races?
 *
 * `isTransientSqlstate` with an escape hatch, and the escape hatch is
 * deliberately a list the CALLER supplies: this module cannot know which of a
 * feature's unique indexes encode a rule, and guessing would be a second,
 * softer copy of the whitelist. An error naming no constraint answers exactly
 * as `isTransientSqlstate` does, so a caller passing an empty list is
 * unchanged.
 *
 * Every existing caller of `isTransientSqlstate` and `rpcErrorStatus` is
 * untouched by this: neither function's behaviour moved, and neither gained a
 * parameter.
 */
export function isTransientDbError(
  error?: { code?: string | null; message?: string | null; details?: string | null } | null,
  permanentConstraints: Iterable<string> = [],
): boolean {
  if (!isTransientSqlstate(error?.code)) return false;
  const name = constraintNameOf(error);
  if (name === null) return true;
  for (const permanent of permanentConstraints) {
    if (permanent === name) return false;
  }
  return true;
}
