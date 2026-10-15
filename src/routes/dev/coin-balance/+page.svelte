<script lang="ts">
	import { onMount } from 'svelte';
	import { page as appPage } from '$app/state';
	import CoinPageView from '$lib/coin-balance/CoinPageView.svelte';
	import {
		coinBalanceAfter,
		coinCanAfford,
		coinExtraCreditCost,
		coinPrintPrice,
		parseCoinMyPage,
		type CoinBuyResult,
		type CoinMyPage
	} from '$lib/coin-balance';
	import type { CoinPageTransports } from '$lib/coin-balance/transports';
	import { fixturePage, SCENARIOS, type Scenario } from './fixture';

	/**
	 * Dev harness for /coin-balance. Mounts the REAL CoinPageView over a
	 * `coin_my_page()`-shaped payload run through the REAL `parseCoinMyPage`,
	 * with in-memory purchase transports that apply 0241's refusal order (not
	 * available, already held, cap, insufficient) and then move the balance,
	 * so a two-step purchase can be driven end to end with no database.
	 *
	 * `?scenario=` picks the starting state so a browser-verify spec can open
	 * one directly; the toolbar switches it by hand. 404s in production.
	 */
	const NOW = Date.parse('2026-10-15T19:00:00Z');

	function pick(): Scenario {
		const q = appPage.url.searchParams.get('scenario') ?? '';
		return (SCENARIOS.find((s) => s.id === q)?.id ?? 'populated') as Scenario;
	}

	let scenario = $state<Scenario>(pick());
	let current = $state<CoinMyPage | null>(parseCoinMyPage(fixturePage(pick())));
	let hydrated = $state(false);
	onMount(() => {
		hydrated = true;
	});

	function load(s: Scenario) {
		scenario = s;
		current = parseCoinMyPage(fixturePage(s));
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
			return charge('three_d_printing', '3D Printing', coinPrintPrice(grams, current!.print.grams_per_coin), `3D print, ${grams} g.`);
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
	}
</style>
