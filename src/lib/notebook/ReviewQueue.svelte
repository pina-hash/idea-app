<script lang="ts">
	import Disclosure from '$lib/Disclosure.svelte';
	import { stampLabel, type ReviewResult, type SectionGrid } from '$lib/notebook-review';
	import {
		approveAction,
		cleanComments,
		queueDefaultSession,
		reviewQueue,
		sinceLabel,
		type QueueFilter
	} from '$lib/notebook/review-queue';

	/**
	 * REVIEW IN ONE PASS (ledger 0297, package F4b): one class day's entries
	 * that nobody has looked at, newest-since-your-last-look first, approved
	 * together with ONE specific next step chosen from the reviewer's own
	 * chips. `$lib/notebook/review-queue` is every rule; this renders it and
	 * runs the pass.
	 *
	 * IT IS THE REVIEW CONSOLE'S OWN WRITES, not a second verdict: an approval
	 * is 0121's acknowledgement, or 0118's resolve when a comment goes with it.
	 * Flagged entries never enter the queue (the grid is where a flag is read).
	 * A failure on one entry is named and the rest still land.
	 */
	let {
		grid,
		today,
		since,
		comments,
		onSaveComments = null,
		approve,
		onDone
	}: {
		grid: SectionGrid | null;
		/** The school day the grid was generated on (`laCalendarDay`). */
		today: string;
		/** When this reviewer last looked at this class, read before this visit stamped it. */
		since: string | null;
		comments: string[];
		/** Absent: the chips cannot be edited here (no preferences store). */
		onSaveComments?: ((list: string[]) => void) | null;
		approve: (entryId: string, comment: string | null) => Promise<ReviewResult>;
		onDone: () => void | Promise<void>;
	} = $props();

	// svelte-ignore state_referenced_locally
	let sessionId = $state<string | null>(queueDefaultSession(grid, today));
	// svelte-ignore state_referenced_locally
	let filter = $state<QueueFilter>(since ? 'new' : 'all');
	let comment = $state<string | null>(null);
	let skipped = $state<Record<string, true>>({});
	let running = $state(false);
	let progress = $state<string | null>(null);
	let result = $state<string | null>(null);
	let failures = $state<{ name: string; error: string }[]>([]);

	const sessions = $derived(
		[...(grid?.sessions ?? [])].sort((a, b) => b.session_date.localeCompare(a.session_date))
	);
	const rows = $derived(reviewQueue(grid, sessionId, since, filter));
	const newCount = $derived(reviewQueue(grid, sessionId, since, 'new').length);
	const allCount = $derived(reviewQueue(grid, sessionId, since, 'all').length);
	const chosen = $derived(rows.filter((r) => !skipped[r.entryId]));
	const sinceText = $derived(sinceLabel(since, new Date(grid?.generated_at ?? Date.now())));

	async function run() {
		if (running || !chosen.length) return;
		running = true;
		result = null;
		failures = [];
		const todo = [...chosen];
		const note = comment;
		let done = 0;
		try {
			for (const row of todo) {
				progress = `Approving ${done + 1} of ${todo.length}...`;
				let res: ReviewResult;
				try {
					res = await approve(row.entryId, note);
				} catch (err) {
					res = { ok: false, error: (err as Error)?.message || 'That did not reach the server.' };
				}
				if (res.ok) done++;
				else failures = [...failures, { name: row.student?.name ?? 'A student', error: res.error }];
			}
			result =
				done === todo.length
					? `Approved ${done}${note && approveAction(note) === 'resolve' ? ' with a next step' : ''}.`
					: `Approved ${done} of ${todo.length}.`;
			skipped = {};
			await onDone();
		} finally {
			running = false;
			progress = null;
		}
	}

	// ---- editing the chips -------------------------------------------------

	// svelte-ignore state_referenced_locally
	let draftComments = $state<string[]>([...comments]);
	let newComment = $state('');

	function saveComments(list: string[]) {
		const clean = cleanComments(list);
		draftComments = clean;
		if (comment && !clean.includes(comment)) comment = null;
		onSaveComments?.(clean);
	}
</script>

<section class="card rq" data-testid="review-queue" aria-labelledby="rq-head">
	<div class="rq-head">
		<h2 id="rq-head" class="rq-title">Approve a class day</h2>
		<label class="rq-field">
			<span>Check-in</span>
			<select bind:value={sessionId} data-testid="rq-session">
				{#each sessions as s (s.id)}
					<option value={s.id}>{s.session_label} · {s.session_date.slice(5).replace('-', '/')}</option>
				{/each}
			</select>
		</label>
	</div>

	<div class="rq-filters" role="group" aria-label="Which entries">
		{#if since}
			<button
				type="button"
				class="rq-chip tap-44"
				class:on={filter === 'new'}
				aria-pressed={filter === 'new'}
				data-testid="rq-filter-new"
				onclick={() => (filter = 'new')}>New since {sinceText} · {newCount}</button
			>
		{/if}
		<button
			type="button"
			class="rq-chip tap-44"
			class:on={filter === 'all'}
			aria-pressed={filter === 'all'}
			data-testid="rq-filter-all"
			onclick={() => (filter = 'all')}>Not reviewed · {allCount}</button
		>
	</div>

	{#if rows.length}
		<ul class="rq-rows" data-testid="rq-rows">
			{#each rows as row (row.entryId)}
				<li>
					<label class="rq-row tap-44" data-testid="rq-row">
						<input
							type="checkbox"
							checked={!skipped[row.entryId]}
							onchange={(e) => {
								const on = (e.currentTarget as HTMLInputElement).checked;
								const { [row.entryId]: _drop, ...rest } = skipped;
								skipped = on ? rest : { ...rest, [row.entryId]: true };
							}}
						/>
						<span class="rq-name">{row.student?.name ?? 'Student'}</span>
						<span class="rq-meta">
							{row.cell.upload_timestamp ? stampLabel(row.cell.upload_timestamp) : ''}
							{#if row.cell.status === 'pending_review'}{' · '}resubmitted{/if}
							{#if row.isNew && since}{' · '}<strong>new</strong>{/if}
						</span>
					</label>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rq-empty" data-testid="rq-empty">
			{filter === 'new' && allCount ? 'Nothing new since you last looked.' : 'Nothing here needs approving.'}
		</p>
	{/if}

	<fieldset class="rq-comments" data-testid="rq-comments">
		<legend>Next step for the student</legend>
		<div class="rq-chips">
			<label class="rq-chip tap-44" class:on={comment === null}>
				<input type="radio" name="rq-comment" checked={comment === null} onchange={() => (comment = null)} />
				None
			</label>
			{#each draftComments as c (c)}
				<label class="rq-chip tap-44" class:on={comment === c} data-testid="rq-comment-chip">
					<input type="radio" name="rq-comment" checked={comment === c} onchange={() => (comment = c)} />
					{c}
				</label>
			{/each}
		</div>
		{#if onSaveComments}
			<Disclosure label="Edit next steps" scope="notebook-review-queue:edit" collapseWhen={true}>
				<ul class="rq-edit">
					{#each draftComments as c, i (c)}
						<li>
							<input
								type="text"
								value={c}
								maxlength="200"
								aria-label="Next step {i + 1}"
								onchange={(e) => {
									const next = [...draftComments];
									next[i] = (e.currentTarget as HTMLInputElement).value;
									saveComments(next);
								}}
							/>
							<button
								type="button"
								class="btn secondary tight tap-44"
								onclick={() => saveComments(draftComments.filter((_, j) => j !== i))}>Remove</button
							>
						</li>
					{/each}
					<li>
						<input type="text" bind:value={newComment} maxlength="200" aria-label="New next step" placeholder="Add a next step" />
						<button
							type="button"
							class="btn secondary tight tap-44"
							disabled={!newComment.trim()}
							onclick={() => {
								saveComments([...draftComments, newComment]);
								newComment = '';
							}}>Add</button
						>
					</li>
				</ul>
			</Disclosure>
		{/if}
	</fieldset>

	<div class="rq-foot">
		<button
			type="button"
			class="btn tap-44"
			data-testid="rq-approve"
			aria-disabled={!chosen.length || running}
			onclick={run}
		>
			{running ? (progress ?? 'Approving...') : `Approve ${chosen.length}`}
		</button>
		{#if result}<span class="rq-result" role="status" data-testid="rq-result">{result}</span>{/if}
	</div>
	{#if failures.length}
		<ul class="rq-failures" role="alert">
			{#each failures as f, i (i)}
				<li>{f.name}: {f.error}</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.rq {
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.rq-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-2, 0.5rem);
	}
	.rq-title {
		margin: 0;
		font-size: 1.1rem;
	}
	.rq-title::before {
		content: none;
	}
	.rq-field {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 0.8rem;
		color: var(--text-2);
		min-width: 0;
	}
	.rq-field select {
		min-height: 44px;
		max-width: 100%;
	}
	.rq-filters,
	.rq-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.rq-chip {
		gap: 0.4em;
		padding: 0 0.8rem;
		border: 1px solid var(--boundary);
		border-radius: 999px;
		background: var(--surface-1);
		color: var(--text-1);
		font: inherit;
		cursor: pointer;
	}
	.rq-chip.on {
		border-color: var(--accent-ink, var(--green));
		background: var(--accent-fill, var(--surface-2));
		color: var(--accent-on-fill, var(--text-1));
		font-weight: 600;
	}
	.rq-chip input {
		margin: 0;
	}
	.rq-rows,
	.rq-edit,
	.rq-failures {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.rq-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		gap: var(--space-2, 0.5rem);
		width: 100%;
		border-bottom: 1px solid var(--hairline);
		cursor: pointer;
	}
	.rq-name {
		font-weight: 600;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.rq-meta {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
		white-space: nowrap;
	}
	.rq-empty {
		margin: 0;
		color: var(--text-2);
	}
	.rq-comments {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
	}
	.rq-comments legend {
		font-size: 0.85rem;
		color: var(--text-2);
		margin-bottom: var(--space-1, 0.25rem);
	}
	.rq-edit li {
		display: flex;
		gap: var(--space-2, 0.5rem);
		margin-top: var(--space-1, 0.25rem);
	}
	.rq-edit input {
		flex: 1;
		min-width: 0;
		min-height: 44px;
	}
	.rq-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	.rq-result {
		color: var(--status-ok, var(--green));
	}
	.rq-failures {
		color: var(--status-danger, var(--crimson));
	}
</style>
