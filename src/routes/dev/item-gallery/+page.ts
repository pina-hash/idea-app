import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for PICTURES ON AN ITEM PAGE (ledger 0297, package ITEM):
 * the gallery grid a set of picture attachments becomes, the lightbox every
 * picture opens in, a YouTube link's thumbnail card, and -- as a manager -- a
 * zip of pictures dropped on the presentation box becoming a gallery. Mounts
 * the REAL ClassroomShell, ClassSplit, ClassView and ItemDetail. Pictures are
 * drawn on a canvas at load and handed to the attachment proxy's own dev seam,
 * so the real src builders and `isImage*` predicates run. No auth, no
 * Supabase, no network. 404s in production.
 */
export const prerender = false;
export const ssr = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
