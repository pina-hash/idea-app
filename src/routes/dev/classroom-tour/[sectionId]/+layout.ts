import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { ITEMS, SECTIONS, UNITS } from '../../classroom-palette/fixture';
import type { LayoutLoad } from './$types';

/**
 * Dev-only harness for the classroom walkthroughs, the one-time tour offer and
 * the list-width separator (ledger 0297, LEARN). Mounts the REAL
 * ClassroomShell (with its Tour control, ClassroomTour, the palette and the
 * settings panel), ClassSplit, ClassView and ItemDetail against the palette
 * harness's fixture, in a route tree shaped like the real one (a section
 * layout plus an item page), so what it measures is the shipping structure.
 * 404s in production.
 *
 * Like the real section load it takes no `url` dependency: the role and the
 * seeds are read from the URL in the component.
 */
export const prerender = false;
/** Client-rendered: the harness's own module state (the latch, the in-memory profile row) must not be shared between requests. */
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
