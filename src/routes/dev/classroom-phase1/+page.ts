import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the classroom Phase 1 rebuild. Mounts the REAL
 * ContentComposer, RichTextEditor, ItemBody, ItemDetail, SpecImport,
 * ReferenceTools and RubricBuilder against an in-memory store -- no auth, no
 * Supabase, no Drive. 404s in production.
 *
 * WHAT IT EXISTS TO MAKE DRIVABLE without a backend, in the order the work
 * landed: the composer in create and edit mode (including the pre-checked
 * class and the schedule field), the rich editor round-tripping a document
 * through the REAL sanitizer, the link popover, ItemBody rendering a rich body
 * beside a legacy plain-text one, a manager row set carrying all three of
 * Draft / Scheduled / Published, and the migrated components on the new
 * surface tokens.
 *
 * The sibling /dev/classroom harness stays as it is -- it drives the whole
 * module end to end (the multi-class sync loop, linkage, the grading console).
 * This one is scoped to what Phase 1 changed, so a regression in it points at
 * one thing.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
