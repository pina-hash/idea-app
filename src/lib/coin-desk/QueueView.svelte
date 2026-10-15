<script lang="ts">
	import { onMount } from 'svelte';
	import { coins } from '$lib/coin-format';
	import Disclosure from '$lib/Disclosure.svelte';
	import Lightbox from '$lib/media/Lightbox.svelte';
	import type { LightboxImage } from '$lib/media/lightbox';
	import { num, V2_UNAVAILABLE } from './v2';
	import {
		amountEditable,
		amountRequired,
		amountSeed,
		approveAllSkips,
		approveAllWords,
		approveCheck,
		cardAmountWords,
		cardDetail,
		cardWhen,
		decisionWords,
		QUEUE_KIND_WORDS,
		QUEUE_KINDS,
		queueRefusal,
		recentWords,
		totalPending,
		type QueueCard,
		type QueueKind,
		type QueuePayload,
		type QueueTransports
	} from './queue';

	/**
	 * THE QUEUE (IDEA Coin V2, 2.2): one list for everything students submit.
	 *
	 * A presentation component over injected transports (the route points them
	 * at 0245's RPCs, the dev harness answers in memory), so the harness mounts
	 * this identical file. An omitted transport removes the control it drives:
	 * no `decide` is no Approve or Deny, no `approveAll` is no Approve All, no
	 * `photoUrl` is no thumbnail.
	 *
	 * APPROVE IS ONE PRESS AND DENY IS ONE PRESS (with an optional reason the
	 * student sees). APPROVE ALL IS TWO, and names the count, because it moves
	 * coins for a whole kind at once. Every refusal from the database is said in
	 * words on the card it belongs to; every landed decision is said once above
	 * the list, because the card it was about leaves the list.
	 */
	let { transports }: { transports: QueueTransports } = $props();

	let data = $state<QueuePayload | null>(null);
	let phase = $state<'loading' | 'ready' | 'missing' | 'error'>('loading');
	let message = $state('');
	let filter = $state<QueueKind | null>(null);

	/** The amount box per card, seeded once from the card's own amount. */
	let amounts = $state<Record<string, string>>({});
	/** Cards whose deny reason box is open, and what is typed in it. */
	let denying = $state<Record<string, boolean>>({});
	let reasons = $state<Record<string, string>>({});
	let busyId = $state<string | null>(null);
	let cardError = $state<{ id: string; message: string } | null>(null);
	/** The last landed decision, said above the list. */
	let notice = $state('');

	let armedAll = $state(false);
	let busyAll = $state(false);
	let allMessage = $state<{ tone: 'notice' | 'error'; text: string } | null>(null);
	let allBlocked = $state('');

	let photos = $state<Record<string, string>>({});
	let lightboxIndex = $state<number | null>(null);

	async function fetchPhotos(cards: QueueCard[]) {
		const photoUrl = transports.photoUrl;
		if (!photoUrl) return;
		const wanted = cards.filter((c) => c.photo_path && !photos[c.id]);
		const got = await Promise.all(
			wanted.map(async (c) => [c.id, await photoUrl(c.photo_path as string)] as const)
		);
		const next = { ...photos };
		for (const [id, url] of got) if (url) next[id] = url;
		photos = next;
	}

	async function load(kind: QueueKind | null = filter) {
		phase = data ? phase : 'loading';
		const r = await transports.load(kind);
		if (r.kind === 'missing') {
			phase = 'missing';
			return;
		}
		if (r.kind === 'error') {
			phase = 'error';
			message = r.message;
			return;
		}
		const seeded = { ...amounts };
		for (const c of r.data.pending) if (!(c.id in seeded)) seeded[c.id] = amountSeed(c);
		amounts = seeded;
		data = r.data;
		phase = 'ready';
		void fetchPhotos([...r.data.pending, ...r.data.recent]);
	}

	onMount(() => {
		void load(null);
	});

	function choose(kind: QueueKind | null) {
		if (filter === kind) return;
		filter = kind;
		armedAll = false;
		allMessage = null;
		allBlocked = '';
		void load(kind);
	}

	const pending = $derived(data?.pending ?? []);
	const counts = $derived(data?.counts ?? {});
	const total = $derived(totalPending(counts));
	/** The chips: every kind that has a card, plus the chosen one. */
	const chips = $derived(QUEUE_KINDS.filter((k) => (counts[k] ?? 0) > 0 || k === filter));

	async function decide(card: QueueCard, approve: boolean) {
		const decideFn = transports.decide;
		if (!decideFn || busyId) return;
		cardError = null;
		let amount: number | null = null;
		if (approve) {
			const check = approveCheck(card, amounts[card.id]);
			if (!check.ok) {
				cardError = { id: card.id, message: check.problem };
				return;
			}
			amount = check.amount;
		}
		const note = approve ? null : (reasons[card.id] ?? '').trim() || null;
		busyId = card.id;
		try {
			const r = await decideFn(card.id, approve, amount, note);
			if (r.kind === 'missing') {
				cardError = { id: card.id, message: V2_UNAVAILABLE };
				return;
			}
			if (r.kind === 'error') {
				cardError = { id: card.id, message: r.message };
				return;
			}
			if (!r.data?.ok) {
				cardError = { id: card.id, message: queueRefusal(r.data) };
				return;
			}
			notice = decisionWords(card, approve, r.data);
			denying = { ...denying, [card.id]: false };
			await load();
		} finally {
			busyId = null;
		}
	}

	function pressApproveAll() {
		allMessage = null;
		if (!filter) {
			allBlocked = 'Choose one kind above first. Approve All works on one kind at a time.';
			return;
		}
		if (!(counts[filter] ?? 0)) {
			allBlocked = 'Nothing of this kind is waiting.';
			return;
		}
		allBlocked = '';
		armedAll = true;
	}

	async function confirmApproveAll() {
		const fn = transports.approveAll;
		if (!fn || !filter || busyAll) return;
		busyAll = true;
		try {
			const r = await fn(filter);
			armedAll = false;
			if (r.kind === 'missing') {
				allMessage = { tone: 'error', text: V2_UNAVAILABLE };
				return;
			}
			if (r.kind === 'error') {
				allMessage = { tone: 'error', text: r.message };
				return;
			}
			if (!r.data?.ok) {
				allMessage = { tone: 'error', text: queueRefusal(r.data) };
				return;
			}
			allMessage = { tone: 'notice', text: approveAllWords(r.data) };
			await load();
		} finally {
			busyAll = false;
		}
	}

	const filterCount = $derived(filter ? (counts[filter] ?? 0) : 0);
	const filterSkips = $derived(filter ? approveAllSkips(pending, filter) : 0);

	const gallery = $derived<LightboxImage[]>(
		[...pending, ...(data?.recent ?? [])]
			.filter((c) => photos[c.id])
			.map((c) => ({
				key: c.id,
				src: photos[c.id],
				alt: `${QUEUE_KIND_WORDS[c.kind].one} photo from ${c.name}`,
				caption: `${c.name}, ${QUEUE_KIND_WORDS[c.kind].one.toLowerCase()}`
			}))
	);
	function openPhoto(id: string) {
		const i = gallery.findIndex((g) => g.key === id);
		if (i >= 0) lightboxIndex = i;
	}
</script>

<section class="card" data-testid="cd-queue">
	<div class="q-head">
		<h2>Queue</h2>
		<button type="button" class="btn secondary cdx-small" onclick={() => load()} disabled={phase === 'loading'}>
			Refresh
		</button>
	</div>
	<p class="cdx-note" data-testid="cd-queue-explain">
		Nothing in the queue expires: a card waits here until someone approves or denies it. Approving pays
		the student (or grants what they bought); a reason you give when denying is shown to the student.
	</p>

	{#if phase === 'loading'}
		<p class="cdx-note">Loading the queue…</p>
	{:else if phase === 'missing'}
		<p class="cdx-feedback error" data-testid="cd-queue-missing">{V2_UNAVAILABLE}</p>
	{:else if phase === 'error'}
		<p class="cdx-feedback error">{message}</p>
	{:else}
		<div class="q-filters" role="group" aria-label="Show one kind">
			<button
				type="button"
				class="btn secondary cdx-small q-chip"
				aria-pressed={filter === null}
				class:on={filter === null}
				data-testid="cd-queue-filter"
				data-kind="all"
				onclick={() => choose(null)}
			>
				All <span class="q-count">{total}</span>
			</button>
			{#each chips as k (k)}
				<button
					type="button"
					class="btn secondary cdx-small q-chip"
					aria-pressed={filter === k}
					class:on={filter === k}
					data-testid="cd-queue-filter"
					data-kind={k}
					onclick={() => choose(k)}
				>
					{QUEUE_KIND_WORDS[k].many} <span class="q-count">{counts[k] ?? 0}</span>
				</button>
			{/each}
		</div>

		{#if transports.approveAll}
			<div class="q-all" data-testid="cd-queue-all">
				{#if armedAll && filter}
					<p class="q-all-ask">
						Approve all {filterCount} {filterCount === 1 ? QUEUE_KIND_WORDS[filter].one.toLowerCase() : QUEUE_KIND_WORDS[filter].many.toLowerCase()}
						card{filterCount === 1 ? '' : 's'}?
						{#if filterSkips}
							{filterSkips} without an amount will be skipped and stay here.
						{/if}
					</p>
					<button
						type="button"
						class="btn cdx-small"
						data-testid="cd-queue-all-confirm"
						disabled={busyAll}
						onclick={confirmApproveAll}
					>
						{busyAll ? 'Approving…' : `Yes, approve ${filterCount}`}
					</button>
					<button type="button" class="btn secondary cdx-small" onclick={() => (armedAll = false)}>Cancel</button>
				{:else}
					<button
						type="button"
						class="btn secondary cdx-small"
						data-testid="cd-queue-all-arm"
						aria-disabled={!filter || !filterCount}
						onclick={pressApproveAll}
					>
						{filter ? `Approve all ${QUEUE_KIND_WORDS[filter].many.toLowerCase()}` : 'Approve all of one kind'}
					</button>
					{#if !filter}
						<span class="cdx-note q-all-hint">Choose a kind above to approve all of it at once.</span>
					{/if}
				{/if}
			</div>
			{#if allBlocked}<p class="cdx-feedback error">{allBlocked}</p>{/if}
			{#if allMessage}
				<p class="cdx-feedback {allMessage.tone}" role="status" data-testid="cd-queue-all-result">{allMessage.text}</p>
			{/if}
		{/if}

		<p class="q-live" role="status" aria-live="polite">
			{#if notice}<span class="cdx-feedback notice q-notice" data-testid="cd-queue-notice">{notice}</span>{/if}
		</p>

		{#if !pending.length}
			<p class="cdx-note" data-testid="cd-queue-empty">
				{filter ? `No ${QUEUE_KIND_WORDS[filter].many.toLowerCase()} waiting.` : 'Nothing is waiting. The queue is clear.'}
			</p>
		{:else}
			<ol class="q-cards" style:column-count={Math.min(3, pending.length)}>
				{#each pending as card (card.id)}
					{@const detail = cardDetail(card)}
					{@const amountLine = cardAmountWords(card)}
					<li class="q-card" data-testid="cd-queue-card" data-kind={card.kind}>
						<div class="q-top">
							<span class="cdx-chip q-kind" data-testid="cd-queue-kind">{QUEUE_KIND_WORDS[card.kind].one}</span>
							<span class="q-when">{cardWhen(card.created_at)}</span>
						</div>
						<div class="q-who">
							<span class="person-name q-name" title={card.name}>{card.name}</span>
							<span class="q-section">{card.section ?? 'No class'}</span>
						</div>
						<div class="q-money">
							{#if amountLine}<span class="q-amount" data-testid="cd-queue-amount">{amountLine}</span>{/if}
							<span class="q-bal">
								Balance <span class="cdx-balance" class:negative={num(card.balance) < 0}>{coins(num(card.balance))}</span>
							</span>
						</div>
						{#if card.photo_path && photos[card.id]}
							<button
								type="button"
								class="q-thumb"
								data-testid="cd-queue-photo"
								onclick={() => openPhoto(card.id)}
							>
								<img src={photos[card.id]} alt="{QUEUE_KIND_WORDS[card.kind].one} photo from {card.name}" loading="lazy" />
								<span class="q-thumb-word">Open photo</span>
							</button>
						{:else if card.photo_path}
							<p class="cdx-note q-nophoto">Photo attached (could not load a preview).</p>
						{/if}
						{#if detail.length}
							<ul class="q-detail" data-testid="cd-queue-detail">
								{#each detail as line, i (i)}<li>{line}</li>{/each}
							</ul>
						{/if}
						{#if card.note}
							<p class="q-note"><span class="q-label">Student’s note</span> {card.note}</p>
						{/if}

						{#if transports.decide}
							{#if amountEditable(card)}
								<label class="cdx-field q-amount-field">
									<span>Amount to pay (coins){amountRequired(card) ? ', required' : ''}</span>
									<input
										class="cdx-input"
										type="text"
										inputmode="decimal"
										data-testid="cd-queue-amount-input"
										bind:value={amounts[card.id]}
										placeholder={amountRequired(card) ? 'Enter an amount' : ''}
									/>
								</label>
							{/if}
							{#if denying[card.id]}
								<label class="cdx-field q-reason">
									<span>Reason the student will see (optional)</span>
									<textarea class="cdx-textarea" maxlength="500" bind:value={reasons[card.id]} data-testid="cd-queue-reason"></textarea>
								</label>
								<div class="q-actions">
									<button
										type="button"
										class="btn cdx-small q-deny"
										data-testid="cd-queue-deny-confirm"
										disabled={busyId === card.id}
										onclick={() => decide(card, false)}
									>
										{busyId === card.id ? 'Denying…' : 'Deny'}
									</button>
									<button
										type="button"
										class="btn secondary cdx-small"
										onclick={() => (denying = { ...denying, [card.id]: false })}
									>
										Keep it
									</button>
								</div>
							{:else}
								<div class="q-actions">
									<button
										type="button"
										class="btn cdx-small"
										data-testid="cd-queue-approve"
										aria-disabled={!approveCheck(card, amounts[card.id]).ok}
										disabled={busyId === card.id}
										onclick={() => decide(card, true)}
									>
										{busyId === card.id ? 'Approving…' : 'Approve'}
									</button>
									<button
										type="button"
										class="btn secondary cdx-small"
										data-testid="cd-queue-deny"
										onclick={() => {
											denying = { ...denying, [card.id]: true };
											cardError = null;
										}}
									>
										Deny
									</button>
								</div>
							{/if}
						{/if}
						{#if cardError?.id === card.id}
							<p class="cdx-feedback error" role="alert" data-testid="cd-queue-card-error">{cardError.message}</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}

		{#if data?.recent.length}
			<div class="q-recent cdx-disc" data-testid="cd-queue-recent">
				<Disclosure label="Decided in the last two weeks" collapseWhen={true}>
					{#snippet meta()}
						<span class="cdx-chip">{data?.recent.length ?? 0}</span>
					{/snippet}
					<ul class="q-recent-rows">
						{#each data?.recent ?? [] as card (card.id)}
							<li class="q-recent-row" data-testid="cd-queue-recent-row">
								<span class="person-name" title={card.name}>{card.name}</span>
								<span class="q-recent-kind">{QUEUE_KIND_WORDS[card.kind].one}</span>
								<span class="cdx-chip" class:ok={card.status === 'approved'} class:warn={card.status === 'denied'}>
									{recentWords(card)}
								</span>
								{#if card.amount != null && card.status === 'approved' && card.kind !== 'reported_coins'}
									<span class="q-recent-amount">{coins(num(card.amount))}</span>
								{/if}
								{#if card.decision_note}
									<span class="q-recent-note">Reason: {card.decision_note}</span>
								{/if}
							</li>
						{/each}
					</ul>
				</Disclosure>
			</div>
		{/if}
	{/if}
</section>

{#if gallery.length}
	<Lightbox
		images={gallery}
		index={lightboxIndex}
		label="Queue photos"
		onIndex={(i) => (lightboxIndex = i)}
		onClose={() => (lightboxIndex = null)}
		testId="cd-queue-lightbox"
	/>
{/if}

<style>
	.q-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0;
	}
	.q-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin: 0.6rem 0;
	}
	.q-chip.on {
		color: var(--green);
		border-color: var(--green);
		border-width: 2px;
	}
	.q-count {
		font-family: var(--font-mono);
		color: var(--text-2, var(--dim));
	}
	.q-chip.on .q-count {
		color: var(--green);
	}
	.q-all {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin: 0.4rem 0;
	}
	.q-all-ask {
		margin: 0;
		color: var(--white);
		flex-basis: 100%;
	}
	.q-all-hint {
		margin: 0;
	}
	.q-live {
		margin: 0;
	}
	.q-notice {
		display: block;
	}
	/* Cards of unequal height side by side: multi-column, never a grid (a grid
	   row is as tall as its tallest card). The count is a ceiling, so two
	   cards on a wide desk share the width rather than leaving a third column
	   empty beside them. */
	.q-cards {
		list-style: none;
		margin: 0.6rem 0 0;
		padding: 0;
		column-width: 22rem;
		column-gap: 1rem;
	}
	.q-card {
		break-inside: avoid;
		margin-bottom: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: 0;
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		background: var(--bg0);
		padding: 0.7rem 0.8rem;
	}
	.q-top {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.q-kind {
		color: var(--cyan);
		border-color: var(--cyan);
	}
	.q-when,
	.q-section {
		color: var(--text-2, var(--dim));
		font-size: 0.82rem;
	}
	.q-who {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.q-name {
		font-size: 1.05rem;
		color: var(--white);
		font-weight: 600;
	}
	.q-money {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 1rem;
		font-size: 0.92rem;
		color: var(--white);
	}
	.q-amount {
		font-family: var(--font-mono);
	}
	.q-bal {
		color: var(--text-2, var(--dim));
	}
	.q-thumb {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.25rem;
		background: none;
		border: 1px solid var(--boundary, var(--line));
		border-radius: 4px;
		padding: 0.3rem;
		cursor: zoom-in;
		min-height: 44px;
		max-width: 100%;
		color: var(--cyan);
		font: inherit;
	}
	.q-thumb img {
		display: block;
		max-width: 100%;
		max-height: 9rem;
		object-fit: contain;
	}
	.q-thumb-word {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
	}
	.q-nophoto {
		margin: 0;
	}
	.q-detail {
		margin: 0;
		padding-left: 1.1rem;
		color: var(--white);
		font-size: 0.92rem;
	}
	.q-note {
		margin: 0;
		color: var(--white);
		font-size: 0.92rem;
		overflow-wrap: anywhere;
	}
	.q-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2, var(--dim));
		margin-right: 0.3rem;
	}
	.q-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.2rem;
	}
	.q-deny {
		color: var(--amber);
		border-color: var(--amber);
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
	.q-recent {
		margin-top: 1rem;
	}
	.q-recent-rows {
		list-style: none;
		margin: 0.4rem 0 0;
		padding: 0;
	}
	.q-recent-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem 0.8rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid var(--line);
		min-height: 44px;
	}
	.q-recent-row:last-child {
		border-bottom: none;
	}
	.q-recent-kind,
	.q-recent-note {
		color: var(--text-2, var(--dim));
		font-size: 0.85rem;
	}
	.q-recent-note {
		flex-basis: 100%;
		overflow-wrap: anywhere;
	}
	.q-recent-amount {
		font-family: var(--font-mono);
		color: var(--white);
	}
</style>
