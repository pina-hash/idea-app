/**
 * The /coin-desk route group's sub-navigation registry -- plain data, no
 * Svelte, no Supabase (the curriculum.ts / portal-apps.ts convention), so the
 * real layout and the dev harness can both drive the SAME nav from one list.
 *
 * Order here IS the order rendered. `href` is the real route; the dev harness
 * ignores it and switches on `id` instead (see CoinDeskNav.svelte).
 */
export interface CoinDeskArea {
	id: CoinDeskAreaId;
	label: string;
	href: string;
	/** One-line description of what the area is for, shown under the nav. */
	blurb: string;
}

export type CoinDeskAreaId =
	| 'log'
	| 'fine'
	| 'students'
	| 'debt'
	| 'contracts'
	| 'roles'
	| 'economy'
	| 'settings';

export const COIN_DESK_AREAS: CoinDeskArea[] = [
	// The first five keep their places: harness specs reach an area by its
	// position in this row. V2's three (Fine, Debt, Settings) follow them.
	{
		id: 'log',
		label: 'Log',
		href: '/coin-desk',
		blurb: 'Look up a student and log a fine, award, or purchase, for one student or a whole section. Recent autopay runs are below.'
	},
	{
		id: 'students',
		label: 'Students',
		href: '/coin-desk/students',
		blurb: 'Sections and rosters, plus one student by email: balance, history with undo, adjustments and coin-paid purchases.'
	},
	{
		id: 'contracts',
		label: 'Contracts',
		href: '/coin-desk/contracts',
		blurb: 'Post a job, watch students claim it, complete it (splitting the payout) or cancel it.'
	},
	{
		id: 'roles',
		label: 'Roles',
		href: '/coin-desk/roles',
		blurb: 'Applications, ratio capacity, current holders, and the Weekly Role Stipend.'
	},
	{
		id: 'economy',
		label: 'Economy',
		href: '/coin-desk/economy',
		blurb: 'The category list, and paying out a positive balance in physical coins.'
	},
	{
		id: 'fine',
		label: 'Fine',
		href: '/coin-desk/fine',
		blurb: 'The fine screen: pick a class, tap the students, tap the fine.'
	},
	{
		id: 'debt',
		label: 'Debt',
		href: '/coin-desk/debt',
		blurb: 'Every student whose balance is below zero, deepest first.'
	},
	{
		id: 'settings',
		label: 'Settings',
		href: '/coin-desk/settings',
		blurb: 'Prices, autopay, no-pay weeks, hall pass thresholds, which classes are in the economy, and the fine buttons. Every change is recorded.'
	}
	// There was a sixth area, Migrate: the one-time wizard that pulled the legacy
	// Google Sheets ledger into this one. That import ran, reconciled, and is
	// done, and the Sheets system it read from is retired, so the wizard went
	// with it (docs/coin-economy/archive/legacy-system/). The 0084 import schema
	// and its RPCs are still live -- including the rollback -- but they are
	// reached from the Supabase SQL editor now, not from a page here.
];

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
