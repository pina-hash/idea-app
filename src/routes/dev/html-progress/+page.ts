import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the HTML-ASSIGNMENT PROGRESS RAIL (prompt 0142). It
 * mounts the REAL `Progress.svelte` over hand-written manifests in every state
 * the brief names -- zero, partial, complete, one module, an image as the only
 * unmet block, a sentence floor unmet -- and the REAL `ItemDetail` over a real
 * `HxAnswersStore` pointed at the real `/hx/worksheet` route, so the rail can
 * be watched moving as a document is typed into. No auth, no Supabase, no
 * network beyond the local `/hx/` route. 404s in production.
 *
 * WHY IT HAS TO BE A BROWSER. Ledger 0141 shipped a grading pane 275px wide at
 * 1440 with every content check green, because every string was present. A
 * progress bar is exactly that kind of surface: `tests/` can prove the number,
 * and only a rendered page can show whether the bar is 14px tall, whether a
 * five-point segment is visibly wider than a one-point one, and whether the
 * fill is a colour a reader can see against the track.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
