/**
 * Portal app launcher registry: the homepage's curated app grid. PLAIN DATA +
 * pure helpers (client-safe, like curriculum.ts).
 *
 * ONE FLAT GRID, no sections. The Games / Tools / Class headers and the
 * per-group ordering they implied are gone: with a dozen cards the headers cost
 * a third of the vertical space to say something the card titles already said,
 * and they made "reorder" mean "reorder within your group", which is not what
 * anyone wants from a launcher. The registry order below IS the curated default
 * order, and every sort mode is a reordering of that one list.
 *
 * Signed-in users customize on top of it: pin favorites, drag to reorder, pick a
 * sort mode, and toggle a compact view. That layout persists in
 * `profiles.preferences.homepage` (the Phase 2 preferences JSONB), shaped as
 * {@link HomepagePrefs}; helpers here apply it without ever losing apps (an
 * app missing from a saved order still renders, in its curated position).
 */

export interface PortalApp {
	id: string;
	title: string;
	sub: string;
	/** Icon id rendered by the launcher (line-art SVG). */
	icon: string;
	href: string;
	/** Card CTA label. */
	cta: string;
	/** Needs a session to enter (the card offers sign-in when anonymous). */
	requiresAuth?: boolean;
	/** Only rendered for site admins (0067; was teachers). */
	adminOnly?: boolean;
	/**
	 * THERE IS NO `theme` FIELD, AND ADDING ONE BACK IS STILL THE CHANGE TO
	 * REFUSE -- but the per-app accent it used to carry is BACK, one layer down.
	 *
	 * Each entry once declared `{ primary, secondary }`, which AppLauncher
	 * stamped onto the card as an INLINE `--acc-primary` / `--acc-secondary`.
	 * THAT is what was wrong with it, and it is the only thing that was: an
	 * inline custom property beats every class rule, so `.app-card`'s shared
	 * brass/gold pair was dead code, no later rule could correct a single card,
	 * and the only way to learn what a card would paint was to read this file.
	 * Deleting the field fixed the cascade by deleting the identity with it,
	 * which was the wrong half: the identity is deliberate. GAUNTLET, GREENLINE
	 * and VANGUARD carry their own product colours and the FRC card carries
	 * FIRST's brand.
	 *
	 * The pairs now live in AppLauncher's stylesheet, keyed on the `data-app`
	 * attribute the card already carried, with the shared brass/gold pair as the
	 * live default on `.app-card` for any app that declares nothing. A new app
	 * therefore looks right with no entry anywhere, and a later pass overrides
	 * one card with one selector instead of hunting through a registry.
	 *
	 * What belongs in THIS file is the app's identity (`id`), not its paint. A
	 * colour field here would put the value back on the losing side of the
	 * cascade the moment anything read it into a style attribute again.
	 */
	/**
	 * Superseded by a newer tool but kept reachable (bookmarks, muscle memory).
	 * Renders a muted "Legacy" badge and dimmed chrome so it never reads as
	 * equal-weight with its replacement; the card itself still says what to use
	 * instead. Purely presentational — carries no access or write implications.
	 */
	legacy?: boolean;
}

/**
 * THE CURATED DEFAULT ORDER IS THIS ARRAY'S ORDER. Class work first, then the
 * personal record, then the economy, then training and games; admin tools last.
 * `visibleApps` additionally guarantees the admin block sorts after every
 * student-facing card whatever position an admin entry is written in here.
 */
export const PORTAL_APPS: PortalApp[] = [
	{
		id: 'classroom',
		title: 'Classroom',
		sub: 'Your classes: announcements, assignments, and due dates from your teachers.',
		icon: 'classroom',
		href: '/classroom',
		cta: 'Open',
		requiresAuth: true
	},
	{
		id: 'notebook',
		title: 'My Notebook',
		sub: 'Photograph your engineering notebook pages and keep every entry in one place.',
		icon: 'notebook',
		href: '/notebook',
		cta: 'Open',
		// Every signed-in account, whatever their role: a notebook is a
		// personal record, not a student-only surface.
		requiresAuth: true
	},
	{
		id: 'maps',
		title: 'IDEA Maps',
		sub: 'Find any room, any storage unit, and any tool, down to the drawer it lives in.',
		icon: 'maps',
		href: '/maps',
		cta: 'Find',
		// NO `requiresAuth`, AND THAT IS THE ENTRY'S ONE REAL DECISION.
		// The spec's section 2 locks read access as "fully public, no sign-in",
		// and the surface is built that way down to the database: 0161 gives
		// every `maps_*` table a `status = 'published'` select policy for
		// `anon`, 0163 does the same for photos and the `maps-media` bucket,
		// and 0162/0165 grant `maps_search` to `anon` deliberately. A flag that
		// swapped this card's CTA to "Sign in" and refused the click would be
		// the launcher contradicting the route: `/maps` answers an anonymous
		// GET today, and it is not in `authedPrefixes`.
		//
		// WHAT THE FLAG DOES AND DOES NOT DO, since this is where somebody will
		// come looking: `visibleApps` filters on `adminOnly` and on nothing
		// else, so `requiresAuth` has never hidden a card from anyone. It is a
		// CTA switch plus a click interception (`appClick` -> `onRequireSignIn`).
		// Omitting it is therefore not "making the card public", it is
		// declining to put a sign-in wall in front of a public surface. Three
		// cards already omit it for the same reason -- the Coin Ledger,
		// VANGUARD and Tournaments are each reachable signed out.
		//
		// IT IS PUBLISHED ROWS ONLY, WHICH IS THE DATABASE'S ANSWER AND NOT
		// THIS CARD'S. A draft room is invisible to an anonymous reader because
		// the select policy says so; an admin opening the same URL sees their
		// own drafts through the same read, which is why `/maps` sends no
		// shared cache header.
	},
	// TWO coin cards, deliberately, and there is no third. The Ledger is the
	// single student hub — balance, leaderboard, transactions, analytics,
	// contracts and roles all live on it — so the separate My Coin Balance and
	// Contracts cards were removed rather than duplicating parts of it in the
	// launcher (both routes redirect there). The old Sheets entry tool is
	// retired outright (see docs/coin-economy/archive/legacy-system/);
	// Coin Desk is the entry tool.
	{
		id: 'coins',
		title: 'IDEA Coin Ledger',
		sub: 'Your balance, the leaderboard, every transaction, open contracts, and role applications.',
		icon: 'coins',
		href: '/coins/index.html',
		cta: 'View live'
	},
	{
		id: 'gauntlet',
		title: 'IDEA // GAUNTLET',
		sub: 'CAD skills dojo. Read drawings, model against the clock, and climb the boards.',
		icon: 'gauntlet',
		href: '/gauntlet',
		cta: 'Enter',
		requiresAuth: true
	},
	{
		id: 'frc',
		title: 'FRC Training',
		sub: 'The Team 5669 training track: CAD, mechanisms, controls, strategy, and drive team.',
		icon: 'frc',
		href: '/frc',
		cta: 'Enter',
		requiresAuth: true
	},
	{
		id: 'greenline',
		title: 'IDEA // GREENLINE',
		sub: 'Combat racing under the floodlights. Build your machine, run Proving Ground 07, and hold the line.',
		icon: 'greenline',
		href: '/greenline',
		cta: 'Race',
		requiresAuth: true
	},
	{
		id: 'vanguard',
		title: 'IDEA // VANGUARD',
		sub: 'Top-down arcade shooter. Clear the sectors, chain your combos, and chase the high score.',
		icon: 'vanguard',
		href: '/vanguard/',
		cta: 'Play'
	},
	{
		id: 'foundry',
		title: 'IDEA // FOUNDRY',
		sub: 'Web apps built and published by students. Open one, or publish your own.',
		icon: 'foundry',
		href: '/foundry',
		cta: 'Browse',
		// Signed-in: this flag is about the GALLERY, and it is not a claim about
		// the bundles. It used to read "the gallery mints a token per launch, and
		// a token names the viewer. There is no anonymous read of a student
		// bundle." BOTH CLAUSES ARE FALSE NOW. There is no mint: the token proxy
		// and its secret are deleted, and a frame src is `/b/<app>/<version>/` on
		// the apps origin, plain and unsigned. And `/a/<app>/` is a DELIBERATE
		// anonymous read -- a published app has a public address anyone can open
		// without signing in, which is the whole point of the share control.
		//
		// WHAT BOUNDS THAT ANONYMOUS READ, since this is where somebody will come
		// looking: it serves only the app's `published_version_id`, never a draft,
		// a rejected build or a hidden app; it answers only on the apps origin,
		// which holds no session cookie of ours; and it projects one column of the
		// app row plus that version's files, never the author, the class, the
		// description or the build notes. The WORK is public; the STUDENT is not.
		//
		// The flag stays true because everything at /foundry -- browsing the
		// gallery, publishing, My apps -- is the signed-in tier.
		requiresAuth: true
	},
	{
		id: 'tournaments',
		title: 'Tournaments',
		sub: 'Live double-elimination brackets: register, qualify, and follow every match in real time.',
		icon: 'tournament',
		href: '/tournaments',
		cta: 'View'
	},
	{
		id: 'coin-desk',
		title: 'Coin Desk',
		sub: 'Log fines, awards, and purchases against the real coin ledger (0070). Admin tool.',
		icon: 'coin-desk',
		href: '/coin-desk',
		cta: 'Open',
		adminOnly: true
	},
	{
		id: 'dashboard',
		title: 'Admin Dashboard',
		sub: 'Roles, pathways, and the content review queues.',
		icon: 'dashboard',
		href: '/dashboard',
		cta: 'Open',
		adminOnly: true
	},
	{
		id: 'admin',
		title: 'Site Admins',
		// ITS OWN GLYPH, where this used to read `icon: 'dashboard'`. The two
		// admin cards then drew the same gauge and were told apart by their
		// titles alone -- and in the compact view, which is the DEFAULT, the
		// tagline is dropped too. A roster with a key is what this surface
		// actually is; the gauge stays with the readings it describes.
		icon: 'admin',
		sub: 'Who can administer the portal. Owner manages the list.',
		href: '/admin',
		cta: 'Open',
		adminOnly: true
	}
	// NO "Courses & Assignments" card (it pointed at #your-class, a same-page
	// anchor on a section that no longer held either) and NO "Course Archive"
	// card (/archive is reference material, not something to launch; the route is
	// untouched and still reached from the home footer, the FSP archive, and the
	// dashboard callout).
];

/** How the grid is ordered. `custom` is the user's own dragged order. */
export type AppSortMode = 'default' | 'used' | 'recent' | 'custom';

export const APP_SORT_MODES: { id: AppSortMode; label: string }[] = [
	{ id: 'default', label: 'Default order' },
	{ id: 'used', label: 'Most used' },
	{ id: 'recent', label: 'Recently opened' },
	{ id: 'custom', label: 'Custom order' }
];

/** One app's launch history, written from the launcher's click funnel. */
export interface AppUsage {
	/** Times opened. */
	count: number;
	/** ISO timestamp of the most recent open. */
	last: string;
}

/** The per-user homepage layout stored at `profiles.preferences.homepage`. */
export interface HomepagePrefs {
	/** Pinned app ids, in pin order. Pinned apps sort to the front of the grid. */
	pinned?: string[];
	/**
	 * The custom order as ONE flat list of app ids (v2). Unknown ids are ignored
	 * and apps missing from it keep their curated position, so the list never
	 * needs maintaining when the registry changes.
	 */
	order?: string[];
	/** Active sort mode; absent reads as 'default'. */
	sort?: AppSortMode;
	/**
	 * Compact cards (icon + title row only). ABSENT READS AS TRUE -- compact is
	 * the default view, so only an explicit `false` gives the roomy cards.
	 */
	compact?: boolean;
	/** Per-app launch history, keyed by app id. Feeds the 'used' and 'recent' sorts. */
	usage?: Record<string, AppUsage>;
}

/**
 * The v1 shape, kept only so {@link readHomepagePrefs} can migrate it. v1 stored
 * a per-group order map and a collapsed-group set, both of which the flat grid
 * has no use for.
 */
interface LegacyHomepagePrefs {
	pinned?: string[];
	order?: Record<string, string[]>;
	collapsed?: string[];
	compact?: boolean;
}

/** The v1 group ids, in the order their sections used to render. */
const LEGACY_GROUP_ORDER = ['games', 'tools', 'class'];

/**
 * Read the stored layout, MIGRATING THE v1 SHAPE IN CODE (no DB migration, and
 * nothing is rewritten until the next persist happens to fire).
 *
 * v1's per-group order becomes one flat list by walking the groups in the order
 * their sections used to render and concatenating each group's saved ids. That
 * preserves every within-group choice the user made, which is the only ordering
 * information v1 actually held. `collapsed` is dropped -- there are no groups to
 * collapse. Pins survive untouched.
 *
 * A migrated order also sets `sort: 'custom'`: the user HAD arranged their grid,
 * and leaving the mode at 'default' would keep their arrangement in storage
 * while quietly ignoring it. A v1 user who never reordered has no order to
 * migrate and lands on the curated default, same as a brand-new one.
 */
export function readHomepagePrefs(preferences: unknown): HomepagePrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const hp = (preferences as Record<string, unknown>).homepage;
	if (!hp || typeof hp !== 'object') return {};

	const raw = hp as HomepagePrefs & LegacyHomepagePrefs;
	// v2 already: a flat array (or no order at all).
	if (!raw.order || Array.isArray(raw.order)) return raw as HomepagePrefs;

	const grouped = raw.order as Record<string, string[]>;
	const flat: string[] = [];
	const seen = new Set<string>();
	// Ids for apps that no longer exist are dropped HERE rather than only being
	// ignored at render, so a retired card cannot sit in the stored order waiting
	// to reappear in a position the user never chose if its id is ever reused.
	const known = new Set(PORTAL_APPS.map((a) => a.id));
	for (const group of LEGACY_GROUP_ORDER) {
		for (const id of grouped[group] ?? []) {
			if (typeof id === 'string' && known.has(id) && !seen.has(id)) {
				seen.add(id);
				flat.push(id);
			}
		}
	}

	const migrated: HomepagePrefs = {
		pinned: raw.pinned,
		compact: raw.compact,
		usage: raw.usage
	};
	if (flat.length) {
		migrated.order = flat;
		migrated.sort = raw.sort ?? 'custom';
	} else if (raw.sort) {
		migrated.sort = raw.sort;
	}
	return migrated;
}

/**
 * The apps visible to this visitor, in curated order.
 *
 * Admin tools are filtered out for everyone else and, for an admin, are STABLY
 * PARTITIONED to the end: the default order puts the tools a student uses first,
 * whatever position an admin entry happens to occupy in the registry.
 */
export function visibleApps(isAdmin: boolean): PortalApp[] {
	const visible = PORTAL_APPS.filter((a) => !a.adminOnly || isAdmin);
	return [...visible.filter((a) => !a.adminOnly), ...visible.filter((a) => a.adminOnly)];
}

/**
 * Apply a saved flat order: known ids first in their saved order, then every
 * app the saved order does not mention, in curated order. Ids that no longer
 * exist are dropped.
 */
function applyCustomOrder(apps: PortalApp[], saved: string[] | undefined): PortalApp[] {
	if (!saved?.length) return apps;
	const byId = new Map(apps.map((a) => [a.id, a]));
	const ordered: PortalApp[] = [];
	for (const id of saved) {
		const app = byId.get(id);
		if (app) {
			ordered.push(app);
			byId.delete(id);
		}
	}
	for (const app of apps) if (byId.has(app.id)) ordered.push(app);
	return ordered;
}

/**
 * Sort the visible apps by the active mode. `apps` must already be in curated
 * order, which is what every mode falls back to for ties and for apps with no
 * history -- so a fresh account sees the curated grid under every mode.
 */
export function sortApps(
	apps: PortalApp[],
	prefs: HomepagePrefs,
	mode: AppSortMode
): PortalApp[] {
	if (mode === 'custom') return applyCustomOrder(apps, prefs.order);
	if (mode === 'default') return apps;

	const usage = prefs.usage ?? {};
	const curated = new Map(apps.map((a, i) => [a.id, i]));
	const rank = (a: PortalApp) => curated.get(a.id) ?? 0;

	if (mode === 'used') {
		return [...apps].sort((a, b) => {
			const d = (usage[b.id]?.count ?? 0) - (usage[a.id]?.count ?? 0);
			return d !== 0 ? d : rank(a) - rank(b);
		});
	}
	// 'recent': anything opened, newest first; everything never opened after it,
	// in curated order. Comparing the ISO strings directly is safe -- they are
	// all UTC and fixed-width, so lexical order IS chronological order.
	return [...apps].sort((a, b) => {
		const la = usage[a.id]?.last ?? '';
		const lb = usage[b.id]?.last ?? '';
		if (la !== lb) return la < lb ? 1 : -1;
		return rank(a) - rank(b);
	});
}

/**
 * The grid as rendered: sorted by the active mode, with pinned apps hoisted to
 * the front IN PIN ORDER. Pin order is used rather than the active sort so the
 * pinned block holds still while the mode changes underneath it. Every app
 * appears EXACTLY ONCE -- pinning moves a card, it never duplicates it.
 */
export function arrangeApps(
	apps: PortalApp[],
	prefs: HomepagePrefs,
	mode: AppSortMode
): PortalApp[] {
	const sorted = sortApps(apps, prefs, mode);
	const pinnedIds = prefs.pinned ?? [];
	if (!pinnedIds.length) return sorted;
	const byId = new Map(sorted.map((a) => [a.id, a]));
	const front: PortalApp[] = [];
	for (const id of pinnedIds) {
		const app = byId.get(id);
		if (app) {
			front.push(app);
			byId.delete(id);
		}
	}
	return [...front, ...sorted.filter((a) => byId.has(a.id))];
}

/**
 * Record one open. Pure and MERGING: it spreads the prefs it was handed, so a
 * usage write carries whatever layout is currently in hand rather than replacing
 * it with a stale copy.
 */
export function recordUsage(prefs: HomepagePrefs, id: string, at: Date): HomepagePrefs {
	const usage = prefs.usage ?? {};
	const prev = usage[id];
	return {
		...prefs,
		usage: {
			...usage,
			[id]: { count: (prev?.count ?? 0) + 1, last: at.toISOString() }
		}
	};
}
