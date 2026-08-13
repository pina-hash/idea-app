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

export type CoinDeskAreaId = 'log' | 'students' | 'contracts' | 'roles' | 'economy';

export const COIN_DESK_AREAS: CoinDeskArea[] = [
	{
		id: 'log',
		label: 'Log',
		href: '/coin-desk',
		blurb: 'Look up a student and log a fine, award, or purchase -- one student or a whole section.'
	},
	{
		id: 'students',
		label: 'Students',
		href: '/coin-desk/students',
		blurb: 'Sections and rosters, plus balance lookup and signed adjustments by email.'
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
		blurb: 'The category price list, and paying out positive balances.'
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
 * an exact match wins before any prefix test -- otherwise every sub-route
 * would also read as Log.
 */
export function areaForPath(pathname: string): CoinDeskAreaId {
	const clean = pathname.replace(/\/+$/, '') || '/';
	const match = COIN_DESK_AREAS.find((a) => a.href !== '/coin-desk' && clean === a.href);
	return match?.id ?? 'log';
}
