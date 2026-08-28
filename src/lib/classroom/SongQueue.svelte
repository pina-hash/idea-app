<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import {
		SONG_QUEUE_POLL_MS,
		songBlockedReason,
		songCanReject,
		songCanRequest,
		songClockLabel,
		songLinkLabel,
		songPendingLabel,
		songPriceLabel,
		songRefusalMessage,
		songStatusLabel,
		songWaitingLabel,
		type SongQueueState,
		type SongQueueTransports,
		type SongRefusal,
		type SongRefusalDetail
	} from '$lib/classroom/song-queue';

	/**
	 * THE CLASSROOM SONG QUEUE, in the class pane beneath the hall pass.
	 *
	 * BENEATH THE PASS, NOT ABOVE IT, and the ordering is an argument rather than
	 * a preference. The hall pass earns the top of the pane because its whole
	 * value is the second it takes -- a student who needs it needs it now,
	 * one-handed, without reading. A song request is never urgent; it is a thing
	 * somebody does once a period with time to spare. Putting it first would cost
	 * the pass the property it was placed there for.
	 *
	 * PRESENTATION PLUS INJECTED TRANSPORTS, the ReviewConsole convention. It is
	 * not a boundary and could not be one: `0145` decides who may request, who may
	 * decide, how many may wait, what an approval costs and -- the part that
	 * matters -- WHAT EACH ROLE IS TOLD. A student's `state` has never contained a
	 * classmate's pending or rejected request, so there is nothing in this file
	 * that hides one. Read the two branches of `classroom_song_queue` for the real
	 * rule.
	 *
	 * WHICH IS WHY THERE IS NO `canManage` PROP AND MUST NOT BE. The role comes
	 * from the PAYLOAD's own `scope`, because the payload is what the database
	 * actually decided; a flag threaded down beside it would be a second opinion
	 * about who this person is. Neither can be expressed here: the manager markup
	 * reads fields the student type does not have.
	 *
	 * NOTHING PLAYS IN THIS COMPONENT. There is no `<audio>` element, no embed and
	 * no preview -- an approved song is a LINK an instructor opens in whatever
	 * they already use. And no streaming service is parsed: `songLinkLabel` prints
	 * a host for legibility and never branches on it.
	 */
	let {
		sectionId,
		state: serverState,
		transports,
		now
	}: {
		sectionId: string;
		/** The layout load's answer. Null is not a state this component renders --
		 *  the caller does not mount it at all, which is how a deployment without
		 *  0145 has no card rather than a broken one. */
		state: SongQueueState;
		/** Omitted (null) removes every control: read-only is structural here, as
		 *  everywhere else in this module, rather than a flag somebody honours. */
		transports?: SongQueueTransports | null;
		/**
		 * THE ONE CLOCK, threaded from the layout. Nothing in this component or in
		 * `$lib/classroom/song-queue` reads `Date.now()`, so every waiting figure in
		 * one paint is measured against the same instant and each label is
		 * assertable at a pinned one.
		 */
		now: number;
	} = $props();

	/**
	 * The server's answer, overlaid with whatever this component has since
	 * learned -- the hall pass's own pattern, for the same reason: the load only
	 * re-runs on a real navigation, so a request sent here would otherwise sit
	 * unreported until one happened. The overlay is dropped the moment the
	 * server's own answer moves, which is when it should win again.
	 */
	let local = $state<SongQueueState | null>(null);
	let notice = $state<string | null>(null);
	let busy = $state(false);
	$effect(() => {
		void serverState;
		local = null;
	});
	const live = $derived(local ?? serverState);

	const manager = $derived(live.scope === 'manager' ? live : null);
	const student = $derived(live.scope === 'student' ? live : null);
	const canRequest = $derived(!!transports && songCanRequest(live));
	const blocked = $derived(songBlockedReason(live));

	/** The compose fields. Cleared only on a confirmed acceptance. */
	let url = $state('');
	let note = $state('');

	/** Which pending row has its reject box open, and what is in it. */
	let rejecting = $state<string | null>(null);
	let reason = $state('');
	const reasonOk = $derived(songCanReject(reason));

	async function refresh(): Promise<void> {
		if (!transports) return;
		const next = await transports.load(sectionId);
		// A failed refresh keeps what is on screen. Blanking it would read as
		// "nothing has been approved", which is a wrong answer rather than a
		// missing one.
		if (next) local = next;
	}

	/**
	 * POLLED, BECAUSE THE OTHER PERSON'S CHANGES ARE THE POINT: a student wants
	 * to see their request decided, an instructor wants to see one arrive. Paused
	 * while the tab is hidden and re-asked the moment it is visible again, which
	 * is the transition that actually matters for a surface that spends its life
	 * in a pocket.
	 *
	 * The effect reads `transports` and `sectionId` and nothing else. The timer
	 * and listener callbacks run outside the tracking scope, so the work they do
	 * takes no dependency on the state it writes -- which is what would otherwise
	 * re-arm the interval on every tick.
	 */
	$effect(() => {
		if (!transports) return;
		const tick = () => {
			if (typeof document !== 'undefined' && document.hidden) return;
			void refresh();
		};
		const timer = setInterval(tick, SONG_QUEUE_POLL_MS);
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', tick);
		};
	});

	function report(
		res: { ok: boolean; refusal?: unknown; detail?: unknown; message?: string },
		done: string
	): void {
		if (res.ok) {
			notice = done;
			return;
		}
		notice =
			'refusal' in res && res.refusal
				? songRefusalMessage(
						res.refusal as SongRefusal,
						(res.detail ?? {}) as SongRefusalDetail
					)
				: (res.message ?? 'Something went wrong. Try again.');
	}

	/**
	 * ONE PREDICATE DRIVES THE CONTROL AND ITS HANDLER. `canRequest` is read by
	 * the `aria-disabled` attribute and again as the first line here; two
	 * spellings of "is this ready" is what produces a click that does nothing.
	 *
	 * THE CONTROL IS `aria-disabled` AND NOT `disabled`, so a student at the cap
	 * gets a sentence naming the cap rather than a dead button. A genuinely
	 * disabled control swallows the pointer event and can never explain itself.
	 *
	 * THE FIELDS ARE CLEARED ONLY ON A CONFIRMED ACCEPTANCE. A refusal keeps what
	 * was typed, because the next thing that happens to a rejected link is being
	 * corrected, not retyped from scratch.
	 */
	async function send(): Promise<void> {
		if (busy || !transports) return;
		if (!canRequest) {
			notice = blocked ?? songRefusalMessage('pending_cap');
			return;
		}
		const link = url.trim();
		if (!link) {
			// NOT A URL RULE -- there is exactly one of those and it is
			// `_classroom_song_url_ok` in the database. This is only "you have not
			// typed anything yet", which is worth saying without a round trip.
			notice = 'Paste a link first.';
			return;
		}
		busy = true;
		notice = null;
		try {
			const res = await transports.submit(sectionId, link, note.trim() || null);
			report(res, 'Sent. Your teacher will review it.');
			if (res.ok) {
				url = '';
				note = '';
			}
		} catch {
			// The transport turns an RPC refusal into a result, so reaching here
			// means the request never completed. Saying so matters: silence would
			// leave a student believing a request is queued when nothing is.
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}

	/**
	 * THE DECISION NAMES THE REQUEST, read from THIS PAINT's payload, so the id
	 * sent is the one the instructor was actually looking at when they pressed.
	 * `0144`'s lesson: a section-keyed decision re-resolves "the oldest pending
	 * one" server-side at the instant the request lands, so a press made while a
	 * classmate's request arrives decides the wrong one. If the named request has
	 * since been decided, `0145` refuses with `already_decided` and touches
	 * nothing.
	 */
	async function decideApprove(requestId: string): Promise<void> {
		if (busy || !transports) return;
		busy = true;
		notice = null;
		try {
			const res = await transports.approve(requestId);
			report(
				res,
				res.ok
					? `Approved ${res.data.student_name}'s song. ${res.data.charged}i¢ charged.`
					: ''
			);
		} catch {
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}

	async function decideReject(requestId: string): Promise<void> {
		if (busy || !transports || !reasonOk) return;
		busy = true;
		notice = null;
		try {
			const res = await transports.reject(requestId, reason.trim());
			report(res, res.ok ? `Sent ${res.data.student_name} the reason. Nothing was charged.` : '');
			if (res.ok) {
				rejecting = null;
				reason = '';
			}
		} catch {
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}

	function armReject(requestId: string): void {
		rejecting = rejecting === requestId ? null : requestId;
		reason = '';
	}
</script>

<section class="sq-card" data-testid="song-queue" data-scope={live.scope}>
	<div class="sq-head">
		<h2 class="sq-title">Class music</h2>
		<span class="sq-price" data-testid="song-queue-price">{songPriceLabel(live.price)}</span>
	</div>

	<!--
		SAID IN WORDS, ON EVERY MOUNT. A student who reads "request a song" as
		"play a song" is going to wonder why nothing happened, and one who does not
		know approval costs coins is going to be surprised by a balance. Both facts
		are one sentence and neither is discoverable any other way.
	-->
	<p class="sq-note">
		Paste a link to a song. Your teacher plays approved ones in class, so nothing plays here.
		Asking is free; you are charged only if it is approved.
	</p>

	{#if student}
		{#if transports}
			<div class="sq-compose">
				<label class="sq-field">
					<span class="sq-label">Link</span>
					<input
						class="sq-input"
						type="url"
						inputmode="url"
						placeholder="https://"
						bind:value={url}
						data-testid="song-queue-url"
					/>
				</label>
				<label class="sq-field">
					<span class="sq-label">Note <span class="sq-optional">(optional)</span></span>
					<input
						class="sq-input"
						type="text"
						maxlength="300"
						placeholder="Anything your teacher should know"
						bind:value={note}
						data-testid="song-queue-note"
					/>
				</label>
				<div class="sq-compose-foot">
					<span class="sq-count" data-testid="song-queue-count">{songPendingLabel(student)}</span>
					<button
						type="button"
						class="btn tap-44 sq-action"
						data-testid="song-queue-send"
						aria-disabled={!canRequest || busy}
						onclick={send}
					>
						Request
					</button>
				</div>
			</div>
		{/if}

		{#if notice}
			<p class="sq-notice" role="status" data-testid="song-queue-notice">{notice}</p>
		{/if}

		<h3 class="sq-sub">Approved for this class</h3>
		{#if student.approved.length === 0}
			<p class="sq-empty">Nothing approved yet.</p>
		{:else}
			<ul class="sq-list" data-testid="song-queue-approved">
				{#each student.approved as row (row.request_id)}
					<li class="sq-row">
						<a class="sq-link tap-reach-44" href={row.url} target="_blank" rel="noopener noreferrer"
							>{songLinkLabel(row.url)}</a
						>
						<span class="sq-meta">
							{songClockLabel(row.decided_at)}
							<!--
								ONE BIT, NEVER A NAME. There is no requester name in this payload
								to print -- see `SongApprovedRow`. This says only that a row is
								the reader's own.
							-->
							{#if row.mine}<span class="sq-mine">yours</span>{/if}
						</span>
						{#if row.note}<span class="sq-rownote">{row.note}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<Disclosure
			label="Your requests"
			scope={`song-queue-mine:${sectionId}`}
			testId="song-queue-mine"
			bodyClass="sq-disc-body"
		>
			{#if student.mine.length === 0}
				<p class="sq-empty">You have not asked for anything in this class yet.</p>
			{:else}
				<ul class="sq-list">
					{#each student.mine as row (row.request_id)}
						<li class="sq-row">
							<span class="sq-rowhead">
								<a
									class="sq-link tap-reach-44"
									href={row.url}
									target="_blank"
									rel="noopener noreferrer">{songLinkLabel(row.url)}</a
								>
								<span class="sq-chip" data-tone={row.status}>{songStatusLabel(row.status)}</span>
							</span>
							<span class="sq-meta">asked {songWaitingLabel(row.created_at, now)} ago</span>
							{#if row.rejection_reason}
								<!--
									THE READER'S OWN REASON, AND NOBODY ELSE'S. `0145`'s student
									branch selects a reason only from a query pinned to the caller's
									own email; the approved list selects none at all.
								-->
								<span class="sq-reason" data-testid="song-queue-reason"
									>{row.rejection_reason}</span
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Disclosure>
	{/if}

	{#if manager}
		{#if notice}
			<p class="sq-notice" role="status" data-testid="song-queue-notice">{notice}</p>
		{/if}

		<h3 class="sq-sub">
			Waiting
			<span class="sq-tally" data-testid="song-queue-tally">{manager.pending.length}</span>
		</h3>
		{#if manager.pending.length === 0}
			<p class="sq-empty">Nothing is waiting for review.</p>
		{:else}
			<ul class="sq-list" data-testid="song-queue-pending">
				{#each manager.pending as row (row.request_id)}
					<li class="sq-row">
						<span class="sq-rowhead">
							<a
								class="sq-link tap-reach-44"
								href={row.url}
								target="_blank"
								rel="noopener noreferrer">{songLinkLabel(row.url)}</a
							>
							<span class="sq-who">{row.student_name}</span>
						</span>
						<span class="sq-meta">asked {songWaitingLabel(row.created_at, now)} ago</span>
						{#if row.note}<span class="sq-rownote">{row.note}</span>{/if}
						{#if transports}
							<div class="sq-actions">
								<button
									type="button"
									class="btn tap-44 sq-action"
									data-testid="song-queue-approve"
									aria-disabled={busy}
									onclick={() => decideApprove(row.request_id)}
								>
									Approve
								</button>
								<button
									type="button"
									class="btn tap-44 sq-action"
									data-testid="song-queue-reject"
									aria-disabled={busy}
									onclick={() => armReject(row.request_id)}
								>
									{rejecting === row.request_id ? 'Cancel' : 'Reject'}
								</button>
							</div>
							{#if rejecting === row.request_id}
								<!--
									A REJECTION CARRIES A REASON, so the control that sends it is
									not offered until there is one. Two steps rather than one, the
									way every destructive-ish action here arms and then confirms.
								-->
								<div class="sq-reject">
									<label class="sq-field">
										<span class="sq-label">Why not</span>
										<input
											class="sq-input"
											type="text"
											maxlength="500"
											placeholder="What should they change?"
											bind:value={reason}
											data-testid="song-queue-reason-input"
										/>
									</label>
									<button
										type="button"
										class="btn tap-44 sq-action"
										data-testid="song-queue-reject-send"
										aria-disabled={!reasonOk || busy}
										onclick={() => decideReject(row.request_id)}
									>
										Send reason
									</button>
								</div>
							{/if}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<Disclosure
			label="Already reviewed"
			scope={`song-queue-decided:${sectionId}`}
			testId="song-queue-decided"
			bodyClass="sq-disc-body"
		>
			{#if manager.decided.length === 0}
				<p class="sq-empty">Nothing has been reviewed in this class yet.</p>
			{:else}
				<ul class="sq-list">
					{#each manager.decided as row (row.request_id)}
						<li class="sq-row">
							<span class="sq-rowhead">
								<a
									class="sq-link tap-reach-44"
									href={row.url}
									target="_blank"
									rel="noopener noreferrer">{songLinkLabel(row.url)}</a
								>
								<span class="sq-chip" data-tone={row.status}>{songStatusLabel(row.status)}</span>
							</span>
							<span class="sq-meta">
								{row.student_name} &middot; {songClockLabel(row.decided_at)}
							</span>
							{#if row.rejection_reason}
								<span class="sq-reason">{row.rejection_reason}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</Disclosure>
	{/if}
</section>

<style>
	/*
	 * Prefixed `sq-` because `src/app.css` owns a global class list and a name
	 * collision there is not a styling bug, it is an inherited `display` nobody
	 * can see in this file.
	 */
	.sq-card {
		/* A card sitting on the page plate, so its edge is the only thing
		   separating it from the page: `--boundary`, the load-bearing token,
		   never `--hairline`. */
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-1);
		padding: var(--space-4);
		margin: 0 0 var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		/* A grid/flex child's automatic minimum is its min-content, so without
		   this a long link pushes the pane wider than the viewport. */
		min-width: 0;
	}
	.sq-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		min-width: 0;
	}
	.sq-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.sq-price {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		color: var(--cyan);
		white-space: nowrap;
	}
	.sq-note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.88rem;
		line-height: 1.45;
	}
	.sq-sub {
		margin: var(--space-2) 0 0;
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2);
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.sq-tally {
		font-size: 0.72rem;
		color: var(--text-1);
	}
	.sq-compose {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.sq-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.sq-label {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.sq-optional {
		text-transform: none;
		letter-spacing: 0;
		color: var(--text-3);
	}
	.sq-input {
		/* A phone control before it is anything else: the floor is a min-height,
		   never a height, so nothing here can shrink it back under 44px. */
		min-height: 44px;
		width: 100%;
		min-width: 0;
		box-sizing: border-box;
		padding: 0 var(--space-3);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-input, 8px);
		background: var(--surface-2);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 1rem;
	}
	.sq-input:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.sq-compose-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	.sq-count {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	.sq-actions,
	.sq-reject {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.sq-reject .sq-field {
		flex: 1 1 12rem;
	}
	.sq-action {
		flex: 0 1 auto;
	}
	.sq-action[aria-disabled='true'] {
		/* aria-disabled, so the control still receives the tap and can say why.
		   `--ice` is the disabled token; the cursor says the same thing again. */
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.sq-action[aria-disabled='true']:hover {
		background: transparent;
		color: var(--ice);
		box-shadow: none;
	}
	.sq-notice {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.sq-empty {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.sq-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.sq-row {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}
	.sq-rowhead {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.sq-link {
		color: var(--body-link, var(--cyan));
		font-size: 0.95rem;
		overflow-wrap: anywhere;
		min-width: 0;
		/* Grows the HIT AREA in height only: the chip and the name sit closer than
		   44px horizontally, and overlapping reaches hand the tap to the wrong
		   control. */
		--tap-reach-w: 0px;
	}
	.sq-who {
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.sq-meta {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
	}
	.sq-mine {
		color: var(--green);
		margin-left: 0.4rem;
	}
	.sq-rownote,
	.sq-reason {
		color: var(--text-2);
		font-size: 0.86rem;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	/* COLOUR IS NEVER THE ONLY SIGNAL: every chip carries a word, and the words
	   differ. The hue is the second signal, not the first. */
	.sq-chip {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.sq-chip[data-tone='pending'] {
		/* `--teal` is this palette's "in progress", which is what waiting is. */
		color: var(--teal);
	}
	.sq-chip[data-tone='approved'] {
		color: var(--green);
	}
	.sq-chip[data-tone='rejected'] {
		/* `--amber` is the warning token. NOT `--crimson`, which is reserved for
		   live/rec/error: a song that will not be played is neither a fault nor an
		   alarm, and the student did nothing wrong by asking. */
		color: var(--amber);
	}
</style>
