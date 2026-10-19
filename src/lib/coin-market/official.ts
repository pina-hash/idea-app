/**
 * THE OFFICIAL ZONE (ledger 0402): one roof over everything the economy
 * itself offers. Each tile OPENS AN EXISTING FLOW and never buys anything on
 * its own, so the purchase logic stays where it is (the coin page's shop, the
 * donation panel, the background panel, the contracts list). Pure, so the
 * route and the harness build the identical tile list.
 */

import { coins, coinNumber } from '$lib/coin-format';
import type { Listing } from './market';

export type OfficialKind = 'shop' | 'donation' | 'background' | 'contract' | 'official';

export interface OfficialTile {
	key: string;
	kind: OfficialKind;
	title: string;
	line: string;
	price: string | null;
	href: string;
	featured: boolean;
}

export interface OfficialInputs {
	shop: {
		eatingPass: number | null;
		extraCreditPerPoint: number | null;
		payRaiseCost: number | null;
		gramsPerCoin: number | null;
		printActive: boolean;
	} | null;
	donations: { id: string; name: string; rate: number | null }[];
	contracts: {
		id: string;
		title: string;
		pay_type: 'flat' | 'hourly' | 'quality';
		payout_amount: number | null;
		hourly_rate: number | null;
		debt_only: boolean;
		section: string | null;
	}[];
	staffCards: Listing[];
	inDebt: boolean;
}

/** The coin page's own anchors, so a tile lands on the panel it names. */
export const OFFICIAL_HREF = {
	shop: '/coin-balance#cp-h-buy',
	background: '/coin-balance#cpx-h-bg',
	coinPage: '/coin-balance'
} as const;

function contractPay(c: OfficialInputs['contracts'][number]): string {
	if (c.pay_type === 'hourly') return c.hourly_rate !== null ? `${coins(c.hourly_rate)} an hour` : 'Paid by the hour';
	if (c.pay_type === 'quality') return c.payout_amount !== null ? `Up to ${coins(c.payout_amount)}` : 'Paid by quality';
	return c.payout_amount !== null ? coins(c.payout_amount) : 'Flat pay';
}

export function officialTiles(i: OfficialInputs): OfficialTile[] {
	const out: OfficialTile[] = [];
	for (const c of i.staffCards) {
		out.push({
			key: `official:${c.id}`,
			kind: 'official',
			title: c.title,
			line: c.description || (c.section ? `For ${c.section}` : 'From IDEA staff'),
			price: c.price !== null ? coins(c.price) : null,
			href: c.link ?? OFFICIAL_HREF.coinPage,
			featured: c.featured
		});
	}
	// Contracts are featured listings: admin jobs, including restitution jobs
	// a student in debt can take to work it off.
	for (const c of i.contracts) {
		if (c.debt_only && !i.inDebt) continue;
		out.push({
			key: `contract:${c.id}`,
			kind: 'contract',
			title: c.title,
			line: c.debt_only ? 'Restitution job: work off a debt.' : c.section ? `Contract, ${c.section}` : 'Contract from IDEA staff',
			price: contractPay(c),
			href: OFFICIAL_HREF.coinPage,
			featured: true
		});
	}
	const s = i.shop;
	if (s) {
		if (s.eatingPass !== null)
			out.push({ key: 'shop:eating_pass', kind: 'shop', title: 'Eating Pass', line: 'Eat in class while it lasts.', price: coins(s.eatingPass), href: OFFICIAL_HREF.shop, featured: false });
		if (s.extraCreditPerPoint !== null)
			out.push({ key: 'shop:extra_credit', kind: 'shop', title: 'Extra Credit', line: 'Points on returned work, within your class limit.', price: `${coins(s.extraCreditPerPoint)} a point`, href: OFFICIAL_HREF.shop, featured: false });
		if (s.payRaiseCost !== null)
			out.push({ key: 'shop:pay_raise', kind: 'shop', title: 'Pay Raise', line: 'One more coin on every weekly wage.', price: coins(s.payRaiseCost), href: OFFICIAL_HREF.shop, featured: false });
		if (s.printActive && s.gramsPerCoin !== null)
			out.push({ key: 'shop:print', kind: 'shop', title: '3D print', line: 'Paid by the gram your slicer reports.', price: `1 i¢ per ${coinNumber(s.gramsPerCoin)} g`, href: OFFICIAL_HREF.shop, featured: false });
	}
	for (const d of i.donations) {
		out.push({
			key: `donation:${d.id}`,
			kind: 'donation',
			title: `Wanted: ${d.name}`,
			line: 'Bring one in and claim it with a photo.',
			price: d.rate !== null ? `Earn ${coins(d.rate)}` : 'Priced at approval',
			href: OFFICIAL_HREF.coinPage,
			featured: false
		});
	}
	out.push({
		key: 'background',
		kind: 'background',
		title: 'Desktop background',
		line: 'Make one for the class computers.',
		price: 'Earn coins',
		href: OFFICIAL_HREF.background,
		featured: false
	});
	return out;
}
