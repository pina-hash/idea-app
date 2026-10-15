<script lang="ts">
	import { onMount } from 'svelte';
	import { coins, signedCoins } from '$lib/coin-format';
	import { num, V2_UNAVAILABLE } from './v2';
	import {
		autopayTotal,
		DIGEST_DAYS,
		moneyWords,
		pushBlockedWords,
		sinceWords,
		type Digest,
		type DigestAutopayRow,
		type DigestTransports
	} from './digest';

	/**
	 * THE DIGEST (IDEA Coin V2, 2.13): the week in the coin economy, on one
	 * page, and the switch for its Friday notification.
	 *
	 * UNDO IS OFFERED ONLY WHERE THE ROW SAYS `reversible`, which the database
	 * sets for a full coin admin alone; a section staff member reads the same
	 * lines with no Undo on any of them. It is two presses, and a reversed row
	 * stays on the list, marked, so the week still reads as what autopay paid.
	 *
	 * THE NOTIFICATION IS TWO HALVES and the page says which one failed: the
	 * account's choice (`notify`) and this browser's subscription (`push`). A
	 * browser that cannot be subscribed is said in words; the account's choice
	 * still stands, so another browser can take it.
	 */
	let {
		transports,
		queueHref = '/coin-desk/queue'
	}: {
		transports: DigestTransports;
		queueHref?: string;
	} = $props();

	let digest = $state<Digest | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');

	let notify = $state(false);
	let notifyBusy = $state(false);
	let notifyError = $state('');
	let pushNote = $state<{ tone: 'notice' | 'warn'; text: string } | null>(null);
	let subscribed = $state<boolean | null>(null);

	let armed = $state<string | null>(null);
	let busyId = $state<string | null>(null);
	let rowError = $state<{ id: string; message: string } | null>(null);

	async function checkBrowser() {
		const push = transports.push;
		if (!push || !notify) {
			subscribed = null;
			return;
		}
		const blocked = pushBlockedWords(push.availability());
		if (blocked) {
			subscribed = false;
			pushNote = { tone: 'warn', text: `You are on the Friday list, but ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}` };
			return;
		}
		subscribed = await push.hasSubscription();
		if (!subscribed) {
			pushNote = { tone: 'warn', text: 'You are on the Friday list, but this browser is not subscribed yet.' };
		}
	}

	async function load() {
		phase = digest ? phase : 'loading';
		const r = await transports.load(DIGEST_DAYS);
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		digest = r.data;
		notify = r.data.notify;
		phase = 'ready';
	}

	onMount(() => {
		void load().then(checkBrowser);
	});

	async function subscribeBrowser(): Promise<void> {
		const push = transports.push;
		if (!push) return;
		const blocked = pushBlockedWords(push.availability());
		if (blocked) {
			subscribed = false;
			pushNote = { tone: 'warn', text: `You are on the Friday list, but ${blocked.charAt(0).toLowerCase()}${blocked.slice(1)}` };
			return;
		}
		const res = await push.enable();
		if (!res.ok) {
			subscribed = false;
			pushNote = {
				tone: 'warn',
				text: `You are on the Friday list, but this browser could not subscribe: ${res.error ?? 'it gave no reason'}`
			};
			return;
		}
		subscribed = true;
		pushNote = { tone: 'notice', text: 'This browser will get the Friday notification.' };
	}

	async function toggleNotify() {
		const set = transports.notify;
		if (!set || notifyBusy) return;
		const next = !notify;
		notifyBusy = true;
		notifyError = '';
		pushNote = null;
		try {
			const r = await set(next);
			if (r.kind === 'missing') {
				notifyError = V2_UNAVAILABLE;
				return;
			}
			if (r.kind === 'error') {
				notifyError = r.message;
				return;
			}
			if (!r.data?.ok) {
				notifyError = 'The switch was refused. Reload the page and try again.';
				return;
			}
			notify = next;
			if (next) {
				if (transports.push) await subscribeBrowser();
				else pushNote = { tone: 'notice', text: 'You are on the Friday list.' };
			} else {
				subscribed = null;
				pushNote = {
					tone: 'notice',
					text: 'Turned off: no digest notification will be sent to you. This browser keeps any subscription it has for other alerts.'
				};
			}
		} finally {
			notifyBusy = false;
		}
	}

	async function undo(row: DigestAutopayRow) {
		const reverse = transports.reverse;
		if (!reverse || busyId) return;
		busyId = row.id;
		rowError = null;
		try {
			const r = await reverse(row.id, 'Undone from the digest.');
			if (!r.ok) {
				rowError = { id: row.id, message: r.message };
				return;
			}
			armed = null;
			await load();
		} finally {
			busyId = null;
		}
	}

	const net = $derived(digest ? num(digest.money.in) - num(digest.money.out) : 0);
</script>

<section class="card" data-testid="cd-digest">
	<div class="d-head">
		<h2>Digest</h2>
		<button type="button" class="btn secondary cdx-small" onclick={load} disabled={phase === 'loading'}>Refresh</button>
	</div>
	<p class="cdx-note" data-testid="cd-digest-explain">
		The week in the coin economy: what autopay paid, who gained the most, who is stuck in debt, what is
		waiting in the queue, and money in against money out.
	</p>

	{#if phase === 'loading'}
		<p class="cdx-note">Loading the week…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error" data-testid="cd-digest-missing">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else if digest}
		<p class="cdx-note" data-testid="cd-digest-since">
			{sinceWords(digest.since, DIGEST_DAYS)}
			{digest.scope === 'section' ? 'Only students in your own classes are counted.' : 'Every student is counted.'}
		</p>

		{#if transports.notify}
			<div class="d-notify" data-testid="cd-digest-notify">
				<button
					type="button"
					class="btn cdx-small d-switch"
					class:on={notify}
					aria-pressed={notify}
					data-testid="cd-digest-notify-toggle"
					disabled={notifyBusy}
					onclick={toggleNotify}
				>
					<span class="d-switch-mark" aria-hidden="true">{notify ? '●' : '○'}</span>
					Friday notification: {notify ? 'On' : 'Off'}
				</button>
				<span class="cdx-note d-notify-hint">
					{notify
						? 'A push notification says the digest is ready, Friday afternoons.'
						: 'Turn on to get a push notification when the digest is ready, Friday afternoons.'}
				</span>
				{#if notify && subscribed === false && transports.push && transports.push.availability() === 'available'}
					<button type="button" class="btn secondary cdx-small" data-testid="cd-digest-subscribe" onclick={subscribeBrowser}>
						Subscribe this browser
					</button>
				{/if}
			</div>
			{#if notifyError}<p class="cdx-feedback error" role="alert">{notifyError}</p>{/if}
			{#if pushNote}
				<p class="cdx-feedback {pushNote.tone === 'warn' ? 'error' : 'notice'}" role="status" data-testid="cd-digest-push-note">
					{pushNote.text}
				</p>
			{/if}
		{/if}

		<div class="d-tiles">
			<div class="d-tile" data-testid="cd-digest-money">
				<h3>Money in and out</h3>
				<p class="d-figure" class:neg={net < 0}>{signedCoins(net)}</p>
				<p class="cdx-note">{moneyWords(digest.money)}</p>
			</div>
			<div class="d-tile" data-testid="cd-digest-queue">
				<h3>Queue</h3>
				<p class="d-figure">{digest.queue}</p>
				<p class="cdx-note">
					{digest.queue === 1 ? 'card is' : 'cards are'} waiting.
					<a class="d-link" href={queueHref}>Open the queue</a>
				</p>
			</div>
		</div>

		<h3>What autopay paid</h3>
		{#if !digest.autopay.length}
			<p class="cdx-note" data-testid="cd-digest-autopay-empty">Autopay paid nothing this week.</p>
		{:else}
			<p class="cdx-note">
				{digest.autopay.length} payment{digest.autopay.length === 1 ? '' : 's'}, {coins(autopayTotal(digest.autopay))} in all.
				{digest.scope === 'section' ? 'Only a full coin admin can undo one.' : ''}
			</p>
			<ul class="d-rows">
				{#each digest.autopay as row (row.id)}
					<li class="d-row" class:reversed={row.reversed} data-testid="cd-digest-autopay-row">
						<span class="person-name d-who" title={row.name}>{row.name}</span>
						<span class="d-what">{row.category}</span>
						<span class="d-amount" class:struck={row.reversed}>{signedCoins(num(row.amount))}</span>
						{#if row.reversed}
							<span class="cdx-chip warn">Undone</span>
						{:else if row.reversible && transports.reverse}
							{#if armed === row.id}
								<button
									type="button"
									class="btn cdx-small"
									data-testid="cd-digest-undo-confirm"
									disabled={busyId === row.id}
									onclick={() => undo(row)}
								>
									{busyId === row.id ? 'Undoing…' : 'Confirm undo'}
								</button>
								<button type="button" class="btn secondary cdx-small" onclick={() => (armed = null)}>Keep</button>
							{:else}
								<button
									type="button"
									class="btn secondary cdx-small"
									data-testid="cd-digest-undo"
									onclick={() => {
										armed = row.id;
										rowError = null;
									}}
								>
									Undo
								</button>
							{/if}
						{/if}
						{#if rowError?.id === row.id}<p class="cdx-feedback error d-full">{rowError.message}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<div class="d-cols">
			<div>
				<h3>Gained the most</h3>
				{#if !digest.gainers.length}
					<p class="cdx-note" data-testid="cd-digest-gainers-empty">Nobody gained more than the gain threshold this week.</p>
				{:else}
					<p class="cdx-note">Students whose balance rose by more than the gain threshold in Settings.</p>
					<ul class="d-rows">
						{#each digest.gainers as g (g.email)}
							<li class="d-row" data-testid="cd-digest-gainer">
								<span class="person-name d-who" title={g.name}>{g.name}</span>
								<span class="d-amount">{signedCoins(num(g.gained))}</span>
								<span class="d-what">Balance {coins(num(g.balance))}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div>
				<h3>Chronic debt</h3>
				{#if !digest.chronic_debt.length}
					<p class="cdx-note" data-testid="cd-digest-debt-empty">Nobody has been deep in debt for weeks.</p>
				{:else}
					<p class="cdx-note">Below the chronic debt line in Settings, and still there week after week.</p>
					<ul class="d-rows">
						{#each digest.chronic_debt as d (d.email)}
							<li class="d-row" data-testid="cd-digest-debt">
								<span class="person-name d-who" title={d.name}>{d.name}</span>
								<span class="cdx-balance negative">{coins(num(d.balance))}</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}
</section>

<style>
	.d-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	h3 {
		margin: 1rem 0 0.3rem;
		font-size: 1rem;
	}
	.d-notify {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.8rem;
		margin: 0.6rem 0;
	}
	.d-switch {
		color: var(--white);
		border-color: var(--text-2, var(--dim));
	}
	.d-switch.on {
		color: var(--green);
		border-color: var(--green);
		border-width: 2px;
	}
	.d-switch-mark {
		font-size: 0.9rem;
	}
	.d-notify-hint {
		margin: 0;
		flex: 1 1 14rem;
	}
	.d-tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin-top: 0.6rem;
	}
	.d-tile {
		flex: 1 1 14rem;
		min-width: 0;
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		background: var(--bg0);
		padding: 0.6rem 0.8rem;
	}
	.d-tile h3 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.d-figure {
		margin: 0.2rem 0;
		font-family: var(--font-mono);
		font-size: 1.6rem;
		color: var(--green);
	}
	.d-figure.neg {
		color: var(--amber);
	}
	.d-tile .cdx-note {
		margin: 0;
	}
	.d-link {
		color: var(--cyan);
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}
	.d-rows {
		list-style: none;
		margin: 0.3rem 0 0;
		padding: 0;
	}
	.d-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.9rem;
		min-height: 44px;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
	.d-row:last-child {
		border-bottom: none;
	}
	.d-who {
		flex: 1 1 10rem;
		min-width: 0;
		color: var(--white);
	}
	.d-what {
		color: var(--text-2, var(--dim));
		font-size: 0.88rem;
	}
	.d-amount {
		font-family: var(--font-mono);
		color: var(--white);
	}
	.d-amount.struck {
		text-decoration: line-through;
		color: var(--text-2, var(--dim));
	}
	.d-full {
		flex-basis: 100%;
	}
	.d-cols {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.5rem;
	}
	.d-cols > div {
		flex: 1 1 20rem;
		min-width: 0;
	}
</style>
