<script lang="ts">
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import CoinPageView from '$lib/coin-balance/CoinPageView.svelte';
	import {
		coinBalanceAfter,
		coinCanAfford,
		coinExtraCreditCost,
		coinPrintPrice,
		coinPrintWithSpool,
		parseCoinMyPage,
		type CoinBuyResult,
		type CoinMyPage
	} from '$lib/coin-balance';
	import type { CoinPageTransports } from '$lib/coin-balance/transports';
	import type { CoinActionResult, CoinPageExtras } from '$lib/coin-balance/extras';
	import { coinUploadRefusal, coinUploadExt } from '$lib/coin-balance/uploads';
	import { fixtureExtras, fixturePage, SCENARIOS, type Scenario } from './fixture';

	/**
	 * Dev harness for /coin-balance. Mounts the REAL CoinPageView over a
	 * `coin_my_page()`-shaped payload run through the REAL `parseCoinMyPage`,
	 * with in-memory purchase transports that apply 0241's refusal order (not
	 * available, already held, cap, insufficient) and then move the balance,
	 * so a two-step purchase can be driven end to end with no database.
	 *
	 * `?scenario=` picks the starting state so a browser-verify spec can open
	 * one directly; the toolbar switches it by hand. 404s in production.
	 *
	 * SESSION TWO (0245 to 0250): the extras (contracts, stats, the want list,
	 * the auditor queue, the role flag) come from `fixtureExtras` through the
	 * REAL parsers, and every new action answers in memory with the refusal the
	 * database would give in the common cases, so each section can be driven.
	 * An upload "lands" with no network and answers a path of the real shape.
	 */
	const NOW = Date.parse('2026-10-15T19:00:00Z');

	function pick(): Scenario {
		const q = appPage.url.searchParams.get('scenario') ?? '';
		return (SCENARIOS.find((s) => s.id === q)?.id ?? 'populated') as Scenario;
	}

	let scenario = $state<Scenario>(pick());
	let current = $state<CoinMyPage | null>(parseCoinMyPage(fixturePage(pick())));
	let extras = $state<CoinPageExtras>(fixtureExtras(pick()));
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	function load(s: Scenario) {
		scenario = s;
		current = parseCoinMyPage(fixturePage(s));
		extras = fixtureExtras(s);
	}

	const viewState = $derived(
		scenario === 'signed_out' ? 'signed_out' : scenario === 'updating' ? 'updating' : 'ready'
	) as 'ready' | 'signed_out' | 'updating';

	let seq = 100;
	function charge(categoryId: string, name: string, cost: number, note: string): CoinBuyResult {
		const p = current!;
		if (!coinCanAfford(p.balance, cost)) return { ok: false, reason: 'insufficient', balance: p.balance, cost };
		p.balance = coinBalanceAfter(p.balance, cost);
		p.history = [
			{ id: `x${seq++}`, at: new Date(NOW).toISOString(), amount: -cost, category_id: categoryId, name, kind: 'purchase', note, reverses: null, reversed: false, automatic: false },
			...p.history
		];
		return { ok: true, cost, balance: p.balance };
	}

	const wait = () => new Promise((r) => setTimeout(r, 250));
	const ok = (data: Record<string, unknown> = {}): CoinActionResult => ({ ok: true, data: { ok: true, ...data } });
	const no = (reason: string, data: Record<string, unknown> = {}): CoinActionResult => ({ ok: false, reason, data: { ok: false, reason, ...data } });
	const UID = '00000000-0000-4000-8000-000000000001';
	let rq = 900;
	function addRequest(kind: 'background' | 'donation' | 'reported_coins' | 'split' | 'dispute', extra: Record<string, unknown> = {}) {
		const p = current!;
		p.requests = [
			{ id: `rq${rq++}`, kind, status: 'pending', amount: null, note: null, decision_note: null, created_at: new Date(NOW).toISOString(), decided_at: null, item: null, count: null, quantity: null, result: null, ...extra },
			...(p.requests ?? [])
		];
	}
	function debit(categoryId: string, name: string, amount: number, note: string) {
		const p = current!;
		p.balance = coinBalanceAfter(p.balance, amount);
		p.history = [
			{ id: `x${seq++}`, at: new Date(NOW).toISOString(), amount: -amount, category_id: categoryId, name, kind: 'purchase', note, reverses: null, reversed: false, automatic: false },
			...p.history
		];
	}
	const SPLIT_PRICE: Record<string, () => number> = {
		eating_pass: () => current!.eating_pass.price ?? 0,
		pay_raise: () => current!.pay_raise.cost,
		three_d_printing: () => 0,
		extra_credit: () => 0
	};

	const transports: CoinPageTransports = {
		async buyEatingPass() {
			await wait();
			const p = current!;
			if (p.eating_pass.price === null) return { ok: false, reason: 'not_available' };
			if (p.eating_pass.active) return { ok: false, reason: 'pass_already_active' };
			const r = charge('eating_pass', 'Eating Pass', p.eating_pass.price, 'Bought by the student.');
			if (r.ok) p.eating_pass = { ...p.eating_pass, active: true, strikes: 0 };
			return r;
		},
		async buyPayRaise() {
			await wait();
			const p = current!;
			const q = p.pay_raise;
			const r = charge('pay_raise', 'Pay Raise', q.cost, 'Bought by the student.');
			if (!r.ok) return r;
			const per = q.wage_now / q.tier;
			p.wage_tier = q.new_tier;
			p.weekly_wage = q.wage_after;
			p.pay_raise = { tier: q.new_tier, new_tier: q.new_tier + 1, cost: (q.cost / q.tier) * q.new_tier, wage_now: q.wage_after, wage_after: per * (q.new_tier + 1) };
			return { ...r, new_tier: q.new_tier };
		},
		async buyPrint(grams) {
			await wait();
			if (!(grams > 0 && grams <= 5000)) return { ok: false, reason: 'grams' };
			const p = current!;
			const q = coinPrintWithSpool(grams, p.print.grams_per_coin, p.print.spool_grams);
			const r = charge('three_d_printing', '3D Printing', q.cost, `3D print, ${grams} g.`);
			if (r.ok) p.print.spool_grams = Math.max(0, p.print.spool_grams - q.spool);
			return r;
		},
		async buyExtraCredit(sectionId, submissionId, points) {
			await wait();
			const p = current!;
			const c = p.extra_credit.classes.find((x) => x.section_id === sectionId);
			if (!c) return { ok: false, reason: 'not_your_class' };
			const s = c.submissions.find((x) => x.submission_id === submissionId);
			if (!s) return { ok: false, reason: 'not_your_work' };
			if (points > c.room.remaining_points) return { ok: false, reason: 'cap', room: c.room };
			const r = charge('extra_credit', 'Extra Credit', coinExtraCreditCost(points, p.extra_credit.price_per_point ?? 0), 'Bought by the student.');
			if (!r.ok) return r;
			c.room.used_points += points;
			c.room.remaining_points -= points;
			s.extra_credit += points;
			s.score = (s.score ?? 0) + points;
			return { ...r, points };
		},

		async buySplit(item, physical, inputs) {
			await wait();
			const p = current!;
			if (p.balance < 0) return { ok: false, reason: 'in_debt', balance: p.balance };
			let price = SPLIT_PRICE[item]();
			if (item === 'three_d_printing') price = coinPrintPrice(Math.max(0, (inputs.grams ?? 0) - p.print.spool_grams), p.print.grams_per_coin);
			if (item === 'extra_credit') price = coinExtraCreditCost(inputs.points ?? 0, p.extra_credit.price_per_point ?? 0);
			if (item === 'eating_pass' && p.eating_pass.active) return { ok: false, reason: 'pass_already_active' };
			if (!(physical > 0 && physical <= price)) return { ok: false, reason: 'physical_part', price };
			const digital = Math.round((price - physical) * 100) / 100;
			if (!coinCanAfford(p.balance, digital)) return { ok: false, reason: 'insufficient', balance: p.balance, cost: digital };
			if (digital > 0) debit('split_payment', 'Split Payment', digital, 'Split payment, digital part.');
			addRequest('split', { amount: physical, item });
			return { ok: true, price, digital, physical, balance: p.balance, request_id: `rq${rq - 1}` };
		},
		async requestPayout(n) {
			await wait();
			const p = current!;
			if (p.payout) return no('already_open');
			if (!(n > 0)) return no('coins');
			if (n > p.balance) return no('insufficient', { balance: p.balance, cost: n });
			p.balance = coinBalanceAfter(p.balance, n);
			p.payout = { id: 'po-new', coins: n, requested_at: new Date(NOW).toISOString() };
			return ok({ coins: n, payday: p.payday, balance: p.balance });
		},
		async cancelPayout() {
			await wait();
			const p = current!;
			if (!p.payout) return no('none_open');
			p.balance = coinBalanceAfter(p.balance, -p.payout.coins);
			p.payout = null;
			return ok({ balance: p.balance });
		},
		async uploadPhoto(file) {
			await wait();
			const refusal = coinUploadRefusal(file);
			if (refusal) return { ok: false, words: refusal };
			return { ok: true, path: `${UID}/${crypto.randomUUID()}.${coinUploadExt(file)}` };
		},
		async submitBackground(_path, width, height) {
			await wait();
			if (Math.abs(width * 9 - height * 16) > width * 9 * 0.01) return no('not_16_9', { width, height });
			if ((current!.requests ?? []).some((r) => r.kind === 'background' && r.status === 'pending')) {
				return no('too_soon', { next_at: '2026-10-29T17:00:00Z' });
			}
			addRequest('background', { amount: 2 });
			return ok({ request_id: `rq${rq - 1}` });
		},
		async submitDonation(itemId, quantity, other) {
			await wait();
			if (!(quantity >= 1 && quantity <= 100)) return no('quantity');
			const item = extras.donationItems?.find((i) => i.id === itemId) ?? null;
			if (itemId && !item) return no('unknown_item');
			if (!itemId && !other) return no('describe_other');
			addRequest('donation', { item: item?.name ?? other, quantity, amount: item?.rate !== null && item ? item.rate * quantity : null });
			return ok({ request_id: `rq${rq - 1}` });
		},
		async reportOnHand(count) {
			await wait();
			if ((current!.requests ?? []).some((r) => r.kind === 'reported_coins' && r.status === 'pending')) return no('already_pending');
			addRequest('reported_coins', { count });
			return ok();
		},
		async disputeFine(id, reason) {
			await wait();
			if (!reason.trim()) return no('reason_required');
			const p = current!;
			const row = p.history.find((h) => h.id === id);
			if (!row || !row.disputable) return no('not_disputable');
			if (row.dispute?.status === 'pending') return no('already_disputed');
			row.dispute = { status: 'pending', decision_note: null };
			addRequest('dispute', { amount: -row.amount });
			return ok();
		},
		async cancelRequest(id) {
			await wait();
			const r = current!.requests?.find((x) => x.id === id);
			if (!r) return no('not_found');
			if (r.status !== 'pending' || r.kind === 'split') return no('not_cancellable');
			r.status = 'cancelled';
			return ok();
		},
		async auditorValidate(id) {
			await wait();
			if (!extras.auditor?.some((a) => a.id === id)) return no('not_found');
			extras.auditor = extras.auditor.filter((a) => a.id !== id);
			return ok();
		},
		async exportRows() {
			await wait();
			return {
				ok: true,
				data: {
					scope: 'student',
					exported_at: new Date(NOW).toISOString(),
					rows: current!.history.map((h) => ({ id: h.id, created_at: h.at, category_id: h.category_id, category: h.name, kind: h.kind, amount: h.amount, medium: 'digital', quantity: null, note: h.note, actor: h.automatic ? 'system' : 'teacher@example.edu', transfer_id: null }))
				}
			};
		}
	};
</script>

<div class="dev-toolbar" data-coin-hydrated={hydrated ? '' : undefined}>
	<label>
		Scenario
		<select value={scenario} onchange={(e) => load(e.currentTarget.value as Scenario)}>
			{#each SCENARIOS as s (s.id)}
				<option value={s.id}>{s.label}</option>
			{/each}
		</select>
	</label>
</div>

{#key scenario}
	<CoinPageView
		state={viewState}
		page={current}
		transports={viewState === 'ready' ? transports : {}}
		{extras}
		now={NOW}
		onsignin={() => {}}
		onchanged={() => {}}
	/>
{/key}

<style>
	/* In flow, never fixed: a fixed toolbar sat over the Buy section in every
	   full-page screenshot. */
	.dev-toolbar {
		margin: 0.5rem 1rem;
		width: fit-content;
		max-width: calc(100% - 2rem);
		box-sizing: border-box;
		background: var(--bg1);
		border: 1px solid var(--boundary);
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-1);
	}
	.dev-toolbar label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.dev-toolbar select {
		min-height: 44px;
		min-width: 0;
		max-width: 100%;
	}
</style>
