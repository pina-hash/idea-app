<script lang="ts">
	import StatusChip from '$lib/ui/StatusChip.svelte';
	import { onMount } from 'svelte';
	import { coins } from '$lib/coin-format';
	import { num, V2_UNAVAILABLE } from './v2';
	import {
		allTicked,
		debtPaymentWords,
		parseCoinCount,
		paydayWords,
		settleHeadline,
		settleSummary,
		tickedCoins,
		tickedIds,
		type PaydayClass,
		type PaydayDebt,
		type PaydayOverview,
		type PaydayTransports,
		type SettleSummary
	} from './payday';

	/**
	 * PAYDAY (IDEA Coin V2, 2.4): coins out and students in debt, one class at
	 * a time.
	 *
	 * Every request is TICKED BY DEFAULT, so nobody present is left out by
	 * accident; the teacher unticks anyone absent and presses Done, which is two
	 * presses because it settles a whole class's coins at once. Only the ticked
	 * ids are sent (`coin_payday_settle`), so an unticked request stays held for
	 * the next payday with nothing to undo.
	 *
	 * A debt row opens a count box for physical coins received; Record posts it
	 * (`coin_payday_debt_payment`). An omitted transport removes its control.
	 */
	let { transports }: { transports: PaydayTransports } = $props();

	let overview = $state<PaydayOverview | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	let cls = $state<PaydayClass | null>(null);
	let clsPhase = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let clsMessage = $state('');

	let ticks = $state<Record<string, boolean>>({});
	let armed = $state(false);
	let settling = $state(false);
	let doneBlocked = $state('');
	let summary = $state<{ s: SettleSummary; headline: string } | null>(null);
	let settleError = $state('');

	let debtOpen = $state<string | null>(null);
	let debtCount = $state<string>('');
	let debtBusy = $state(false);
	let debtMessage = $state<{ email: string; tone: 'notice' | 'error'; text: string } | null>(null);

	async function loadOverview() {
		phase = 'loading';
		const r = await transports.overview();
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		overview = { payday: r.data?.payday ?? null, sections: r.data?.sections ?? [] };
		phase = 'ready';
	}

	onMount(() => {
		void loadOverview();
	});

	async function openClass(id: string, keepSummary = false) {
		clsPhase = 'loading';
		armed = false;
		doneBlocked = '';
		if (!keepSummary) {
			summary = null;
			settleError = '';
			debtMessage = null;
		}
		debtOpen = null;
		const r = await transports.open(id);
		if (r.kind === 'missing') {
			clsPhase = 'error';
			clsMessage = V2_UNAVAILABLE;
			return;
		}
		if (r.kind === 'error') {
			clsPhase = 'error';
			clsMessage = r.message;
			return;
		}
		cls = {
			...r.data,
			requests: r.data?.requests ?? [],
			debts: r.data?.debts ?? []
		};
		ticks = allTicked(cls.requests);
		clsPhase = 'ready';
	}

	function backToClasses() {
		cls = null;
		clsPhase = 'idle';
		summary = null;
		void loadOverview();
	}

	const requests = $derived(cls?.requests ?? []);
	const ids = $derived(tickedIds(requests, ticks));
	const outCoins = $derived(tickedCoins(requests, ticks));
	const unticked = $derived(requests.length - ids.length);

	function pressDone() {
		settleError = '';
		if (!ids.length) {
			doneBlocked = 'Nobody is ticked. Tick the students you handed coins to, then press Done.';
			return;
		}
		doneBlocked = '';
		armed = true;
	}

	async function confirmDone() {
		const settle = transports.settle;
		if (!settle || !cls || settling) return;
		settling = true;
		const sent = [...ids];
		const before = [...requests];
		const left = before.length - sent.length;
		try {
			const r = await settle(sent);
			armed = false;
			if (r.kind === 'missing') {
				settleError = V2_UNAVAILABLE;
				return;
			}
			if (r.kind === 'error') {
				settleError = r.message;
				return;
			}
			const s = settleSummary(r.data, before);
			summary = { s, headline: settleHeadline(s, left) };
			await openClass(cls.section_id, true);
		} finally {
			settling = false;
		}
	}

	function openDebt(d: PaydayDebt) {
		if (debtOpen === d.email) {
			debtOpen = null;
			return;
		}
		debtOpen = d.email;
		debtCount = String(Math.max(0, -num(d.balance)));
		debtMessage = null;
	}

	async function recordDebt(d: PaydayDebt) {
		const pay = transports.payDebt;
		if (!pay || debtBusy || !cls) return;
		const count = parseCoinCount(debtCount);
		if (count == null) {
			debtMessage = { email: d.email, tone: 'error', text: 'Enter the count of coins received, above zero.' };
			return;
		}
		debtBusy = true;
		try {
			const r = await pay(d.email, count);
			if (r.kind === 'missing') {
				debtMessage = { email: d.email, tone: 'error', text: V2_UNAVAILABLE };
				return;
			}
			if (r.kind === 'error') {
				debtMessage = { email: d.email, tone: 'error', text: r.message };
				return;
			}
			const words = debtPaymentWords(r.data, d.name);
			if (!r.data?.ok) {
				debtMessage = { email: d.email, tone: 'error', text: words };
				return;
			}
			// Said ABOVE the list: the row may leave it once the debt is cleared.
			debtMessage = { email: '', tone: 'notice', text: words };
			await openClass(cls.section_id, true);
		} finally {
			debtBusy = false;
		}
	}
</script>

<section class="card" data-testid="cd-payday">
	<div class="p-head">
		<h2>Payday{cls ? `: ${cls.label}` : ''}</h2>
		{#if cls}
			<button type="button" class="btn secondary cdx-small" data-testid="cd-payday-back" onclick={backToClasses}>
				All classes
			</button>
		{/if}
	</div>
	<p class="cdx-note" data-testid="cd-payday-explain">
		Coins students asked to take out, and students in debt, one class at a time. Hand the coins out, untick
		anyone absent, then press Done.
	</p>

	{#if phase === 'loading'}
		<p class="cdx-note">Loading payday…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error" data-testid="cd-payday-missing">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else if !cls && clsPhase !== 'loading'}
		<p class="p-date" data-testid="cd-payday-date">{paydayWords(overview?.payday)}</p>
		{#if clsPhase === 'error'}<p class="cdx-feedback error">{clsMessage}</p>{/if}
		{#if !overview?.sections.length}
			<p class="cdx-note" data-testid="cd-payday-none">
				None of your classes has the coin economy turned on.
			</p>
		{:else}
			<p class="cdx-note">Pick a class to see who asked for coins and who is in debt.</p>
			<ul class="p-classes">
				{#each overview.sections as s (s.id)}
					<li>
						<button type="button" class="p-class" data-testid="cd-payday-class" onclick={() => openClass(s.id)}>
							<span class="p-class-name">{s.label}</span>
							<span class="p-class-counts">
								{s.requests} asking for coins, {s.in_debt} in debt
							</span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if clsPhase === 'loading'}
		<p class="cdx-note">Loading the class…</p>
	{:else if cls}
		<p class="p-date" data-testid="cd-payday-date">{paydayWords(cls.payday)}</p>

		{#if summary}
			<div class="cdx-feedback notice p-summary" role="status" data-testid="cd-payday-summary">
				<p class="p-summary-head">{summary.headline}</p>
				<ul>
					{#each summary.s.lines as line (line.id)}
						<li class:warn={!line.ok}><span class="person-name">{line.name}</span>: {line.words}</li>
					{/each}
				</ul>
			</div>
		{/if}

		<h3>Coins out</h3>
		{#if !requests.length}
			<p class="cdx-note" data-testid="cd-payday-no-requests">Nobody in this class has asked for coins out.</p>
		{:else}
			<p class="cdx-note">
				Everyone is ticked. Hand the coins out, untick anyone who is absent, then press Done. An unticked
				request stays held for the next payday.
			</p>
			<ul class="p-rows">
				{#each requests as r (r.id)}
					<li>
						<label class="p-row" data-testid="cd-payday-request">
							<input
								type="checkbox"
								checked={ticks[r.id] !== false}
								onchange={(e) => (ticks = { ...ticks, [r.id]: (e.currentTarget as HTMLInputElement).checked })}
							/>
							<span class="person-name p-name" title={r.name}>{r.name}</span>
							<span class="p-coins">{coins(num(r.coins))}</span>
							<span class="p-bal">
								Balance <span class="cdx-balance" class:negative={num(r.balance) < 0}>{coins(num(r.balance))}</span>
							</span>
							{#if ticks[r.id] === false}<StatusChip tone="warn" label="Next payday" />{/if}
						</label>
					</li>
				{/each}
			</ul>

			{#if transports.settle}
				<div class="p-done">
					{#if armed}
						<p class="p-ask">
							Settle {ids.length} request{ids.length === 1 ? '' : 's'}, {coins(outCoins)} in all?
							{#if unticked}{unticked} unticked stay{unticked === 1 ? 's' : ''} for the next payday.{/if}
						</p>
						<button type="button" class="btn" data-testid="cd-payday-done-confirm" disabled={settling} onclick={confirmDone}>
							{settling ? 'Settling…' : `Yes, settle ${ids.length}`}
						</button>
						<button type="button" class="btn secondary" onclick={() => (armed = false)}>Cancel</button>
					{:else}
						<button
							type="button"
							class="btn"
							data-testid="cd-payday-done"
							aria-disabled={!ids.length}
							onclick={pressDone}
						>
							Done
						</button>
						<span class="cdx-note p-done-hint">{ids.length} ticked, {coins(outCoins)} to hand out.</span>
					{/if}
				</div>
				{#if doneBlocked}<p class="cdx-feedback error">{doneBlocked}</p>{/if}
				{#if settleError}<p class="cdx-feedback error" role="alert">{settleError}</p>{/if}
			{/if}
		{/if}

		<h3>Students in debt</h3>
		{#if debtMessage && !debtMessage.email}
			<p class="cdx-feedback {debtMessage.tone}" role="status" data-testid="cd-payday-debt-result">{debtMessage.text}</p>
		{/if}
		{#if !cls.debts.length}
			<p class="cdx-note" data-testid="cd-payday-no-debts">Nobody in this class is in debt.</p>
		{:else}
			<p class="cdx-note">
				A balance below zero is debt. Tap a student to record physical coins they hand you toward it.
			</p>
			<ul class="p-rows">
				{#each cls.debts as d (d.email)}
					<li class="p-debt" data-testid="cd-payday-debt">
						{#if transports.payDebt}
							<button
								type="button"
								class="p-debt-row"
								aria-expanded={debtOpen === d.email}
								class:on={debtOpen === d.email}
								onclick={() => openDebt(d)}
							>
								<span class="person-name p-name" title={d.name}>{d.name}</span>
								<span class="p-owes">Owes <span class="cdx-balance negative">{coins(Math.max(0, -num(d.balance)))}</span></span>
								<span class="p-debt-word">{debtOpen === d.email ? 'Close' : 'Record coins'}</span>
							</button>
						{:else}
							<div class="p-debt-row">
								<span class="person-name p-name" title={d.name}>{d.name}</span>
								<span class="p-owes">Owes <span class="cdx-balance negative">{coins(Math.max(0, -num(d.balance)))}</span></span>
							</div>
						{/if}
						{#if debtOpen === d.email}
							<div class="cdx-row p-debt-form">
								<label class="cdx-field">
									<span>Coins received</span>
									<input
										class="cdx-input"
										type="text"
										inputmode="decimal"
										data-testid="cd-payday-debt-count"
										bind:value={debtCount}
									/>
								</label>
								<button
									type="button"
									class="btn cdx-small"
									data-testid="cd-payday-debt-record"
									disabled={debtBusy}
									onclick={() => recordDebt(d)}
								>
									{debtBusy ? 'Recording…' : 'Record'}
								</button>
							</div>
							{#if debtMessage?.email === d.email}
								<p class="cdx-feedback {debtMessage.tone}" role="alert">{debtMessage.text}</p>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.p-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
		overflow-wrap: anywhere;
	}
	h3 {
		margin: 1.1rem 0 0.3rem;
		font-size: 1rem;
	}
	.p-date {
		font-family: var(--font-mono);
		color: var(--cyan);
		margin: 0.5rem 0;
	}
	.p-classes,
	.p-rows {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
	}
	.p-classes {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.p-class {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 0.3rem 1rem;
		width: 100%;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		background: var(--bg0);
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		color: var(--white);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.p-class:hover {
		border-color: var(--green);
	}
	.p-class-name {
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.p-class-counts {
		color: var(--text-2, var(--dim));
		font-size: 0.88rem;
	}
	.p-row,
	.p-debt-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 1rem;
		min-height: 44px;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
		cursor: pointer;
		width: 100%;
	}
	.p-row input {
		width: 22px;
		height: 22px;
		accent-color: var(--green);
		flex: none;
	}
	.p-name {
		flex: 1 1 10rem;
		min-width: 0;
		color: var(--white);
	}
	.p-coins {
		font-family: var(--font-mono);
		color: var(--white);
	}
	.p-bal,
	.p-owes {
		color: var(--text-2, var(--dim));
		font-size: 0.9rem;
	}
	.p-debt-row {
		background: none;
		border-left: none;
		border-right: none;
		border-top: none;
		color: inherit;
		font: inherit;
		text-align: left;
	}
	.p-debt-row.on {
		border-bottom-color: var(--green);
	}
	.p-debt-word {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--cyan);
		letter-spacing: 0.04em;
	}
	.p-debt-form {
		padding: 0.2rem 0 0.4rem;
	}
	.p-done {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin-top: 0.8rem;
	}
	.p-ask {
		flex-basis: 100%;
		margin: 0;
		color: var(--white);
	}
	.p-done-hint {
		margin: 0;
	}
	.p-summary p,
	.p-summary ul {
		margin: 0;
	}
	.p-summary ul {
		padding-left: 1.1rem;
		margin-top: 0.3rem;
		color: var(--white);
	}
	.p-summary li.warn {
		color: var(--amber);
	}
	.btn[aria-disabled='true'],
	.btn[aria-disabled='true']:hover {
		color: var(--text-2, var(--dim));
		border-color: var(--text-2, var(--dim));
		border-style: dashed;
		background: transparent;
		box-shadow: none;
		cursor: not-allowed;
	}
</style>
