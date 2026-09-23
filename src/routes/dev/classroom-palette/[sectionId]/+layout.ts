import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { ITEMS, SECTIONS, UNITS } from '../fixture';
import type { LayoutLoad } from './$types';

/**
 * Dev-only harness for the command palette, the classroom settings panel and
 * the search inside a class (ledger 0297, F3+F5). Mounts the REAL
 * ClassroomShell, CommandPalette, ClassroomSettings, ClassSplit, ClassView and
 * ItemDetail against fixture data, in a route tree shaped like the real one (a
 * section layout plus an item page), so what it measures is the shipping
 * structure. 404s in production.
 *
 * LIKE THE REAL SECTION LOAD, THIS TAKES NO `url` DEPENDENCY: the role and the
 * seeded default are read from the URL in the component, so opening an item
 * never re-runs this.
 */
export const prerender = false;
/**
 * CLIENT-RENDERED ONLY, and the reason is the harness's own module state:
 * `?manage=1` latches and `?opens=` seeds a row, both at module scope so they
 * survive client navigation. Server-rendered, that module is shared by every
 * request the dev server answers, so one visit's `?manage=1` would render the
 * next visitor's page as a teacher. Nothing measured here is about SSR.
 */
export const ssr = false;

export const load: LayoutLoad = async ({ params }) => {
	if (!dev) error(404, 'Not found');
	const section = SECTIONS.find((s) => s.id === params.sectionId);
	if (!section) error(404, 'Not found');
	return {
		section,
		items: section.id === 's-1' ? ITEMS : [],
		units: section.id === 's-1' ? UNITS : []
	};
};
