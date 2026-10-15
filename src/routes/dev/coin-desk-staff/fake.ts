/**
 * AN IN-MEMORY BACKEND for `/dev/coin-desk-staff`, shaped like the answers of
 * 0245 (`coin_queue`, `coin_queue_decide`, `coin_queue_approve_all`), 0246
 * (`coin_payday`, `coin_payday_settle`, `coin_payday_debt_payment`), 0248
 * (`coin_tournament_transfers`, `coin_tournament_settle`) and 0249
 * (`coin_digest`, `coin_digest_notify_set`, plus `coin_reverse_transaction`).
 *
 * THE SCOPE IS MIRRORED, NOT FAKED AWAY: with `scope: 'section'` every read
 * keeps only the students of the caller's own class (Block 2) and the digest's
 * autopay rows answer `reversible: false`, exactly as the database does for
 * section coin staff. It records every call so the page can show what the
 * components sent. No network.
 */
import type { V2Result } from '$lib/coin-desk/v2';
import type {
	ApproveAllResult,
	QueueCard,
	QueueDecision,
	QueueKind,
	QueuePayload,
	QueueTransports
} from '$lib/coin-desk/queue';
import type {
	DebtPaymentResult,
	PaydayClass,
	PaydayOverview,
	PaydayTransports,
	SettleResult
} from '$lib/coin-desk/payday';
import type { Digest, DigestTransports, PushTransport } from '$lib/coin-desk/digest';
import type {
	SettleAnswer,
	TournamentPending,
	TournamentTransports
} from '$lib/coin-desk/tournament-transfer';
import type { PushAvailability } from '$lib/tournaments/push-client';

export const BLOCK_2 = '11111111-aaaa-4aaa-8aaa-111111111111';
export const BLOCK_4 = '22222222-bbbb-4bbb-8bbb-222222222222';

export interface FakeOptions {
	scope: 'full' | 'section';
	/** Every call answers as a database without the migration. */
	missing?: boolean;
	/** What this fake browser says about push. */
	push?: PushAvailability;
	/** Approving the split card answers the database's pass_already_active refusal. */
	refuseSplit?: boolean;
}

const MISSING = { kind: 'missing' } as const;
const ok = <T>(data: T): V2Result<T> => ({ kind: 'ok', data });

interface Student {
	email: string;
	name: string;
	section: string;
	balance: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A 16:9 picture as a data URL (an inert SVG inside an img). */
function picture(label: string, hue: number): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="hsl(${hue} 45% 32%)"/><circle cx="250" cy="60" r="34" fill="hsl(${hue} 60% 62%)"/><text x="20" y="160" font-family="sans-serif" font-size="22" fill="#fff">${label}</text></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createFakeStaff(opts: FakeOptions, note: (line: string) => void) {
	const students: Student[] = [
		{ email: 'ana.reyes@boscotech.net', name: 'Ana Reyes', section: BLOCK_2, balance: 18 },
		{ email: 'ben.okonkwo@boscotech.net', name: 'Ben Okonkwo', section: BLOCK_2, balance: -6 },
		{ email: 'carla.chen@boscotech.net', name: 'Carla Chen', section: BLOCK_2, balance: 42.5 },
		{ email: 'diego.diaz@boscotech.net', name: 'Diego Diaz', section: BLOCK_2, balance: -24 },
		{ email: 'elena.evans@boscotech.net', name: 'Elena Evans', section: BLOCK_4, balance: 9 },
		{ email: 'felix.fischer@boscotech.net', name: 'Felix Fischer', section: BLOCK_4, balance: -3 }
	];
	const label = (id: string) => (id === BLOCK_2 ? 'IDEA100 Block 2' : 'IDEA209H Block 4');
	const inScope = (email: string) =>
		opts.scope === 'full' || students.find((s) => s.email === email)?.section === BLOCK_2;
	const student = (email: string) => students.find((s) => s.email === email)!;

	// --------------------------------------------------------------- the queue
	let seq = 0;
	const at = (minutesAgo: number) => new Date(Date.parse('2026-10-14T19:00:00Z') - minutesAgo * 60_000).toISOString();
	const mk = (kind: QueueKind, email: string, amount: number | null, payload: Record<string, unknown>, extra: Partial<QueueCard> = {}): QueueCard => {
		const s = student(email);
		return {
			id: `q-${++seq}`,
			kind,
			email,
			name: s.name,
			section_id: s.section,
			section: label(s.section),
			amount,
			photo_path: null,
			payload,
			note: null,
			status: 'pending',
			decided_at: null,
			decision_note: null,
			result: null,
			created_at: at(600 - seq * 30),
			balance: s.balance,
			...extra
		};
	};
	const cards: QueueCard[] = [
		mk('background', 'ana.reyes@boscotech.net', 2, { width: 2560, height: 1440, bytes: 812_000 }, { photo_path: 'u-ana/bg.png' }),
		mk('background', 'elena.evans@boscotech.net', 2, { width: 1920, height: 1080, bytes: 402_000 }, { photo_path: 'u-elena/bg.png' }),
		mk('donation', 'carla.chen@boscotech.net', 4, { item: 'Tissue box, large rectangle', rate: 2, quantity: 2, other: false }, { photo_path: 'u-carla/tissue.png' }),
		mk('donation', 'ben.okonkwo@boscotech.net', null, { item: 'A box of zip ties', rate: null, quantity: 1, other: true }, { photo_path: 'u-ben/ties.png', note: 'Found these in my garage, never opened.' }),
		mk('contract', 'diego.diaz@boscotech.net', 6, { title: 'Sort the fastener bins', pay_type: 'hourly', hours: 1.5, hourly_rate: 4, debt_only: true }),
		mk('role_day', 'carla.chen@boscotech.net', null, { day: '2026-10-13', role_id: 'shop_steward', status: { reason: 'gap_too_short', photos: 2 } }, { note: 'The fire drill cut class short, so my two photos were 30 minutes apart.' }),
		mk('split', 'ana.reyes@boscotech.net', 3, { item: 'eating_pass', price: 8, digital: 5, physical: 3 }),
		mk('reported_coins', 'felix.fischer@boscotech.net', null, { count: 14 }),
		mk('dispute', 'ben.okonkwo@boscotech.net', 2, { transaction_id: 'tx-77', category_id: 'long_bathroom_break', fined_at: at(1500) }, { note: 'The nurse kept me, I have a pass from her.' })
	];
	const recent: QueueCard[] = [
		{ ...mk('donation', 'elena.evans@boscotech.net', 1, { item: 'Tissue box, small square', rate: 1, quantity: 1, other: false }), status: 'approved', decided_at: at(1440) },
		{ ...mk('background', 'diego.diaz@boscotech.net', 2, { width: 1280, height: 720 }), status: 'denied', decided_at: at(2000), decision_note: 'Too small and a bit blurry; try a 1920 by 1080 picture.' }
	];
	const photoFor: Record<string, string> = {
		'u-ana/bg.png': picture('Ana: mountains', 210),
		'u-elena/bg.png': picture('Elena: city at night', 260),
		'u-carla/tissue.png': picture('Two tissue boxes', 30),
		'u-ben/ties.png': picture('Zip ties', 120)
	};

	const queueTransports: QueueTransports = {
		async load(kind) {
			note(`coin_queue(${kind ?? 'null'})`);
			if (opts.missing) return MISSING;
			const mine = cards.filter((c) => c.status === 'pending' && inScope(c.email));
			const counts: Partial<Record<QueueKind, number>> = {};
			for (const c of mine) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
			const payload: QueuePayload = {
				pending: mine.filter((c) => !kind || c.kind === kind).map((c) => ({ ...c, balance: student(c.email).balance })),
				counts,
				recent: recent.filter((c) => inScope(c.email) && (!kind || c.kind === kind))
			};
			return ok(payload);
		},
		async decide(id, approve, amount, reason) {
			note(`coin_queue_decide(${id}, ${approve}, ${amount ?? 'null'}, ${reason ? JSON.stringify(reason) : 'null'})`);
			if (opts.missing) return MISSING;
			const c = cards.find((x) => x.id === id);
			if (!c || !inScope(c.email)) return ok<QueueDecision>({ ok: false, reason: 'not_found' });
			if (c.status !== 'pending') return ok<QueueDecision>({ ok: false, reason: 'already_decided', status: c.status });
			let result: Record<string, unknown> = {};
			if (approve) {
				const amt = amount ?? c.amount;
				if ((c.kind === 'donation' || c.kind === 'contract') && amt == null) {
					return ok<QueueDecision>({ ok: false, reason: 'amount_required' });
				}
				if (c.kind === 'split' && opts.refuseSplit) {
					return ok<QueueDecision>({ ok: false, reason: 'pass_already_active' });
				}
				if (['background', 'donation', 'contract', 'dispute'].includes(c.kind) && amt != null) {
					student(c.email).balance = r2(student(c.email).balance + Number(amt));
					result = { paid: Number(amt) };
				}
				c.amount = amt;
			}
			c.status = approve ? 'approved' : 'denied';
			c.decided_at = new Date().toISOString();
			c.decision_note = approve ? null : reason;
			recent.unshift({ ...c });
			return ok<QueueDecision>({ ok: true, request_id: id, status: c.status, result });
		},
		async approveAll(kind) {
			note(`coin_queue_approve_all(${kind})`);
			if (opts.missing) return MISSING;
			let total = 0;
			let succeeded = 0;
			let skipped = 0;
			for (const c of cards.filter((x) => x.kind === kind && x.status === 'pending' && inScope(x.email))) {
				total += 1;
				if ((kind === 'donation' || kind === 'contract') && c.amount == null) {
					skipped += 1;
					continue;
				}
				const r = await queueTransports.decide!(c.id, true, null, null);
				if (r.kind === 'ok' && r.data.ok) succeeded += 1;
			}
			return ok<ApproveAllResult>({ ok: true, kind, total, succeeded, skipped, refused: total - succeeded - skipped, results: [] });
		},
		async photoUrl(path) {
			note(`createSignedUrl(coin-uploads, ${path}, 300)`);
			return photoFor[path] ?? null;
		}
	};

	// --------------------------------------------------------------- payday
	const payouts = [
		{ id: 'p-1', email: 'ana.reyes@boscotech.net', coins: 10, requested_at: at(3000), open: true },
		{ id: 'p-2', email: 'carla.chen@boscotech.net', coins: 15, requested_at: at(2800), open: true },
		{ id: 'p-3', email: 'ben.okonkwo@boscotech.net', coins: 4, requested_at: at(2600), open: true },
		{ id: 'p-4', email: 'elena.evans@boscotech.net', coins: 5, requested_at: at(2400), open: true }
	];
	const sections = opts.scope === 'full' ? [BLOCK_2, BLOCK_4] : [BLOCK_2];
	const PAYDAY = '2026-11-02';

	const paydayTransports: PaydayTransports = {
		async overview() {
			note('coin_payday(null)');
			if (opts.missing) return MISSING;
			const data: PaydayOverview = {
				payday: PAYDAY,
				sections: sections.map((id) => ({
					id,
					label: label(id),
					requests: payouts.filter((p) => p.open && student(p.email).section === id).length,
					in_debt: students.filter((s) => s.section === id && s.balance < 0).length
				}))
			};
			return ok(data);
		},
		async open(id) {
			note(`coin_payday(${id.slice(0, 8)})`);
			if (opts.missing) return MISSING;
			if (!sections.includes(id)) return { kind: 'error', message: 'That class is not one of yours.' };
			const data: PaydayClass = {
				payday: PAYDAY,
				section_id: id,
				label: label(id),
				requests: payouts
					.filter((p) => p.open && student(p.email).section === id)
					.map((p) => ({ id: p.id, email: p.email, name: student(p.email).name, coins: p.coins, requested_at: p.requested_at, balance: student(p.email).balance })),
				debts: students
					.filter((s) => s.section === id && s.balance < 0)
					.sort((a, b) => a.balance - b.balance)
					.map((s) => ({ email: s.email, name: s.name, balance: s.balance }))
			};
			return ok(data);
		},
		async settle(ids) {
			note(`coin_payday_settle([${ids.join(', ')}])`);
			if (opts.missing) return MISSING;
			const results: SettleResult['results'] = [];
			let settled = 0;
			for (const id of ids) {
				const p = payouts.find((x) => x.id === id);
				if (!p || !inScope(p.email)) {
					results.push({ id, ok: false, reason: 'not_found' });
					continue;
				}
				if (!p.open) {
					results.push({ id, ok: false, reason: 'already_closed' });
					continue;
				}
				p.open = false;
				// The hold was already taken from the balance; the fake's balance
				// is the after-hold figure, so a negative one has nothing left.
				const s = student(p.email);
				if (s.balance + p.coins <= 0) {
					results.push({ id, ok: false, reason: 'no_balance' });
					continue;
				}
				const paid = Math.min(p.coins, r2(s.balance + p.coins));
				settled += 1;
				results.push({ id, ok: true, paid, partial: paid < p.coins });
			}
			return ok<SettleResult>({ ok: true, settled, results });
		},
		async payDebt(email, amount) {
			note(`coin_payday_debt_payment(${email}, ${amount})`);
			if (opts.missing) return MISSING;
			if (!inScope(email)) return ok<DebtPaymentResult>({ ok: false, reason: 'not_found' });
			const s = student(email);
			s.balance = r2(s.balance + amount);
			return ok<DebtPaymentResult>({ ok: true, amount, balance: s.balance });
		}
	};

	// --------------------------------------------------------------- digest
	const autopay = [
		{ id: 'a-1', at: at(4000), email: 'ana.reyes@boscotech.net', category_id: 'weekly_wage', category: 'Weekly Wage', amount: 5, note: null, reversed: false },
		{ id: 'a-2', at: at(4000), email: 'carla.chen@boscotech.net', category_id: 'weekly_wage', category: 'Weekly Wage', amount: 5, note: null, reversed: false },
		{ id: 'a-3', at: at(3900), email: 'carla.chen@boscotech.net', category_id: 'highest_grade', category: 'Highest Grade', amount: 10, note: null, reversed: false },
		{ id: 'a-4', at: at(3800), email: 'elena.evans@boscotech.net', category_id: 'weekly_wage', category: 'Weekly Wage', amount: 5, note: null, reversed: false },
		{ id: 'a-5', at: at(200), email: 'ben.okonkwo@boscotech.net', category_id: 'long_bathroom_break', category: 'Long Bathroom Break', amount: -2, note: null, reversed: true }
	];
	let notify = false;
	let subscribed = false;

	const push: PushTransport = {
		availability: () => opts.push ?? 'available',
		async hasSubscription() {
			note('push hasSubscription()');
			return subscribed;
		},
		async enable() {
			note('push enable()');
			if ((opts.push ?? 'available') !== 'available') return { ok: false, error: 'Notifications are blocked for this site in your browser settings.' };
			subscribed = true;
			return { ok: true };
		}
	};

	const digestTransports: DigestTransports = {
		async load(days) {
			note(`coin_digest(${days})`);
			if (opts.missing) return MISSING;
			const full = opts.scope === 'full';
			const data: Digest = {
				since: at(days * 24 * 60),
				scope: opts.scope,
				autopay: autopay
					.filter((r) => inScope(r.email))
					.map((r) => ({ ...r, name: student(r.email).name, reversible: full && !r.reversed })),
				gainers: [
					{ email: 'carla.chen@boscotech.net', name: 'Carla Chen', gained: 17, balance: 42.5 },
					{ email: 'elena.evans@boscotech.net', name: 'Elena Evans', gained: 12, balance: 9 }
				].filter((g) => inScope(g.email)),
				chronic_debt: students
					.filter((s) => s.balance < -20 && inScope(s.email))
					.map((s) => ({ email: s.email, name: s.name, balance: s.balance })),
				queue: cards.filter((c) => c.status === 'pending' && inScope(c.email)).length,
				money: full ? { in: 64, out: 27.5 } : { in: 41, out: 30 },
				notify
			};
			return ok(data);
		},
		async reverse(id) {
			note(`coin_reverse_transaction(${id})`);
			if (opts.missing) return { ok: false, message: 'Not available until the database update lands.' };
			const r = autopay.find((x) => x.id === id);
			if (!r || opts.scope !== 'full') return { ok: false, message: 'That row is not in the ledger any more.' };
			if (r.reversed) return { ok: false, message: 'That row was already undone.' };
			r.reversed = true;
			student(r.email).balance = r2(student(r.email).balance - r.amount);
			return { ok: true };
		},
		async notify(on) {
			note(`coin_digest_notify_set(${on})`);
			if (opts.missing) return MISSING;
			notify = on;
			return ok({ ok: true, notify: on });
		},
		push
	};

	// --------------------------------------------------------------- tournaments
	const tournaments: TournamentPending[] = [
		{
			id: 't-1',
			name: 'Fall CAD Speedrun Cup',
			updated_at: at(1000),
			has_placement_rules: true,
			entries: [
				{
					entry_id: 'e-1',
					name: 'Gearheads',
					earned: 10,
					placement: 1,
					placement_default: 0,
					members: [
						{ user_id: 'u-ana', name: 'Ana Reyes', has_account: true },
						{ user_id: 'u-carla', name: 'Carla Chen', has_account: true },
						{ user_id: null, name: 'Sam (walk-up)', has_account: false }
					]
				},
				{
					entry_id: 'e-2',
					name: 'Diego Diaz',
					earned: 4,
					placement: 2,
					placement_default: 0,
					members: [{ user_id: 'u-diego', name: 'Diego Diaz', has_account: true }]
				}
			]
		},
		{
			id: 't-2',
			name: 'Lunch Bracket, week 7',
			updated_at: at(500),
			has_placement_rules: false,
			entries: [
				{ entry_id: 'e-3', name: 'Elena Evans', earned: 0, placement: 1, placement_default: 3, members: [{ user_id: 'u-elena', name: 'Elena Evans', has_account: true }] },
				{ entry_id: 'e-4', name: 'Felix Fischer', earned: 0, placement: 2, placement_default: 2, members: [{ user_id: 'u-felix', name: 'Felix Fischer', has_account: true }] },
				{ entry_id: 'e-5', name: 'Ben Okonkwo', earned: 0, placement: null, placement_default: 0, members: [{ user_id: 'u-ben', name: 'Ben Okonkwo', has_account: true }] }
			]
		}
	];
	const settled = new Set<string>();

	const tournamentTransports: TournamentTransports = {
		async load() {
			note('coin_tournament_transfers()');
			if (opts.missing) return MISSING;
			if (opts.scope !== 'full') return { kind: 'error', message: 'Only a full coin admin can transfer tournament rewards.' };
			return ok(tournaments.filter((t) => !settled.has(t.id)));
		},
		async settle(id, outcome, mode, amounts) {
			note(`coin_tournament_settle(${id}, ${outcome}, ${mode ?? 'null'}, ${amounts ? JSON.stringify(amounts) : 'null'})`);
			if (opts.missing) return MISSING;
			if (settled.has(id)) return ok<SettleAnswer>({ ok: false, reason: 'already_settled' });
			settled.add(id);
			const paid = outcome === 'transferred' ? (amounts ?? []).filter((a) => a.amount > 0).length : 0;
			return ok<SettleAnswer>({ ok: true, outcome, paid, skipped: 0 });
		}
	};

	return { queue: queueTransports, payday: paydayTransports, digest: digestTransports, tournaments: tournamentTransports };
}
