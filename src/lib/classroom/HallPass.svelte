<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import {
		HALL_PASS_POLL_MS,
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
		hallPassUsageLine,
		type HallPassRefusal,
		type HallPassState,
		type HallPassTransports
	} from '$lib/classroom/hall-pass';

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
		now
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
	const live = $derived(local ?? serverState);

	const canOpen = $derived(!!transports && hallPassCanOpen(live, now));
	const canClose = $derived(!!transports && hallPassCanClose(live));
	const blocked = $derived(hallPassBlockedReason(live, now));
	const manager = $derived(live.scope === 'manager' ? live : null);

	/**
	 * `0174`. THE COUNT IS SHOWN BEFORE ANYBODY TAPS, which is the half of the
	 * limit that is not a refusal: a student who can see it coming does not
	 * spend a pass finding out. Null on a deployment without the migration --
	 * there is no rule to describe, so the card says nothing about one.
	 */
	const usage = $derived(hallPassUsageLine(live));
	const limitSummary = $derived(hallPassLimitSummary(live));

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
		if (live.taken && live.scope === 'student' && live.mine)
			return { tone: 'mine', glyph: '◐', word: 'You are out' };
		if (live.taken) return { tone: 'taken', glyph: '◐', word: 'Taken' };
		return { tone: 'free', glyph: '○', word: 'Free' };
	});

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
	 * THE CONTROL IS `aria-disabled` AND NOT `disabled`, so a student who taps a
	 * taken pass gets a sentence rather than a dead button. A genuinely disabled
	 * control swallows the pointer event and can never explain itself, which on
	 * the only control this feature has would be the whole surface going quiet.
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
			report(await transports.open(sectionId), 'You are signed out. Sign back in when you return.');
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
	 * THE SNAPSHOT IS TAKEN ONCE, before the await. Reading `live` again after
	 * it would be reading whatever the poll has since replaced it with, which is
	 * the same stale-intent bug one level up.
	 */
	async function signIn(): Promise<void> {
		if (busy || !transports || !canClose) return;
		const snapshot = live;
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
			if (res.ok) overrideEmail = '';
		} catch {
			notice = 'Could not reach the class. Check your connection and try again.';
		} finally {
			busy = false;
			await refresh();
		}
	}
</script>

<section class="hp-card" data-testid="hall-pass" data-scope={live.scope}>
	<div class="hp-head">
		<h2 class="hp-title">Hall pass</h2>
		<span class="hp-chip" data-tone={chip.tone} data-testid="hall-pass-chip">
			<span class="hp-glyph" aria-hidden="true">{chip.glyph}</span>{chip.word}
		</span>
	</div>

	<p class="hp-status" data-testid="hall-pass-status">{hallPassStatusLine(live, now)}</p>

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
					aria-disabled={busy}
					onclick={signIn}
				>
					Sign back in
				</button>
			{:else if live.scope === 'student'}
				<!--
					OFFERED EVEN WHEN THE PASS IS TAKEN, on purpose. The alternative --
					removing the control -- leaves a student staring at a card with no
					affordance and no account of why, and "the pass is taken" is a
					sentence they are entitled to whether or not they can act on it.
					`aria-disabled` is what lets it say so; `disabled` would eat the tap.
				-->
				<button
					type="button"
					class="btn tap-44 hp-action"
					data-testid="hall-pass-open"
					aria-disabled={!canOpen || busy}
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
		-->
		<div class="hp-override" data-testid="hall-pass-override">
			<label class="hp-override-label" for={`hp-send-${sectionId}`}>Send a student out</label>
			<select
				id={`hp-send-${sectionId}`}
				class="hp-override-select tap-44"
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
				aria-disabled={busy || !overrideEmail}
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
		   `--ice` is the disabled token; the cursor says the same thing again. */
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
</style>
