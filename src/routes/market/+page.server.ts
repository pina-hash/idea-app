import { parseCoinMyPage } from '$lib/coin-balance';
import { parseDonationItems, parseMyContracts } from '$lib/coin-balance/extras';
import { COIN_UPLOAD_BUCKET } from '$lib/coin-balance/uploads';
import { parseBoard, parseTransfer, type MarketBoard, type TransferRow } from '$lib/coin-market/market';
import { officialTiles, type OfficialTile } from '$lib/coin-market/official';
import type { PageServerLoad } from './$types';

/**
 * `/market`: the IDEA Market (ledger 0402, migration 0276).
 *
 * NOT IN `authedPrefixes`, the coin page's reason: a signed-out visitor gets a
 * sign-in panel that comes back here, not a bounce home.
 *
 * NOTHING HERE CAN FAIL THE PAGE BUT THE BOARD ITSELF. The catch-up autopay
 * run goes first and every error it raises is ignored (it also releases
 * trades whose window has passed). The board is `coin_market_board()`, which
 * takes no identity; a database without 0276 answers PGRST202 or 42883,
 * which is the "being set up" state. The official zone's reads (the coin
 * page's prices, the want list, the contracts) and the transfer feed are each
 * best effort: missing or failing, that part is simply not drawn. Listing
 * photos are five-minute signed URLs minted on the caller's own client; 0276
 * lets any signed-in person read a photo a live listing names.
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
	depends('coin:market');
	const userId = typeof locals.claims?.sub === 'string' ? locals.claims.sub : '';
	const empty = { board: null as MarketBoard | null, tiles: [] as OfficialTile[], feed: [] as TransferRow[], userId: '' };
	if (!locals.claims || !userId) return { state: 'signed_out' as const, ...empty };

	const sb = locals.supabase;
	try {
		await sb.rpc('coin_autopay_run', { p_trigger: 'page' });
	} catch {
		// Best effort, always.
	}

	const [answer, pageRaw, itemsRaw, contractsRaw, feedRaw] = await Promise.all([
		(async (): Promise<Rpc | null> => {
			try {
				return (await sb.rpc('coin_market_board')) as Rpc;
			} catch {
				return null;
			}
		})(),
		soft(sb.rpc('coin_my_page') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_donation_items_list') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_my_contracts') as PromiseLike<Rpc>),
		soft(sb.rpc('coin_public_transfers', { p_limit: 40 }) as PromiseLike<Rpc>)
	]);
	if (!answer) return { state: 'error' as const, ...empty };
	if (answer.error) {
		const code = answer.error.code ?? '';
		return { state: code === 'PGRST202' || code === '42883' ? ('updating' as const) : ('error' as const), ...empty };
	}
	const board = parseBoard(answer.data);
	if (!board) return { state: 'signed_out' as const, ...empty };

	const page = pageRaw ? parseCoinMyPage(pageRaw) : null;
	const tiles = officialTiles({
		shop: page
			? {
					eatingPass: page.eating_pass.price,
					extraCreditPerPoint: page.extra_credit.price_per_point,
					payRaiseCost: page.pay_raise.cost,
					gramsPerCoin: page.print.grams_per_coin,
					printActive: page.print.active
				}
			: null,
		donations: Array.isArray(itemsRaw) ? parseDonationItems(itemsRaw) : [],
		contracts: Array.isArray(contractsRaw) ? parseMyContracts(contractsRaw).filter((c) => !c.done_at) : [],
		staffCards: board.official,
		inDebt: board.me.balance < 0
	});
	const feed = Array.isArray(feedRaw) ? feedRaw.map(parseTransfer).filter((t): t is TransferRow => !!t) : [];

	const paths = [...new Set(board.listings.map((l) => l.photo_path).filter((p): p is string => !!p))];
	if (paths.length) {
		try {
			const { data } = await sb.storage.from(COIN_UPLOAD_BUCKET).createSignedUrls(paths, 300);
			const urls = new Map<string, string>();
			for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) urls.set(d.path, d.signedUrl);
			board.listings = board.listings.map((l) => ({ ...l, photo_url: l.photo_path ? (urls.get(l.photo_path) ?? null) : null }));
		} catch {
			// A picture that cannot be signed is a picture not drawn.
		}
	}

	return { state: 'ready' as const, board, tiles, feed, userId };
};
