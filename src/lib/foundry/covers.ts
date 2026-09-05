/**
 * THE ONE PLACE A FOUNDRY COVER URL IS BUILT, and the one predicate that
 * decides whether a stored `cover_path` is a storage key at all.
 *
 * ===========================================================================
 * WHY THIS MODULE EXISTS
 * ===========================================================================
 *
 * `0130_foundry.sql` created `foundry-covers` with `public = true` and a
 * select policy `to public using (bucket_id = 'foundry-covers')`, copying the
 * shape 0020 had given `avatars`. Prompt 0052 closed that bucket and measured
 * what the shape actually costs; prompt 0057 measured the same two facts here,
 * against a real Postgres with 0130 applied, as `anon` with no claims:
 *
 *   * a known key read back 1 row, and
 *   * `select name from storage.objects where bucket_id = 'foundry-covers'`
 *     returned EVERY key -- the policy places no restriction on WHICH rows
 *     `public` may select.
 *
 * On the same connection `select count(*) from public.profiles` answered
 * `permission denied for table profiles`, so the listing was the policy and
 * not RLS being off.
 *
 * A cover is art a student drew for a game they published. It was world
 * readable, world LISTABLE, permanent, and survived the student leaving.
 *
 * ===========================================================================
 * THE URL USED TO BE BUILT IN THREE PLACES
 * ===========================================================================
 *
 * `src/routes/foundry/+page.svelte`, `.../mine/+page.svelte` and
 * `.../review/+page.svelte` each carried a byte-identical
 *
 *     data.supabase.storage.from(FOUNDRY_COVER_BUCKET).getPublicUrl(path)
 *
 * and handed the result down as the `coverUrl` prop. Three copies of one rule
 * is the thing that quietly stops matching, and here the rule is a security
 * boundary: a fourth surface written against `getPublicUrl` after 0183 lands
 * would render nothing and look like a broken upload. They call this instead.
 *
 * The components' own prop stays `(path: string) => string | null`, so the
 * bucket layout is still something a route knows and a component does not.
 */

/**
 * Every cover ever written is `<uid>/<uuid>.<ext>`: all three upload sites
 * build `${uid}/${crypto.randomUUID()}.${ext}` and the bucket's write policies
 * permit nothing else, because they pin `(storage.foldername(name))[1]` to
 * `auth.uid()::text`.
 *
 * THE COLUMN IS LOOSER THAN THAT AND THAT IS WHY THIS PREDICATE EXISTS.
 * `student_apps.cover_path` is checked by `_classroom_deck_path_ok`, which
 * admits any relative multi-segment path up to 400 characters -- it is the
 * BUNDLE path rule, borrowed. So the column can hold a value no upload
 * produced, and pointing a mint at a column is not the same as pointing a
 * dead public link at one. This is the same argument `avatarObjectKey` makes
 * about `profiles.avatar` in `$lib/avatars.ts`, and the same shape of answer.
 */
const COVER_KEY_RE =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\/[A-Za-z0-9._-]{1,120}$/;

/** The route the proxy is mounted at. Trailing slash included. */
export const FOUNDRY_COVER_PROXY_PREFIX = '/api/foundry-cover/';

/**
 * The stored `cover_path` if it is a key, null for anything else.
 *
 * BOTH HALVES CALL IT -- the client so no such URL is ever built, and the
 * route so a request that arrived some other way is refused anyway. Two
 * spellings of "is this a real key" is the pair that stops agreeing, and the
 * half that would go quiet is the route's.
 */
export function foundryCoverObjectKey(path: string | null | undefined): string | null {
	const key = (path ?? '').trim();
	if (!COVER_KEY_RE.test(key)) return null;
	// A filename that IS `.` or `..` cannot get past the regex above (both are
	// shorter than the uuid segment it demands first), but it is refused by
	// name rather than by argument, exactly as `avatarObjectKey` refuses it.
	const file = key.slice(key.indexOf('/') + 1);
	if (file === '.' || file === '..') return null;
	return key;
}

/**
 * The URL a cover is asked for, or NULL when the stored value is not a key.
 *
 * NULL IS A REAL ANSWER AND THE CALLER RENDERS THE ABSENCE, for the reason
 * `foundryBundleUrl` gives about a frame: an `<img>` whose src is the empty
 * string requests the CURRENT PAGE, which on a gallery is a second render of
 * the gallery rather than a missing picture.
 *
 * Each segment is encoded. The key has already been through
 * `foundryCoverObjectKey`, so nothing here can be a traversal -- but a route
 * that depended on its input being clean would be one regex edit away from
 * not being.
 */
export function foundryCoverUrl(path: string | null | undefined): string | null {
	const key = foundryCoverObjectKey(path);
	if (!key) return null;
	return FOUNDRY_COVER_PROXY_PREFIX + key.split('/').map(encodeURIComponent).join('/');
}

/**
 * THE `onerror` FOR A COVER `<img>`, WRITTEN ONCE.
 *
 * It stamps `data-cover-failed` on the element itself rather than setting a
 * component `$state` flag, and the reason is the LISTS: a gallery and
 * `/foundry/mine` draw one of these per row, so a reactive flag would have to
 * be keyed per row and kept in step with a list that reloads after every save.
 * An attribute on the element that failed is scoped to exactly that element by
 * construction, survives a re-render only if the same element fails again, and
 * needs nothing keyed.
 *
 * WHAT IT DOES NOT DISTINGUISH, deliberately: a cover the SERVER refused (no
 * session, a policy that said no, an object that is gone) from one whose bytes
 * did not decode. `/api/foundry-cover` answers one bodyless 404 to all of
 * those on purpose -- a 403 on one key and a 404 on another is an oracle for
 * which scraped keys are still live -- so the client cannot tell them apart
 * and must not appear to. The case it CAN judge is the one it judges locally
 * and without asking: a `cover_path` that is not a key, which
 * `foundryCoverUrl` answers null for, rendered as its own state by the caller.
 */
export function foundryCoverFailed(event: Event): void {
	const el = event.currentTarget;
	if (el instanceof HTMLImageElement) el.dataset.coverFailed = 'true';
}
