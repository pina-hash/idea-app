import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the assignment spec TABLE cell and the free-text
 * textarea. Mounts the REAL `SpecRenderer` in both of its rendering paths --
 * read-only (a submitted hand-in, `locked`) and editable -- against in-memory
 * values. No auth, no Supabase, no network. 404s in production.
 *
 * It exists because both defects it stands for are invisible to `svelte-check`
 * and to the SQL suite: a cell's first-line offset and a textarea's grown
 * height are browser layout, and the only way to tell a CODE cause from a DATA
 * cause is to render the same value both ways side by side. `?dirty=1` seeds
 * the CONTROL -- the identical values carrying leading whitespace -- so a
 * measurement that finds no offset in the clean case cannot be read as the
 * sweep having found nothing at all.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
