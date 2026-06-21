/**
 * Gated legacy content registry.
 *
 * Legacy HTML lives in `src/lib/legacy/` (OUTSIDE `static/`), so it is never
 * served publicly. It is pulled in at build time via Vite raw imports
 * (`?raw`), not runtime `fs` reads, so it works on Vercel serverless.
 *
 * The assignment glob is lazy: keys give us the available slugs without
 * bundling every file's contents, and the requested file's HTML is loaded on
 * demand by the gated endpoint.
 */
import coinEntryHtmlRaw from './coin-entry.html?raw';

const modules = import.meta.glob('./assignments/*.html', {
	query: '?raw',
	import: 'default'
}) as Record<string, () => Promise<string>>;

function slugFromPath(path: string): string {
	return path.split('/').pop()!.replace(/\.html$/, '');
}

/** Slugs of every available legacy assignment, sorted. */
export const assignmentSlugs: string[] = Object.keys(modules).map(slugFromPath).sort();

const slugSet = new Set(assignmentSlugs);

/**
 * Returns the raw HTML for an assignment slug, or `null` if there is no such
 * assignment. Apply {@link rewriteLegacyLinks} before serving.
 */
export async function loadAssignmentHtml(slug: string): Promise<string | null> {
	const entry = Object.entries(modules).find(([path]) => slugFromPath(path) === slug);
	if (!entry) return null;
	return entry[1]();
}

/** Raw HTML of the teacher-only coin entry tool (legacy `entry/index.html`). */
export const coinEntryHtml: string = coinEntryHtmlRaw;

/** Shared root icons mirrored into `static/IDEA/`. */
export const MIRRORED_ICONS = [
	'android-chrome-512x512.png',
	'favicon-32x32.png',
	'ib-android-chrome-512x512.png',
	'md-android-chrome-512x512.png',
	'md2-android-chrome-512x512.png',
	'sp-android-chrome-512x512.png'
];

// Matches `href`/`src` attribute values that are a BARE mirrored icon filename
// (quote immediately followed by the filename and the matching quote), e.g.
// `href="sp-android-chrome-512x512.png"`. A value with any leading path (such
// as the already-correct `/IDEA/sp-...png`) does not match, so it is not
// touched twice.
const BARE_ICON_RE = new RegExp(
	`((?:href|src)=)("|')(${MIRRORED_ICONS.map((i) => i.replace(/\./g, '\\.')).join('|')})\\2`,
	'gi'
);

/**
 * Serve-time asset-path fix. Applied only to the served HTML string, never to
 * the source files on disk.
 *
 * 1. Maps inter-page links `/IDEA/<name>.html` to the gated route
 *    `/assignments/<name>`.
 * 2. Rewrites bare-filename references to a mirrored icon (for example a
 *    relative `<link rel="icon" href="sp-android-chrome-512x512.png">`) to its
 *    `/IDEA/<icon>` path so it resolves against the `static/IDEA/` mirror.
 *
 * Absolute `/IDEA/...` icon references already resolve against the mirror and
 * are left untouched. External links (https://, Google Classroom) contain no
 * matching path and are likewise untouched.
 */
export function rewriteLegacyLinks(html: string): string {
	return html
		.replace(/\/IDEA\/([A-Za-z0-9._-]+)\.html/g, '/assignments/$1')
		.replace(BARE_ICON_RE, '$1$2/IDEA/$3$2');
}

/** A single gated assignment link. */
export type Assignment = { slug: string; title: string };

/** A course grouping for the dashboard assignments index. */
export type Course = { id: string; title: string; note?: string; assignments: Assignment[] };

/**
 * Course grouping, mirroring how the legacy `index.html` organized content.
 * This replaces the legacy index. Only assignments whose file actually exists
 * in the glob are surfaced, so a typo links to nothing rather than a 404.
 */
const COURSE_LAYOUT: Course[] = [
	{
		id: 'IDEA-113',
		title: 'Freshman, Block 1',
		assignments: [
			{ slug: 'idea113-blade-01', title: 'Blade 01' },
			{ slug: 'idea113-blade-02', title: 'Blade 02' },
			{ slug: 'idea113-blade-03', title: 'Blade 03' },
			{ slug: 'idea113-blade-04', title: 'Blade 04' },
			{ slug: 'idea113-blade-05', title: 'Blade 05' },
			{ slug: 'idea113-blade-05-qr', title: 'Blade 05 QR' },
			{ slug: 'IDEA-Blade_Rulebook_v2_2', title: 'Blade Rulebook v2.2' }
		]
	},
	{
		id: 'IDEA-208',
		title: 'Sophomore, Block 2',
		assignments: [
			{ slug: 'MSET-Mold-01', title: 'MSET Mold 01' },
			{ slug: 'mset-mold-02', title: 'MSET Mold 02' }
		]
	},
	{
		id: 'IDEA-303',
		title: 'Junior, Block 3',
		note: 'Under construction',
		assignments: []
	},
	{
		id: 'IDEA-403',
		title: 'Senior, Block 4',
		assignments: [
			{ slug: 'idea403-senior-progress', title: 'Senior Progress' },
			{ slug: 'idea403-senior-final', title: 'Senior Final' }
		]
	}
];

export const courses: Course[] = COURSE_LAYOUT.map((course) => ({
	...course,
	assignments: course.assignments.filter((a) => slugSet.has(a.slug))
}));
