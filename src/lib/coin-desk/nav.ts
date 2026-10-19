/**
 * The /coin-desk route group's sub-navigation registry -- plain data, no
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
	| 'contracts'
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
		href: '/coin-desk',
		tier: 'full',
		blurb: 'Look up a student and log a fine, award, or purchase, for one student or a whole class. Recent autopay runs are below.'
	},
	{
		id: 'students',
		label: 'Students',
		href: '/coin-desk/students',
		tier: 'section',
		blurb: 'One student: balance over time, what they earn and spend, every fine, award and purchase, and an export.'
	},
	{
		id: 'contracts',
		label: 'Contracts',
		href: '/coin-desk/contracts',
		tier: 'full',
		blurb: 'Post a job (hourly, flat or quality-adjusted, or a restitution job for students in debt). Completions come through the queue.'
	},
	{
		id: 'roles',
		label: 'Roles',
		href: '/coin-desk/roles',
		tier: 'full',
		blurb: 'Applications, each class’s cap and switch, holders and their proven days, and the stipend.'
	},
	{
		id: 'economy',
		label: 'Economy',
		href: '/coin-desk/economy',
		tier: 'full',
		blurb: 'The category list: add a category, or retire one.'
	},
	{
		id: 'fine',
		label: 'Fine',
		href: '/coin-desk/fine',
		tier: 'section',
		blurb: 'The fine screen: pick a class, tap the students, tap the fine.'
	},
	{
		id: 'queue',
		label: 'Queue',
		href: '/coin-desk/queue',
		tier: 'section',
		blurb: 'Everything students submit, in one list: approve or deny each card, or approve all of one kind.'
	},
	{
		id: 'payday',
		label: 'Payday',
		href: '/coin-desk/payday',
		tier: 'section',
		blurb: 'Coins out and students in debt, one class at a time. Hand the coins out, untick anyone absent, press Done.'
	},
	{
		id: 'digest',
		label: 'Digest',
		href: '/coin-desk/digest',
		tier: 'section',
		blurb: 'The week: what autopay paid, who gained most, chronic debt, the queue, and money in against money out.'
	},
	{
		id: 'market',
		label: 'Market',
		href: '/coin-desk/market',
		tier: 'section',
		blurb: 'The IDEA Market: disputes, featuring and hiding listings, reviews, official cards, the classroom banner, transfers and the stocks.'
	},
	{
		id: 'tournaments',
		label: 'Tournaments',
		href: '/coin-desk/tournaments',
		tier: 'full',
		blurb: 'Concluded tournaments with rewards waiting: transfer them, or record that they were paid in coins.'
	},
	{
		id: 'settings',
		label: 'Settings',
		href: '/coin-desk/settings',
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
 * Which area a pathname belongs to. `/coin-desk` itself is the Log view, so
 * it is never matched as a prefix -- otherwise every sub-route would also read
 * as Log. Any other area owns its own sub-paths (`/coin-desk/fine/...`).
 */
export function areaForPath(pathname: string): CoinDeskAreaId {
	const clean = pathname.replace(/\/+$/, '') || '/';
	const match = COIN_DESK_AREAS.find(
		(a) => a.href !== '/coin-desk' && (clean === a.href || clean.startsWith(`${a.href}/`))
	);
	return match?.id ?? 'log';
}
