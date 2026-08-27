<script lang="ts">
	import {
		EXCUSAL_NOTE_MAX,
		excusalBlockedReason,
		type ExcusalRow,
		type ExcusalTransports
	} from '$lib/notebook/admin-actions';

	/**
	 * EXCUSING ONE STUDENT FROM ONE CHECK-IN, FROM THE CELL THAT SHOWS IT.
	 *
	 * `excused` has been a first-class READ state since 0069 -- its own glyph
	 * and its own `--nb-cell-excused` token in the grid, its own branch in
	 * `checkInStatus`, its own line in the Documentation Check's coverage
	 * arithmetic, its own count on the People panel -- and it is what stops a
	 * check-in counting as outstanding. `notebook_admin_set_excusal` has been
	 * live and granted the whole time with nothing calling it, so every one of
	 * those read sites has been rendering a state no surface could produce.
	 *
	 * IT LIVES IN THE PANEL BESIDE THE GRID, NOT ON A SCREEN OF ITS OWN. The
	 * cursor already names a (student, check-in) pair, which is exactly the
	 * pair the RPC takes; a separate surface would mean picking both again from
	 * lists, twice, with the grid that prompted it no longer on screen. It
	 * renders under BOTH panel branches for the same reason: the common case is
	 * a cell with nothing filed, which is the empty-cell panel.
	 *
	 * THE NOTE IS THE POINT OF SURFACING IT AT ALL. `notebook_session_excusals.note`
	 * has existed since 0069 and has never been selected anywhere, so an excusal
	 * recorded in October is unexplainable in March. It is optional to write and
	 * always shown when it is there.
	 *
	 * ---------------------------------------------------------------------
	 * THE GATE IS THE FUNCTION, AND THIS COMPONENT IS THE PRESENTATION HALF.
	 *
	 * `notebook_admin_set_excusal` raises "Only a site admin can excuse notebook
	 * sessions." for anybody `is_admin()` refuses, and that is the boundary --
	 * it holds whatever this renders. What this does is not offer a control
	 * whose only possible outcome is that refusal: `transports.set` is ABSENT
	 * for a non-admin (the route hands it in on `isChair` alone), so there is no
	 * write to execute rather than a hidden one.
	 *
	 * READING IS THE WIDER TIER, and that asymmetry is deliberate rather than an
	 * oversight to correct here. 0098's SELECT policy on the table admits the
	 * SUBJECT and any manager of a section the check-in is posted to, so an
	 * instructor sees the excusal and its reason and simply has no control. The
	 * sentence below says who to ask -- an instructor left looking at a state
	 * they cannot change should not have to guess whether it is a bug.
	 */
	let {
		sessionId,
		studentId,
		studentName,
		sessionLabel,
		excused,
		excusal = null,
		transports,
		onDone
	}: {
		sessionId: string;
		/**
		 * NULL IS A REAL CASE, not a loading state: 0094's roster carries a
		 * student who has been enrolled and has never signed in, and they have no
		 * account for an excusal to hang off. See `excusalBlockedReason`.
		 */
		studentId: string | null;
		studentName: string;
		sessionLabel: string;
		/**
		 * THE GRID'S ANSWER, not this component's. `notebook_get_section_grid`
		 * adjudicates the cell, and a second idea of "is this excused" derived
		 * from whether a row came back in `excusal` is the thing that stops
		 * matching. The row below carries the NOTE and nothing else.
		 */
		excused: boolean;
		excusal?: ExcusalRow | null;
		transports: ExcusalTransports;
		/** The write landed; the console refetches the grid and the excusals. */
		onDone: () => void;
	} = $props();

	let note = $state('');
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	/** Two-step confirm on the REMOVE, which is the direction that loses a record. */
	let clearArmed = $state(false);
	let open = $state(false);

	const blocked = $derived(excusalBlockedReason(studentId));
	const canWrite = $derived(!!transports.set && !blocked);

	function when(iso: string | null): string {
		if (!iso) return '';
		const d = new Date(iso);
		return Number.isNaN(d.getTime())
			? ''
			: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
	}

	async function apply(next: boolean) {
		const set = transports.set;
		if (!set || !studentId || busy) return;
		// The remove is armed once before it fires: it deletes the row, and the
		// reason written on it goes with it.
		if (!next && !clearArmed) {
			clearArmed = true;
			return;
		}
		busy = true;
		errorMsg = null;
		try {
			const result = await set({
				sessionId,
				studentId,
				excused: next,
				// Sent as typed. The RPC trims and nulls an empty string itself, so
				// a second normalization here is a second rule that could drift.
				note: next ? note : null
			});
			if (!result.ok) {
				errorMsg = result.error;
				return;
			}
			note = '';
			clearArmed = false;
			open = false;
			onDone();
		} finally {
			// In `finally`: a throw mid-submit would otherwise disable the form
			// for as long as the panel stays open.
			busy = false;
		}
	}
</script>

<section class="excusal" data-testid="cell-excusal">
	<div class="state" data-testid="excusal-state">
		{#if excused}
			<span class="chip on" aria-hidden="true">E</span>
			<div class="state-text">
				<strong>Excused from {sessionLabel}</strong>
				{#if excusal?.excused_at}
					<span class="stamp">Recorded {when(excusal.excused_at)}</span>
				{/if}
				<!-- The whole reason this panel exists. A recorded excusal with no
				     reason says so rather than rendering an empty line: "nobody wrote
				     one down" and "the field was never read" look identical
				     otherwise, and they are what somebody is trying to tell apart. -->
				{#if excusal?.note}
					<span class="reason" data-testid="excusal-note">{excusal.note}</span>
				{:else}
					<span class="reason none" data-testid="excusal-note-empty">No reason was recorded.</span>
				{/if}
			</div>
		{:else}
			<span class="chip off" aria-hidden="true">·</span>
			<div class="state-text">
				<strong>Not excused</strong>
				<span class="reason none">This check-in counts as outstanding for {studentName}.</span>
			</div>
		{/if}
	</div>

	{#if blocked}
		<!-- A CONTROL THAT IS ABSENT FOR A REASON SAYS THE REASON. Every other row
		     in the grid offers this, so a row that silently lacked it reads as a
		     defect rather than as a rule. -->
		<p class="note" data-testid="excusal-blocked">{blocked}</p>
	{:else if !transports.set}
		<!-- The instructor tier: the read is theirs, the write is not. -->
		<p class="note" data-testid="excusal-readonly">
			Only a site admin can record or remove an excusal. Ask one to change this.
		</p>
	{:else if excused}
		<div class="form-actions">
			<button
				type="button"
				class="btn secondary tap-44"
				disabled={busy}
				data-testid="excusal-clear"
				onclick={() => apply(false)}
			>
				{busy ? 'Working...' : clearArmed ? 'Confirm remove' : 'Remove excusal'}
			</button>
			{#if clearArmed}
				<button
					type="button"
					class="btn secondary tap-44"
					disabled={busy}
					onclick={() => (clearArmed = false)}>Cancel</button
				>
			{/if}
		</div>
		{#if clearArmed}
			<p class="msg confirm" data-testid="excusal-clear-confirm">
				{studentName} will owe {sessionLabel} again, and the reason recorded with this excusal is
				deleted with it.
			</p>
		{/if}
	{:else if open}
		<div class="form">
			<label class="field">
				<span>Reason (optional, kept for the record)</span>
				<textarea
					bind:value={note}
					maxlength={EXCUSAL_NOTE_MAX}
					rows="2"
					data-testid="excusal-note-input"
					placeholder="Field trip, medical, approved absence..."
				></textarea>
			</label>
			<div class="form-actions">
				<button
					type="button"
					class="btn tap-44"
					disabled={busy}
					data-testid="excusal-set"
					onclick={() => apply(true)}
				>
					{busy ? 'Working...' : 'Record excusal'}
				</button>
				<button
					type="button"
					class="btn secondary tap-44"
					disabled={busy}
					onclick={() => {
						open = false;
						note = '';
					}}>Cancel</button
				>
			</div>
		</div>
	{:else}
		<div class="form-actions">
			<button
				type="button"
				class="btn secondary tap-44"
				data-testid="excusal-open"
				onclick={() => (open = true)}>Excuse from this check-in</button
			>
		</div>
	{/if}

	{#if errorMsg}<p class="msg error" role="alert" data-testid="excusal-error">{errorMsg}</p>{/if}
</section>

<style>
	/* Deliberately quieter than the verdict buttons above it: excusing is
	   bookkeeping, not a judgement on the work, and it sits in the same pane as
	   Accept and Flag. */
	.excusal {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	.state {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		/* min-width:0 on the text child, not here: a long reason is the thing
		   that would otherwise force the whole pane wider than the split. */
	}
	.state-text {
		display: grid;
		gap: 0.15rem;
		min-width: 0;
	}
	.state-text strong {
		font-size: 0.86rem;
		color: var(--text-1);
	}
	/* The grid's own excused treatment, quoted rather than reinvented: dashed
	   edge, the per-plate `--nb-cell-excused` ink. The six status colours are a
	   locked contract and this is a READ of one, not a seventh state. */
	.chip {
		flex: none;
		display: inline-grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-control);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		line-height: 1;
	}
	.chip.on {
		border: 1px dashed var(--nb-cell-excused);
		color: var(--nb-cell-excused);
	}
	.chip.off {
		border: 1px solid var(--boundary);
		color: var(--text-3);
	}
	.stamp {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.reason {
		font-size: 0.78rem;
		color: var(--text-1);
		overflow-wrap: anywhere;
	}
	.reason.none {
		color: var(--text-2);
	}
	.note {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.form {
		display: grid;
		gap: var(--space-2);
	}
	.field {
		display: grid;
		gap: 0.25rem;
	}
	.field span {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.field textarea {
		font: inherit;
		font-size: 0.82rem;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: var(--space-2);
		resize: vertical;
	}
	.form-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}
	.msg {
		margin: 0;
		font-size: 0.76rem;
	}
	.msg.confirm {
		color: var(--nb-warn);
	}
	.msg.error {
		color: var(--nb-error);
	}
</style>
