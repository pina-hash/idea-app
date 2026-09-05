import { avatarObjectKey } from '$lib/avatars';
import type { RequestHandler } from './$types';

/**
 * GET /avatar/<uid>/<file> -- one uploaded avatar's bytes, for a signed-in
 * caller.
 *
 * ===========================================================================
 * WHY THIS ROUTE EXISTS
 * ===========================================================================
 *
 * `0020_profiles_identity.sql` created the `avatars` bucket PUBLIC, with a
 * select policy `to public using (bucket_id = 'avatars')`, on the stated
 * grounds that "avatars are non-sensitive by design (they render on public
 * leaderboards)". Until 0181 those were photographs of minors at a school
 * sitting behind a URL and nothing else.
 *
 * MEASURED, THREE TIMES, RATHER THAN READ OFF THE POLICY. Prompt 0033 put an
 * anonymous caller to a real Postgres with 0020 applied and read another
 * person's avatar object; prompt 0038 confirmed it; this bundle measured the
 * half neither had -- with that policy in force an anonymous caller does not
 * have to GUESS a key, it can LIST them, because the policy places no
 * restriction on which rows `public` may select. So the path was never even
 * weak protection, and a longer or more random key would have fixed nothing.
 *
 * 0181 flips the bucket private and replaces that policy with one `to
 * authenticated`. This route is what keeps every avatar on every page
 * rendering afterwards.
 *
 * ===========================================================================
 * THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY, AND THAT IS DELIBERATE
 * ===========================================================================
 *
 * The signed URL is minted on `locals.supabase` -- the CALLER'S OWN client,
 * carrying the caller's own cookie session -- so 0181's storage policy is what
 * decides, evaluated as the caller's own role. With no session that role is
 * `anon`, the policy does not name it, and the mint fails. There is no
 * service-role client on this path and there must not be one: the moment one
 * appears this route becomes the boundary instead of the database, and the
 * same trade the classroom attachment route names in its own header applies
 * here for the same reason.
 *
 * The `claims` check below is therefore DEFENCE IN DEPTH rather than the gate.
 * It exists to answer a signed-out probe without a Supabase round trip, which
 * matters on a route an unauthenticated crawler can hit once per key it
 * scraped out of a page's HTML before 0181 landed.
 *
 * ===========================================================================
 * EVERY REFUSAL IS THE SAME BODYLESS 404, AND THAT IS THE POINT
 * ===========================================================================
 *
 * A malformed key, a key that is not this shape, an object that never existed,
 * an object that was deleted, and a caller with no session are all one
 * response. A 404 meaning "this person has no picture" and a 403 meaning "not
 * yours to see" are two different facts, and only the first is safe to publish
 * -- 403 on one key and 404 on another turns this route into an oracle for
 * which of a list of scraped keys are still live, which is most of what the
 * old public bucket handed over.
 *
 * It is also what makes the CLIENT half work. `Avatar.svelte` renders the
 * initials tile on `onerror`, so a refused picture and an absent picture paint
 * the identical tile in the identical box, and a roster does not reveal by its
 * own layout which rows the viewer was refused.
 *
 * ===========================================================================
 * WHAT IT DOES NOT DECIDE
 * ===========================================================================
 *
 * WHO MAY SEE WHOSE FACE. That is settled per surface and is not this route's
 * question: every page that renders an avatar is already behind
 * `authedPrefixes` or an admin gate, and the GAUNTLET leaderboard has shown
 * every signed-in student every other student's face since 0024. A per-viewer
 * rule here would break that leaderboard while claiming to fix a bucket, and
 * the leaderboard is somebody else's decision to change.
 *
 * The two facts that changed are worth stating plainly, because they are the
 * whole of what this bundle bought: a stranger with a key read a face before
 * and reads nothing now, and a key scraped out of a page's HTML stops working
 * the moment its holder signs out.
 *
 * A NOTE ON THE KEY. `profiles.avatar` is free text on a row its owner
 * updates directly (0001's "update own profile"), with no CHECK constraint and
 * no validating RPC in the chain -- so `upload:../../anything` is a value a
 * signed-in person can write about themselves today. While the URL was a dead
 * public link that produced a broken image; pointed at a mint, the same string
 * is an input to a storage key. `avatarObjectKey` in `$lib/avatars.ts` is the
 * ONE predicate that decides whether a value is a key, and both halves call
 * it: the client so no such URL is ever built, and this route so a request
 * that arrived some other way is refused anyway. Two spellings of "is this a
 * real key" is the pair that stops agreeing, and the half that would go quiet
 * is this one.
 */

/** 0020's bucket. Private since 0181. */
const AVATARS_BUCKET = 'avatars';

/**
 * Long enough to survive the redirect and a slow image fetch, short enough
 * that a URL lifted out of a network log is stale before it is useful. The
 * classroom attachment route's own figure, for the same reason.
 *
 * IT MUST STAY LARGER THAN `CACHE_CONTROL`'s max-age, AND THAT RELATIONSHIP IS
 * LOAD-BEARING RATHER THAN COINCIDENTAL. A browser may reuse this 302 for the
 * length of that max-age, so a cached redirect handed out at the last permitted
 * moment still points at a signed URL with 120 - 60 = 60 seconds left on it.
 * Raise the cache window past this TTL and the tail of every cache lifetime
 * becomes a redirect to an expired URL -- which renders as a broken image that
 * fixes itself a minute later, the hardest possible thing to report.
 */
const SIGNED_URL_TTL_SECONDS = 120;

/**
 * `private, max-age=60`, which is CLAUDE.md's rule for a proxied private
 * asset and is a claim about the REDIRECT rather than about the bytes. The
 * bytes at a given key are immutable; who may read them is not, so a browser
 * may reuse this 302 for a minute and must ask again after that. Longer would
 * mean a person who signed out kept rendering faces from cache; shorter would
 * mean a function invocation per image per render on a roster.
 */
const CACHE_CONTROL = 'private, max-age=60';

/** The one refusal. No body, no header that distinguishes one cause from another. */
const refused = () => new Response(null, { status: 404 });

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) return refused();

	// `avatarObjectKey` takes the stored `upload:<key>` form, which is what
	// makes it the same call the client makes rather than a second predicate
	// wearing the same name.
	const key = avatarObjectKey(`upload:${params.path ?? ''}`);
	if (!key) return refused();

	const { data, error } = await supabase.storage
		.from(AVATARS_BUCKET)
		.createSignedUrl(key, SIGNED_URL_TTL_SECONDS);

	// The object is gone, or the policy said no. Both answer identically: see
	// the header. Storage does not tell us which and this route would not pass
	// it on if it did.
	if (error || !data?.signedUrl) return refused();

	/*
	 * A HAND-BUILT 302 RATHER THAN SvelteKit's `redirect()`, and the reason is
	 * the header. `redirect()` THROWS a control object the framework turns into
	 * a bare response, so there is nowhere to hang `Cache-Control` on it -- and
	 * a redirect with no cache directive is re-requested for every `<img>` on
	 * every render, which on a roster is one function invocation per face per
	 * paint. The classroom attachment route can use `redirect()` because its
	 * caller is a link somebody clicks once; this one is an image element in a
	 * list.
	 */
	return new Response(null, {
		status: 302,
		headers: { location: data.signedUrl, 'cache-control': CACHE_CONTROL }
	});
};
