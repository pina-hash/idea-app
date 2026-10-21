import { parseMyRole, type CoinRole } from '$lib/coin-balance/role';
import { coinBarDesk } from '$lib/server/coin-bar';
import { COIN_UPLOAD_BUCKET } from '$lib/coin-balance/uploads';
import type { PageServerLoad } from './$types';

/**
 * `/coin-balance/role`: a student's class-role portal (IDEA Coin V2 2.5, 0247).
 *
 * Signed in only, and NOT in `authedPrefixes` for the same reason as
 * `/coin-balance`: a signed-out visitor gets a sign-in panel that returns
 * here. One read, `coin_my_role()`, which takes no identity parameter. A
 * database without 0247 answers PGRST202 or 42883, the "being updated" state.
 *
 * The day photos sit in the private `coin-uploads` bucket; each is handed
 * down as a five-minute signed URL minted on the caller's own client, so the
 * bucket's own policy decides what can be signed.
 */
const loadPage = async ({ locals, depends }: Parameters<PageServerLoad>[0]) => {
	depends('coin:role');
	const userId = typeof locals.claims?.sub === 'string' ? locals.claims.sub : '';
	if (!locals.claims || !userId) {
		return { state: 'signed_out' as const, roles: null as CoinRole[] | null, userId: '' };
	}
	let answer: { data: unknown; error: { code?: string } | null };
	try {
		answer = await locals.supabase.rpc('coin_my_role');
	} catch {
		return { state: 'error' as const, roles: null as CoinRole[] | null, userId };
	}
	if (answer.error) {
		const code = answer.error.code ?? '';
		const state = code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('error' as const);
		return { state, roles: null as CoinRole[] | null, userId };
	}
	const roles = parseMyRole(answer.data);
	if (!roles) return { state: 'signed_out' as const, roles: null as CoinRole[] | null, userId: '' };

	const paths = roles.flatMap((r) => r.days.flatMap((d) => d.photo_paths.map((p) => p.path)));
	if (paths.length) {
		try {
			const { data } = await locals.supabase.storage.from(COIN_UPLOAD_BUCKET).createSignedUrls(paths, 300);
			const urls = new Map<string, string>();
			for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
			for (const r of roles) for (const d of r.days) for (const p of d.photo_paths) p.url = urls.get(p.path) ?? null;
		} catch {
			// A photo that cannot be signed is listed with its time and no picture.
		}
	}
	return { state: 'ready' as const, roles, userId };
};

/** Ledger 0422: every coin page carries the IDEA Coin bar; the Coin Desk tab is coin staff's alone. */
export const load: PageServerLoad = async (event) => {
	const [page, coinDesk] = await Promise.all([loadPage(event), coinBarDesk(event.locals)]);
	return { ...page, coinDesk };
};
