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

/*
 * The clamp is `mosaic.ts`'s, called rather than copied: the range is stated
 * once, with its reasoning, and this module is only the DOM half of it.
 */
import { clampCoverAspect, coverAspectIsClamped } from './mosaic.ts';

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
	if (!(el instanceof HTMLImageElement)) return;
	el.dataset.coverFailed = 'true';
	/*
	 * AND IT IS GIVEN A PICTURE THAT DECODES, WHICH IS THE ONLY WAY TO STOP
	 * THE ENGINE PAINTING ITS BROKEN-IMAGE GLYPH.
	 *
	 * An `<img>` whose request failed paints that icon, in its own colours,
	 * over the top-left of whatever `[data-cover-failed]` drew underneath.
	 * Measured on the mosaic harness: neither `color: transparent` (already in
	 * the rule) nor `content: ''` removes it -- the icon is the engine's
	 * rendering of a replaced element with nothing to replace it with. A 1x1
	 * fully transparent GIF is something to replace it with, so the element
	 * renders nothing and the pattern behind it is what shows.
	 *
	 * IT WENT UNNOTICED WHILE A COVER WAS A SMALL FRAMED THUMBNAIL. The
	 * gallery card IS the picture now, so the glyph is the picture.
	 *
	 * The swap re-enters this element's `load`, which is why
	 * `foundryCoverMeasured` refuses an element already marked failed: a 1x1
	 * is a perfectly measurable square and would otherwise stamp a 1:1 card.
	 */
	el.src = TRANSPARENT_1PX;
}

/** A 1x1 fully transparent GIF. Inline so a failure needs no second request. */
const TRANSPARENT_1PX =
	'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * THE `onload` FOR A COVER `<img>`, AND THE TWIN OF `foundryCoverFailed`.
 *
 * It stamps the card's measured aspect ratio onto the ELEMENT, as a custom
 * property, for exactly the reason its sibling above stamps an attribute: the
 * gallery and `/foundry/mine` draw one of these per row, so a reactive map
 * keyed by app id would have to be kept in step with a list that reloads after
 * every save, while a value written onto the element that produced it is
 * scoped to that element by construction and needs nothing keyed.
 *
 * WHY THIS IS MEASURED AT ALL RATHER THAN READ. No cover dimension is stored
 * anywhere: `student_apps.cover_path` is the only cover column in the schema
 * (0130), and this lane carries no migration, so the browser measuring the
 * decoded image is the ONLY source for the shape of the card it sits in.
 *
 * IT WRITES ON THE CARD, NOT ON THE IMAGE, because the aspect ratio is the
 * CARD's -- the image fills whatever box the card ends up being. `closest`
 * rather than `parentElement` so the markup can gain a wrapper without this
 * silently starting to write on the wrong node.
 *
 * A ratio it cannot compute is left ALONE rather than written as the fallback:
 * the card's own CSS carries the fallback in its `var()`, so "never measured"
 * stays one state with one spelling instead of two that look identical.
 */
export function foundryCoverMeasured(event: Event): void {
	const el = event.currentTarget;
	if (!(el instanceof HTMLImageElement)) return;
	// A failed cover that has been swapped for the 1x1 placeholder fires
	// `load` again; its square is not this app's shape. See `foundryCoverFailed`.
	if (el.dataset.coverFailed === 'true') return;
	const ratio = clampCoverAspect(el.naturalWidth, el.naturalHeight);
	if (ratio === null) return;
	const card = el.closest<HTMLElement>('[data-fdy-card]');
	if (!card) return;
	card.style.setProperty('--fdy-ar', String(ratio));
	// The CROP is a fact about this card that only the measurement knows, and
	// it is what a student asking "why is my screenshot cut off" is looking at.
	if (coverAspectIsClamped(el.naturalWidth, el.naturalHeight)) {
		card.dataset.fdyClamped = 'true';
	}
}
