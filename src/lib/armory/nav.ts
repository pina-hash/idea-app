/**
 * THE PROJECT PAGE'S VIEWS (Mr. Pina's report of 2026-10-07, "it scrolls on
 * for way too long"): a header, then ONE of five views, never every section
 * stacked under the last. Client-safe plain data, so the route, the /dev/armory
 * harness and the tests ask the same functions.
 *
 * THE VIEW LIVES IN `?view=` AND THE COMPONENT READS IT, NEVER A LOAD. The
 * project page's server load reads no `url`, so pressing a tab reruns no load
 * (CLAUDE.md, "A layout load must never read `url`"): `+page.svelte` reads
 * `page.url` and hands the answer down. Only the view goes in the address. A
 * holder filter on the Checked out view is component state, because a full
 * reload sends the address, and a student's school address, to the server and
 * its request logs.
 */

export const PROJECT_VIEWS = ['files', 'checked-out', 'team', 'activity', 'project'] as const;

export type ProjectView = (typeof PROJECT_VIEWS)[number];

export const PROJECT_VIEW_WORDS: Record<ProjectView, string> = {
	files: 'Files',
	'checked-out': 'Checked out',
	team: 'Team',
	activity: 'Activity',
	project: 'Project'
};

/** The view a project opens on (decision of 2026-10-07): a fixed default never moves under anybody. */
export const DEFAULT_PROJECT_VIEW: ProjectView = 'files';

export function isProjectView(value: unknown): value is ProjectView {
	return typeof value === 'string' && (PROJECT_VIEWS as readonly string[]).includes(value);
}

/**
 * Which views this viewer is offered. The Project view (rename, archive,
 * Delete forever) is a mentor's or a site admin's; everything else is every
 * member's. What is OFFERED only: each RPC behind a view re-checks.
 */
export function projectViewsFor(opts: { settings: boolean }): ProjectView[] {
	return PROJECT_VIEWS.filter((v) => v !== 'project' || opts.settings);
}

/**
 * `?view=` read into a view this viewer may open. An unknown value, or one
 * this viewer is not offered, falls back to Files rather than to a view with
 * nothing in it.
 */
export function projectViewOf(param: string | null | undefined, opts: { settings: boolean }): ProjectView {
	return isProjectView(param) && projectViewsFor(opts).includes(param) ? param : DEFAULT_PROJECT_VIEW;
}

/** A tab's address: a query on the same page, so the load never reruns. */
export function projectViewHref(view: ProjectView): string {
	return `?view=${view}`;
}

/**
 * The address before this round sent people to `#people` (the setup page's
 * "Add people" link, and any bookmark of it). The People section is the Team
 * view now.
 */
export function projectViewFromHash(hash: string | null | undefined): ProjectView | null {
	return hash === '#people' ? 'team' : null;
}
