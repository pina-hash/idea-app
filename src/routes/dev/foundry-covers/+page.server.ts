import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import type { PageServerLoad } from './$types';

/**
 * THE COVER-STATE HARNESS. Dev only: 404 in production, no auth, no Supabase.
 *
 * WHY IT EXISTS. `0182_foundry_covers_private.sql` stops
 * `/storage/v1/object/public/foundry-covers/<key>` answering, so every Foundry
 * surface now asks `/api/foundry-cover/<key>` instead. That route answers one
 * bodyless 404 to a refusal and to a missing object alike, which means a cover
 * can fail to appear for four different reasons and three of them look the
 * same unless somebody decided what each should render.
 *
 * THE FOUR STATES, AND WHY THERE ARE FOUR RATHER THAN THREE OR FIVE:
 *
 *   PRESENT   a key, and the bytes arrive. The picture.
 *   ABSENT    `cover_path` is null. A normal state -- most apps have no cover
 *             -- and it has always had its own rendering.
 *   REFUSED   the stored `cover_path` is NOT A KEY. `foundryCoverUrl` answers
 *             null for it in the browser, with NO REQUEST MADE and nothing
 *             asked of the server, so naming this case costs no information at
 *             all. `student_apps.cover_path` is checked by
 *             `_classroom_deck_path_ok`, which admits any relative path, so
 *             the column can genuinely hold one.
 *   FAILED    the request WAS made and did not produce a picture. The server
 *             refused it, or the bytes did not decode. These two stay ONE
 *             rendering on purpose: `/api/foundry-cover` answers identically
 *             to both, because a 403 on one key and a 404 on another is an
 *             oracle for which scraped keys are still live. The client must
 *             not appear to know what the server declined to say.
 *
 * So the split is between what the browser can judge ALONE and what it had to
 * ask about -- not between the reasons the server had.
 *
 * WHAT IS MIRRORED AND WHAT IS NOT, said plainly, because a harness missing a
 * guard the real page has makes a passing drive prove nothing:
 *
 *   * It mounts the REAL `FoundryMine`, the same component `/foundry/mine`
 *     mounts, and the REAL `foundryCoverUrl` the three routes now hand down.
 *     Nothing here re-implements either.
 *   * It hands in NO transports, so every write control is structurally absent
 *     rather than disabled -- the harness is about rendering.
 *   * PRESENT points at a data: URI rather than at `/api/foundry-cover`. The
 *     route needs a session and a real bucket, neither of which a dev harness
 *     has; what is being verified here is the four RENDERINGS and their
 *     geometry, and the route itself is driven as the real handler in
 *     `tests/foundry-cover-url.test.ts`. Said out loud so nobody reads a green
 *     drive here as coverage of the mint.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
