import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the ITEM PAGE'S INSTRUCTOR INSPECTOR.
 *
 * Nothing covered this region in a browser before. `/dev/classroom-split`
 * mounts the real ItemDetail as a teacher and is where the two-pane GEOMETRY is
 * measured, but it wires neither `spec`/`rubric` nor `instructorAttachments`,
 * so the assignment-engine block and the instructor-only block have never been
 * on screen in an automated pass -- and the real `/classroom` page needs a
 * Bosco Tech Google session no automated run can hold.
 *
 * WHAT IT EXISTS TO MAKE DRIVABLE:
 *
 *   ?case=assignment  a manager on an assignment carrying a spec, a rubric and
 *                     a grading console href -- the fullest inspector there is,
 *                     with all three groups present.
 *   ?case=material    a manager on a material with a reference document, a deck
 *                     and no assignment engine -- so the group headings are
 *                     read against a DIFFERENT set of present blocks.
 *   ?case=sparse      every optional transport null. Only the blocks a bare
 *                     deployment offers render, which is what proves a group
 *                     with nothing in it renders NOTHING rather than a heading
 *                     over empty space.
 *   ?case=student     canManage false. The whole region is absent; this is the
 *                     positive control for every "instructor-only" claim.
 *
 * `?open=1` opens the inspector on load. The open flag is module state in
 * `inspector.svelte.ts` and starts collapsed, which is correct for the product
 * and inconvenient for a harness that has to measure the body -- so the page
 * sets it, rather than the harness clicking and hoping. `?open=0` (the default)
 * leaves it as the component would.
 *
 * The transports are stubs that resolve without doing anything: this route is
 * for the inspector's ARRANGEMENT and its geometry. /dev/classroom and
 * /dev/classroom-phase1 are where the write paths are driven against an
 * in-memory store.
 *
 * 404s in production.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
