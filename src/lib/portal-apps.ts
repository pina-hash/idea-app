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
	/** Only rendered for teachers. */
	teacherOnly?: boolean;
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
		cta: 'Play'
	},
	{
		id: 'gauntlet',
		title: 'IDEA // GAUNTLET',
		sub: 'CAD skills dojo. Read drawings, model against the clock, and climb the boards.',
		icon: 'gauntlet',
		href: '/gauntlet',
		group: 'games',
		cta: 'Enter',
		requiresAuth: true
	},
	{
		id: 'greenline',
		title: 'IDEA // GREENLINE',
		sub: 'Pre-alpha vector racing simulator. Test vehicle physics, tire slip, and centerline AI drivers.',
		icon: 'greenline',
		href: '/dev/greenline-movement',
		group: 'games',
		cta: 'Test'
	},
	{
		id: 'coins',
		title: 'IDEA Coin Ledger',
		sub: 'Live balances, transaction log, and rankings across all sections.',
		icon: 'coins',
		href: '/coins/index.html',
		group: 'tools',
		cta: 'View live'
	},
	{
		id: 'coin-entry',
		title: 'Coin Entry',
		sub: 'Award coins to students. Teacher tool.',
		icon: 'coin-entry',
		href: '/coin-entry',
		group: 'tools',
		cta: 'Open',
		teacherOnly: true
	},
	{
		id: 'dashboard',
		title: 'Teacher Dashboard',
		sub: 'Roles, teacher tools, and content management.',
		icon: 'dashboard',
		href: '/dashboard',
		group: 'tools',
		cta: 'Open',
		teacherOnly: true
	},
	{
		id: 'courses',
		title: 'Courses & Assignments',
		sub: 'The 2026-27 curriculum, your pinned class, and every open assignment.',
		icon: 'courses',
		href: '#your-class',
		group: 'class',
		cta: 'Browse'
	},
	{
		id: 'frc',
		title: 'FRC Training',
		sub: 'The Team 5669 training track: CAD, mechanisms, controls, strategy, and drive team.',
		icon: 'frc',
		href: '/frc',
		group: 'class',
		cta: 'Enter',
		requiresAuth: true
	},
	{
		id: 'archive',
		title: 'Course Archive',
		sub: 'Discontinued 2025-26 courses, kept for reference.',
		icon: 'archive',
		href: '/archive',
		group: 'class',
		cta: 'Open'
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

/** The apps visible to this visitor (teacher tools only for teachers). */
export function visibleApps(isTeacher: boolean): PortalApp[] {
	return PORTAL_APPS.filter((a) => !a.teacherOnly || isTeacher);
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
