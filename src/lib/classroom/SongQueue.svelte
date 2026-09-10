<script lang="ts">
	import { untrack } from 'svelte';
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
	// The debounce and the stalled sentence are shared with `HallPass.svelte`;
	// `hall-pass.ts` explains why they sit there rather than in `live.ts`.
	import { CLASSROOM_LIVE_DEBOUNCE_MS, classroomLivePausedLine } from '$lib/classroom/hall-pass';
	import type { ClassroomLive, ClassroomLiveStatus } from '$lib/classroom/live';

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
	 * TWO SHAPES, ONE CARD (prompt 0118). `tool={false}` is the card, exactly as
	 * it has always been. `tool={true}` folds the SAME card into a trigger and a
	 * native `<dialog>`: the trigger is one 44px control carrying the glyph, the
	 * word "Music" and a live status chip, and the dialog holds the identical
	 * markup (same `data-testid`s, same controls) behind one tap. The card is a
	 * snippet rendered in both places precisely so there is one copy of it.
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
		now,
		live = null,
		tool = false
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
		/**
		 * THE LIVE NOTICE BUS (`$lib/classroom/live`). Omitted, the card is what it
		 * was: polled at `SONG_QUEUE_POLL_MS` and nothing else. Present, a notice
		 * for the `song-queue` topic re-asks the server after a short debounce, and
		 * every successful write here announces one. THE POLL STAYS EITHER WAY --
		 * it is the floor. IT IS ITS OWN PROP AND NOT A TRANSPORT METHOD because
		 * `SongQueueTransports` is a closed interface owned outside this bundle;
		 * a bus is also not a transport -- it carries no payload and writes nothing.
		 */
		live?: ClassroomLive | null;
		/** `true` renders the trigger-and-dialog shape; `false` the card as today. */
		tool?: boolean;
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
	const view = $derived(local ?? serverState);

	const manager = $derived(view.scope === 'manager' ? view : null);
	const student = $derived(view.scope === 'student' ? view : null);
	const canRequest = $derived(!!transports && songCanRequest(view));
	const blocked = $derived(songBlockedReason(view));

	/**
	 * THE TRIGGER'S CHIP, which is all a student reads before opening anything.
	 *
	 * IT BELONGS IN `song-queue.ts` BESIDE `songPendingLabel` and is here only
	 * because that module is read-only for this bundle; a pure helper with a
	 * clock parameter is the shape it should take when it moves.
	 *
	 * A STUDENT'S CHIP NAMES NOBODY, because their payload cannot: their own
	 * waiting count, or the verdict on their own latest request. "Approved" is
	 * said only while it is the NEWEST thing that happened to them -- a chip
	 * that read "Approved" forever after one yes would be a chip nobody reads.
	 * An instructor's chip is the queue length, which is the number they open
	 * the dialog to act on.
	 */
	const toolChip = $derived.by((): { tone: 'idle' | 'pending' | 'approved'; word: string } => {
		if (view.scope === 'manager') {
			const n = view.pending.length;
			if (n === 0) return { tone: 'idle', word: 'Queue empty' };
			return { tone: 'pending', word: `${n} waiting` };
		}
		if (view.my_pending > 0) return { tone: 'pending', word: `${view.my_pending} waiting` };
		const newest = [...view.mine].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
		if (newest?.status === 'approved') return { tone: 'approved', word: 'Approved' };
		return { tone: 'idle', word: 'Ask for a song' };
	});

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
	 *
	 * IT STAYS AT COMPONENT LEVEL IN BOTH SHAPES: in tool mode the card is only
	 * mounted while the dialog is open, but the chip on the trigger is read all
	 * period long, so the thing that keeps the chip honest cannot live inside
	 * the dialog.
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

	/**
	 * THE LIVE NOTICE. A notice carries no payload -- it means "re-ask the
	 * server", never "apply this row" (read `live.ts`'s header for why) -- so the
	 * whole of what it does here is call the same `refresh()` the poll calls,
	 * after a short debounce that folds a burst (three approvals in a row) into
	 * one read.
	 *
	 * TRACK THE INPUTS, UNTRACK THE CALL. `live` and `sectionId` are read
	 * tracked at the top so a new bus or a new section re-subscribes; the
	 * `subscribe` call itself is INJECTED CODE -- whoever mounts this component
	 * wrote it, and the memory bus a harness hands in reads and writes reactive
	 * state before it returns -- so it goes inside `untrack`, or everything it
	 * touches joins this effect's dependency set and the mount spins with
	 * `effect_update_depth_exceeded`. The callbacks it is handed run later,
	 * outside any tracking context, and need no wrapping.
	 */
	let liveStatus = $state<ClassroomLiveStatus | null>(null);
	$effect(() => {
		const bus = live;
		const section = sectionId;
		if (!bus) {
			liveStatus = null;
			return;
		}
		let debounce: ReturnType<typeof setTimeout> | null = null;
		const unsubscribe = untrack(() =>
			bus.subscribe(
				section,
				(topic) => {
					if (topic !== 'song-queue') return;
					if (debounce) clearTimeout(debounce);
					debounce = setTimeout(() => {
						debounce = null;
						void refresh();
					}, CLASSROOM_LIVE_DEBOUNCE_MS);
				},
				(status) => {
					liveStatus = status;
				}
			)
		);
		return () => {
			if (debounce) clearTimeout(debounce);
			unsubscribe();
		};
	});

	/**
	 * SAY THAT THIS CLIENT JUST WROTE. Fire-and-forget by the bus's own contract.
	 * Called ONLY after a result the server said yes to -- a refusal changed
	 * nothing, so there is nothing to announce.
	 */
	function announce(): void {
		live?.announce(sectionId, 'song-queue');
	}

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
	 * THE EXPLANATION IS `aria-disabled` AND THE IN-FLIGHT STATE IS `disabled`.
	 * A student at the cap gets a sentence naming the cap rather than a dead
	 * button, so the `canRequest` half is `aria-disabled`: a genuinely disabled
	 * control swallows the pointer event and can never explain itself. `busy`
	 * has nothing to explain -- the request is already on its way -- so that
	 * half is a real `disabled`, on every control in this file alike.
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
				announce();
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
			if (res.ok) announce();
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
				announce();
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

	/*
	 * ------------------------------------------------------------------------
	 * THE TOOL SHAPE: a trigger and a native <dialog>. The same mechanism as
	 * `HallPass.svelte`'s, and its comment there is the full argument: a native
	 * dialog for the top layer, the focus trap and the inert background; mounted
	 * only while open; three close paths into one idempotent handler; Escape
	 * handled on keydown as well as by the browser so the DOM project can drive
	 * it; the backdrop press keyed on `pointerdown` whose target IS the dialog;
	 * focus to the card's own first control on open (the link field, for a
	 * student), back to the trigger on close; all listeners attached with
	 * addEventListener because `close` does not bubble.
	 * ------------------------------------------------------------------------
	 */
	let open = $state(false);
	let dialogEl = $state<HTMLDialogElement | null>(null);
	let triggerEl = $state<HTMLButtonElement | null>(null);

	function openDialog(): void {
		if (open) return;
		open = true;
	}

	function closeDialog(): void {
		if (!open) return;
		open = false;
		// CLOSE THE NATIVE DIALOG BEFORE MOVING FOCUS. While a modal dialog is
		// open everything outside it is inert, and `focus()` on an inert element
		// is refused silently -- measured: focus landed on `body` and the trigger
		// read `aria-expanded="false"` with nothing focused. `close()` lifts the
		// inertness synchronously (the `close` event is queued, and `open` is
		// already false so its handler returns early); the `{#if open}` block
		// then unmounts the element on the next flush.
		const el = dialogEl;
		if (el?.open) el.close();
		triggerEl?.focus();
	}

	$effect(() => {
		const el = dialogEl;
		if (!el) return;
		if (!el.open) el.showModal();
		const onClose = () => closeDialog();
		const onKeydown = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			closeDialog();
		};
		const onPointerdown = (e: PointerEvent) => {
			if (e.target === el) closeDialog();
		};
		el.addEventListener('close', onClose);
		el.addEventListener('keydown', onKeydown);
		el.addEventListener('pointerdown', onPointerdown);
		const first =
			el.querySelector<HTMLElement>(
				'.ctool-body input, .ctool-body button:not([disabled]), .ctool-body select:not([disabled]), .ctool-body a[href]'
			) ?? el.querySelector<HTMLElement>('.ctool-close');
		first?.focus();
		return () => {
			el.removeEventListener('close', onClose);
			el.removeEventListener('keydown', onKeydown);
			el.removeEventListener('pointerdown', onPointerdown);
			if (el.open) el.close();
		};
	});
</script>

{#snippet card()}
	<section class="sq-card" class:sq-in-dialog={tool} data-testid="song-queue" data-scope={view.scope} data-live={liveStatus}>
		<div class="sq-head">
			<h2 class="sq-title">Class music</h2>
			<span class="sq-price" data-testid="song-queue-price">{songPriceLabel(view.price)}</span>
		</div>

		{#if liveStatus === 'stalled'}
			<!--
				ONE QUIET SENTENCE, ONLY FOR A CHANNEL THAT REPORTED A FAULT. Nothing is
				said while connecting or once live; it names the poll interval because
				the point is that the list is still going to be right, just later.
			-->
			<p class="sq-live" data-testid="song-queue-live">
				{classroomLivePausedLine(SONG_QUEUE_POLL_MS)}
			</p>
		{/if}

		<!--
			SAID IN WORDS, ON EVERY MOUNT. A student who reads "request a song" as
			"play a song" is going to wonder why nothing happened, and one who does not
			know approval costs coins is going to be surprised by a balance. Both facts
			are one sentence and neither is discoverable any other way.

			AND SINCE 0188, SO IS THE SPOTIFY RULE. A restriction a student meets only
			by being refused is a restriction nobody told them about, and the refusal
			arrives after they have already gone and found a link. THIS IS COPY, NEVER
			A GATE: nothing in this component reads a URL, `_classroom_song_url_is_spotify`
			is the one implementation, and a paste that gets past this sentence is
			still judged by the database.
		-->
		<p class="sq-note">
			Paste a Spotify link to a song. Your teacher plays approved ones in class, so nothing plays
			here. Asking is free; you are charged only if it is approved.
		</p>

		{#if student}
			{#if transports}
				<div class="sq-compose">
					<label class="sq-field">
						<span class="sq-label">Spotify link</span>
						<input
							class="sq-input"
							type="url"
							inputmode="url"
							placeholder="https://open.spotify.com/track/..."
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
							disabled={busy}
							aria-disabled={!canRequest}
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
										disabled={busy}
										onclick={() => decideApprove(row.request_id)}
									>
										Approve
									</button>
									<button
										type="button"
										class="btn tap-44 sq-action"
										data-testid="song-queue-reject"
										disabled={busy}
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
											disabled={busy}
											aria-disabled={!reasonOk}
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
{/snippet}

{#if tool}
	<div class="ctool" data-testid="song-queue-tool-root" data-live={liveStatus}>
		<!--
			THE TRIGGER: glyph, the word "Music", and a live chip. The word is always
			there; the chip is the one thing on this trigger that moves, from the
			same `view` the card reads -- the poll and the live notice keep it honest
			while the dialog is shut, which is why neither lives inside the dialog.
		-->
		<button
			bind:this={triggerEl}
			type="button"
			class="ctool-trigger"
			data-testid="song-queue-tool"
			aria-haspopup="dialog"
			aria-expanded={open}
			onclick={openDialog}
		>
			<svg class="ctool-glyph" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
				<path
					d="M8 15.5V4.5l8-2v10.5"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
					stroke-linecap="round"
				/>
				<circle cx="5.5" cy="15.5" r="2.5" fill="currentColor" />
				<circle cx="13.5" cy="13" r="2.5" fill="currentColor" />
			</svg>
			<span class="ctool-word">Music</span>
			<span class="ctool-chip" data-tone={toolChip.tone} data-testid="song-queue-tool-chip"
				>{toolChip.word}</span
			>
		</button>
		{#if liveStatus === 'stalled'}
			<!--
				THE STALLED SENTENCE, OUTSIDE THE DIALOG. The card's own copy sits
				inside the snippet, which in tool mode is mounted only while the
				dialog is open -- so with the dialog shut the only trace of a stalled
				channel was the `data-live` attribute, which nobody reads. The chip is
				what a student reads all period, and this is the sentence that says
				the chip is still going to be right, just later. The card keeps its
				copy for the reader inside the dialog; this one is for everyone else.
			-->
			<p class="ctool-live" data-testid="song-queue-tool-live">
				{classroomLivePausedLine(SONG_QUEUE_POLL_MS)}
			</p>
		{/if}
		{#if open}
			<dialog bind:this={dialogEl} class="ctool-dialog" aria-label="Class music">
				<div class="ctool-panel">
					<div class="ctool-head">
						<span class="ctool-title">Class music</span>
						<button
							type="button"
							class="btn ctool-close"
							data-testid="song-queue-tool-close"
							onclick={closeDialog}
						>
							Close
						</button>
					</div>
					<div class="ctool-body">
						{@render card()}
					</div>
				</div>
			</dialog>
		{/if}
	</div>
{:else}
	{@render card()}
{/if}

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
	/* Inside the dialog the panel is the card's edge, so the card draws none
	   of its own and keeps no outer margin. */
	.sq-card.sq-in-dialog {
		border: 0;
		border-radius: 0;
		margin: 0;
		padding: 0;
	}
	/* The stalled-channel sentence: the quiet metadata register, not `--amber`
	   -- a stalled socket is not a warning about the music. */
	.sq-live {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.4;
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
		   `--ice` is the disabled token; the cursor says the same thing again.
		   The in-flight `disabled` half is painted by app.css's `.btn:disabled`. */
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

	/*
	 * THE TOOL SHELL (`ctool-`). THESE RULES ARE MIRRORED BYTE FOR BYTE IN
	 * `HallPass.svelte`, AND THAT IS A KNOWN DUPLICATION, NOT A SECOND DESIGN.
	 * The two tools have to look like two of one thing on one row, so the
	 * trigger and the dialog are one set of rules -- but a shared stylesheet or
	 * a shell component is a file outside this bundle's ownership, so for now
	 * the second copy lives beside the first with this note on both. The right
	 * home is one `class-tools.css` (or a `ClassTool.svelte` shell) that both
	 * import; whoever makes that move deletes both copies in the same change.
	 */
	.ctool {
		/* The trigger sits in the `.class-tools` row and takes its share of it;
		   the dialog is top-layer and takes no room in the row at all, which is
		   what "no layout shift on the page" means here. A column, because the
		   stalled sentence, when there is one, sits BENEATH the trigger. */
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
		flex: 1 1 12rem;
	}
	.ctool-trigger {
		/* One control, 44px, the whole row's width on a phone. `min-height`,
		   never a height, so a chip that wraps grows the box instead of
		   clipping. */
		display: inline-flex;
		align-items: center;
		gap: 0.6rem;
		min-height: 44px;
		min-width: 0;
		width: 100%;
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-1);
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		text-align: left;
		cursor: pointer;
	}
	.ctool-trigger:hover {
		border-color: var(--green);
	}
	.ctool-trigger:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.ctool-trigger[aria-expanded='true'] {
		border-color: var(--green);
	}
	.ctool-glyph {
		flex: none;
		color: var(--green);
	}
	.ctool-word {
		flex: none;
	}
	.ctool-chip {
		/* The chip carries a WORD in every state and a hue in most; the word is
		   the signal and the hue is the second one. Pushed to the trailing edge
		   so the word and the status read as two columns across both tools. */
		margin-left: auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.74rem;
		letter-spacing: 0.06em;
		text-transform: none;
		color: var(--text-2);
	}
	.ctool-chip[data-tone='free'],
	.ctool-chip[data-tone='approved'] {
		color: var(--green);
	}
	.ctool-chip[data-tone='taken'],
	.ctool-chip[data-tone='mine'],
	.ctool-chip[data-tone='out'],
	.ctool-chip[data-tone='pending'] {
		color: var(--teal);
	}
	.ctool-live {
		/* The stalled-channel sentence beneath the trigger: the quiet metadata
		   register, never `--amber` -- a stalled socket is not a warning about
		   the room. Same register as the card's own copy. */
		margin: 0;
		padding-inline: 0.2rem;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.4;
	}
	.ctool-dialog {
		/* The dialog owns no padding: the panel inside it fills every pixel it
		   has, so a pointerdown whose target is the dialog itself is a press on
		   the backdrop and nothing else. */
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card, 10px);
		background: var(--surface-1);
		color: var(--text-1);
		width: 100%;
		max-width: min(100% - 2rem, 34rem);
		max-height: calc(100dvh - 2rem);
		box-sizing: border-box;
		overflow: hidden;
	}
	.ctool-dialog::backdrop {
		background: rgba(4, 6, 5, 0.72);
	}
	.ctool-panel {
		display: flex;
		flex-direction: column;
		max-height: calc(100dvh - 2rem);
		min-width: 0;
	}
	.ctool-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--boundary);
		flex: none;
	}
	.ctool-title {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.ctool-close {
		flex: none;
		min-height: 44px;
	}
	.ctool-body {
		padding: var(--space-4);
		overflow: auto;
		min-width: 0;
		min-height: 0;
	}
	@media (max-width: 640px) {
		/* FULL-HEIGHT-ISH ON A PHONE: the dialog takes the whole viewport less a
		   thumb's worth of margin, so the card's controls sit where a thumb
		   already is rather than floating in the middle of a dark screen. */
		.ctool-dialog,
		.ctool-panel {
			max-height: calc(100dvh - 1rem);
		}
		.ctool-dialog {
			max-width: calc(100% - 1rem);
			height: calc(100dvh - 1rem);
		}
		.ctool-panel {
			height: 100%;
		}
	}
</style>
