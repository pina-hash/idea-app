import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import {
	fieldBlockMap,
	validateHtmlManifest
} from '$lib/classroom/html-assignment/manifest';
import fixture from '../../html-assignment/fixtures/idea100-blade-01.ported.html?raw';
import type { PageServerLoad } from './$types';

/**
 * THE INSTRUCTOR WORKING COPY OF A PORTED WORKSHEET (0199). Dev only: 404 in
 * production, no auth, no database, no network.
 *
 * IT MOUNTS THE REAL `HtmlInstructorCopy` OVER THE REAL PORTED DOCUMENT --
 * IDEA100 Blade CAD 01, the actual export -- served by `./doc` through `/hx/`'s
 * own header builder. Every piece is the shipping one: the component, the frame
 * inside it, the `HxAnswersStore`, `hxInstructorAnswerTransports`, and the
 * manifest read out of the document's own bytes by the REAL validator. Nothing
 * is a `srcdoc`, a stand-in document or a second sandbox attribute -- a harness
 * missing a mechanism the real page has makes a passing drive prove nothing,
 * and the mechanism that matters most here is that the document is genuinely
 * cross-document and genuinely sandboxed, so an answer really does have to
 * travel the bridge to be recorded.
 *
 * THE MANIFEST COMES OUT OF THE SAME BYTES THE FRAME RUNS, through
 * `validateHtmlManifest`, exactly as an import does. A harness that typed the
 * manifest out beside the fixture would be two declarations of one document,
 * and the one the frame is running would not be the one the controller resolved
 * block ids against -- which is the single failure this surface exists to let a
 * teacher catch.
 *
 * THE FIELD MAP IS BUILT FROM THAT MANIFEST BY `fieldBlockMap`, the ONE
 * implementation of the mapping, on the PARENT side. A frame naming a block id
 * directly gets nowhere, which is the whole mechanism, and it only holds if the
 * map the parent holds is the parent's.
 *
 * WHAT IT CANNOT SHOW is the database. The transports on the page are in-memory
 * stand-ins for 0128's, so what is measured here is that a keystroke reaches
 * `saveResponse` with the right block id and that a photograph is refused in
 * words. That the RPC then ACCEPTS those block ids is measured against a real
 * Postgres in `tests/db/html-assignment-instructor-gate.test.ts`, which is the
 * half a harness cannot do.
 */
export const load: PageServerLoad = async () => {
	if (!dev) error(404, 'Not found');

	const { manifest, errors } = validateHtmlManifest(fixture);
	if (!manifest) error(500, `The ported fixture did not validate: ${errors.join(' ')}`);

	return {
		manifest,
		fieldToBlockId: Object.fromEntries(fieldBlockMap(manifest)),
		/*
			A RELATIVE URL, which is `htmlAssignmentSrc`'s own answer for an unset
			sandbox origin: it resolves against whatever host this page is on, so
			nothing has to be configured. Locally that means the frame and the page
			are the same SITE, which is stated rather than hidden -- the boundary
			harness says the same about itself. The document is still SANDBOXED, so
			its origin is opaque and the bridge is still the only way an answer
			gets out.
		*/
		src: '/dev/html-instructor/copy/doc'
	};
};
