/**
 * THE SITE'S SHAPE LANGUAGE IS ON WHILE THIS IS 'site-plate' (ledger 0346).
 *
 * The Plate (ledger 0345) is the classroom's shape language, switched by
 * `CLASSROOM_PLATE` in `$lib/classroom/plate.ts`. This is its twin for the
 * rest of ideabosco.com: `src/routes/+layout.svelte` wraps a page in a
 * `display: contents` element carrying this class when `sitePlateInScope`
 * says the page is built from the site's shared shell, and
 * `$lib/classroom/plate.css` keys every rule on `:is(.cr-plate, .site-plate)`.
 * So this line is the whole switch for the site: set it to '' and every
 * page outside the classroom renders exactly as it did before 0346, and the
 * classroom keeps its own switch.
 *
 * SCOPE IS A LIST OF WHAT IS IN, NEVER OF WHAT IS OUT, AND IT FAILS CLOSED.
 * A route nobody listed keeps its own look, which is the right default for a
 * product with its own design system (GAUNTLET, VANGUARD, GREENLINE, IdeaCAD,
 * FRC, FSP) or for somebody else's content (a published Foundry app, a legacy
 * assignment, the frozen Coin Ledger). The classroom is not listed because it
 * wears `CLASSROOM_PLATE` already. The tournament TV stage is excluded by
 * path, because it sits under a listed prefix and is a projected screen.
 *
 * The wrapper is rendered ONLY on an in-scope route, so a left-out product's
 * DOM is byte-identical to what it was: the scope proof in the 0346 history
 * entry diffs every element of every left-out harness before and after.
 */
export const SITE_PLATE = 'site-plate';

/** Production paths the site plate covers EXACTLY: the home page. */
export const SITE_PLATE_EXACT: readonly string[] = ['/'];

/** Production route prefixes the site plate covers: the prefix itself or anything under it. */
export const SITE_PLATE_PREFIXES: readonly string[] = [
	'/dashboard',
	'/admin',
	'/archive',
	'/armory',
	'/auth',
	'/coin-desk',
	'/foundry',
	'/maps',
	'/tournaments'
];

/**
 * Paths under a listed prefix that stay OUT: a projected screen. Matched as a
 * pattern because the tournament id sits in the middle of the path.
 */
export const SITE_PLATE_EXCLUDE: readonly RegExp[] = [/^\/tournaments\/[^/]+\/tv(\/|$)/];

/**
 * THE `/dev` HARNESSES THAT STAND IN FOR IN-SCOPE ROUTES, matched as a raw
 * prefix so a harness family is one entry. They 404 in production, so this
 * list changes nothing a visitor sees; it lets a harness measure the look
 * the real page has. A harness mounting a LEFT-OUT product must never be
 * listed here: the scope proof reads those harnesses.
 */
export const SITE_PLATE_DEV_PREFIXES: readonly string[] = [
	'/dev/home-order',
	'/dev/home-feed',
	'/dev/tour',
	'/dev/themes',
	'/dev/login',
	'/dev/portal-admin',
	'/dev/notebook-drive-test',
	'/dev/short-links',
	'/dev/coin-desk',
	'/dev/coin-balance',
	'/dev/coin-preview',
	'/dev/contracts',
	'/dev/foundry-',
	'/dev/tournaments',
	'/dev/tournament-',
	'/dev/maps-',
	'/dev/profile-menu',
	'/dev/pathways',
	'/dev/code-census',
	'/dev/armory'
];

/**
 * Whether the site plate applies on this path. The classroom's own harnesses
 * and `/dev/themes-shape` (the classroom mockup) are never in scope: they wear
 * `CLASSROOM_PLATE`, and a page must not carry both roots.
 */
export function sitePlateInScope(pathname: string): boolean {
	const p = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
	if (p.startsWith('/dev/')) {
		if (p.startsWith('/dev/themes-shape')) return false;
		return SITE_PLATE_DEV_PREFIXES.some((d) => p.startsWith(d));
	}
	if (SITE_PLATE_EXCLUDE.some((re) => re.test(p))) return false;
	if (SITE_PLATE_EXACT.includes(p)) return true;
	return SITE_PLATE_PREFIXES.some((x) => p === x || p.startsWith(x + '/'));
}

/** The class the root layout's wrapper carries on this path, or '' for none. */
export function sitePlateClass(pathname: string): string {
	return SITE_PLATE && sitePlateInScope(pathname) ? SITE_PLATE : '';
}
