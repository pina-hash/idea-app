<script lang="ts">
	import './coin-page.css';
	import Disclosure from '$lib/Disclosure.svelte';
	import CoinTypeGlyph from '$lib/coin-desk/CoinTypeGlyph.svelte';
	import CoinBuy from './CoinBuy.svelte';
	import CoinPayout from './CoinPayout.svelte';
	import CoinBackgroundPanel from './CoinBackgroundPanel.svelte';
	import CoinDonationPanel from './CoinDonationPanel.svelte';
	import CoinOnHand from './CoinOnHand.svelte';
	import CoinRequestsList from './CoinRequestsList.svelte';
	import CoinContractsPanel from './CoinContractsPanel.svelte';
	import CoinStatsPanel from './CoinStatsPanel.svelte';
	import CoinAuditorPanel from './CoinAuditorPanel.svelte';
	import CoinDispute from './CoinDispute.svelte';
	import {
		coinAmountDisplay,
		coinNumber,
		coins,
		signedCoins,
		coinTxnType,
		COIN_TXN_TYPE_LABELS
	} from '$lib/coin-format';
	import {
		coinBuyRefusalWords,
		coinCanAfford,
		coinExtraCreditCost,
		coinPrintWithSpool,
		coinScoreLine,
		coinWhen,
		groupCoinRules,
		noShopWhy,
		visibleHistory,
		type CoinMyPage
	} from '$lib/coin-balance';
	import { laCalendarDay, schoolDayOf } from '$lib/classroom/school-calendar';
	import type { CoinPageTransports } from './transports';
	import type { CoinPageExtras } from './extras';

	/**
	 * THE BODY OF A STUDENT'S OWN IDEA COIN PAGE, without the site chrome, so
	 * a DOM test can mount it with no profile menu or version stamp. Mounted by
	 * `CoinPageView`, which is what the route and the harness mount.
	 *
	 * A STUDENT'S OWN IDEA COIN PAGE (V2, migration 0241). The route mounts it
	 * over `coin_my_page()` and four injected purchase transports; the dev
	 * harness mounts the identical component over an in-memory page.
	 *
	 * ONE NUMBER. The balance is the only figure: no physical/digital split, no
	 * separate debt, no lifetime totals. A negative balance is the debt, said in
	 * words beside the number.
	 *
	 * AN OMITTED TRANSPORT REMOVES ITS PURCHASE. A page with no transports at
	 * all has no Buy section, which is how a read-only mount stays read-only.
	 */
	let {
		state: pageState,
		page = null,
		transports = {},
		extras = {},
		now,
		onsignin = null,
		onchanged = null
	}: {
		state: 'ready' | 'signed_out' | 'updating' | 'error';
		page?: CoinMyPage | null;
		transports?: CoinPageTransports;
		/**
		 * The session-two reads (0245 to 0249), each its own function. NULL or
		 * absent means that function is not there (its migration is not applied)
		 * or it answered nothing, and its section is simply not drawn.
		 */
		extras?: CoinPageExtras;
		/** The loader's clock, threaded down so "today" is the server's today. */
		now: number;
		onsignin?: (() => void) | null;
		onchanged?: (() => void) | null;
	} = $props();

	const today = $derived(laCalendarDay(new Date(now)));
	const history = $derived(page ? visibleHistory(page.history) : { rows: [], hiddenPairs: 0 });
	const ruleGroups = $derived(page ? groupCoinRules(page.rules) : []);
	const inDebt = $derived(!!page && page.balance < 0);
	const whyNoShop = $derived(
		page && page.no_shop_today ? noShopWhy(page.history, today, schoolDayOf) : ''
	);

	const canBuyAny = $derived(
		!!(transports.buyEatingPass || transports.buyPayRaise || transports.buyPrint || transports.buyExtraCredit)
	);

	function insufficient(cost: number): string | null {
		if (!page) return null;
		return coinCanAfford(page.balance, cost)
			? null
			: coinBuyRefusalWords({ reason: 'insufficient', balance: page.balance, cost });
	}

	/* ---- Eating Pass ---- */
	const passBase = $derived.by(() => {
		if (!page) return null;
		if (page.eating_pass.price === null) return coinBuyRefusalWords({ reason: 'not_available' });
		if (page.eating_pass.active) return coinBuyRefusalWords({ reason: 'pass_already_active' });
		return null;
	});
	const passBlocked = $derived(passBase ?? (page && page.eating_pass.price !== null ? insufficient(page.eating_pass.price) : null));

	/* ---- Pay Raise ---- */
	const raiseBlocked = $derived(page ? insufficient(page.pay_raise.cost) : null);

	/* ---- Split payment (2.3): the same purchase, part paid in physical coins. ---- */
	function splitFor(
		item: 'eating_pass' | 'pay_raise' | 'three_d_printing' | 'extra_credit',
		baseBlocked: string | null,
		itemWords: string,
		inputs: () => { grams?: number | null; sectionId?: string | null; submissionId?: string | null; points?: number | null }
	) {
		const buySplit = transports.buySplit;
		if (!buySplit || !page) return null;
		return {
			onsplit: (physical: number) => buySplit(item, physical, inputs()),
			inDebt,
			baseBlocked,
			itemWords
		};
	}

	/* ---- 3D print ---- */
	let gramsText = $state('');
	const grams = $derived.by(() => {
		const t = gramsText.trim();
		if (!t || !/^\d+(\.\d+)?$/.test(t)) return null;
		const n = Number(t);
		return n > 0 && n <= 5000 ? n : null;
	});
	const printQuote = $derived(
		page && grams !== null ? coinPrintWithSpool(grams, page.print.grams_per_coin, page.print.spool_grams) : null
	);
	const printCost = $derived(printQuote ? printQuote.cost : null);
	const printBase = $derived.by(() => {
		if (!page) return null;
		if (!page.print.active) return coinBuyRefusalWords({ reason: 'not_available' });
		if (!gramsText.trim()) return 'Enter the weight from the slicer first.';
		if (grams === null) return coinBuyRefusalWords({ reason: 'grams' });
		return null;
	});
	const printBlocked = $derived(printBase ?? insufficient(printCost ?? 0));

	/* ---- Extra credit ---- */
	let sectionPick = $state('');
	let submissionPick = $state('');
	let pointsText = $state('');
	const classes = $derived(page?.extra_credit.classes ?? []);
	const ecClass = $derived(classes.find((c) => c.section_id === sectionPick) ?? classes[0] ?? null);
	const ecWork = $derived(ecClass?.submissions.find((s) => s.submission_id === submissionPick) ?? null);
	const points = $derived.by(() => {
		const t = pointsText.trim();
		if (!/^\d+$/.test(t)) return null;
		const n = Number(t);
		return n >= 1 && n <= 1000 ? n : null;
	});
	const ecPrice = $derived(page?.extra_credit.price_per_point ?? null);
	const ecCost = $derived(ecPrice !== null && points !== null ? coinExtraCreditCost(points, ecPrice) : null);
	const ecBase = $derived.by(() => {
		if (!page) return null;
		if (ecPrice === null) return coinBuyRefusalWords({ reason: 'not_available' });
		if (!ecClass) return 'None of your classes in the IDEA Coin economy has extra credit to buy.';
		if (!ecClass.room.semester) return coinBuyRefusalWords({ reason: 'no_semester' });
		if (ecClass.room.remaining_points <= 0) return coinBuyRefusalWords({ reason: 'cap', room: ecClass.room });
		if (!ecWork) {
			return ecClass.submissions.length
				? 'Pick one of your returned assignments first.'
				: 'You have no returned work in this class yet. Extra credit goes on returned work.';
		}
		if (!pointsText.trim()) return 'Enter how many points you want.';
		if (points === null) return coinBuyRefusalWords({ reason: 'points' });
		if (points > ecClass.room.remaining_points) return coinBuyRefusalWords({ reason: 'cap', room: ecClass.room });
		return null;
	});
	const ecBlocked = $derived(ecBase ?? insufficient(ecCost ?? 0));

	/* ---- Session two ----
	   `requests` is the tell that coin_my_page is 0250's: before it, the page
	   cannot show a held payout or a pending card, so the sections that act on
	   them (coins out, the background, donations, coins on hand) stay hidden
	   rather than offering a second request the student cannot see. */
	const requests = $derived(page?.requests ?? null);
	const sessionTwo = $derived(requests !== null);
	const onHandPending = $derived(!!requests?.some((r) => r.kind === 'reported_coins' && r.status === 'pending'));
	const showPayout = $derived(
		!!page && sessionTwo && (!!page.payout || (page.in_economy && !!transports.requestPayout))
	);
	const showContracts = $derived(
		!!page && !!extras.contracts && (extras.contracts.length > 0 || page.in_economy)
	);

	function changed() {
		onchanged?.();
	}
</script>

<div class="cp-body" data-testid="coin-page" data-state={pageState}>
	{#if pageState === 'signed_out'}
		<section class="card cp-card" data-testid="coin-signin">
			<p class="cp-lead">Sign in to see your IDEA Coin balance and buy things with your coins.</p>
			{#if onsignin}
				<button class="btn" type="button" onclick={() => onsignin?.()}>Sign in with your school Google account</button>
			{/if}
		</section>
	{:else if pageState === 'updating'}
		<section class="card cp-card" data-testid="coin-updating">
			<h2>Your coin page is being updated</h2>
			<p class="cp-lead">Mr. Pina is switching on the new coin system. Check back soon. Nothing you earned is lost.</p>
		</section>
	{:else if pageState === 'error' || !page}
		<section class="card cp-card" data-testid="coin-error">
			<h2>Your coin page could not be read</h2>
			<p class="cp-lead">Try again in a minute. If it keeps happening, send feedback from the button on this page.</p>
		</section>
	{:else}
		<div class="cp-grid">
			<div class="cp-col cp-col-main">
			<!-- THE STANDING: one number, then the three things that change what you can do. -->
			<section class="card cp-card cp-standing" aria-labelledby="cp-h-standing" data-testid="coin-standing">
				<h2 id="cp-h-standing">Balance</h2>
				<div class="cp-balance-row">
					<span class="cp-balance" class:neg={inDebt} data-testid="coin-balance">{coins(page.balance)}</span>
					{#if inDebt}
						<span class="cp-debt-chip" data-testid="coin-debt">In debt</span>
					{/if}
				</div>
				{#if inDebt}
					<p class="cp-debt-line">
						Your balance is below zero, so you are in debt by {coins(-page.balance)}. Fines and awards
						still count. You cannot buy anything that would leave you below {coins(0)}.
					</p>
				{/if}

				<dl class="cp-facts">
					<div class="cp-fact" data-testid="coin-wage">
						<dt>Weekly wage</dt>
						<dd>
							<strong>{coins(page.weekly_wage)}</strong> a school week, tier {page.wage_tier}. Paid
							automatically.
						</dd>
					</div>
					<div class="cp-fact" data-testid="coin-pass">
						<dt>Eating Pass</dt>
						<dd>
							{#if page.eating_pass.active}
								<strong class="cp-yes">Held</strong>. Strikes: {page.eating_pass.strikes} of 3. A third
								strike revokes the pass.
							{:else}
								<strong>Not held</strong>.
								{#if page.eating_pass.revoked_at}
									Your last pass was revoked {coinWhen(page.eating_pass.revoked_at)} after a third
									strike. You can buy a new one.
								{/if}
							{/if}
						</dd>
					</div>
					{#if page.no_shop_today}
						<div class="cp-fact cp-noshop" data-testid="coin-noshop">
							<dt>Shop</dt>
							<dd>
								<strong>No shop today.</strong> You may not use shop tools or machines until tomorrow.
								{whyNoShop}
							</dd>
						</div>
					{/if}
				</dl>
				{#if !page.in_economy}
					<p class="cp-note" data-testid="coin-not-in-economy">
						None of your classes is using IDEA Coins right now, so nothing new is earned, fined or
						bought. Your history stays here.
					</p>
				{/if}
				{#if extras.hasRole}
					<p class="cp-note" data-testid="coin-role-link">
						You hold a class role. Prove each class day with a start and an end photo on your role page.
						<a class="cpx-link" href="/coin-balance/role">Open your role page</a>
					</p>
				{/if}
			</section>

			{#if showPayout}
				<CoinPayout
					balance={page.balance}
					payout={page.payout}
					payday={page.payday}
					request={page.in_economy ? (transports.requestPayout ?? null) : null}
					cancel={transports.cancelPayout ?? null}
					ondone={changed}
				/>
			{/if}

			{#if page.in_economy && canBuyAny}
				<section class="card cp-card cp-shop" aria-labelledby="cp-h-buy" data-testid="coin-buy">
					<h2 id="cp-h-buy">Buy</h2>
					<p class="cp-note">
						Every purchase asks you to confirm and shows your balance afterwards. A purchase has to
						leave you at {coins(0)} or more.
					</p>
					<div class="cp-buys">
						{#if transports.buyEatingPass}
							<CoinBuy
								testId="buy-eating-pass"
								title="Eating Pass"
								buyLabel="Buy the Eating Pass"
								cost={page.eating_pass.price}
								balance={page.balance}
								blocked={passBlocked}
								onbuy={() => transports.buyEatingPass!()}
								ondone={changed}
								split={splitFor('eating_pass', passBase, 'the Eating Pass', () => ({}))}
							>
								<p class="cp-help">
									Lets you eat in class. Three eating strikes revoke it, and then you can buy another.
								</p>
							</CoinBuy>
						{/if}

						{#if transports.buyPayRaise}
							<CoinBuy
								testId="buy-pay-raise"
								title="Pay Raise"
								buyLabel="Buy a Pay Raise"
								cost={page.pay_raise.cost}
								balance={page.balance}
								blocked={raiseBlocked}
								split={splitFor('pay_raise', null, 'the Pay Raise', () => ({}))}
								onbuy={() => transports.buyPayRaise!()}
								ondone={changed}
								doneWords={(r) => `Done. You are on tier ${r.new_tier ?? ''} now.${r.balance !== undefined ? ` Your balance is ${coins(r.balance)}.` : ''}`}
							>
								<p class="cp-help">
									Your wage goes from <strong>{coins(page.pay_raise.wage_now)}</strong> to
									<strong>{coins(page.pay_raise.wage_after)}</strong> a week (tier {page.pay_raise.tier}
									to tier {page.pay_raise.new_tier}). It costs {coins(page.pay_raise.cost / Math.max(page.pay_raise.tier, 1))} times your current
									tier, so each raise costs more than the last.
								</p>
							</CoinBuy>
						{/if}

						{#if transports.buyPrint}
							<CoinBuy
								testId="buy-print"
								title="3D print"
								buyLabel="Pay for the print"
								cost={printCost}
								balance={page.balance}
								blocked={printBlocked}
								split={splitFor('three_d_printing', printBase, 'the print', () => ({ grams }))}
								onbuy={() => transports.buyPrint!(grams ?? 0)}
								ondone={() => {
									gramsText = '';
									changed();
								}}
							>
								<p class="cp-help">
									Slice it with the material set to HIPS and the generic ABS profile, then enter the weight
									the slicer shows. {coins(1)} per {coinNumber(page.print.grams_per_coin)} grams,
									rounded to the nearest coin (a half rounds up). Print time is never charged.
								</p>
								<p class="cp-help" data-testid="print-spool">
									{#if page.print.spool_grams > 0}
										You have <strong>{coinNumber(page.print.spool_grams)} grams</strong> left on your own
										spool. A print draws from it before coins, and only the grams past it cost anything.
									{:else}
										You have no spool grams. A spool you buy outright is used before coins.
									{/if}
								</p>
								{#if printQuote && printQuote.spool > 0}
									<p class="cp-room" data-testid="print-spool-draw">
										{coinNumber(printQuote.spool)} grams come from your spool{printQuote.cost > 0 ? ', and the rest is charged.' : ', so this print costs nothing.'}
									</p>
								{/if}
								<label class="cp-field">
									<span>Weight in grams</span>
									<input
										type="text"
										inputmode="decimal"
										autocomplete="off"
										placeholder="for example 42.5"
										bind:value={gramsText}
										data-testid="print-grams"
									/>
								</label>
							</CoinBuy>
						{/if}

						{#if transports.buyExtraCredit}
							<CoinBuy
								testId="buy-extra-credit"
								title="Extra credit"
								buyLabel="Buy extra credit"
								cost={ecCost}
								balance={page.balance}
								blocked={ecBlocked}
								split={splitFor('extra_credit', ecBase, 'the extra credit', () => ({
									sectionId: ecClass?.section_id ?? null,
									submissionId: ecWork?.submission_id ?? null,
									points
								}))}
								onbuy={() => transports.buyExtraCredit!(ecClass?.section_id ?? '', ecWork?.submission_id ?? '', points ?? 0)}
								ondone={() => {
									pointsText = '';
									changed();
								}}
								doneWords={(r) => `Done. ${r.points ?? points} point${(r.points ?? points) === 1 ? '' : 's'} added to ${ecWork?.title ?? 'your work'}.`}
							>
								<p class="cp-help">
									Points go onto one of your returned assignments.
									{#if ecPrice !== null}{coins(ecPrice)} a point.{/if}
									Each class allows a limited number of points each semester.
								</p>
								{#if classes.length}
									<label class="cp-field">
										<span>Class</span>
										<select
											value={ecClass?.section_id ?? ''}
											onchange={(e) => {
												sectionPick = e.currentTarget.value;
												submissionPick = '';
											}}
											data-testid="ec-class"
										>
											{#each classes as c (c.section_id)}
												<option value={c.section_id}>{c.label}</option>
											{/each}
										</select>
									</label>
									{#if ecClass}
										<p class="cp-room" data-testid="ec-room">
											{#if ecClass.room.semester}
												<strong>{coinNumber(ecClass.room.remaining_points)}</strong> of
												{coinNumber(ecClass.room.cap_points)} points left in this class this semester
												({coinNumber(ecClass.room.used_points)} used).
											{:else}
												No semester is set up yet.
											{/if}
										</p>
										{#if ecClass.submissions.length}
											<label class="cp-field">
												<span>Returned work</span>
												<select
													value={ecWork?.submission_id ?? ''}
													onchange={(e) => (submissionPick = e.currentTarget.value)}
													data-testid="ec-work"
												>
													<option value="">Pick an assignment</option>
													{#each ecClass.submissions as s (s.submission_id)}
														<option value={s.submission_id}>{s.title} ({coinScoreLine(s)})</option>
													{/each}
												</select>
											</label>
										{/if}
										<label class="cp-field">
											<span>Points</span>
											<input
												type="text"
												inputmode="numeric"
												autocomplete="off"
												placeholder="whole number"
												bind:value={pointsText}
												data-testid="ec-points"
											/>
										</label>
									{/if}
								{/if}
							</CoinBuy>
						{/if}
					</div>
				</section>
			{/if}

			{#if page.in_economy && sessionTwo}
				<CoinBackgroundPanel
					rules={page.background_rules}
					background={page.background}
					backgroundUrl={extras.backgroundUrl ?? null}
					upload={transports.uploadPhoto ?? null}
					submit={transports.submitBackground ?? null}
					ondone={changed}
				/>
				{#if extras.donationItems}
					<CoinDonationPanel
						items={extras.donationItems}
						rules={page.donation_rules}
						upload={transports.uploadPhoto ?? null}
						submit={transports.submitDonation ?? null}
						ondone={changed}
					/>
				{/if}
			{/if}
			{#if showContracts && extras.contracts}
				<CoinContractsPanel
					contracts={extras.contracts}
					claim={page.in_economy ? (transports.claimContract ?? null) : null}
					markDone={transports.markContractDone ?? null}
					ondone={changed}
				/>
			{/if}
			{#if page.in_economy && sessionTwo && transports.reportOnHand}
				<CoinOnHand report={transports.reportOnHand} pending={onHandPending} ondone={changed} />
			{/if}
			</div>

			<div class="cp-col cp-col-side">
			{#if requests && requests.length}
				<CoinRequestsList {requests} cancel={transports.cancelRequest ?? null} ondone={changed} />
			{/if}
			{#if extras.auditor}
				<CoinAuditorPanel pending={extras.auditor} validate={transports.auditorValidate ?? null} ondone={changed} />
			{/if}

			<section class="card cp-card cp-history" aria-labelledby="cp-h-history" data-testid="coin-history">
				<h2 id="cp-h-history">History</h2>
				{#if history.rows.length}
					<ol class="cp-rows">
						{#each history.rows as row (row.id)}
							{@const type = coinTxnType({ category_id: row.category_id }, row.kind)}
							{@const amount = coinAmountDisplay(row.amount, type)}
							<li class="cp-row" data-testid="coin-row">
								<div class="cp-row-main">
									<span class="cp-reason">{row.name}</span>
									{#if row.note}<span class="cp-row-note">{row.note}</span>{/if}
									<span class="cp-row-meta">
										<span class="cp-chip {type}" data-testid="coin-type">
											<CoinTypeGlyph {type} size={12} />
											{COIN_TXN_TYPE_LABELS[type]}
										</span>
										{#if row.automatic}
											<span class="cp-chip auto" data-testid="coin-auto">Automatic</span>
										{/if}
										{#if row.edited}
											<span class="cp-chip edited" data-testid="coin-edited">Edited</span>
										{/if}
										<span class="cp-when">{coinWhen(row.at)}</span>
									</span>
									{#if row.edited && row.edits?.length}
										<ul class="cp-edits" data-testid="coin-edits">
											{#each row.edits as e, i (e.at + i)}
												<li class:undone={e.undone}>
													Changed from {signedCoins(e.old)} to {signedCoins(e.new)}, {coinWhen(e.at)}{e.undone ? ' (this change was undone)' : ''}.
												</li>
											{/each}
											{#if row.original_amount !== null && row.original_amount !== undefined}
												<li>First written as {signedCoins(row.original_amount)}.</li>
											{/if}
										</ul>
									{/if}
									{#if row.disputable || row.dispute}
										<CoinDispute {row} dispute={transports.disputeFine ?? null} ondone={changed} />
									{/if}
								</div>
								<span class="cp-amount {amount.tone}" data-testid="coin-amount">{amount.text}</span>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="cp-note">Nothing yet. Every coin you earn, lose or spend will be listed here with its reason.</p>
				{/if}
				{#if history.hiddenPairs > 0}
					<p class="cp-note" data-testid="coin-undone-note">
						{history.hiddenPairs} entr{history.hiddenPairs === 1 ? 'y was' : 'ies were'} undone by Mr. Pina
						and {history.hiddenPairs === 1 ? 'is' : 'are'} not shown, along with the undo.
					</p>
				{/if}
			</section>
			</div>

			{#if extras.stats}
				<div class="cp-wide">
					<CoinStatsPanel stats={extras.stats} {now} exportRows={transports.exportRows ?? null} />
				</div>
			{/if}

			<section class="card cp-card cp-rules" aria-labelledby="cp-h-rules" data-testid="coin-rules">
				<h2 id="cp-h-rules">How coins work</h2>
				<p class="cp-note">Open any rule to read exactly when it applies.</p>
				<div class="cp-rule-groups">
					{#each ruleGroups as g (g.type)}
						<div class="cp-rule-group" data-testid="rule-group" data-type={g.type}>
							<h3>{g.heading}</h3>
							<p class="cp-note">{g.lead}</p>
							<ul class="cp-rule-list">
								{#each g.rules as r (r.category_id || r.reason)}
									<li data-testid="rule">
										<Disclosure label={r.reason} collapseWhen={true} showWord="Read" hideWord="Close">
											{#snippet meta()}<span class="cp-rule-amount">{r.detail}</span>{/snippet}
											<p class="cp-rule-text">
												<span class="cp-rule-amount-line">Amount: {r.detail}.</span>
												{r.explanation ?? 'Ask Mr. Pina how this one works.'}
											</p>
										</Disclosure>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</section>
		</div>
	{/if}
</div>

<style>
	.cp-card {
		margin: 0 0 1.1rem;
		min-width: 0;
	}
	.cp-card h2 {
		margin-top: 0;
	}
	.cp-lead {
		color: var(--text-1);
	}
	.cp-note {
		color: var(--text-2);
		font-size: 0.95rem;
		margin: 0.3rem 0 0.6rem;
	}
	.cp-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0 1.1rem;
	}
	/* Two stacks side by side above 64rem, never a grid of rows: a row is as
	   tall as its tallest member, and these panels differ a lot in height. */
	.cp-col {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	@media (min-width: 64rem) {
		.cp-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
		.cp-wide,
		.cp-rules {
			grid-column: 1 / -1;
		}
	}
	.cp-wide {
		min-width: 0;
	}
	.cp-chip.edited {
		color: var(--violet-ink);
	}
	.cp-edits {
		margin: 0.15rem 0 0;
		padding-left: 1rem;
		color: var(--text-2);
		font-size: 0.85rem;
	}
	.cp-edits li.undone {
		text-decoration: line-through;
	}

	.cp-balance-row {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}
	.cp-balance {
		font-family: var(--font-mono);
		font-size: 2.6rem;
		line-height: 1.1;
		color: var(--green);
	}
	.cp-balance.neg {
		color: var(--amber);
	}
	.cp-debt-chip {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber);
		border: 1px solid var(--amber);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
	.cp-debt-line {
		color: var(--text-1);
		margin: 0.4rem 0 0;
	}
	.cp-facts {
		margin: 1rem 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.cp-fact {
		display: grid;
		grid-template-columns: 8.5rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: baseline;
		border-top: 1px solid var(--hairline);
		padding-top: 0.6rem;
	}
	.cp-fact dt {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cp-fact dd {
		margin: 0;
		color: var(--text-1);
	}
	.cp-yes {
		color: var(--green);
	}
	.cp-noshop dd strong {
		color: var(--amber);
	}
	@media (max-width: 30rem) {
		.cp-fact {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.15rem;
		}
	}

	.cp-buys {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 0.9rem;
	}
	.cp-help {
		margin: 0;
		color: var(--text-1);
		font-size: 0.95rem;
	}
	.cp-room {
		margin: 0;
		color: var(--text-1);
		font-size: 0.95rem;
	}
	.cp-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.cp-field input,
	.cp-field select {
		min-height: 44px;
		font-family: var(--font-display);
		font-size: 1rem;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-1);
		background: var(--bg0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.4rem 0.6rem;
		max-width: 100%;
		min-width: 0;
	}

	.cp-rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cp-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.8rem;
		padding: 0.6rem 0;
		border-bottom: 1px solid var(--hairline);
	}
	.cp-row:last-child {
		border-bottom: none;
	}
	.cp-row-main {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.cp-reason {
		font-weight: 700;
		color: var(--text-1);
	}
	.cp-row-note {
		color: var(--text-1);
		font-size: 0.92rem;
		overflow-wrap: break-word;
	}
	.cp-row-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	.cp-when {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.cp-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		border: 1px solid var(--boundary);
		border-radius: 3px;
		padding: 0.05rem 0.35rem;
		color: var(--text-2);
	}
	.cp-chip.award {
		color: var(--green);
	}
	.cp-chip.fine {
		color: var(--amber);
	}
	.cp-chip.purchase {
		color: var(--gold);
	}
	.cp-chip.adjustment {
		color: var(--violet-ink);
	}
	.cp-chip.payout {
		color: var(--cyan);
	}
	.cp-chip.auto {
		color: var(--cyan);
	}
	.cp-amount {
		font-family: var(--font-mono);
		font-size: 1.05rem;
		white-space: nowrap;
	}
	.cp-amount.positive {
		color: var(--green);
	}
	.cp-amount.negative,
	.cp-amount.purchase {
		color: var(--amber);
	}
	.cp-amount.adjustment {
		color: var(--violet-ink);
	}
	.cp-amount.transfer {
		color: var(--cyan);
	}

	.cp-rule-groups {
		columns: 22rem 3;
		column-gap: 1.4rem;
	}
	.cp-rule-group {
		break-inside: avoid;
		margin-bottom: 1rem;
	}
	.cp-rule-group h3 {
		margin: 0.4rem 0 0;
		color: var(--text-1);
	}
	.cp-rule-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.cp-rule-list li {
		border-bottom: 1px solid var(--hairline);
	}
	.cp-rule-amount {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--gold);
		white-space: nowrap;
	}
	.cp-rule-text {
		margin: 0 0 0.7rem;
		color: var(--text-1);
		font-size: 0.95rem;
	}
	.cp-rule-amount-line {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--text-2);
		margin-bottom: 0.2rem;
	}
</style>
