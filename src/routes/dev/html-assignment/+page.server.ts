import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { HX_DOCUMENT_IDS, hxFieldMap } from '../../hx/_documents';
import type { PageServerLoad } from './$types';

/**
 * THE BOUNDARY HARNESS. Dev only: 404 in production, no auth, no database.
 *
 * IT MOUNTS THE REAL `HtmlAssignmentFrame` POINTED AT THE REAL `/hx/` ROUTE.
 * Nothing here is a copy of anything -- no `srcdoc`, no stand-in document, no
 * second sandbox attribute. That matters more here than on an ordinary harness:
 * a containment control run against a `srcdoc` frame would be measuring a
 * different document, on a different origin, under a CSP nobody sent, and would
 * prove nothing about the route that actually serves a student's upload.
 *
 * THE DEFAULT DOCUMENT IS THE HOSTILE ONE. `/hx/probe` attempts every escape
 * this feature exists to refuse and reports each attempt back up the ORDINARY
 * bridge, so the results travel the exact path a student's answer travels.
 * `?doc=worksheet` is the happy path, for driving the state round trip.
 *
 * THE FIELD MAP COMES FROM THE SERVER, which is the shape the real surface has:
 * a parent holds the map it built from the manifest it stored at import, and
 * the frame cannot influence it. There is no import path yet, so it comes from
 * the fixture module instead -- but it comes from the PARENT SIDE either way,
 * which is the property the mapping rule rests on.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');

	const docId = url.searchParams.get('doc') ?? 'probe';
	const configured = (env.PUBLIC_HX_SANDBOX_ORIGIN ?? '').trim().replace(/\/+$/, '');

	return {
		docId,
		documentIds: HX_DOCUMENT_IDS,
		/*
			THE SANDBOX ORIGIN, WHICH LOCALLY IS THIS SAME SERVER -- and that is
			worth stating rather than hiding, because it is the one way the local
			measurement is weaker than production. With one origin the frame and the
			page around it are the same site, so the `event.origin` check cannot
			separate them and the SOURCE check is what does the work. In production
			they are two hosts and both refusals are independent. The containment
			controls are unaffected: the sandbox makes the document's origin OPAQUE
			whether or not the server it came from is this one, which is why
			`window.origin` reads `null` in the frame here exactly as it will there.
		*/
		sandboxOrigin: configured || url.origin,
		configuredSandboxOrigin: configured,
		fieldToBlockId: hxFieldMap(docId, dev)
	};
};
