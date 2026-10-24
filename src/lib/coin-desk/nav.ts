/**
 * The coin staff areas' sub-navigation registry (the Coin Desk's areas, folded
 * into the coin home at /coin/<area> by ledger 0432; the old /coin-desk
 * addresses answer a redirect, `coinDeskRedirect` below) -- plain data, no
 * Svelte, no Supabase (the curriculum.ts / portal-apps.ts convention), so the
 * real layout and the dev harness can both drive the SAME nav from one list.
 *
 * Order here IS the order rendered. `href` is the real route; the dev harness
 * ignores it and switches on `id` instead (see CoinDeskNav.svelte).
 *
 * TWO TIERS (decision 68, migration 0244). `full` areas belong to a full coin
 * admin (the owner, plus the settings page's list) and are 404 to anyone
 * else; `section` areas are also open to section coin staff (every other
 * admin, and every class's teacher of record), who see only their own
 * students in them. The database enforces both; this list only decides what
 * is offered.
 */
export interface CoinDeskArea {
	id: CoinDeskAreaId;
	label: string;
	href: string;
	/** One-line description of what the area is for, shown under the nav. */
	blurb: string;
	/** Who the area is for: full coin admins only, or section staff too. */
	tier: CoinDeskTier;
}

export type CoinDeskTier = 'full' | 'section';
export type CoinStaffScope = 'full' | 'section';

export type CoinDeskAreaId =
	| 'log'
	| 'fine'
	| 'students'
	| 'roles'
	| 'economy'
	| 'queue'
	| 'payday'
	| 'digest'
	| 'market'
	| 'tournaments'
	| 'settings';

export const COIN_DESK_AREAS: CoinDeskArea[] = [
	// The first five keep their places: harness specs reach an area by its
	// position in this row.
	{
		id: 'log',
		label: 'Log',
		href: '/coin/log',
		tier: 'full',
		blurb: 'Look up a student and log a fine, award, or purchase, for one student or a whole class. Recent autopay runs are below.'
	},
	{
		id: 'students',
		label: 'Students',
		href: '/coin/students',
		tier: 'section',
		blurb: 'One student: balance over time, what they earn and spend, every fine, award and purchase, and an export.'
	},
	{
		id: 'roles',
		label: 'Roles',
		href: '/coin/roles',
		tier: 'full',
		blurb: 'Applications, each class’s cap and switch, holders and their proven days, and the stipend.'
	},
	{
		id: 'economy',
		label: 'Economy',
		href: '/coin/economy',
		tier: 'full',
		blurb: 'The category list: add a category, or retire one.'
	},
	{
		id: 'fine',
		label: 'Fine',
		href: '/coin/fine',
		tier: 'section',
		blurb: 'The fine screen: pick a class, tap the students, tap the fine.'
	},
	{
		id: 'queue',
		label: 'Queue',
		href: '/coin/queue',
		tier: 'section',
		blurb: 'Everything students submit, in one list: approve or deny each card, or approve all of one kind.'
	},
	{
		id: 'payday',
		label: 'Payday',
		href: '/coin/payday',
		tier: 'section',
		blurb: 'Coins out and students in debt, one class at a time. Hand the coins out, untick anyone absent, press Done.'
	},
	{
		id: 'digest',
		label: 'Digest',
		href: '/coin/digest',
		tier: 'section',
		blurb: 'The week: what autopay paid, who gained most, chronic debt, the queue, and money in against money out.'
	},
	{
		id: 'market',
		label: 'Market',
		href: '/coin/market',
		tier: 'section',
		blurb: 'The IDEA Market: disputes, featuring and hiding listings, reviews, official cards, the classroom banner, transfers and the stocks.'
	},
	{
		id: 'tournaments',
		label: 'Tournaments',
		href: '/coin/tournaments',
		tier: 'full',
		blurb: 'Concluded tournaments with rewards waiting: transfer them, or record that they were paid in coins.'
	},
	{
		id: 'settings',
		label: 'Settings',
		href: '/coin/settings',
		tier: 'full',
		blurb: 'Prices, autopay, the calendars, every limit, who holds full coin powers, the want list and the Student Auditors. Every change is recorded.'
	}
	// There was a Debt area. Payday lists every student in debt per class and
	// takes a debt paid in coins, so it went (IDEA Coin V2 session two).
];

/** The areas one tier of coin staff is offered, in order. */
export function areasForScope(scope: CoinStaffScope): CoinDeskArea[] {
	return COIN_DESK_AREAS.filter((a) => scope === 'full' || a.tier === 'section');
}

/** Whether one tier may open one area. */
export function areaAllowed(id: CoinDeskAreaId, scope: CoinStaffScope): boolean {
	const area = COIN_DESK_AREAS.find((a) => a.id === id);
	return !!area && (scope === 'full' || area.tier === 'section');
}

/**
 * Which area a pathname belongs to. Each area owns its own sub-paths
 * (`/coin/fine/...`); anything else is the Log view.
 */
export function areaForPath(pathname: string): CoinDeskAreaId {
	const clean = pathname.replace(/\/+$/, '') || '/';
	const match = COIN_DESK_AREAS.find((a) => clean === a.href || clean.startsWith(`${a.href}/`));
	return match?.id ?? 'log';
}

/** The first area a tier lands on: the Log for a full coin admin, the fine screen otherwise. */
export function coinStaffHome(scope: CoinStaffScope): string {
	return scope === 'full' ? '/coin/log' : '/coin/fine';
}

/**
 * THE OLD /coin-desk ADDRESSES (ledger 0432). The Coin Desk is not its own
 * app any more: its areas live under the coin home, and every old address
 * (bookmarks, pushes, links on other pages) answers a redirect. An area that
 * still exists goes to its new address with the query kept; the desk's front
 * door, the retired Contracts area and anything unknown go to the coin home.
 * The target is the same for every caller, so it says nothing about who may
 * open an area: that is each area's own 404.
 */
export function coinDeskRedirect(rest: string, search = ''): string {
	const first = rest.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
	const area = COIN_DESK_AREAS.find((a) => a.id === first && a.id !== 'log');
	if (!area) return '/coin';
	const tail = rest.replace(/^\/+|\/+$/g, '').split('/').slice(1).join('/');
	return `${area.href}${tail ? `/${tail}` : ''}${search}`;
}
