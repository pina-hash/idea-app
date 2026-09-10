<script lang="ts">
	import { untrack } from 'svelte';
	import Disclosure from '$lib/Disclosure.svelte';
	import {
		CLASSROOM_LIVE_DEBOUNCE_MS,
		HALL_PASS_POLL_MS,
		classroomLivePausedLine,
		hallPassBlockedReason,
		hallPassCanClose,
		hallPassCanOpen,
		hallPassClockLabel,
		hallPassDurationLabel,
		hallPassElapsedLabel,
		hallPassLimitSummary,
		hallPassOverrideLabel,
		hallPassRefusalMessage,
		hallPassStatusLine,
		hallPassToolChip,
		hallPassUsageLine,
		type HallPassRefusal,
		type HallPassState,
		type HallPassTransports
	} from '$lib/classroom/hall-pass';
	import type { ClassroomLive, ClassroomLiveStatus } from '$lib/classroom/live';

	/**
	 * THE DIGITAL BATHROOM PASS, at the top of the class pane.
	 *
	 * WHY IT IS THE FIRST THING IN THE PANE AND NOT A ROW IN THE ACTIONS LINE.
	 * The whole value of this feature is the second it takes: a student who needs
	 * it needs it now, one-handed, on a phone, without reading anything. At 375px
	 * the class page IS this pane, so first-in-the-pane means zero scrolling and
	 * one tap from opening the class. Anywhere further down is a scroll on the
	 * one surface where scrolling is the cost.
	 *
	 * TWO SHAPES, ONE CARD (prompt 0118). `tool={false}` is the card, exactly as
	 * it has always been. `tool={true}` folds the SAME card into a trigger and a
	 * native `<dialog>`: the trigger is one 44px control carrying the glyph, the
	 * word and a live status chip, and the dialog holds the identical markup
	 * (same `data-testid`s, same controls) behind one tap. The card is a snippet
	 * rendered in both places precisely so there is one copy of it -- a second
	 * "compact" rendering would be the thing that quietly stops matching.
	 *
	 * PRESENTATION PLUS INJECTED TRANSPORTS, the ReviewConsole convention. It is
	 * not a boundary and could not be one: `0143` decides who may open, who may
	 * close, and -- the part that matters -- WHAT EACH ROLE IS TOLD. A student's
	 * `state` has never contained another student's name, so there is nothing in
	 * this file that hides one. Read the two branches of
	 * `classroom_hall_pass_state` for the real rule.
	 *
	 * WHICH IS WHY THERE IS NO `canManage` PROP AND MUST NOT BE. The role comes
	 * from the PAYLOAD's own `scope`, because the payload is what the database
	 * actually decided; a flag threaded down beside it would be a second opinion
	 * about who this person is, and the failure mode of a second opinion here is
	 * a student's browser being handed a manager payload and told to render it,
	 * or a manager's surface deciding to hide a name it holds. Neither can be
	 * expressed: the manager markup reads fields the student type does not have.
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
		 *  0143 has no control rather than a broken one. */
		state: HallPassState;
		/** Omitted (null) removes both controls: read-only is structural here, as
		 *  everywhere else in this module, rather than a flag somebody honours. */
		transports?: HallPassTransports | null;
		/**
		 * THE ONE CLOCK, threaded from the layout. Nothing in this component or in
		 * `$lib/classroom/hall-pass` reads `Date.now()`, so every figure in one
		 * paint is measured against the same instant and each label is assertable
		 * at a pinned one.
		 */
		now: number;
		/**
		 * THE LIVE NOTICE BUS (`$lib/classroom/live`). Omitted, the card is what it
		 * was: polled at `HALL_PASS_POLL_MS` and nothing else. Present, a notice
		 * for the `hall-pass` topic re-asks the server after a short debounce, and
		 * every successful write here announces one. THE POLL STAYS EITHER WAY --
		 * it is the floor, and a write made outside this app (the SQL editor)
		 * announces nothing.
		 */
		live?: ClassroomLive | null;
		/** `true` renders the trigger-and-dialog shape; `false` the card as today. */
		tool?: boolean;
	} = $props();

	/**
	 * The server's answer, overlaid with whatever this component has since
	 * learned -- the layout's own `localItems` pattern, for the same reason: the
	 * load only re-runs on a real navigation, so a pass opened here would
	 * otherwise sit unreported until one happened. The overlay is dropped the
	 * moment the server's own answer moves, which is when it should win again.
	 */
	let local = $state<HallPassState | null>(null);
	let notice = $state<string | null>(null);
	let busy = $state(false);
	$effect(() => {
		void serverState;
		local = null;
	});
	const view = $derived(local ?? serverState);

	const canOpen = $derived(!!transports && hallPassCanOpen(view, now));
	const canClose = $derived(!!transports && hallPassCanClose(view));
	const blocked = $derived(hallPassBlockedReason(view, now));
	const manager = $derived(view.scope === 'manager' ? view : null);

	/**
	 * `0174`. THE COUNT IS SHOWN BEFORE ANYBODY TAPS, which is the half of the
	 * limit that is not a refusal: a student who can see it coming does not
	 * spend a pass finding out. Null on a deployment without the migration --
	 * there is no rule to describe, so the card says nothing about one.
	 */
	const usage = $derived(hallPassUsageLine(view));
	const limitSummary = $derived(hallPassLimitSummary(view));

	/**
	 * THE OVERRIDE CONTROL EXISTS ONLY WHEN ALL THREE HALVES DO: the transport
	 * (absence is the mechanism, as everywhere else here), the roster the
	 * database hands a manager to name somebody from, and nobody currently out
	 * of this room -- the capacity index refuses that case, and a control whose
	 * only possible answer is a refusal must not be offered.
	 */
	const overrideRoster = $derived(manager && !manager.taken ? (manager.roster ?? []) : []);
	const canOverride = $derived(!!transports?.openFor && overrideRoster.length > 0);
	let overrideEmail = $state('');

	/** Glyph AND word, never the hue alone. */
	const chip = $derived.by(() => {
		if (view.taken && view.scope === 'student' && view.mine)
			return { tone: 'mine', glyph: '◐', word: 'You are out' };
		if (view.taken) return { tone: 'taken', glyph: '◐', word: 'Taken' };
		return { tone: 'free', glyph: '○', word: 'Free' };
	});

	/** The trigger's own chip, one word shorter than the status line and named nobody a student may not see. */
	const toolChip = $derived(hallPassToolChip(view, now));

	async function refresh(): Promise<void> {
		if (!transports) return;
		const next = await transports.load(sectionId);
		// A failed refresh keeps what is on screen. Blanking it would read as
		// "the pass is free", which is the one wrong answer that matters.
		if (next) local = next;
	}

	/**
	 * POLLED, BECAUSE ONE SLOT IS SHARED BY A WHOLE CLASS and a stale "Free" is
	 * what sends a second student to the door. Paused while the tab is hidden and
	 * re-asked the moment it is visible again, which is the transition that
	 * actually matters: this surface spends most of its life in a pocket.
	 *
	 * The effect reads `transports` and `sectionId` and nothing else. The timer
	 * and listener callbacks run outside the tracking scope, so the work they do
	 * takes no dependency on the state it writes -- which is what would otherwise
	 * re-arm the interval on every tick.
	 *
	 * IT STAYS AT COMPONENT LEVEL IN BOTH SHAPES, deliberately: in tool mode the
	 * card is only mounted while the dialog is open, but the chip on the trigger
	 * is read all period long, so the thing that keeps the chip honest cannot
	 * live inside the dialog.
	 */
	$effect(() => {
		if (!transports) return;
		const tick = () => {
			if (typeof document !== 'undefined' && document.hidden) return;
			void refresh();
		};
		const timer = setInterval(tick, HALL_PASS_POLL_MS);
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
	 * after a short debounce that folds a burst into one read.
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
					if (topic !== 'hall-pass') return;
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
	 * SAY THAT THIS CLIENT JUST WROTE. Fire-and-forget by the bus's own contract;
	 * a notice that does not get through costs the other viewers one poll
	 * interval, which is what they had before this existed. Called ONLY after a
	 * result the server said yes to -- a refusal changed nothing, so there is
	 * nothing to announce.
	 */
	function announce(): void {
		live?.announce(sectionId, 'hall-pass');
	}

	/**
	 * THE REFUSAL'S DETAIL IS CARRIED, NOT DROPPED (`0174`). A `cooldown` whose
	 * `retryAt` never reached the sentence builder reads "wait a few minutes",
	 * which is the refusal-with-no-time-in-it the limit exists to avoid.
	 */
	function report(
		res: {
			ok: boolean;
			refusal?: unknown;
			message?: string;
			retryAt?: string | null;
			used?: number | null;
			limit?: number | null;
		},
		done: string
	): void {
		if (res.ok) {
			notice = done;
			return;
		}
		notice =
			'refusal' in res && res.refusal
				? hallPassRefusalMessage(res.refusal as HallPassRefusal, {
						retryAt: res.retryAt,
						used: res.used,
						limit: res.limit
					})
				: (res.message ?? 'Something went wrong. Try again.');
	}

	/**
	 * ONE PREDICATE DRIVES THE CONTROL AND ITS HANDLER. `canOpen` is read by the
	 * `aria-disabled` attribute and again as the first line here; two spellings
	 * of "is this ready" is what produces a click that does nothing.
	 *
	 * THE EXPLANATION IS `aria-disabled` AND THE IN-FLIGHT STATE IS `disabled`.
	 * A student who taps a taken pass gets a sentence rather than a dead button,
	 * so the `canOpen` half is `aria-disabled`: a genuinely disabled control
	 * swallows the pointer event and can never explain itself, which on the only
	 * control this feature has would be the whole surface going quiet. `busy`
	 * has nothing to explain -- a request is already on its way and a second
	 * tap could only queue behind it -- so that half is a real `disabled`.
	 */
	async function signOut(): Promise<void> {
		if (busy || !transports) return;
		if (!canOpen) {
			notice = blocked ?? hallPassRefusalMessage('taken');
			return;
		}
		busy = true;
		notice = null;
		try {
			const res = await transports.open(sectionId);
			report(res, 'You are signed out. Sign back in when you return.');
			if (res.ok) announce();
		} catch {
			// The transport turns an RPC refusal into a result, so reaching here
			// means the request never completed. SAYING SO MATTERS MORE THAN
			// USUAL: silence would leave the card reading "free" beside a tap that
			// looked like it worked, and send a second student to the door.
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			// Re-asked either way: a refusal means somebody else moved, and the
			// surface should show what is actually true rather than what it
			// believed a moment ago.
			await refresh();
		}
	}

	/**
	 * THE MANAGER NAMES THE PASS; THE STUDENT NAMES NOTHING (`0144`).
	 *
	 * The target is read from THIS PAINT's payload, so the id sent is the pass
	 * the instructor was actually looking at when they pressed. That is the
	 * whole fix: `classroom_hall_pass_close(p_section_id)` re-resolved "whatever
	 * is open in this section" server-side at the instant the request landed, so
	 * a clear pressed while one student returned and another left closed the
	 * SECOND student's pass -- marking them back in the room while they were in
	 * a corridor, with nothing on screen reporting it. If the named pass has
	 * since closed the database refuses with `already_closed` and touches
	 * nothing, which is the honest answer to a press that arrived too late.
	 *
	 * A STUDENT SENDS NO IDENTIFIER AT ALL, and could not: their payload has no
	 * pass id in it and `HallPassStudentState` has no field capable of carrying
	 * one. `closeMine` passes the section and the database resolves the person
	 * from the session.
	 *
	 * THE SNAPSHOT IS TAKEN ONCE, before the await. Reading `view` again after
	 * it would be reading whatever the poll has since replaced it with, which is
	 * the same stale-intent bug one level up.
	 */
	async function signIn(): Promise<void> {
		if (busy || !transports || !canClose) return;
		const snapshot = view;
		const target = snapshot.scope === 'manager' ? snapshot.open : null;
		// `canClose` already requires a manager to have an open pass, so this is
		// unreachable rather than defensive -- but a close with nothing to name
		// must never fall through to a section-keyed one, which is the shape this
		// change exists to remove.
		if (snapshot.scope === 'manager' && !target) return;
		busy = true;
		notice = null;
		try {
			const res = target
				? await transports.closeById(target.pass_id)
				: await transports.closeMine(sectionId);
			report(
				res,
				res.ok && res.data.student_name
					? `Signed ${res.data.student_name} back in.`
					: 'Signed back in.'
			);
			if (res.ok) announce();
		} catch {
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}

	/**
	 * THE OVERRIDE (`0174`). An instructor sends a NAMED student out past the
	 * cooldown and the daily cap.
	 *
	 * IT NAMES THE STUDENT, which is `closeById`'s argument in the other
	 * direction: the person acting is deciding ABOUT somebody, and an email
	 * carried from this paint's own roster is what makes the intent survive the
	 * gap between reading the list and pressing the control. A manager's payload
	 * already holds those names, so it costs no disclosure.
	 *
	 * IT IS NOT A BOUNDARY. `classroom_hall_pass_open_for` re-checks
	 * `classroom_manages_section` and raises the same sentence a nonexistent
	 * section raises for anybody else -- and it still refuses a student who is
	 * off the roster, already out somewhere, or whose room already has somebody
	 * in the corridor.
	 */
	async function sendOut(): Promise<void> {
		const send = transports?.openFor;
		if (busy || !send || !overrideEmail) return;
		const target = overrideEmail;
		busy = true;
		notice = null;
		try {
			const res = await send(sectionId, target);
			report(res, res.ok ? `Sent ${res.data.student_name} out.` : '');
			if (res.ok) {
				overrideEmail = '';
				announce();
			}
		} catch {
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}

	/*
	 * ------------------------------------------------------------------------
	 * THE TOOL SHAPE: a trigger and a native <dialog>.
	 *
	 * A NATIVE <dialog> WITH showModal(), NOT A STYLED OVERLAY DIV, for the
	 * reasons `PhotoViewer.svelte` already gives: the browser owns the top
	 * layer, the focus trap, Escape and the inert-ness of everything behind it,
	 * and every one of those is a thing a hand-rolled overlay gets subtly wrong.
	 * The element is MOUNTED ONLY WHILE OPEN -- so "no dialog at rest" is a
	 * structural absence a spec can count, and the card inside it (its poll-free
	 * markup, its Disclosure) costs nothing while the dialog is shut.
	 *
	 * THREE CLOSE PATHS, ONE HANDLER. The Close control, Escape and a press on
	 * the backdrop all land in `closeDialog()`, which is idempotent, so the
	 * browser's own cancel arriving beside ours is harmless. Escape is handled
	 * on keydown as well as left to the browser: the DOM project has no native
	 * close-request handling, so a test of that path would otherwise be
	 * asserting nothing, and in a real browser both roads reach the same line.
	 * The backdrop press is `pointerdown`, not `click`, on the DIALOG ELEMENT
	 * ITSELF: the panel inside it fills every pixel the dialog owns, so a press
	 * whose target IS the dialog is by construction a press on the backdrop --
	 * and a drag that starts inside and ends outside never produces one.
	 *
	 * FOCUS GOES TO THE CARD'S OWN CONTROL ON OPEN and back to the trigger on
	 * close. The dialog exists to do one thing, and that thing is the card's
	 * button; landing on Close first would put the exit one Tab ahead of the
	 * reason anybody opened it. Close is one Shift+Tab away and always on
	 * screen. A card with nothing to press (read-only, an instructor with nobody
	 * out) falls back to Close.
	 *
	 * ALL THREE LISTENERS ARE ATTACHED WITH addEventListener in the effect that
	 * opens the dialog, not as Svelte attributes: `close` does not bubble (HTML
	 * spec) so a delegated attribute never fires, and keeping the other two
	 * beside it means one place says what the dialog listens for.
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
				'.ctool-body button:not([disabled]), .ctool-body select:not([disabled]), .ctool-body input, .ctool-body a[href]'
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
	<section class="hp-card" class:hp-in-dialog={tool} data-testid="hall-pass" data-scope={view.scope} data-live={liveStatus}>
		<div class="hp-head">
			<h2 class="hp-title">Hall pass</h2>
			<span class="hp-chip" data-tone={chip.tone} data-testid="hall-pass-chip">
				<span class="hp-glyph" aria-hidden="true">{chip.glyph}</span>{chip.word}
			</span>
		</div>

		<p class="hp-status" data-testid="hall-pass-status">{hallPassStatusLine(view, now)}</p>

		{#if usage}
			<!--
				`0174`. THE COUNT BEFORE THE TAP, not only in the refusal after it. A
				student who can see "2 of 3" coming does not spend the third finding
				out what the rule is.
			-->
			<p class="hp-usage" data-testid="hall-pass-usage">{usage}</p>
		{/if}

		{#if transports}
			<div class="hp-actions">
				{#if canClose}
					<button
						type="button"
						class="btn tap-44 hp-action"
						data-testid="hall-pass-close"
						disabled={busy}
						onclick={signIn}
					>
						Sign back in
					</button>
				{:else if view.scope === 'student'}
					<!--
						OFFERED EVEN WHEN THE PASS IS TAKEN, on purpose. The alternative --
						removing the control -- leaves a student staring at a card with no
						affordance and no account of why, and "the pass is taken" is a
						sentence they are entitled to whether or not they can act on it.
						`aria-disabled` is what lets it say so; a real `disabled` would eat
						the tap. The in-flight half IS a real `disabled`: a tap during a
						request has nothing to be told.
					-->
					<button
						type="button"
						class="btn tap-44 hp-action"
						data-testid="hall-pass-open"
						disabled={busy}
						aria-disabled={!canOpen}
						onclick={signOut}
					>
						Sign out
					</button>
				{/if}
			</div>
		{/if}

		{#if notice}
			<p class="hp-notice" role="status" data-testid="hall-pass-notice">{notice}</p>
		{/if}

		{#if liveStatus === 'stalled'}
			<!--
				ONE QUIET SENTENCE, ONLY FOR A CHANNEL THAT REPORTED A FAULT. Nothing
				is said while connecting (every page starts there) or once live. It
				names the poll interval because the point is that the card is still
				going to be right, just later -- "paused" alone reads as "broken".
			-->
			<p class="hp-live" data-testid="hall-pass-live">
				{classroomLivePausedLine(HALL_PASS_POLL_MS)}
			</p>
		{/if}

		{#if manager && canOverride}
			<!--
				`0174`. THE OVERRIDE, WHICH IS WHAT KEEPS THE LIMIT FROM BEING WORKED
				AROUND. A rule with no override becomes a rule an instructor routes
				around some other way, and a bathroom is not a place to be rigid --
				so the person who knows the situation can send a student out past the
				cooldown and the cap, and the row records that they did.

				ONE ROW, NOT A PANEL. This sits on a card an instructor reads while a
				student is standing in front of them: a select and a button, no
				disclosure to open, nothing to scroll past.

				THE SELECT IS `cr-select` (item TEN): the shared redrawn native select
				in classroom.css, 44px, with a dark open list. The label stays a real
				`<label for>` and stays visible -- a picker with only a placeholder
				option for a name is a picker whose purpose vanishes once a name is
				picked. `min-height` is restated on the local rule so the floor holds
				on a harness that mounts the card outside `.cr-root`.
			-->
			<div class="hp-override" data-testid="hall-pass-override">
				<label class="hp-override-label" for={`hp-send-${sectionId}`}>Send a student out</label>
				<select
					id={`hp-send-${sectionId}`}
					class="hp-override-select cr-select"
					bind:value={overrideEmail}
					disabled={busy}
					data-testid="hall-pass-override-select"
				>
					<option value="">Choose a student</option>
					{#each overrideRoster as person (person.student_email)}
						<option value={person.student_email}>{person.student_name}</option>
					{/each}
				</select>
				<button
					type="button"
					class="btn tap-44 hp-override-go"
					data-testid="hall-pass-override-go"
					disabled={busy}
					aria-disabled={!overrideEmail}
					onclick={sendOut}
				>
					Send out
				</button>
				{#if limitSummary}
					<p class="hp-override-note">{limitSummary}</p>
				{/if}
			</div>
		{/if}

		{#if manager}
			<!--
				THE HISTORY IS INSTRUCTOR ONLY AND IS NOT A SECOND READ. It arrives on
				the same payload, from the manager branch of `classroom_hall_pass_state`
				-- so there is no surface a student could reach that answers this
				question emptily and has to be kept empty.
			-->
			<Disclosure
				label="Recent passes"
				scope={`hall-pass:${sectionId}`}
				testId="hall-pass-history"
				bodyClass="hp-history-body"
			>
				{#if manager.history.length === 0}
					<p class="hp-empty">Nobody has taken the pass in this class yet.</p>
				{:else}
					<ul class="hp-history">
						{#each manager.history as entry (entry.pass_id)}
							<li class="hp-entry">
								<span class="hp-who">{entry.student_name}</span>
								<span class="hp-when">
									{hallPassClockLabel(entry.opened_at)}
									{#if entry.closed_at}
										to {hallPassClockLabel(entry.closed_at)} &middot; {hallPassDurationLabel(entry)}
									{:else}
										&middot; still out, {hallPassElapsedLabel(entry.opened_at, now)}
									{/if}
									<!--
										`0174`. AN OVERRIDE IS READABLE AS ONE, or the history
										cannot tell "went four times" from "went once and I sent
										them three times" -- and a limit whose overrides leave no
										trace is a limit nobody can check.
									-->
									{#if hallPassOverrideLabel(entry)}
										&middot; <span class="hp-sent"
											>{hallPassOverrideLabel(entry)}</span
										>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</Disclosure>
		{/if}
	</section>
{/snippet}

{#if tool}
	<div class="ctool" data-testid="hall-pass-tool-root" data-live={liveStatus}>
		<!--
			THE TRIGGER: glyph, word, and a live chip. The word is always there
			(every control carries a visible word, not only a glyph); the chip is
			the one thing on this trigger that moves, and it moves from the same
			`view` the card reads -- the poll and the live notice keep it honest
			while the dialog is shut, which is why neither lives inside the dialog.
		-->
		<button
			bind:this={triggerEl}
			type="button"
			class="ctool-trigger"
			data-testid="hall-pass-tool"
			aria-haspopup="dialog"
			aria-expanded={open}
			onclick={openDialog}
		>
			<svg class="ctool-glyph" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
				<path
					d="M4 2.5h8.5v15H4z M12.5 5.5l3.5-1v11l-3.5-1"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linejoin="round"
				/>
				<circle cx="10" cy="10.2" r="1.15" fill="currentColor" />
			</svg>
			<span class="ctool-word">Hall pass</span>
			<span class="ctool-chip" data-tone={toolChip.tone} data-testid="hall-pass-tool-chip"
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
			<p class="ctool-live" data-testid="hall-pass-tool-live">
				{classroomLivePausedLine(HALL_PASS_POLL_MS)}
			</p>
		{/if}
		{#if open}
			<dialog bind:this={dialogEl} class="ctool-dialog" aria-label="Hall pass">
				<div class="ctool-panel">
					<div class="ctool-head">
						<span class="ctool-title">Hall pass</span>
						<button
							type="button"
							class="btn ctool-close"
							data-testid="hall-pass-tool-close"
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
	 * Prefixed `hp-` because `src/app.css` owns a global class list and a name
	 * collision there is not a styling bug, it is an inherited `display` nobody
	 * can see in this file.
	 */
	.hp-card {
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
		   this the history row's times push the pane wider than the viewport. */
		min-width: 0;
	}
	/* Inside the dialog the panel is the card's edge, so the card draws none
	   of its own and keeps no outer margin. */
	.hp-card.hp-in-dialog {
		border: 0;
		border-radius: 0;
		margin: 0;
		padding: 0;
	}
	.hp-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		min-width: 0;
	}
	.hp-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.hp-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
	}
	.hp-glyph {
		font-size: 0.9rem;
		line-height: 1;
	}
	/* COLOUR IS NEVER THE ONLY SIGNAL: every chip carries a glyph and a word,
	   and the words differ. The hue is the third signal, not the first. */
	.hp-chip[data-tone='free'] {
		color: var(--green);
	}
	.hp-chip[data-tone='taken'],
	.hp-chip[data-tone='mine'] {
		/* `--teal` is this palette's "in progress", which is exactly what an open
		   pass is. Not `--amber` (a warning) and not `--crimson`, which is
		   reserved for live/rec/error: somebody being out is neither a fault nor
		   an alarm, and nothing here enforces a time limit. */
		color: var(--teal);
	}
	.hp-status {
		margin: 0;
		color: var(--text-1);
		font-size: 0.95rem;
		line-height: 1.4;
	}
	.hp-actions {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}
	/* THE FLOOR IS A `min-height`, NEVER A HEIGHT: `.tap-44` grows the control
	   to 44px and nothing here may shrink it back. This is a phone control
	   before it is anything else. */
	.hp-action {
		flex: 0 1 auto;
	}
	.hp-action[aria-disabled='true'] {
		/* aria-disabled, so the control still receives the tap and can say why.
		   `--ice` is the disabled token; the cursor says the same thing again.
		   The in-flight `disabled` half is painted by app.css's `.btn:disabled`. */
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.hp-action[aria-disabled='true']:hover {
		background: transparent;
		color: var(--ice);
		box-shadow: none;
	}
	/* `0174`. Metadata about the caller's own day, in the metadata register. */
	.hp-usage {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}
	/* The stalled-channel sentence: the same quiet register as the usage line.
	   Not `--amber` -- a stalled socket is not a warning about the pass. */
	.hp-live {
		margin: 0;
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1.4;
	}
	.hp-override {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
		padding-top: var(--space-2, 0.5rem);
		border-top: 1px solid var(--boundary);
	}
	.hp-override-label {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.hp-override-select {
		flex: 1 1 12rem;
		min-width: 0;
		min-height: 44px;
	}
	.hp-override-go {
		flex: 0 0 auto;
	}
	.hp-override-go[aria-disabled='true'] {
		color: var(--ice);
		border-color: var(--ice);
		cursor: not-allowed;
	}
	.hp-override-go[aria-disabled='true']:hover {
		background: transparent;
		color: var(--ice);
		box-shadow: none;
	}
	.hp-override-note {
		flex: 1 1 100%;
		margin: 0;
		color: var(--text-2);
		font-size: 0.85rem;
		line-height: 1.4;
	}
	.hp-sent {
		color: var(--cyan);
	}
	.hp-notice {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.hp-empty {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.hp-history {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.hp-entry {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		padding-block: 0.15rem;
	}
	.hp-who {
		color: var(--text-1);
		font-size: 0.92rem;
	}
	.hp-when {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.76rem;
		letter-spacing: 0.04em;
	}

	/*
	 * THE TOOL SHELL (`ctool-`). THESE RULES ARE MIRRORED BYTE FOR BYTE IN
	 * `SongQueue.svelte`, AND THAT IS A KNOWN DUPLICATION, NOT A SECOND DESIGN.
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
