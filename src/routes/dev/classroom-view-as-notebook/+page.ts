import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for /classroom/view-as/[studentEmail]/notebook -- the one
 * route where `.nb-root` (NotebookView) mounts INSIDE `.cr-root`
 * (ClassroomShell), under the view-as tree's ImpersonationBanner. No other
 * harness reproduces that nesting (docs/HISTORY.md, 6376ad4), which is how the
 * double masthead and the hand-rolled NotebookNoAccountNotice copy went
 * unnoticed. 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
