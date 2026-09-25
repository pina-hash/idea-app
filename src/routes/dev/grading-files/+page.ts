import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for "DOWNLOAD ALL FILES" in the grading console (ledger
 * 0298, A6). Mounts the REAL `GradingConsole` with the REAL `BulkFileDownload`
 * inside it, over an in-memory fixture and an in-memory file transport. No
 * auth, no Supabase, no network. 404s in production.
 *
 * THE FIXTURE CARRIES EVERY CASE THE SPEC NAMES: two classes, a student on no
 * roster, a file whose submission never arrived, a legacy Drive row (no storage
 * key, no recorded size), a block the manifest does not know, an item-level
 * hand-in, the teacher's own file, two students whose names fold to one folder,
 * and a fetch that fails.
 *
 * THE DOWNLOAD IS INTERCEPTED, NOT SIMULATED: the console's own `download`
 * helper runs, and the harness keeps the Blob and reads the zip BACK with
 * Foundry's reader, printing every path and the whole `index.csv`.
 *
 *   ?source=none   no transport, so the control must be ABSENT
 *   ?mode=section  the per-class console (no cross-class read), where the
 *                  wider roster is what recognises the other class's student
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
