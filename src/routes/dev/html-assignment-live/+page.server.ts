import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';
import { hxDocument, hxFieldMap } from '../../hx/_documents';
import type { PageServerLoad } from './$types';

/**
 * THE LIVE-WORKSHEET HARNESS (ledger 0431): the real frame, the real progress
 * rail and the real Answers left list over the real `/hx/` worksheet fixture,
 * with a Close and a Reopen that move the lock the way the item page's
 * heartbeat does. The manifest is read out of the served document itself, the
 * one the parent stores at import, so the list and the document cannot be
 * describing two different worksheets.
 */
export const load: PageServerLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const docId = url.searchParams.get('doc') ?? 'worksheet';
	const doc = hxDocument(docId, dev);
	if (!doc) error(404, 'Not found');
	const raw = /<script type="application\/json" id="idea-manifest">([\s\S]*?)<\/script>/.exec(doc.html)?.[1] ?? 'null';
	const configured = (env.PUBLIC_HX_SANDBOX_ORIGIN ?? '').trim().replace(/\/+$/, '');
	return {
		docId,
		manifest: JSON.parse(raw) as unknown,
		sandboxOrigin: configured || url.origin,
		fieldToBlockId: hxFieldMap(docId, dev),
		lock: url.searchParams.get('lock') === 'closed' ? ('closed' as const) : ('open' as const),
		expanded: url.searchParams.get('full') === '1',
		spacer: url.searchParams.get('spacer') !== '0'
	};
};
