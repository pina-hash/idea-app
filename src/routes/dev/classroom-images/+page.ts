import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for CLASSROOM IMAGE BOX GEOMETRY. Mounts the five real
 * renderers that put a picture on a classroom surface -- SpecRenderer's
 * imageZone, AttachmentList, SubmissionFileList, MarkdownText's authored
 * figures and MyClasses' card grid -- against the four intrinsic shapes in
 * `fixtures.ts`. No auth, no Supabase, no network. 404s in production.
 *
 * IT EXISTS BECAUSE "BLANK SPACE BESIDE AN IMAGE" IS FOUR DIFFERENT DEFECTS
 * AND ONLY A MEASUREMENT TELLS THEM APART. An empty `auto-fill` grid track, a
 * pillarbox painted inside an `object-fit: contain` box, a stretched flex
 * wrapper standing wider than the picture it frames, and a small figure
 * UPSCALED to the column all look alike in a screenshot and read identically
 * in a bug report. Each has a different painted box, so the instrument is the
 * same in every case: the element's own rendered width against the width the
 * image actually occupies inside it.
 *
 * `window.__imgBoxes()` is that instrument, exposed by +page.svelte, and the
 * route spec in tools/browser-verify/routes/ calls it rather than retyping any
 * number here. `svelte-check` cannot see any of this: every value it reports is
 * browser layout.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
