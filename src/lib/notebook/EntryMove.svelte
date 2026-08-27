<script lang="ts">
	import {
		MOVE_DETACH,
		entryMoveChanged,
		entryMovePayload,
		type EntryMoveTransports
	} from '$lib/notebook/admin-actions';
	import { sectionName, shortDate, sessionsInOrder } from '$lib/notebook-review';
	import type { GridSession, ReviewSection } from '$lib/notebook-review';

	/**
	 * MOVING AN ENTRY FILED AGAINST THE WRONG CHECK-IN OR THE WRONG CLASS.
	 *
	 * `notebook_admin_override_entry` takes NINE parameters and this renders
	 * TWO pickers. That is the whole design decision, so it is written down
	 * here rather than left to be rediscovered:
	 *
	 *   * Four of the nine (`custom_label`, `status`, `flag_reason`,
	 *     `instructor_comment`) restate verdicts this console already has real
	 *     controls for -- Flag, with its validated reason list; Clear flag;
	 *     Accept. Exposing them again would be a SECOND path to the same
	 *     decision, admin-only, with none of the surrounding rules, and no
	 *     reason for anybody to prefer it. A form that can do everything is a
	 *     form nobody can be sure what they just did with.
	 *   * The two `p_set_*` booleans are not user-facing at all: they are how
	 *     the RPC tells "leave this alone" apart from "write null here", which
	 *     `entryMovePayload` derives from what actually moved.
	 *
	 * What is left is the pair with NO other path anywhere in the codebase, and
	 * both are ordinary student mistakes rather than exotica: two classes share
	 * a check-in and the wrong one was tapped, or the row above the intended one
	 * was. Either leaves the grid telling an instructor something untrue about a
	 * student, and until now the only fix was to delete the entry and ask them
	 * to file it again.
	 *
	 * ADMIN ONLY, AND THE GATE IS `is_admin()` INSIDE THE FUNCTION. This
	 * component is handed no transport for a non-admin, so there is no write to
	 * execute; the RPC would raise "Only a site admin can override notebook
	 * entries." regardless of what any client renders.
	 *
	 * IT IS NOT A REVIEW. Sending no `p_status` is what makes the RPC leave
	 * `reviewed_by`/`reviewed_at` alone, so correcting where an entry sits never
	 * silently also records that somebody looked at it.
	 */
	let {
		entryId,
		currentSessionId,
		currentSectionId,
		studentName,
		sessions,
		sections,
		transports,
		onDone
	}: {
		entryId: string;
		currentSessionId: string | null;
		currentSectionId: string | null;
		studentName: string;
		/** The check-ins of the section being viewed: where an entry can move to. */
		sessions: GridSession[];
		/** Every section this viewer manages, from the console's own list. */
		sections: ReviewSection[];
		transports: EntryMoveTransports;
		onDone: () => void;
	} = $props();

	let open = $state(false);
	let busy = $state(false);
	let errorMsg = $state<string | null>(null);
	let notice = $state<string | null>(null);

	/**
	 * SEEDED FROM THE ENTRY, then owned by the pickers. `MOVE_DETACH` is the
	 * sentinel for "no check-in" -- a `<select>` value is a string, and the
	 * empty string is already what an unselected option carries, so detaching
	 * needs a value of its own or it cannot be told from not having chosen.
	 */
	// svelte-ignore state_referenced_locally
	let sessionChoice = $state(currentSessionId ?? MOVE_DETACH);
	// svelte-ignore state_referenced_locally
	let sectionChoice = $state(currentSectionId ?? '');

	const ordered = $derived(sessionsInOrder(sessions));

	const next = $derived({
		sessionId: sessionChoice === MOVE_DETACH ? null : sessionChoice,
		sectionId: sectionChoice === '' ? null : sectionChoice
	});
	const current = $derived({ sessionId: currentSessionId, sectionId: currentSectionId });

	/**
	 * ONE PREDICATE FOR THE BUTTON AND THE HANDLER. Two spellings of "is this
	 * ready to send" is what produces a click that does nothing -- and here the
	 * cost is worse than nothing: an unchanged send mints an audit row saying an
	 * admin moved an entry that did not move.
	 */
	const changed = $derived(entryMoveChanged(current, next));

	/**
	 * Re-seed when the console swaps the entry under this component. It is
	 * mounted inside the panel's `{#key entry.id}`, so this only ever fires on
	 * a LIVE reload of the same entry -- somebody else's write arriving over
	 * realtime -- where the stored ids genuinely moved and the pickers should
	 * follow rather than keep offering a move from a state that is gone.
	 */
	$effect(() => {
		const s = currentSessionId;
		const c = currentSectionId;
		if (!open) {
			sessionChoice = s ?? MOVE_DETACH;
			sectionChoice = c ?? '';
		}
	});

	async function submit() {
		if (busy || !changed) return;
		busy = true;
		errorMsg = null;
		notice = null;
		try {
			const result = await transports.move(entryMovePayload(entryId, current, next));
			if (!result.ok) {
				errorMsg = result.error;
				return;
			}
			// The acknowledgement renders HERE because the panel survives the act
			// it reports: a move keeps the entry, it only changes where it sits.
			notice = 'Moved. The grid has been re-read.';
			open = false;
			onDone();
		} finally {
			busy = false;
		}
	}
</script>

<div class="move" data-testid="entry-move">
	<button
		type="button"
		class="disclosure"
		aria-expanded={open}
		aria-controls="entry-move-body"
		onclick={() => (open = !open)}
	>
		<span class="caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
		Filed in the wrong place
	</button>
	<div id="entry-move-body" hidden={!open}>
		<p class="note">
			Moves {studentName}'s entry to a different check-in or a different class. Nothing about the
			entry itself changes: the pages, the notes, the status and the flag are untouched, and this
			does not count as reviewing it.
		</p>

		<label class="field">
			<span>Check-in</span>
			<select bind:value={sessionChoice} data-testid="move-session">
				<option value={MOVE_DETACH}>No check-in (a free entry in this class)</option>
				{#each ordered as s (s.id)}
					<option value={s.id}
						>{s.session_label} · U{s.unit_number} · {shortDate(s.session_date)}</option
					>
				{/each}
			</select>
		</label>

		<label class="field">
			<span>Class</span>
			<select bind:value={sectionChoice} data-testid="move-section">
				<option value="">No class</option>
				{#each sections as s (s.id)}
					<option value={s.id}>{sectionName(s)}</option>
				{/each}
			</select>
		</label>

		<!-- WHY THE CLASS PICKER CAN BE OVERRULED, said rather than left to
		     surprise somebody: re-pointing the check-in makes the RPC re-resolve
		     the class through `_notebook_resolve_session_section`, which keeps the
		     entry's current one when the new check-in still runs there and
		     otherwise picks the one that fits. So the answer that lands is the
		     one the database worked out, and the grid is re-read to show it. -->
		<p class="note fine">
			Moving to a different check-in may also change the class, because an entry has to sit in a
			class the check-in actually runs in.
		</p>

		<div class="form-actions">
			<button
				type="button"
				class="btn tap-44"
				aria-disabled={!changed || busy}
				data-testid="move-apply"
				onclick={submit}
			>
				{busy ? 'Moving...' : 'Move entry'}
			</button>
		</div>
		{#if !changed}
			<!-- `aria-disabled`, never `disabled`: a genuinely disabled control
			     swallows pointer events and can never explain itself. -->
			<p class="note" data-testid="move-unchanged">
				Both pickers still read where this entry already is, so there is nothing to move.
			</p>
		{/if}
		{#if errorMsg}<p class="msg error" role="alert" data-testid="move-error">{errorMsg}</p>{/if}
	</div>
	{#if notice}<p class="msg ok" data-testid="move-notice">{notice}</p>{/if}
</div>

<style>
	.move {
		display: grid;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
		background: var(--surface-2);
	}
	/* The same disclosure treatment the panel's other foldaways use. A real
	   <button> with aria-expanded/aria-controls, per the disclosure rule. */
	.disclosure {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 44px;
		padding: 0;
		background: none;
		border: 0;
		font-family: var(--font-mono);
		font-size: 0.76rem;
		color: var(--text-2);
		text-align: left;
		cursor: pointer;
	}
	.disclosure:hover {
		color: var(--text-1);
	}
	.caret {
		font-size: 0.7rem;
	}
	.note {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.note.fine {
		font-size: 0.72rem;
		color: var(--text-3);
	}
	.field {
		display: grid;
		gap: 0.25rem;
		margin-block: var(--space-2);
		min-width: 0;
	}
	.field span {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--text-2);
	}
	.field select {
		font: inherit;
		font-size: 0.82rem;
		min-height: 44px;
		max-width: 100%;
		color: var(--text-1);
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control);
		padding: 0 var(--space-2);
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
	.msg.error {
		color: var(--nb-error);
	}
	.msg.ok {
		color: var(--nb-ok);
	}
	[aria-disabled='true'] {
		opacity: 0.55;
		cursor: not-allowed;
	}
</style>
