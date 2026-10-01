<script lang="ts">
	/**
	 * THE GAME REQUEST BOARD (report b2ba6d74, ledger 0360). A student who wants
	 * a game asks for one, with a message, and may state an offer in their own
	 * words. Somebody who builds it publishes it the ordinary way and the
	 * requester closes the request, naming the app if they like.
	 *
	 * NO COIN MOVES, AND THE BOARD SAYS SO BESIDE EVERY OFFER. Mr. Pina decided
	 * the board only (2026-09-30: "transactions off the site"), so an offer is
	 * text a student typed and nothing reads it. `FOUNDRY_REQUEST_OFFER_NOTE`
	 * is on the form and under every card that carries one.
	 *
	 * READ ONCE ON PAGE LOAD, NO POLL. A board changes a few times a day; the
	 * person posting sees their own request because the route re-reads after a
	 * write.
	 *
	 * TEXT IS TEXT. Title, message and offer render as plain strings with
	 * `pre-wrap` for line breaks: no `{@html}`, no markdown and no linking, so a
	 * request cannot carry a link somebody did not mean to follow.
	 *
	 * ABSENCE IS THE MECHANISM: no `post` transport, no form; no `close`, no
	 * Close key; no `setHidden` (everybody who is not an admin), no Hide key.
	 * Closing is two steps because nothing reopens a request.
	 */
	import Disclosure from '$lib/Disclosure.svelte';

	import ForgeStatus from './ForgeStatus.svelte';
	import {
		FOUNDRY_REQUEST_NAME_NOTE,
		FOUNDRY_REQUEST_OFFER_NOTE,
		FOUNDRY_REQUEST_UNAVAILABLE_NOTE,
		REQUEST_BODY_MAX,
		REQUEST_OFFER_MAX,
		REQUEST_TITLE_MAX,
		requestCanPost,
		requestDay,
		requestRefusalSentence,
		requestSlugFrom,
		splitRequests,
		type FoundryGameRequest
	} from './requests.ts';
	import { foundryAuthorName } from './surface.ts';
	import type { FoundryRequestTransports } from './transports.ts';

	let {
		requests,
		available = true,
		transports = {},
		onChanged = undefined
	}: {
		requests: FoundryGameRequest[];
		/** False on a database without 0230: the board says it is not on yet. */
		available?: boolean;
		transports?: FoundryRequestTransports;
		onChanged?: () => void;
	} = $props();

	const lists = $derived(splitRequests(requests));
	const uid = $props.id();

	let title = $state('');
	let body = $state('');
	let offer = $state('');
	let posting = $state(false);
	let postProblem = $state<string | null>(null);
	let posted = $state<string | null>(null);

	const verdict = $derived(requestCanPost({ title, body, offer }));

	let closing = $state<string | null>(null);
	let closeSlug = $state('');
	let busy = $state<string | null>(null);
	let cardProblems = $state<Record<string, string>>({});

	function nameOf(r: FoundryGameRequest): string {
		return foundryAuthorName(r) ?? 'A student';
	}

	async function post() {
		if (posting) return;
		if (!verdict.ok) {
			postProblem = requestRefusalSentence(verdict.reason, {
				field: verdict.field,
				limit: verdict.limit
			});
			return;
		}
		if (!transports.post) return;
		posting = true;
		postProblem = null;
		posted = null;
		try {
			const r = await transports.post(title, body, offer.trim() ? offer : null);
			if (!r.ok) {
				postProblem = r.reason
					? requestRefusalSentence(r.reason, {
							field: r.field,
							limit: r.limit,
							retryAfterSeconds: r.retryAfterSeconds
						})
					: (r.message ?? requestRefusalSentence(null));
				return;
			}
			posted = 'Posted. Your request is at the top of the board.';
			title = '';
			body = '';
			offer = '';
			onChanged?.();
		} catch (err) {
			postProblem = err instanceof Error ? err.message : requestRefusalSentence(null);
		} finally {
			posting = false;
		}
	}

	async function close(r: FoundryGameRequest) {
		if (!transports.close || busy) return;
		busy = r.id;
		cardProblems = { ...cardProblems, [r.id]: '' };
		try {
			const out = await transports.close(r.id, requestSlugFrom(closeSlug));
			if (!out.ok) {
				cardProblems = {
					...cardProblems,
					[r.id]: out.reason ? requestRefusalSentence(out.reason) : (out.message ?? requestRefusalSentence(null))
				};
				return;
			}
			closing = null;
			closeSlug = '';
			onChanged?.();
		} catch (err) {
			cardProblems = {
				...cardProblems,
				[r.id]: err instanceof Error ? err.message : requestRefusalSentence(null)
			};
		} finally {
			busy = null;
		}
	}

	async function setHidden(r: FoundryGameRequest, hidden: boolean) {
		if (!transports.setHidden || busy) return;
		busy = r.id;
		try {
			const out = await transports.setHidden(r.id, hidden);
			if (!out.ok) {
				cardProblems = {
					...cardProblems,
					[r.id]: out.reason ? requestRefusalSentence(out.reason) : (out.message ?? requestRefusalSentence(null))
				};
				return;
			}
			onChanged?.();
		} finally {
			busy = null;
		}
	}
</script>

{#snippet card(r: FoundryGameRequest)}
	<li class="fdy-block fdy-req-card" data-testid="foundry-request" data-status={r.status}>
		<div class="fdy-req-top">
			<h3 class="fdy-req-title">{r.title}</h3>
			{#if r.status === 'closed'}
				<ForgeStatus tone={r.fulfilled ? 'ok' : 'quiet'} word={r.fulfilled ? 'Made' : 'Closed'} />
			{/if}
			{#if r.hidden}
				<ForgeStatus tone="shelved" word="Hidden" />
			{/if}
		</div>
		<p class="fdy-req-by">
			<span>{nameOf(r)}</span>
			<span class="fdy-req-day">{requestDay(r.created_at)}</span>
		</p>
		<p class="fdy-req-body">{r.body}</p>
		{#if r.offer}
			<div class="fdy-req-offer">
				<p class="fdy-req-offer-text"><span class="fdy-req-label">Offer</span> {r.offer}</p>
				<p class="fdy-req-offer-note">{FOUNDRY_REQUEST_OFFER_NOTE}</p>
			</div>
		{/if}
		{#if r.fulfilled}
			<p class="fdy-req-made">
				<span class="fdy-req-label">Answered by</span>
				<a href="/foundry?app={encodeURIComponent(r.fulfilled.slug)}">{r.fulfilled.title}</a>
			</p>
		{/if}

		{#if r.status === 'open' && (transports.close || transports.setHidden)}
			<div class="fdy-req-do">
				{#if transports.close && r.mine}
					{#if closing === r.id}
						<div class="fdy-req-confirm">
							<label class="fdy-req-field">
								<span>The app that answered it, from the gallery (optional)</span>
								<input
									type="text"
									bind:value={closeSlug}
									placeholder="cookie-press"
									data-testid="foundry-request-close-app"
								/>
							</label>
							<p class="fdy-req-hint">Closing cannot be undone.</p>
							<div class="fdy-req-keys">
								<button
									type="button"
									class="btn tap-44"
									data-testid="foundry-request-close-confirm"
									disabled={busy === r.id}
									onclick={() => close(r)}
								>
									Close my request
								</button>
								<button
									type="button"
									class="btn tap-44"
									onclick={() => {
										closing = null;
										closeSlug = '';
									}}
								>
									Keep it open
								</button>
							</div>
						</div>
					{:else}
						<button
							type="button"
							class="btn tap-44"
							data-testid="foundry-request-close"
							onclick={() => {
								closing = r.id;
								closeSlug = '';
							}}
						>
							Close it
						</button>
					{/if}
				{/if}
				{#if transports.setHidden}
					<button
						type="button"
						class="btn tap-44"
						data-testid="foundry-request-hide"
						disabled={busy === r.id}
						onclick={() => setHidden(r, !r.hidden)}
					>
						{r.hidden ? 'Show it again' : 'Hide it'}
					</button>
				{/if}
			</div>
		{/if}
		{#if cardProblems[r.id]}
			<p class="fdy-req-problem" role="status">{cardProblems[r.id]}</p>
		{/if}
	</li>
{/snippet}

<div class="fdy-req" data-testid="foundry-request-board">
	{#if !available}
		<p class="fdy-block fdy-req-note" data-testid="foundry-request-unavailable">
			{FOUNDRY_REQUEST_UNAVAILABLE_NOTE}
		</p>
	{:else}
		{#if transports.post}
			<form
				class="fdy-block fdy-req-form"
				data-testid="foundry-request-form"
				onsubmit={(e) => {
					e.preventDefault();
					void post();
				}}
			>
				<h2>Ask for a game</h2>
				<p class="fdy-req-lead">
					Say what you would like somebody to make. Anyone who signs in to the Foundry can read the
					board. {FOUNDRY_REQUEST_NAME_NOTE}
				</p>
				<label class="fdy-req-field">
					<span>The game you want</span>
					<input
						type="text"
						maxlength={REQUEST_TITLE_MAX}
						bind:value={title}
						data-testid="foundry-request-title"
					/>
				</label>
				<label class="fdy-req-field">
					<span>Your message</span>
					<textarea
						rows="4"
						maxlength={REQUEST_BODY_MAX}
						bind:value={body}
						data-testid="foundry-request-body"
					></textarea>
				</label>
				<label class="fdy-req-field">
					<span>Your offer, in your own words (optional)</span>
					<input
						type="text"
						maxlength={REQUEST_OFFER_MAX}
						bind:value={offer}
						data-testid="foundry-request-offer"
					/>
				</label>
				<p class="fdy-req-offer-note">{FOUNDRY_REQUEST_OFFER_NOTE}</p>
				<div class="fdy-req-keys">
					<button
						type="submit"
						class="btn tap-44"
						data-testid="foundry-request-post"
						aria-disabled={!verdict.ok ? 'true' : undefined}
						disabled={posting}
					>
						{posting ? 'Posting' : 'Post the request'}
					</button>
				</div>
				{#if postProblem}
					<p class="fdy-req-problem" role="status" data-testid="foundry-request-problem">
						{postProblem}
					</p>
				{/if}
				{#if posted}<p class="fdy-req-posted" role="status">{posted}</p>{/if}
			</form>
		{/if}

		<!-- THE BOARD BESIDE THE FORM ON A WIDE PAGE (ledger 0360, the fresh-eyes
		     review): stacked, the form took half a 1440 window and the requests
		     started under the fold, so a student saw how to ask and not what had
		     been asked. -->
		<div class="fdy-req-side">
		<section class="fdy-req-board" aria-labelledby="fdy-req-open-{uid}">
			<h2 id="fdy-req-open-{uid}">
				Open requests <span class="fdy-req-count">{lists.open.length}</span>
			</h2>
			{#if lists.open.length === 0}
				<p class="fdy-req-note">Nobody has asked for anything yet.</p>
			{:else}
				<ul class="fdy-req-list">
					{#each lists.open as r (r.id)}{@render card(r)}{/each}
				</ul>
			{/if}
		</section>

		{#if lists.closed.length > 0}
			<Disclosure
				label="Closed requests ({lists.closed.length})"
				heading={2}
				collapseWhen={true}
				scope="foundry-requests-closed"
				testId="foundry-requests-closed"
			>
				<ul class="fdy-req-list">
					{#each lists.closed as r (r.id)}{@render card(r)}{/each}
				</ul>
			</Disclosure>
		{/if}
		</div>
	{/if}
</div>

<style>
	.fdy-req {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		min-width: 0;
	}
	.fdy-req-side {
		display: flex;
		flex-direction: column;
		gap: var(--space-5, 1.25rem);
		min-width: 0;
	}
	/* A viewport query is honest here because `FoundryPage` takes the window's
	   width (CLAUDE.md, the FoundryPage trap); a container cannot query itself,
	   and the board is the page. The form keeps its reading measure on the left
	   and the board takes the rest. */
	@media (min-width: 1024px) {
		.fdy-req:has(> .fdy-req-form) {
			display: grid;
			grid-template-columns: minmax(20rem, 32rem) minmax(0, 1fr);
			align-items: start;
		}
	}

	.fdy-req-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 44rem;
		padding: 1.25rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-req-form h2,
	.fdy-req-board h2 {
		margin: 0;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-req-lead,
	.fdy-req-note,
	.fdy-req-hint {
		margin: 0;
		color: var(--text-2);
	}

	.fdy-req-note {
		max-width: var(--measure-prose, 42rem);
	}

	.fdy-req-field {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}

	.fdy-req-field > span {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-req-field :is(input, textarea) {
		min-height: 44px;
		padding: 0.45rem 0.65rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-1, 4px);
		background: var(--surface-2);
		color: var(--text-1);
		font: inherit;
	}

	.fdy-req-field textarea {
		resize: vertical;
	}

	.fdy-req-field :is(input, textarea):focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}

	.fdy-req-keys,
	.fdy-req-do {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.fdy-req-board {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		min-width: 0;
	}

	.fdy-req-count {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--text-2);
	}

	/* CARDS OF UNEQUAL HEIGHT GO IN COLUMNS, NEVER A GRID (CLAUDE.md): a grid
	   row is as tall as its tallest request. A width and a ceiling, so a phone
	   gets one column and a wide monitor four, with no breakpoint of its own. */
	.fdy-req-list {
		margin: 0;
		padding: 0;
		list-style: none;
		columns: 22rem 4;
		column-gap: var(--space-4, 1rem);
	}

	.fdy-req-card {
		break-inside: avoid;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0 0 var(--space-4, 1rem);
		padding: 1rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
		min-width: 0;
	}

	.fdy-req-top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
	}

	.fdy-req-title {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.15rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}

	.fdy-req-by {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-1);
	}

	.fdy-req-day {
		color: var(--text-2);
	}

	.fdy-req-body {
		margin: 0;
		color: var(--text-1);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.fdy-req-offer {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.5rem 0.65rem;
		background: var(--surface-2);
		border-radius: var(--radius-sm, 4px);
	}

	.fdy-req-offer-text,
	.fdy-req-made {
		margin: 0;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}

	.fdy-req-offer-note {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	.fdy-req-label {
		margin-right: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2);
	}

	.fdy-req-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	}

	.fdy-req-problem {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--crimson);
	}

	.fdy-req-posted {
		margin: 0;
		color: var(--text-1);
		padding-left: 0.6rem;
		border-left: 3px solid var(--green);
	}
</style>
