import { parseCoinMyPage, type CoinMyPage } from '$lib/coin-balance';
import {
	parseAuditorQueue,
	parseDonationItems,
	parseMyContracts,
	parseMyStats,
	type CoinPageExtras
} from '$lib/coin-balance/extras';
import { COIN_UPLOAD_BUCKET } from '$lib/coin-balance/uploads';
import type { PageServerLoad } from './$types';

/**
 * `/coin-balance`: a student's own IDEA Coin page (IDEA Coin V2, 0241).
 *
 * It used to 308 to the Ledger, which was the single student hub while the
 * balance was two numbers and nothing could be bought. Since V2 a student buys
 * on their own, and that needs a signed-in page of their own; the Ledger stays
 * the public board.
 *
 * NOT IN `authedPrefixes`, deliberately: a signed-out visitor gets a sign-in
 * panel that returns here, not a bounce to the home page.
 *
 * THE FIRST CALL CANNOT FAIL THE PAGE. `coin_autopay_run('page')` is the
 * catch-up for weekly pay (idempotent and throttled in the database, 0242): it
 * runs first so a wage that is due shows up in the balance this page reads,
 * and every error it can raise is ignored. Then `coin_my_page()`, which takes
 * no identity parameter. A database without 0241 answers PGRST202 or 42883,
 * which is the "being updated" state rather than an error.
 *
 * SESSION TWO (0245 to 0249) ADDS FIVE READS, IN PARALLEL, AND NONE OF THEM
 * CAN FAIL THE PAGE EITHER. Each is its own function and each may be missing
 * on a database that has not applied its migration: a missing function, any
 * error, or an answer that does not parse is NULL, and the page simply draws
 * no section for it. Pictures in the private `coin-uploads` bucket are handed
 * down as five-minute signed URLs minted on the caller's own client.
 */

type Rpc = { data: unknown; error: { code?: string } | null };

async function soft(p: PromiseLike<Rpc>): Promise<unknown> {
	try {
		const r = await p;
		return r.error ? null : r.data;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals, depends }) => {
	depends('coin:page');
	const now = Date.now();
	const email = typeof locals.claims?.email === 'string' ? locals.claims.email.trim() : '';
	const userId = typeof locals.claims?.sub === 'string' ? locals.claims.sub : '';
	const empty = { page: null as CoinMyPage | null, extras: {} as CoinPageExtras, now, email: '', userId: '' };
	if (!locals.claims || !email) {
		return { state: 'signed_out' as const, ...empty };
	}

	try {
		await locals.supabase.rpc('coin_autopay_run', { p_trigger: 'page' });
	} catch {
		// Best effort, always. Pay that did not run now runs nightly.
	}

	const sb = locals.supabase;
	const [answer, contractsRaw, roleRaw, statsRaw, itemsRaw, auditRaw] = await Promise.all([
		(async (): Promise<Rpc | null> => {
			try {
				return (await sb.rpc('coin_my_page')) as Rpc;
			} catch {
				return null;
			}
		})(),
		soft(sb.rpc('coin_my_contracts') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_my_role') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_my_stats') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_donation_items_list') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_auditor_queue') as PromiseLike<Rpc>)
	]);

	if (!answer) return { state: 'error' as const, ...empty };
	if (answer.error) {
		const code = answer.error.code ?? '';
		const state = code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('error' as const);
		return { state, ...empty };
	}
	const page = parseCoinMyPage(answer.data);
	if (!page) return { state: 'signed_out' as const, ...empty };

	const roleObj = roleRaw && typeof roleRaw === 'object' ? (roleRaw as Record<string, unknown>) : null;
	const extras: CoinPageExtras = {
		contracts: Array.isArray(contractsRaw) ? parseMyContracts(contractsRaw) : null,
		stats: statsRaw ? parseMyStats(statsRaw) : null,
		donationItems: Array.isArray(itemsRaw) ? parseDonationItems(itemsRaw) : null,
		auditor: parseAuditorQueue(auditRaw),
		hasRole: !!roleObj && Array.isArray(roleObj.roles) && roleObj.roles.length > 0,
		backgroundUrl: null
	};

	// Signed URLs for the pictures this page draws, in one request.
	const paths = [
		...(page.background ? [page.background.photo_path] : []),
		...(extras.donationItems ?? []).map((i) => i.photo_path).filter((p): p is string => !!p)
	];
	if (paths.length) {
		try {
			const { data } = await sb.storage.from(COIN_UPLOAD_BUCKET).createSignedUrls(paths, 300);
			const urls = new Map<string, string>();
			for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
			if (page.background) extras.backgroundUrl = urls.get(page.background.photo_path) ?? null;
			if (extras.donationItems) {
				extras.donationItems = extras.donationItems.map((i) => ({
					...i,
					photo_url: i.photo_path ? (urls.get(i.photo_path) ?? null) : null
				}));
			}
		} catch {
			// A picture that cannot be signed is a picture not drawn.
		}
	}

	return { state: 'ready' as const, page, extras, now, email, userId };
};
