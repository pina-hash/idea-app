import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for EACH PERSON'S PAGE LAYOUT (ledger 0360, report R23,
 * phase 1). It mounts the REAL `ClassroomSettings` over a REAL classroom
 * preference store (in memory: no account here), the REAL `PanelLayoutEditor`
 * inside it, the REAL `PanelStack` rendering a page from `resolvePanels`, and
 * the REAL `PanelsHiddenNote` -- the mechanism the class page and the item page
 * render through. The class page's tools row and teams are the REAL `HallPass`
 * and `ClassTeams`; the other panels are labelled fixture sections. The class
 * header is one panel with the tools, the theme vote's key and a teacher's
 * posting keys as pieces inside it (ledger 0360, R19), and a notice follows it
 * while it leads the page and leads the page otherwise. The REAL class page
 * over a stored layout is `/dev/class-header?view=class&layout=...`. The item page's work slot
 * is a real `<iframe>` that counts its own loads, so a reorder that moved the
 * anchor would show as a second load. No auth, no Supabase; 404 in production.
 *
 *   ?page=class|item       which page (default class)
 *   ?kind=material         the item page for a material: no work slot, a reference document
 *   ?links=top&files=top   the item's author placement of links and files (0193)
 *   ?preset=default|reordered|hidden|search-first
 *                          the stored layout: none; the posts above the teams and the
 *                          instructions below the work; Videos and the theme vote
 *                          (class) / the rubric (item) hidden; or (class) the search
 *                          row above the header, so the notice leads the page
 *   ?role=teacher          a manager's page and editor (the posting keys piece)
 *   ?settings=open         the settings panel opened for this page's arrangement
 *   ?theme=space-white     the classroom's light theme, forced (no session here)
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
