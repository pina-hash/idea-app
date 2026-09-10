/**
 * THE ADMIN CONSOLE'S PANELS, AND THE ORDER THEY RENDER IN. Plain data plus
 * pure helpers, client-safe, so the order and the preference read are
 * assertable without a browser -- the `portal-apps.ts` shape one directory
 * over, for the same reason.
 *
 * ONE ROOM SINCE LEDGER 0117 (report 26). `/dashboard` and `/admin` were two
 * launcher cards and two pages; every panel below is now on `/dashboard`, and
 * `/admin` only forwards an admin here. The registry order IS the curated
 * default: review queues first because they are the things waiting on a
 * person, then the two rosters, then the settings.
 *
 * "SORT BY MOST USED" IS REPORT 24, AND THE SIGNAL IS THE ADMIN'S OWN. Nothing
 * on this page loads a per-panel tally from anywhere, and a global count
 * would answer the wrong question (which panel the SCHOOL uses is not which
 * panel THIS person opens). So a use is recorded when the person interacts
 * with a panel -- a pointer down or a focus inside it, once per panel per
 * page load -- into `profiles.preferences.dashboard`, spread-merged beside
 * the launcher's `homepage` namespace exactly as every other preference is,
 * and the console ranks by count on the next load. The FIRST load is the
 * curated order, which is what "most used" means when nothing has been used.
 *
 * THE RANKING IS `rankByUse`, SHARED WITH THE LAUNCHER, and the record is
 * `bumpUsage`, likewise: count descending, ties in curated order, stable. A
 * second spelling of that rule in this file is the thing that would quietly
 * stop matching.
 *
 * NEVER RE-ORDERED MID-VISIT. The order is computed from the prefs the page
 * LOADED with; a use recorded during the visit is persisted but does not move
 * the panel under the pointer that is using it.
 */
import { bumpUsage, rankByUse, readUsage, type AppUsage } from '$lib/portal-apps';

export interface ConsolePanel {
	id: string;
	/** The heading, and the nav chip's word. */
	title: string;
	/** One sentence under the heading. */
	blurb: string;
}

export const CONSOLE_PANELS: ConsolePanel[] = [
	{
		id: 'frc-reviews',
		title: 'FRC model reviews',
		blurb: 'Modeling-gate submissions (MDM-4 to MDM-8) awaiting review. Approving completes the unit and unlocks the next.'
	},
	{
		id: 'greenline-reviews',
		title: 'GREENLINE reviews',
		blurb: 'Custom decal uploads awaiting approval, and the community-track moderation panel.'
	},
	{
		id: 'feedback',
		title: 'Feedback',
		blurb: 'Everything sent from the Report a problem control, anywhere in the portal.'
	},
	{
		id: 'roster',
		title: 'Students and pathways',
		blurb: "Every Bosco Tech student's pathway, and their FRC completion. Identity only, it never gates access."
	},
	{
		id: 'admins',
		title: 'Site admins',
		blurb: 'Who can administer the portal. Every admin can read this list; only the owner can change it.'
	},
	{
		id: 'links',
		title: 'Short links',
		blurb: 'The short paths printed on QR codes. The paper does not change, so the row here is what re-points a document that moved.'
	},
	{
		id: 'coin',
		title: 'IDEA Coin',
		blurb: 'Balance lookup, signed adjustments and the desk that logs fines, awards and purchases.'
	},
	{
		id: 'drive',
		title: 'Notebook Drive',
		blurb: 'The Google account the digital notebook uploads as. Connecting runs a one-time consent flow.'
	},
	{
		id: 'content',
		title: 'Portal content',
		blurb: 'The live homepage and the course archive.'
	}
];

export type ConsoleSort = 'used' | 'default';
export const CONSOLE_SORT_MODES: { id: ConsoleSort; label: string }[] = [
	{ id: 'used', label: 'Most used' },
	{ id: 'default', label: 'Default order' }
];
const SORTS = new Set<string>(CONSOLE_SORT_MODES.map((m) => m.id));

export interface ConsolePrefs {
	sort?: ConsoleSort;
	usage?: Record<string, AppUsage>;
}

/**
 * The `dashboard` namespace of `profiles.preferences`, validated against its
 * union: a sort this file does not name and a usage entry that is not a
 * count-and-date are DROPPED, never coerced, so a stored value can never put
 * the page in a state no branch renders.
 */
export function readConsolePrefs(preferences: unknown): ConsolePrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const raw = (preferences as Record<string, unknown>).dashboard;
	if (!raw || typeof raw !== 'object') return {};
	const { sort, usage } = raw as { sort?: unknown; usage?: unknown };
	const out: ConsolePrefs = {};
	if (typeof sort === 'string' && SORTS.has(sort)) out.sort = sort as ConsoleSort;
	const u = readUsage(usage);
	if (u) out.usage = u;
	return out;
}

/** The whole preferences blob with `dashboard` replaced: a spread-merge, so a sibling namespace is never clobbered. */
export function mergeConsolePrefs(preferences: unknown, next: ConsolePrefs): Record<string, unknown> {
	const base = preferences && typeof preferences === 'object' ? (preferences as Record<string, unknown>) : {};
	return { ...base, dashboard: next };
}

export function recordConsoleUse(prefs: ConsolePrefs, id: string, at: Date): ConsolePrefs {
	return { ...prefs, usage: bumpUsage(prefs.usage, id, at) };
}

/** The panels in the order the console renders them. */
export function orderPanels(
	panels: ConsolePanel[],
	prefs: ConsolePrefs,
	mode: ConsoleSort = prefs.sort ?? 'used'
): ConsolePanel[] {
	if (mode === 'default') return panels;
	return rankByUse(panels, prefs.usage ?? {});
}
