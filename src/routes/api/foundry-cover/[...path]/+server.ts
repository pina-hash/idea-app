import { FOUNDRY_COVER_BUCKET } from '$lib/foundry/bundle-url';
import { foundryCoverObjectKey } from '$lib/foundry/covers';
import type { RequestHandler } from './$types';

/**
 * GET /api/foundry-cover/<uid>/<file> -- one published app's cover art, for a
 * signed-in caller.
 *
 * ===========================================================================
 * WHY THIS ROUTE EXISTS
 * ===========================================================================
 *
 * `0130_foundry.sql` created `foundry-covers` PUBLIC with a select policy
 * `to public using (bucket_id = 'foundry-covers')`, on the stated grounds that
 * a cover is "the public card image". Prompt 0057 measured what that shape
 * costs, against a real Postgres with 0130 applied, as `anon` with no claims:
 * a known key read back 1 row, and `select name from storage.objects where
 * bucket_id = 'foundry-covers'` returned EVERY key. So a stranger did not have
 * to GUESS a key, and a longer or more random key would have fixed nothing.
 * `select count(*) from public.profiles` was refused on the same connection,
 * which is what says the listing was the policy rather than RLS being off.
 *
 * 0182 flips the bucket private and replaces that policy with one
 * `to authenticated`. This route is what keeps every cover on every Foundry
 * surface rendering afterwards. It is 0052's `src/routes/api/avatar/[...path]`
 * with one bucket changed and one predicate swapped; the reasoning below is
 * that route's reasoning, restated here because a reader of this file should
 * not have to find that one to know why there is no service-role client in it.
 *
 * ===========================================================================
 * THE ROUTE IS NOT THE AUTHORIZATION BOUNDARY, AND THAT IS DELIBERATE
 * ===========================================================================
 *
 * The signed URL is minted on `locals.supabase` -- the CALLER'S OWN client,
 * carrying the caller's own cookie session -- so 0182's storage policy is what
 * decides, evaluated as the caller's own role. With no session that role is
 * `anon`, the policy does not name it, and the mint fails. There is no
 * service-role client on this path and there must not be one: the moment one
 * appears this route becomes the boundary instead of the database.
 *
 * `$lib/server/foundry-bundle.ts` is the ONE reader of the service key in this
 * subsystem and stays the one reader. Adding a second here would reopen the
 * split CLAUDE.md records that module closing.
 *
 * The `claims` check below is therefore DEFENCE IN DEPTH rather than the gate.
 * It answers a signed-out probe without a Supabase round trip, which matters
 * on a route an unauthenticated crawler can hit once per key it scraped out of
 * a gallery's HTML before 0182 landed.
 *
 * ===========================================================================
 * EVERY REFUSAL IS THE SAME BODYLESS 404
 * ===========================================================================
 *
 * A malformed key, a key that is not this shape, an object that never existed,
 * an object that was deleted, and a caller with no session are all one
 * response. A 403 on one key and a 404 on another would turn this route into
 * an oracle for which of a list of scraped keys are still live, which is most
 * of what the old public bucket handed over.
 *
 * IT IS ALSO WHY A REFUSED COVER AND A BROKEN ONE LOOK THE SAME ON SCREEN,
 * which is a deliberate cost rather than an oversight in the client. The
 * components distinguish the case they can judge WITHOUT asking -- a
 * `cover_path` that is not a key, which `foundryCoverUrl` answers null for
 * locally -- and collapse the two the SERVER answers into one rendering.
 *
 * ===========================================================================
 * WHAT IT DOES NOT DECIDE
 * ===========================================================================
 *
 * WHO MAY SEE WHOSE COVER. Every surface that renders one is under `/foundry`,
 * which is in `authedPrefixes`, and the gallery deliberately shows every
 * signed-in student every published app. `to authenticated` is exactly that
 * tier. A per-viewer rule here would break the gallery while claiming to fix a
 * bucket, and the gallery is somebody else's decision to change.
 *
 * THE COVER OF A HIDDEN APP. `foundry_set_app_hidden` shelves an app off the
 * gallery, the serving route and its owner's list, but its cover object is
 * untouched by that call and stays readable to a signed-in caller who kept the
 * key. That is unchanged by this bundle -- it was world readable before -- and
 * closing it means keying this route on `_foundry_app_in_population`, which is
 * a per-request app lookup on an `<img>` in a list and a separate decision with
 * an owner. Said out loud rather than left for the next reader to find.
 */

/** 0130's bucket. Private since 0182. */
const COVERS_BUCKET = FOUNDRY_COVER_BUCKET;

/**
 * Long enough to survive the redirect and a slow image fetch, short enough
 * that a URL lifted out of a network log is stale before it is useful. The
 * avatar route's own figure, for the same reason.
 *
 * IT MUST STAY LARGER THAN `CACHE_CONTROL`'s max-age, AND THAT RELATIONSHIP IS
 * LOAD-BEARING RATHER THAN COINCIDENTAL. A browser may reuse this 302 for the
 * length of that max-age, so a cached redirect handed out at the last permitted
 * moment still points at a signed URL with 120 - 60 = 60 seconds left on it.
 * Raise the cache window past this TTL and the tail of every cache lifetime
 * becomes a redirect to an expired URL -- a broken image that fixes itself a
 * minute later, which is the hardest possible thing to report.
 */
const SIGNED_URL_TTL_SECONDS = 120;

/**
 * `private, max-age=60`, CLAUDE.md's rule for a proxied private asset. It is a
 * claim about the REDIRECT and not about the bytes: the bytes at a given key
 * are immutable, who may read them is not. Longer would mean a person who
 * signed out kept rendering covers from cache; shorter would mean a function
 * invocation per card per render on a gallery.
 */
const CACHE_CONTROL = 'private, max-age=60';

/** The one refusal. No body, no header that distinguishes one cause from another. */
const refused = () => new Response(null, { status: 404 });

export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims) return refused();

	// The same call the client makes, rather than a second predicate wearing
	// the same name.
	const key = foundryCoverObjectKey(params.path ?? '');
	if (!key) return refused();

	const { data, error } = await supabase.storage
		.from(COVERS_BUCKET)
		.createSignedUrl(key, SIGNED_URL_TTL_SECONDS);

	// The object is gone, or the policy said no. Both answer identically:
	// storage does not tell us which and this route would not pass it on if it
	// did.
	if (error || !data?.signedUrl) return refused();

	/*
	 * A HAND-BUILT 302 RATHER THAN SvelteKit's `redirect()`, for the header.
	 * `redirect()` THROWS a control object the framework turns into a bare
	 * response, so there is nowhere to hang `Cache-Control` on it -- and a
	 * redirect with no cache directive is re-requested for every `<img>` on
	 * every render, which on a gallery is one function invocation per card per
	 * paint.
	 */
	return new Response(null, {
		status: 302,
		headers: { location: data.signedUrl, 'cache-control': CACHE_CONTROL }
	});
};
