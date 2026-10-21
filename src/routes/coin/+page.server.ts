import { parseCoinMyPage } from '$lib/coin-balance';
import { parseBoard } from '$lib/coin-market/market';
import { parseStocksBoard } from '$lib/coin-stocks/stocks';
import { coinHomeFrom, parseLeaderboard } from '$lib/coin-bar/home';
import { coinStaff } from '$lib/server/coin-scope';
import type { PageServerLoad } from './$types';

/**
 * `/coin`: THE COIN HOME (ledger 0422, feedback d299d864). One condensed
 * preview of every coin page, each opening its full page.
 *
 * PUBLIC, like the Ledger it previews: signed out, the Ledger's preview is
 * drawn from the same public board (`coin_public_leaderboard`, granted to
 * anon, every address projected away in the database) and every other preview
 * asks the visitor to sign in. Not in `authedPrefixes`, for the reason
 * `/coin-balance` is not: a sign-in panel beats a bounce home.
 *
 * READS ONLY, AND NOTHING CAN FAIL THE PAGE. Each preview is its page's own
 * read, run in parallel and best effort: a missing function, an error or an
 * answer that does not parse draws that preview's empty state. The catch-up
 * runs the full pages make (autopay, the stock tick) are theirs; a preview
 * shows what is recorded.
 */

type Rpc = { data: unknown; error: unknown };

async function soft(p: PromiseLike<Rpc>): Promise<unknown> {
	try {
		const r = await p;
		return r.error ? null : r.data;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const sb = locals.supabase;
	const sub = typeof locals.claims?.sub === 'string' ? locals.claims.sub : '';
	const signedIn = !!sub;
	const none = Promise.resolve(null);
	const [mineRaw, boardRaw, marketRaw, stocksRaw, staff] = await Promise.all([
		signedIn ? soft(sb.rpc('coin_my_page') as PromiseLike<Rpc>) : none,
		soft(sb.rpc('coin_public_leaderboard') as PromiseLike<Rpc>),
		signedIn ? soft(sb.rpc('coin_market_board') as PromiseLike<Rpc>) : none,
		signedIn ? soft(sb.rpc('coin_stocks_board') as PromiseLike<Rpc>) : none,
		signedIn ? coinStaff(sb, sub).catch(() => null) : none
	]);
	const home = coinHomeFrom({
		signedIn,
		mine: mineRaw ? parseCoinMyPage(mineRaw) : null,
		leaderboard: parseLeaderboard(boardRaw),
		market: marketRaw ? parseBoard(marketRaw) : null,
		stocks: stocksRaw ? parseStocksBoard(stocksRaw) : null,
		staff: staff ? staff.scope : null
	});
	return { home, coinDesk: !!staff };
};
