import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE MAPS WORKSPACE HARNESS. Dev-only: 404s in a production build, needs no
 * auth and no Supabase. It mounts the REAL `MapsEditorShell` -- the identical
 * component `/maps/edit` mounts, chrome bar and workspace -- over the
 * `/dev/maps-edit` fixture with in-memory transports that mirror 0161's
 * refusals, plus the grant console over the `/dev/maps-grants` fixture, so
 * the third tab is measured too. This is the page `tools/browser-verify`
 * drives at 375px and 1440px, and the one prompt 0093 drives at 1920 and
 * 2560 as well.
 *
 * `?state=` opens a selection: `root` (IDEA Building: a root's own frame with
 * its rooms inside), `room` (Machine Shop: a room in the building with its
 * units drawn inside it), `place` (Workbench B: a placed unit, the drag and
 * snap probes), `unit` (Tool Chest A: plan plus elevation editor),
 * `compartment` (Drawer 1: the elevation sketch), `pending` (Mill Room),
 * `new-root` (a new building: the live frame from typed fields), `new-room`
 * (a new room in the building: the ghost), `type` (an item type). No state is
 * the overview. Reading `url` here is fine -- this is a PAGE load.
 */
export const prerender = false;

export const load = ({ url }: { url: URL }) => {
	if (!dev) error(404, 'Not found');
	return { state: url.searchParams.get('state') };
};
