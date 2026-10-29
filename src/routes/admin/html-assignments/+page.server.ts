import { error, fail } from '@sveltejs/kit';
import { stamp } from 'virtual:hx-kit-stamp';
import { isAdmin } from '$lib/server/admin';
import {
	htmlHealth,
	parseKitStamp,
	sourceIdentity,
	type CommittedSource,
	type HtmlHealthRow
} from '$lib/classroom/html-assignment/health';
import type { Actions, PageServerLoad } from './$types';

/**
 * THE HTML ASSIGNMENTS HEALTH LIST (ledger 0458, report 3bf69806): every HTML
 * post in every class with the kit it was built on, whether its source is
 * stored, and a key where a newer kit has not reached it. Admin only; anyone
 * else gets 404 (the /admin rule), and `classroom_html_health` re-checks.
 *
 * THE COMMITTED SOURCES are read at build time from `assignment-sources/`,
 * lazily, so only this route's server chunk carries them. A post whose stored
 * manifest names the same title and course as exactly one of them can take it
 * with one key (report 013c83d0: "sources already in assignment-sources/
 * attach to their live posts").
 */
const SOURCES = import.meta.glob('/assignment-sources/**/*.src.html', { query: '?raw', import: 'default' });

async function committedSources(): Promise<CommittedSource[]> {
	const out: CommittedSource[] = [];
	for (const [path, load] of Object.entries(SOURCES)) {
		const text = (await load()) as string;
		out.push({ path: path.replace(/^\//, ''), ...sourceIdentity(text), text });
	}
	return out.sort((a, b) => a.path.localeCompare(b.path));
}

async function gate(supabase: App.Locals['supabase'], claims: App.Locals['claims']) {
	if (!claims) error(404, 'Not found');
	if (!(await isAdmin(supabase, claims.sub))) error(404, 'Not found');
}

export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	await gate(supabase, claims);
	const { data, error: readError } = await supabase.rpc('classroom_html_health');
	const committed = await committedSources();
	const kitNow = parseKitStamp(stamp);
	if (readError) {
		return {
			unavailable: readError.code === 'PGRST202' ? 'This list arrives with the next site update.' : 'The list could not be read. Reload the page to try again.',
			entries: [],
			kitNow,
			committed: committed.length
		};
	}
	const entries = htmlHealth((data ?? []) as HtmlHealthRow[], committed, kitNow).map((e) => ({
		...e,
		committed: e.committed ? { path: e.committed.path } : null
	}));
	return { unavailable: null, entries, kitNow, committed: committed.length };
};

export const actions: Actions = {
	/** Store a committed source with the one post it matches. */
	attach: async ({ request, locals: { supabase, claims } }) => {
		await gate(supabase, claims);
		const form = await request.formData();
		const itemId = String(form.get('item_id') ?? '');
		const path = String(form.get('path') ?? '');
		const source = (await committedSources()).find((c) => c.path === path);
		if (!itemId || !source) return fail(400, { message: 'That source is not one of the committed sources.' });
		const name = path.split('/').pop() ?? 'assignment.src.html';
		const { error: writeError } = await supabase.rpc('classroom_html_set_source', {
			p_item_id: itemId,
			p_source: source.text,
			p_filename: name
		});
		if (writeError) return fail(400, { message: writeError.message });
		return { attached: itemId };
	}
};
