/**
 * Gated legacy content registry.
 *
 * Legacy HTML lives in `src/lib/legacy/assignments/` (OUTSIDE `static/`), so it
 * is never served publicly. It is pulled in at build time via Vite raw imports
 * (`?raw`), not runtime `fs` reads, so it works on Vercel serverless.
 *
 * The glob is lazy: keys give us the available slugs without bundling every
 * file's contents into modules that only need the list, and the requested
 * file's HTML is loaded on demand by the gated endpoint.
 */
const modules = import.meta.glob('./assignments/*.html', {
	query: '?raw',
	import: 'default'
}) as Record<string, () => Promise<string>>;

function slugFromPath(path: string): string {
	return path.split('/').pop()!.replace(/\.html$/, '');
}

/** Slugs of every available legacy assignment, sorted. */
export const assignmentSlugs: string[] = Object.keys(modules).map(slugFromPath).sort();

/**
 * Returns the raw, unchanged HTML for an assignment slug, or `null` if there
 * is no such assignment.
 */
export async function loadAssignmentHtml(slug: string): Promise<string | null> {
	const entry = Object.entries(modules).find(([path]) => slugFromPath(path) === slug);
	if (!entry) return null;
	return entry[1]();
}
