/**
 * The in-memory market the /dev/coin-market harness mounts (ledger 0402):
 * a `coin_market_board()`-shaped payload, run through the real parser by the
 * page, with every escrow state on the "Your trades" list and a mix of
 * offers and requests across two classes. Names are invented.
 */

const CLASS_A = { section_id: 's-a', label: 'IDEA100 Block 1' };
const CLASS_B = { section_id: 's-b', label: 'IDEA209H Block 4' };

function person(id: string, name: string, classes = [CLASS_A], avg: number | null = 4.6, count = 5) {
	return { id, name, classes, rating: { average: avg, count } };
}

function listing(id: string, o: Record<string, unknown>) {
	return {
		id,
		zone: 'student',
		kind: 'offer',
		description: '',
		price: 2,
		category: 'service',
		quantity: null,
		remaining: 1,
		photo_path: null,
		link: null,
		section_id: null,
		section: null,
		featured: false,
		hidden: false,
		hidden_reason: null,
		closed: false,
		closed_reason: null,
		expired: false,
		expires_at: '2026-10-29T19:00:00Z',
		created_at: '2026-10-15T19:00:00Z',
		mine: false,
		owner: person('p-maya', 'Maya Torres'),
		...o
	};
}

type Row = Record<string, unknown> & { id: string };

/** Loosely typed on purpose: the harness edits it in place and the real parser reads it. */
export interface FixtureBoard {
	signed_in: boolean;
	in_economy: boolean;
	staff: boolean;
	me: { id: string; name: string; balance: number; open_listings: number };
	rules: Record<string, number>;
	listings: Row[];
	official: Row[];
	orders: Row[];
}

export function fixtureBoard(balance = 23.5): FixtureBoard {
	return {
		signed_in: true,
		in_economy: true,
		staff: false,
		me: { id: 'p-me', name: 'Ana Reyes', balance, open_listings: 2 },
		rules: { fee_percent: 0, max_open: 5, listing_days: 14, auto_release_days: 5, review_min_chars: 20, review_edit_hours: 24 },
		listings: [
			listing('l1', {
				title: 'Laser-cut name tags',
				description: 'Your name on 3 mm birch, cut on the shop laser. Ready next class.',
				price: 3.5,
				category: 'fabrication',
				featured: true,
				quantity: 6,
				remaining: 4
			}),
			listing('l2', {
				kind: 'request',
				title: 'Help sanding my bridge',
				description: 'Twenty minutes of sanding before the load test.',
				price: 2,
				category: 'service',
				owner: person('p-jon', 'Jon Park', [CLASS_B], 4, 2)
			}),
			listing('l3', {
				title: 'SolidWorks tutoring',
				description: 'Sketch relations and fillets, one class period.',
				price: 5,
				category: 'tutoring',
				owner: person('p-lee', 'Lee Chen', [CLASS_B], 5, 9)
			}),
			listing('l4', {
				title: 'Desktop wallpaper design',
				description: 'A custom 1920 by 1080 background with your team logo.',
				price: 1.25,
				category: 'design',
				owner: person('p-sam', 'Sam Ortiz', [CLASS_A], null, 0)
			}),
			listing('l5', {
				kind: 'request',
				title: 'Borrow calipers for a day',
				description: 'Digital calipers, returned tomorrow.',
				price: 0.5,
				category: 'product',
				owner: person('p-kai', 'Kai Brooks', [CLASS_A], 3.5, 4)
			}),
			listing('l6', {
				title: 'Keychain from my 3D printer',
				price: 1,
				category: 'product',
				owner: person('p-maya', 'Maya Torres')
			}),
			listing('m1', { title: 'Stickers of the IDEA gear', price: 0.75, category: 'product', mine: true, owner: { name: 'Ana Reyes' } }),
			listing('m2', {
				kind: 'request',
				title: 'Someone to proofread my lab report',
				price: 2,
				category: 'service',
				mine: true,
				hidden: true,
				hidden_reason: 'Ask your teacher before trading help on graded work',
				owner: { name: 'Ana Reyes' }
			})
		],
		official: [
			{
				...listing('o1', {}),
				zone: 'official',
				kind: 'official',
				title: 'Tissue boxes wanted',
				description: 'Bring one in, earn coins.',
				price: null,
				link: '/coin-balance',
				featured: true,
				owner: { name: 'IDEA staff' }
			}
		],
		orders: [
			order('t1', 'held', 'payer', 'Laser-cut name tags', 3.5, 'Maya Torres'),
			order('t2', 'delivered', 'payer', 'Keychain from my 3D printer', 1, 'Maya Torres', { can_confirm: true, can_dispute: true, class_days_since_delivery: 2 }),
			order('t3', 'held', 'payee', 'Stickers of the IDEA gear', 0.75, 'Jon Park', { can_deliver: true, can_cancel: true, can_dispute: true }),
			order('t4', 'disputed', 'payer', 'SolidWorks tutoring', 5, 'Lee Chen', { dispute_reason: 'The session was cut short.' }),
			order('t5', 'released', 'payer', 'Desktop wallpaper design', 1.25, 'Sam Ortiz', { can_review: true }),
			order('t6', 'refunded', 'payee', 'Stickers of the IDEA gear', 0.75, 'Kai Brooks')
		]
	};
}

function order(id: string, status: string, side: string, title: string, amount: number, other: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		listing_id: 'l',
		title,
		kind: 'offer',
		amount,
		status,
		side,
		other: { id: `p-${other}`, name: other },
		created_at: '2026-10-14T18:00:00Z',
		delivered_at: status === 'delivered' || status === 'released' ? '2026-10-15T18:00:00Z' : null,
		disputed_at: status === 'disputed' ? '2026-10-15T18:30:00Z' : null,
		dispute_reason: null,
		settled_at: null,
		to_payee: status === 'released' ? amount : null,
		fee: 0,
		resolution_note: null,
		class_days_since_delivery: null,
		auto_release_days: 5,
		can_deliver: false,
		can_cancel: false,
		can_confirm: false,
		can_dispute: status === 'held' || status === 'delivered',
		can_review: false,
		my_review: null,
		...extra
	};
}

export const FIXTURE_FEED = [
	{ id: 'x1', at: '2026-10-15T20:10:00Z', amount: 2, from: { id: 'a', name: 'Maya Torres' }, to: { id: 'b', name: 'Jon Park' }, message: 'For the sanding, thank you!', message_removed: false, private: false, fee: 0 },
	{ id: 'x2', at: '2026-10-15T19:40:00Z', amount: 0.5, from: { id: 'c', name: 'Lee Chen' }, to: { id: 'd', name: 'Kai Brooks' }, message: null, message_removed: false, private: false, fee: 0 },
	{ id: 'x3', at: '2026-10-14T21:00:00Z', amount: 5, from: { id: 'e', name: 'Sam Ortiz' }, to: { id: 'f', name: 'Ana Reyes' }, message: null, message_removed: true, private: false, fee: 0 }
];

export const FIXTURE_DIRECTORY = [
	{ id: 'p-maya', name: 'Maya Torres', classes: [CLASS_A] },
	{ id: 'p-jon', name: 'Jon Park', classes: [CLASS_B] },
	{ id: 'p-lee', name: 'Lee Chen', classes: [CLASS_B] },
	{ id: 'p-kai', name: 'Kai Brooks', classes: [CLASS_A] }
];
