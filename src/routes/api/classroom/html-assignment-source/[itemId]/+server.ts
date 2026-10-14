import { error } from '@sveltejs/kit';
import { asciiSafeName } from '$lib/download-name';
import type { RequestHandler } from './$types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * THE ORIGINAL FILE OF A PORTED HTML ASSIGNMENT, as it was uploaded (ledger
 * 0380, report daaaaed1: "I should be able to download that HTML ... the file
 * before it was uploaded").
 *
 * `classroom_html_assignments.document` is that file verbatim (0195: nothing
 * rewrites a stored byte), so nothing new is stored and nothing older is lost.
 *
 * A MANAGER'S, ON THEIR OWN SESSION. It reads under the caller's own client, so
 * RLS ("follows its item") is the first gate, and then the item must be posted
 * to a class the caller manages. Every refusal is the same bodyless 404 (not
 * signed in, not a uuid, not theirs, no document), so the route cannot be used
 * to ask which items are worksheets.
 *
 * IT IS A DOWNLOAD AND NEVER A PAGE. On this origin, which holds the session
 * cookies, a `text/html` response would run a worksheet's script with the
 * teacher's rights; `application/octet-stream` + `attachment` + `nosniff` + a
 * sandbox policy means the browser only saves it. The worksheet runs where it
 * always has, on `/hx/<id>` under its own sandbox.
 */
export const GET: RequestHandler = async ({ params, locals: { supabase, claims } }) => {
	if (!claims || !UUID.test(params.itemId)) error(404);

	const { data: postings } = await supabase.from('classroom_postings').select('section_id').eq('item_id', params.itemId);
	let manages = false;
	for (const p of (postings ?? []) as Array<{ section_id: string }>) {
		const { data } = await supabase.rpc('classroom_manages_section', { p_section_id: p.section_id });
		if (data === true) {
			manages = true;
			break;
		}
	}
	if (!manages) error(404);

	const { data: row } = await supabase
		.from('classroom_html_assignments')
		.select('document, filename')
		.eq('item_id', params.itemId)
		.maybeSingle();
	const doc = (row as { document?: unknown; filename?: unknown } | null)?.document;
	if (typeof doc !== 'string' || doc === '') error(404);

	const stored = typeof (row as { filename?: unknown }).filename === 'string' ? ((row as { filename: string }).filename) : '';
	const name = `${asciiSafeName(stored.replace(/\.html?$/i, '')) || 'assignment'}.html`;
	return new Response(doc, {
		headers: {
			'content-type': 'application/octet-stream',
			'content-disposition': `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(stored || name)}`,
			'x-content-type-options': 'nosniff',
			'content-security-policy': 'sandbox',
			'cache-control': 'private, no-store'
		}
	});
};
