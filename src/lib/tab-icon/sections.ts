/**
 * WHICH SECTION A PAGE IS, decided from its path alone (ledger 0396).
 *
 * Longest prefix over every `route` and `also` in `G`, matched on a PATH
 * BOUNDARY: `/maps` matches `/maps` and `/maps/edit` and never `/mapsfoo`.
 * Anything no section claims is Home, which is also what `/` is.
 *
 * TWO CONSEQUENCES WORTH KNOWING. `/classroom/notebook` is Notebook, not
 * Classroom, because the longer prefix wins. A class's own Notebook tab,
 * `/classroom/<id>/notebook`, is Classroom: it is a tab inside one class, and
 * no static prefix names it. And a few routes are listed here although the
 * live icon never paints on them (`/coins` and `/vanguard` serve their own
 * HTML documents, outside the root layout): the map answers "what is this
 * address", and whether the icon is in force there is a separate question,
 * answered by the page's own `<head>`.
 */
import { G, TAB_SECTIONS, type TabSection } from './geometry';

/** Every (prefix, section) pair, longest first, so the first match wins. */
const PREFIXES: ReadonlyArray<readonly [string, TabSection]> = TAB_SECTIONS.filter((s) => s !== 'home')
	.flatMap((s) => [G[s].route, ...(G[s].also ?? [])].map((r) => [r, s] as const))
	.sort((a, b) => b[0].length - a[0].length);

/** The section for a pathname. Unknown paths, and `/`, are Home. */
export function sectionForPath(pathname: string): TabSection {
	for (const [prefix, section] of PREFIXES) {
		if (pathname === prefix || pathname.startsWith(prefix + '/')) return section;
	}
	return 'home';
}

/** Every prefix the map knows, for the audit and the tests. */
export function sectionPrefixes(): ReadonlyArray<readonly [string, TabSection]> {
	return PREFIXES;
}
