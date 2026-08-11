/**
 * Portal app launcher registry: the homepage's curated app grid. PLAIN DATA +
 * pure helpers (client-safe, like curriculum.ts).
 *
 * The default (unconfigured) view is the curated grouping below. Signed-in
 * users can customize: pin favorites, reorder within groups, collapse groups,
 * and toggle a compact view. That layout persists in
 * `profiles.preferences.homepage` (the Phase 2 preferences JSONB), shaped as
 * {@link HomepagePrefs}; helpers here apply it without ever losing apps (an
 * app missing from a saved order still renders, appended in curated order).
 */

export type AppGroupId = 'games' | 'tools' | 'class';

export interface PortalApp {
	id: string;
	title: string;
	sub: string;
	/** Icon id rendered by the launcher (line-art SVG). */
	icon: string;
	href: string;
	group: AppGroupId;
	/** Card CTA label. */
	cta: string;
	/** Needs a session to enter (the card offers sign-in when anonymous). */
	requiresAuth?: boolean;
	/** Only rendered for site admins (0067; was teachers). */
	adminOnly?: boolean;
	/** Per-card accent colors. Falls back to the shared brass/gold scheme when unset. */
	theme?: { primary: string; secondary: string };
	/**
	 * Superseded by a newer tool but kept reachable (bookmarks, muscle memory).
	 * Renders a muted "Legacy" badge and dimmed chrome so it never reads as
	 * equal-weight with its replacement; the card itself still says what to use
	 * instead. Purely presentational — carries no access or write implications.
	 */
	legacy?: boolean;
}

export const APP_GROUPS: { id: AppGroupId; label: string }[] = [
	{ id: 'games', label: 'Games' },
	{ id: 'tools', label: 'Tools' },
	{ id: 'class', label: 'Class' }
];

export const PORTAL_APPS: PortalApp[] = [
	{
		id: 'vanguard',
		title: 'IDEA // VANGUARD',
		sub: 'Top-down arcade shooter. Clear the sectors, chain your combos, and chase the high score.',
		icon: 'vanguard',
		href: '/vanguard/',
		group: 'games',
		cta: 'Play',
		theme: { primary: '#00FF41', secondary: '#C8FF00' }
	},
	{
		id: 'gauntlet',
		title: 'IDEA // GAUNTLET',
		sub: 'CAD skills dojo. Read drawings, model against the clock, and climb the boards.',
		icon: 'gauntlet',
		href: '/gauntlet',
		group: 'games',
		cta: 'Enter',
		requiresAuth: true,
		theme: { primary: '#00FF41', secondary: '#00F0FF' }
	},
	{
		id: 'greenline',
		title: 'IDEA // GREENLINE',
		sub: 'Combat racing under the floodlights. Build your machine, run Proving Ground 07, and hold the line.',
		icon: 'greenline',
		href: '/greenline',
		group: 'games',
		cta: 'Race',
		requiresAuth: true,
		theme: { primary: '#2AE57E', secondary: '#CFDAE2' }
	},
	{
		id: 'tournaments',
		title: 'Tournaments',
		sub: 'Live double-elimination brackets: register, qualify, and follow every match in real time.',
		icon: 'tournament',
		href: '/tournaments',
		group: 'games',
		cta: 'View',
		theme: { primary: '#00FF41', secondary: '#C8A848' }
	},
	{
		id: 'coin-desk',
		title: 'Coin Desk',
		sub: 'Log fines, awards, and purchases against the real coin ledger (0070). Admin tool.',
		icon: 'coin-entry',
		href: '/coin-desk',
		group: 'tools',
		cta: 'Open',
		adminOnly: true,
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'coin-balance',
		title: 'My Coin Balance',
		sub: 'Your balance, transaction history, wage tier, and Eating Pass status (0070).',
		icon: 'coin-balance',
		href: '/coin-balance',
		group: 'tools',
		cta: 'View',
		requiresAuth: true,
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'contracts',
		title: 'Contracts',
		sub: 'Browse and claim posted jobs; the payout splits across whoever claims it (0077).',
		icon: 'coin-entry',
		href: '/contracts',
		group: 'tools',
		cta: 'Browse',
		requiresAuth: true,
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'coins',
		title: 'IDEA Coin Ledger',
		sub: 'Old Google Sheets ledger. Frozen since Coin Desk launched — see My Coin Balance for your real balance.',
		icon: 'coins',
		href: '/coins/index.html',
		group: 'tools',
		cta: 'View live',
		legacy: true,
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'coin-entry',
		title: 'Coin Entry',
		sub: 'Legacy entry tool. Writes to the old Sheets ledger only, never the real balances — use Coin Desk instead.',
		icon: 'coin-entry',
		href: '/coin-entry',
		group: 'tools',
		cta: 'Open',
		adminOnly: true,
		legacy: true,
		theme: { primary: '#C8A848', secondary: '#D08030' }
	},
	{
		id: 'dashboard',
		title: 'Admin Dashboard',
		sub: 'Roles, pathways, and the content review queues.',
		icon: 'dashboard',
		href: '/dashboard',
		group: 'tools',
		cta: 'Open',
		adminOnly: true,
		theme: { primary: '#78B870', secondary: '#5ABDA8' }
	},
	{
		id: 'admin',
		title: 'Site Admins',
		sub: 'Who can administer the portal. Owner manages the list.',
		icon: 'dashboard',
		href: '/admin',
		group: 'tools',
		cta: 'Open',
		adminOnly: true,
		theme: { primary: '#78B870', secondary: '#5ABDA8' }
	},
	{
		id: 'classroom',
		title: 'Classroom',
		sub: 'Your classes: announcements, assignments, and due dates from your teachers.',
		icon: 'classroom',
		href: '/classroom',
		group: 'class',
		cta: 'Open',
		requiresAuth: true,
		// The shared brass/gold scheme, stated explicitly (the notebook card's
		// lesson: omitting `theme` falls back to a green-led card, not the
		// uniform gold --acc convention).
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'courses',
		title: 'Courses & Assignments',
		sub: 'The 2026-27 curriculum, your pinned class, and every open assignment.',
		icon: 'courses',
		href: '#your-class',
		group: 'class',
		cta: 'Browse',
		theme: { primary: '#78B870', secondary: '#C8A848' }
	},
	{
		id: 'frc',
		title: 'FRC Training',
		sub: 'The Team 5669 training track: CAD, mechanisms, controls, strategy, and drive team.',
		icon: 'frc',
		href: '/frc',
		group: 'class',
		cta: 'Enter',
		requiresAuth: true,
		theme: { primary: '#ED1C24', secondary: '#0066B3' }
	},
	{
		id: 'notebook',
		title: 'My Notebook',
		sub: 'Photograph your engineering notebook pages and keep every entry in one place.',
		icon: 'notebook',
		href: '/notebook',
		group: 'class',
		cta: 'Open',
		// Every signed-in account, whatever their role: a notebook is a
		// personal record, not a student-only surface.
		requiresAuth: true,
		// The shared brass/gold scheme, stated explicitly rather than left to
		// the snippet's fallback. Omitting `theme` does NOT yield the gold
		// `--acc` convention: appCard's fallback is `var(--green)` primary, so
		// an unthemed card renders green-led. These are the design-system
		// --gold / --green tokens themselves (the .app-card CSS default, and
		// what the coin cards already use), so this is the documented uniform
		// accent, not a new per-card color.
		theme: { primary: '#C8A848', secondary: '#78B870' }
	},
	{
		id: 'archive',
		title: 'Course Archive',
		sub: 'Discontinued 2025-26 courses, kept for reference.',
		icon: 'archive',
		href: '/archive',
		group: 'class',
		cta: 'Open',
		theme: { primary: '#849080', secondary: '#78B870' }
	}
];

/** The per-user homepage layout stored at `profiles.preferences.homepage`. */
export interface HomepagePrefs {
	/** Pinned app ids, in pin order (rendered as a top "Pinned" row). */
	pinned?: string[];
	/** Per-group explicit app order (unknown ids ignored, missing appended). */
	order?: Partial<Record<AppGroupId, string[]>>;
	/** Collapsed group ids. */
	collapsed?: AppGroupId[];
	/** Compact cards (icon + title row only). */
	compact?: boolean;
}

export function readHomepagePrefs(preferences: unknown): HomepagePrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const hp = (preferences as Record<string, unknown>).homepage;
	if (!hp || typeof hp !== 'object') return {};
	return hp as HomepagePrefs;
}

/** The apps visible to this visitor (admin tools only for admins). */
export function visibleApps(isAdmin: boolean): PortalApp[] {
	return PORTAL_APPS.filter((a) => !a.adminOnly || isAdmin);
}

/**
 * Order a group's visible apps by the saved order, keeping any app the saved
 * order does not know about (appended in curated order) and dropping ids that
 * no longer exist.
 */
export function orderedGroupApps(
	apps: PortalApp[],
	group: AppGroupId,
	prefs: HomepagePrefs
): PortalApp[] {
	const inGroup = apps.filter((a) => a.group === group);
	const saved = prefs.order?.[group];
	if (!saved?.length) return inGroup;
	const byId = new Map(inGroup.map((a) => [a.id, a]));
	const ordered: PortalApp[] = [];
	for (const id of saved) {
		const app = byId.get(id);
		if (app) {
			ordered.push(app);
			byId.delete(id);
		}
	}
	for (const app of inGroup) if (byId.has(app.id)) ordered.push(app);
	return ordered;
}

/** The pinned apps, in pin order, from whatever is visible. */
export function pinnedApps(apps: PortalApp[], prefs: HomepagePrefs): PortalApp[] {
	const byId = new Map(apps.map((a) => [a.id, a]));
	return (prefs.pinned ?? []).map((id) => byId.get(id)).filter((a): a is PortalApp => !!a);
}
