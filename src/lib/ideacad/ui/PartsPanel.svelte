<script lang="ts">
	/**
	 * THE PARTS LIST: who holds what, live, and one tap to take or let go.
	 *
	 * Mr. Pina's design, 2026-09-12: an IDEA-Blade is several parts, ONE PERSON
	 * HOLDS A PART AT A TIME, switching who holds what must be "extremely easy
	 * and intuitive", and the assembly owner reassigns teammates to parts LIVE.
	 * `0207` is the data layer, `assembly.ts` its client types and predicates,
	 * `checkout.ts` the controller. This renders it and does nothing else.
	 *
	 * ---------------------------------------------------------------------------
	 * ONE PRIMARY CONTROL PER ROW, AND ITS WORD IS THE STATE.
	 * ---------------------------------------------------------------------------
	 *
	 * "Extremely easy" is a design constraint here, so a row carries exactly one
	 * button and the word on it says what pressing it does: **Take this part**
	 * when it is free, **Release** when it is yours. A part somebody else is
	 * holding has NO button at all -- it says who has it instead. That is the
	 * viewer rule applied per row: a control whose only possible outcome is a
	 * refusal must not be offered, and `ideacad_claim_part` answers `held` for
	 * exactly this case.
	 *
	 * THE ROW MODEL IS `partRows`, NOT AN EXPRESSION IN THE MARKUP. Whether a
	 * part is mine, who is blocking it and which of the four actions applies is
	 * one pure function in `checkout.ts`; written inline this would be the second
	 * statement of a rule about who may press what, and the one that drifts.
	 *
	 * ---------------------------------------------------------------------------
	 * A VIEWER SEES THE ASSEMBLY AND NOT ONE CONTROL THAT WOULD BE REFUSED.
	 * ---------------------------------------------------------------------------
	 *
	 * `canWrite` false makes every action `'none'`, so there is no button in the
	 * markup at all -- absent, not disabled. `IDEACAD_CHECKOUT_VIEW_ONLY` is the
	 * sentence that says why, because a list with nothing pressable and no
	 * explanation reads as broken rather than as read-only.
	 *
	 * ---------------------------------------------------------------------------
	 * A LAPSED HOLD IS ON SCREEN BEFORE IT COSTS ANYTHING.
	 * ---------------------------------------------------------------------------
	 *
	 * `secondsLeft` comes off the controller's own clock against the window
	 * `ideacad_assembly` returned, and the row says so while it is running down
	 * rather than after it has gone. A student who has lost a part reads the
	 * terminal notice, which states that the work on screen is still there and
	 * that taking the part again is the way back -- never a console error and
	 * never a silently refused write.
	 *
	 * ---------------------------------------------------------------------------
	 * THE OWNER'S REASSIGN IS A PICKER, AND ITS LABEL IS ABOVE IT.
	 * ---------------------------------------------------------------------------
	 *
	 * Ledger 0186 measured a side-by-side label clipping a select and cutting off
	 * exactly the marker that mattered, so every label here is stacked. The
	 * picker lists the people the document is actually shared with plus the
	 * owner, and "Nobody" clears the part -- which is `ideacad_assign_part`'s own
	 * null, not a separate control.
	 */
	import {
		IDEACAD_CHECKOUT_VIEW_ONLY,
		holdIsExpiring,
		partRows,
		type IdeacadCheckoutNotice,
		type IdeacadCheckoutPhase
	} from '../checkout';
	import type { IdeacadAssembly } from '../assembly';

	let {
		assembly = null,
		myPartId = null,
		secondsLeft = null,
		phase = 'idle',
		notice = null,
		teammates = [],
		onclaim = undefined,
		onrelease = undefined,
		onassign = undefined,
		ondismiss = undefined
	}: {
		assembly?: IdeacadAssembly | null;
		myPartId?: string | null;
		secondsLeft?: number | null;
		phase?: IdeacadCheckoutPhase;
		notice?: IdeacadCheckoutNotice | null;
		/** Addresses the owner may reassign to: whoever the document is shared with. */
		teammates?: string[];
		/** ABSENT REMOVES THE CONTROL, on every one of these. */
		onclaim?: (partId: string) => void;
		onrelease?: (partId: string) => void;
		onassign?: (partId: string, email: string | null) => void;
		ondismiss?: () => void;
	} = $props();

	const rows = $derived(assembly ? partRows(assembly) : []);
	const busy = $derived(phase === 'busy');
	const expiring = $derived(
		assembly ? holdIsExpiring(secondsLeft, assembly.holdWindowSeconds) : false
	);
	/** The owner's own reassign list. The owner is on it: taking a part back is
	 *  reassigning it to yourself, not a second verb. */
	const assignable = $derived(
		assembly ? [assembly.viewer, ...teammates.filter((t) => t !== assembly.viewer)] : []
	);

	/** Minutes and seconds, so a number nobody has to divide is on screen. */
	function clock(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		return m > 0 ? `${m} min ${s < 10 ? '0' : ''}${s} s` : `${s} s`;
	}
</script>

<section class="parts" data-testid="ideacad-parts" aria-labelledby="ic-parts-h">
	<header>
		<h3 id="ic-parts-h">Parts</h3>
		{#if myPartId && secondsLeft !== null}
			<!--
				THE COUNTDOWN IS A WORD AND A NUMBER, never a colour alone, and it is
				`aria-live` because it is the one thing on this panel that changes
				without anybody pressing anything.
			-->
			<span
				class="chip hold"
				class:expiring
				data-testid="ideacad-hold-clock"
				aria-live="polite"
			>
				Your part for {clock(secondsLeft)}
			</span>
		{/if}
	</header>

	{#if notice}
		<!--
			A REFUSAL IS A SURFACE. Every one of these sentences is
			`checkout.ts`'s, which is a `Record` over the database's own reason
			union, so a reason with no sentence is a type error rather than a blank
			line on a student's screen.
		-->
		<p
			class="notice {notice.tone}"
			role="status"
			data-testid="ideacad-parts-notice"
			data-reason={notice.reason}
		>
			<span class="mark" aria-hidden="true"
				>{notice.tone === 'terminal' ? '!' : notice.tone === 'refusal' ? '×' : '✓'}</span
			>
			<span>{notice.text}</span>
			{#if ondismiss && notice.tone !== 'terminal'}
				<button type="button" class="dismiss" onclick={ondismiss}>Dismiss</button>
			{/if}
		</p>
	{/if}

	{#if assembly && !assembly.canWrite}
		<p class="note" data-testid="ideacad-parts-viewonly">{IDEACAD_CHECKOUT_VIEW_ONLY}</p>
	{/if}

	{#if rows.length === 0}
		<p class="note">This assembly has no parts yet.</p>
	{:else}
		<ul>
			{#each rows as row (row.part.id)}
				<li class:mine={row.mine} data-testid="ideacad-part-row" data-part={row.part.id}>
					<span class="nm">
						<span class="pname">{row.part.name}</span>
						<!--
							WHO HOLDS IT, IN WORDS, ALWAYS. The colour of the row says the
							same thing a second time and never on its own.
						-->
						<small data-testid="ideacad-part-holder">
							{#if row.mine}
								Yours
							{:else if row.blockedBy}
								{row.blockedBy} has it
							{:else}
								Free
							{/if}
						</small>
					</span>

					{#if row.action === 'release' && onrelease}
						<button
							type="button"
							class="act release"
							aria-disabled={busy}
							onclick={() => onrelease(row.part.id)}
						>
							Release
						</button>
					{:else if row.action === 'claim' && onclaim}
						<button
							type="button"
							class="act claim"
							aria-disabled={busy}
							onclick={() => onclaim(row.part.id)}
						>
							Take this part
						</button>
					{:else if row.action === 'blocked'}
						<!--
							NO BUTTON, AND A SENTENCE IN ITS PLACE. A control that is absent
							for a reason says the reason where every sibling row has one, or
							the row reads as a bug.
						-->
						<span class="held" data-testid="ideacad-part-blocked">In use</span>
					{/if}

					{#if assembly?.isOwner && onassign}
						<label class="assign">
							<span class="lab">Owner: give to</span>
							<select
								data-testid="ideacad-part-assign"
								value={row.holder ?? ''}
								disabled={busy}
								onchange={(e) => onassign(row.part.id, e.currentTarget.value || null)}
							>
								<option value="">Nobody</option>
								{#each assignable as who (who)}
									<option value={who}>{who}</option>
								{/each}
							</select>
						</label>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.parts {
		display: grid;
		gap: 0.5rem;
		padding: 0.75rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-1);
		/* A CONTAINER, NOT A MEDIA QUERY, and CLAUDE.md's own reason: this panel
		   is mounted inside somebody else's pane, so the viewport says nothing
		   about how much room it actually has. A breakpoint written against the
		   viewport would be dead code in a narrow pane and would fire in a wide
		   one that happens to sit on a narrow screen. */
		container-type: inline-size;
	}
	header {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	h3 {
		margin: 0;
		font-size: 1rem;
		color: var(--text-1);
	}
	.chip {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0.15rem 0.4rem;
	}
	.chip.expiring {
		border-color: var(--ic-warn, var(--amber));
		color: var(--ic-warn, var(--amber));
	}
	.note {
		margin: 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.notice {
		display: flex;
		flex-wrap: wrap;
		/* THE MARK ALIGNS TO THE FIRST LINE, NOT THE MIDDLE ONE. Centred, a
		   three-line notice put the "!" beside line two, where it reads as an
		   interruption in the middle of a sentence rather than as a marker on
		   the block. Only visible at 375, where the sentence wraps. */
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		padding: 0.4rem 0.5rem;
		font-size: 0.9rem;
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.notice .mark {
		flex: 0 0 auto;
		font: 14px 'Share Tech Mono', monospace;
	}
	/* THE SENTENCE SHRINKS SO THE MARK STAYS BESIDE IT. Its automatic minimum is
	   its min-content -- the longest word -- which on a wrapping row is enough to
	   push the mark onto a line of its own above the text. Caught by looking: the
	   terminal notice rendered a bare "!" on one line with the sentence under it. */
	.notice > span:not(.mark) {
		flex: 1 1 12rem;
		min-width: 0;
	}
	.notice.refusal {
		border-color: var(--ic-warn, var(--amber));
	}
	.notice.terminal {
		border-color: var(--crimson);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-0);
	}
	li.mine {
		border-color: var(--green);
	}
	.nm {
		flex: 1 1 9rem;
		/* Its automatic minimum is min-content, so without this a long part name
		   forces the row, the panel and the page wider than the viewport. */
		min-width: 0;
	}
	.pname {
		display: block;
		color: var(--text-1);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	small {
		display: block;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	li.mine small {
		color: var(--green);
	}
	button {
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.9rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}
	button:focus-visible,
	select:focus-visible {
		outline: 3px solid var(--focus-ring);
		outline-offset: 2px;
	}
	button[aria-disabled='true'] {
		color: var(--text-2);
	}
	.act.claim {
		border-color: var(--green);
	}
	.held {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0 0.5rem;
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.08em;
		color: var(--text-2);
	}
	.dismiss {
		min-height: 44px;
	}
	/* THE LABEL IS ABOVE THE SELECT, NOT BESIDE IT -- ledger 0186's clipped
	   marker. `flex-basis` reserves the picker's width rather than letting it be
	   squeezed by whatever shares the row. */
	.assign {
		display: grid;
		/* AN EXPLICIT SINGLE COLUMN. An implicit `auto` track makes the select's
		   `width: 100%` a percentage against a track sized FROM the select, so
		   the browser uses its intrinsic width -- the longest option text -- and
		   the control stops filling the box reserved for it. It happens to look
		   right here only because an email address is wider than 13rem; a short
		   roster would silently shrink the picker. Same fix and same reason as
		   `.field` in `SharePanel`, where it was measured at 103px in a 176px
		   box. */
		grid-template-columns: minmax(0, 1fr);
		gap: 0.2rem;
		flex: 0 1 13rem;
		min-width: 0;
	}
	.lab {
		font: 12px 'Share Tech Mono', monospace;
		letter-spacing: 0.06em;
		color: var(--text-2);
	}
	select {
		min-height: 44px;
		width: 100%;
		min-width: 0;
		padding: 0 0.5rem;
		font: inherit;
		color: var(--text-1);
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
	}

	/*
	 * THE NARROW ROW: THE NAME TAKES THE WHOLE LINE AND THE CONTROL DROPS BELOW.
	 *
	 * MEASURED, IN BOTH DIRECTIONS, RATHER THAN CHOSEN. In the harness this
	 * panel is 343px wide at a 375px viewport and 416px at 1440, so 24rem
	 * (384px) fires on one and not the other -- a threshold no container ever
	 * reaches is a rule that silently never applies, and nothing on screen or in
	 * any type check reports it.
	 *
	 * WHAT IT FIXES, caught by rasterizing and looking rather than by any check:
	 * at 375 the holder line is an EMAIL ADDRESS, which wrapped to two lines
	 * inside a 230px column while "In use" floated on the right beside a 55px
	 * block. Given the row, the address fits on one line and the marker sits
	 * under it where a thumb expects it.
	 */
	@container (max-width: 24rem) {
		.nm {
			flex-basis: 100%;
		}
		.act,
		.held {
			flex: 1 1 auto;
			justify-content: center;
			text-align: center;
		}
		.assign {
			flex-basis: 100%;
		}
	}
</style>
