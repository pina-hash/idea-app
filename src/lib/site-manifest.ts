/**
 * Site manifest: the route-to-path map behind the auto-version and changelog
 * substrate. Each "app" is a page or embedded application of the IDEA portal,
 * with the repo paths that constitute it. The build-time Vite plugin
 * (`virtual:site-versions` in vite.config.ts) walks the full git history and
 * maps every commit to the app(s) it touched using this manifest, deriving a
 * per-app version that bumps automatically whenever a deploy includes commits
 * touching that app's paths. Nothing here is edited per release.
 *
 * PLAIN DATA + pure helpers only (like curriculum.ts): this module is imported
 * by vite.config.ts at build time AND by client components for labels, so it
 * must stay dependency-free and client-safe.
 */

export interface SiteApp {
	id: string;
	/** Short label shown in version badges and changelog filters. */
	label: string;
	/** Repo-relative path prefixes owned by this app. */
	prefixes: string[];
	/** Substrings that also claim a path (checked after prefixes). */
	contains?: string[];
}

/**
 * Match order matters: the first app to claim a path wins, and `portal` is the
 * catch-all for everything else (shell, config, homepage, docs).
 */
export const APPS: SiteApp[] = [
	{
		id: 'gauntlet',
		label: 'Gauntlet',
		prefixes: [],
		contains: ['gauntlet']
	},
	{
		id: 'vanguard',
		label: 'Vanguard',
		prefixes: [],
		contains: ['vanguard']
	},
	{
		id: 'greenline',
		label: 'Greenline',
		prefixes: [],
		contains: ['greenline']
	},
	{
		id: 'coins',
		label: 'IDEA Coins',
		prefixes: ['static/coins/', 'src/routes/coin-entry/', 'src/lib/legacy/coin-entry.html'],
		contains: ['coin']
	},
	{
		id: 'assignments',
		label: 'Assignments',
		prefixes: [
			'src/routes/assignments/',
			'src/lib/legacy/assignments/',
			'src/lib/legacy/index.ts',
			'static/IDEA/'
		]
	},
	{
		id: 'archive',
		label: 'Archive',
		prefixes: ['src/routes/archive/']
	},
	{
		id: 'dashboard',
		label: 'Dashboard',
		prefixes: ['src/routes/dashboard/']
	},
	{
		id: 'frc',
		label: 'FRC Training',
		prefixes: [
			'src/routes/frc/',
			'src/lib/frc/',
			'src/routes/dev/frc/',
			'mdm-content-seed.md'
		]
	},
	{
		id: 'portal',
		label: 'IDEA Portal',
		// Catch-all: the homepage, shell, auth, config, and anything unclaimed.
		prefixes: ['']
	}
];

export function appLabel(id: string): string {
	return APPS.find((a) => a.id === id)?.label ?? id;
}

/** Which app owns a repo-relative file path (first match wins). */
export function appForPath(path: string): string {
	const p = path.replace(/\\/g, '/').toLowerCase();
	for (const app of APPS) {
		if (app.prefixes.some((pre) => pre !== '' && p.startsWith(pre.toLowerCase()))) return app.id;
		if (app.contains?.some((c) => p.includes(c))) return app.id;
	}
	return 'portal';
}

/** The distinct apps a commit touched, given its file list. */
export function appsForCommit(files: string[]): string[] {
	const ids = new Set<string>();
	for (const f of files) ids.add(appForPath(f));
	return [...ids];
}

// ---------------------------------------------------------------------------
// Change-type classification, derived from the commit subject (which is the
// user-facing changelog line by convention; see CLAUDE.md).
// ---------------------------------------------------------------------------

export type ChangeType = 'feature' | 'fix' | 'visual' | 'content' | 'docs' | 'update';

export const CHANGE_TYPES: { id: ChangeType; label: string }[] = [
	{ id: 'feature', label: 'New feature' },
	{ id: 'fix', label: 'Fix' },
	{ id: 'visual', label: 'Visual' },
	{ id: 'content', label: 'Content' },
	{ id: 'docs', label: 'Docs' },
	{ id: 'update', label: 'Update' }
];

export function changeTypeLabel(id: string): string {
	return CHANGE_TYPES.find((t) => t.id === id)?.label ?? 'Update';
}

export function classifyNote(note: string): ChangeType {
	const n = note.toLowerCase();
	if (/\b(fix|fixes|fixed|bug|bugs|patch|patches|repair|correct|corrects|regression)\b/.test(n))
		return 'fix';
	if (/\b(add|adds|added|new|introduce|introduces|implement|implements|build|builds|create|creates|launch|launches|ship|ships|enable|enables|support|supports)\b/.test(n))
		return 'feature';
	if (/\b(restyle|rebrand|redesign|design|visual|visuals|theme|skin|polish|font|fonts|color|colors|style|styles|icon|icons|animation|animations|layout|hover)\b/.test(n))
		return 'visual';
	if (/\b(seed|seeds|content|copy|curriculum|assignment|assignments|challenge|challenges|rename|renames|wording|text)\b/.test(n))
		return 'content';
	if (/\b(doc|docs|readme|documentation|claude\.md)\b/.test(n)) return 'docs';
	return 'update';
}
