<script lang="ts">
	import {
		shuffled,
		type DrillBank,
		type DrillItem,
		type DrillOrderItem,
		type DrillMatchItem,
		type DrillPickItem
	} from '$lib/frc/drill-banks';

	/**
	 * Interactive scored drill for a unit with a drill bank (MDM-1, 2, 3, 9, 10):
	 * order (arrange a shuffled sequence), match (pair a shuffled right column to
	 * the left column), and pick (a scenario choice with immediate feedback).
	 * Every type supports check -> see what's right/wrong -> retry (editing
	 * invalidates the last check and re-enables it), which is what makes this a
	 * DRILL and not a quiz.
	 *
	 * Readiness is scored on FIRST-TRY correctness only: `firstTryCorrect` locks
	 * in the moment an item is checked/selected for the first time in this run,
	 * and retries afterward never raise it (they only help the student learn).
	 * At or above `bank.readinessPass`, "Continue to quiz" unlocks the Quiz
	 * phase; below it, the Quiz stays locked and the student is offered a Brief
	 * review or a fresh redo (`resetDrill`, reshuffles and rescores everything).
	 * There is deliberately no "continue anyway" for these five units — unlike
	 * the write-from-memory FrcDrillPhase used by units with no bank, only a
	 * qualifying score unlocks the Quiz here.
	 *
	 * Entirely client-side, per-mount, never persisted; resets on `unit`
	 * changing reference (a real navigation to a different unit).
	 */
	let {
		unit,
		bank,
		onContinue,
		onReviewBrief
	}: {
		unit: { id: string };
		bank: DrillBank;
		onContinue: () => void;
		onReviewBrief: () => void;
	} = $props();

	interface OrderState {
		type: 'order';
		arrangement: string[];
		result: boolean[] | null;
		attempted: boolean;
		firstTryCorrect: boolean | null;
	}
	interface MatchState {
		type: 'match';
		/** Shuffled right options, each carrying its original (correct) index. */
		rightOptions: { label: string; origIndex: number }[];
		/** Per left row: the chosen right item's ORIGINAL index. */
		assignment: (number | null)[];
		result: boolean[] | null;
		attempted: boolean;
		firstTryCorrect: boolean | null;
	}
	interface PickState {
		type: 'pick';
		selected: number | null;
		attempted: boolean;
		firstTryCorrect: boolean | null;
	}
	type ItemState = OrderState | MatchState | PickState;

	function asOrder(s: ItemState): OrderState {
		return s as OrderState;
	}
	function asMatch(s: ItemState): MatchState {
		return s as MatchState;
	}
	function asPick(s: ItemState): PickState {
		return s as PickState;
	}

	function buildState(item: DrillItem): ItemState {
		if (item.type === 'order') {
			return { type: 'order', arrangement: shuffled(item.sequence), result: null, attempted: false, firstTryCorrect: null };
		}
		if (item.type === 'match') {
			const rightOptions = shuffled(item.right.map((label, origIndex) => ({ label, origIndex })));
			return {
				type: 'match',
				rightOptions,
				assignment: Array(item.left.length).fill(null),
				result: null,
				attempted: false,
				firstTryCorrect: null
			};
		}
		return { type: 'pick', selected: null, attempted: false, firstTryCorrect: null };
	}

	let states = $state<ItemState[]>(bank.items.map(buildState));

	$effect(() => {
		unit.id; // reset on a real navigation to a different unit
		bank; // and if the bank itself changes (defensive; doesn't happen mid-unit)
		states = bank.items.map(buildState);
	});

	/** Redo the drill fresh: reshuffles order/match content and clears all scoring. */
	function resetDrill() {
		states = bank.items.map(buildState);
	}

	const total = $derived(bank.items.length);
	const allAttempted = $derived(total > 0 && states.every((s) => s.attempted));
	const firstTryCount = $derived(states.filter((s) => s.firstTryCorrect === true).length);
	const readinessPercent = $derived(total > 0 ? Math.round((100 * firstTryCount) / total) : 100);
	const ready = $derived(readinessPercent >= bank.readinessPass);

	// ---- order ----
	function moveOrder(i: number, idx: number, dir: -1 | 1) {
		const s = asOrder(states[i]);
		const j = idx + dir;
		if (j < 0 || j >= s.arrangement.length) return;
		const arrangement = s.arrangement.slice();
		[arrangement[idx], arrangement[j]] = [arrangement[j], arrangement[idx]];
		states[i] = { ...s, arrangement, result: null };
	}
	function checkOrder(i: number, item: DrillOrderItem) {
		const s = asOrder(states[i]);
		const result = s.arrangement.map((v, idx) => v === item.sequence[idx]);
		const firstTryCorrect = s.attempted ? s.firstTryCorrect : result.every(Boolean);
		states[i] = { ...s, result, attempted: true, firstTryCorrect };
	}

	// ---- match ----
	function setAssignment(i: number, leftIdx: number, origIndex: number) {
		const s = asMatch(states[i]);
		const assignment = s.assignment.slice();
		assignment[leftIdx] = origIndex;
		states[i] = { ...s, assignment, result: null };
	}
	function checkMatch(i: number) {
		const s = asMatch(states[i]);
		const result = s.assignment.map((v, idx) => v === idx);
		const firstTryCorrect = s.attempted ? s.firstTryCorrect : result.every(Boolean);
		states[i] = { ...s, result, attempted: true, firstTryCorrect };
	}

	// ---- pick ----
	function selectPick(i: number, item: DrillPickItem, idx: number) {
		const s = asPick(states[i]);
		const firstTryCorrect = s.attempted ? s.firstTryCorrect : idx === item.answer;
		states[i] = { ...s, selected: idx, attempted: true, firstTryCorrect };
	}
</script>

<p class="di-progress">{states.filter((s) => s.attempted).length} of {total} checked</p>
<ol class="di-list">
	{#each bank.items as item, i (item.id)}
		<li class="di-item">
			<span class="di-prompt">{item.prompt}</span>

			{#if item.type === 'order'}
				{@const os = asOrder(states[i])}
				{@const solved = !!os.result?.every(Boolean)}
				<ol class="di-order">
					{#each os.arrangement as label, idx (label)}
						<li class="di-order-row" class:correct={os.result?.[idx] === true} class:incorrect={os.result?.[idx] === false}>
							<span class="di-order-pos">{idx + 1}</span>
							<span class="di-order-label">{label}</span>
							{#if !solved}
								<span class="di-order-controls">
									<button type="button" class="di-move" disabled={idx === 0} onclick={() => moveOrder(i, idx, -1)} aria-label="Move up">
										&uarr;
									</button>
									<button
										type="button"
										class="di-move"
										disabled={idx === os.arrangement.length - 1}
										onclick={() => moveOrder(i, idx, 1)}
										aria-label="Move down"
									>
										&darr;
									</button>
								</span>
							{/if}
						</li>
					{/each}
				</ol>
				{#if os.result === null}
					<button class="di-check" type="button" onclick={() => checkOrder(i, item)}>Check order</button>
				{:else if solved}
					<p class="di-feedback correct">All in the right spot.</p>
				{:else}
					<p class="di-feedback incorrect">
						Not quite &mdash; the highlighted rows are out of place. Adjust and check again.
					</p>
				{/if}
			{:else if item.type === 'match'}
				{@const ms = asMatch(states[i])}
				{@const solved = !!ms.result?.every(Boolean)}
				<div class="di-match">
					{#each item.left as leftLabel, leftIdx (leftLabel)}
						<div class="di-match-row" class:correct={ms.result?.[leftIdx] === true} class:incorrect={ms.result?.[leftIdx] === false}>
							<span class="di-match-left">{leftLabel}</span>
							<select
								class="di-match-select"
								value={ms.assignment[leftIdx] ?? ''}
								disabled={solved}
								onchange={(e) => setAssignment(i, leftIdx, Number(e.currentTarget.value))}
							>
								<option value="" disabled>Choose a match&hellip;</option>
								{#each ms.rightOptions as opt (opt.origIndex)}
									<option value={opt.origIndex}>{opt.label}</option>
								{/each}
							</select>
						</div>
					{/each}
				</div>
				{#if ms.result === null}
					<button class="di-check" type="button" disabled={ms.assignment.some((a) => a === null)} onclick={() => checkMatch(i)}>
						Check pairs
					</button>
				{:else if solved}
					<p class="di-feedback correct">All paired correctly.</p>
				{:else}
					<p class="di-feedback incorrect">
						Not quite &mdash; the highlighted rows are mismatched. Adjust and check again.
					</p>
				{/if}
			{:else}
				{@const ps = asPick(states[i])}
				<div class="di-pick">
					{#each item.options as opt, idx (opt)}
						<label
							class="di-pick-opt"
							class:selected={ps.selected === idx}
							class:correct={ps.selected !== null && idx === item.answer}
							class:incorrect={ps.selected === idx && idx !== item.answer}
						>
							<input type="radio" name="di-pick-{item.id}" checked={ps.selected === idx} onchange={() => selectPick(i, item, idx)} />
							<span>{opt}</span>
						</label>
					{/each}
				</div>
				{#if ps.selected !== null}
					<p class="di-feedback {ps.selected === item.answer ? 'correct' : 'incorrect'}">
						<strong>{ps.selected === item.answer ? 'Correct.' : 'Not quite.'}</strong>
						{item.feedback}
					</p>
				{/if}
			{/if}
		</li>
	{/each}
</ol>

{#if allAttempted}
	<div class="frc-card drill-summary">
		<p class="summary-lead">
			<strong>{readinessPercent}% ready</strong>
			({firstTryCount} of {total} correct on the first try; pass at {bank.readinessPass}%).
		</p>
		{#if ready}
			<p class="summary-lead">You're ready for the quiz.</p>
			<div class="summary-actions">
				<button class="summary-btn primary" type="button" onclick={onContinue}>Continue to quiz &rsaquo;</button>
			</div>
		{:else}
			<p class="summary-lead">Not ready yet &mdash; take another look at the Brief.</p>
			<div class="summary-actions">
				<button class="summary-btn" type="button" onclick={onReviewBrief}>&lsaquo; Review the Brief</button>
				<button class="summary-btn primary" type="button" onclick={resetDrill}>Redo the drill</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.di-progress {
		margin: -0.3rem 0 0.9rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--frc-gray, #9a989a);
	}
	.di-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	.di-item {
		padding-bottom: 1.2rem;
		border-bottom: 1px solid var(--frc-line, #dde1e8);
	}
	.di-item:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}
	.di-prompt {
		display: block;
		margin-bottom: 0.6rem;
		color: var(--frc-ink, #231f20);
		font-weight: 500;
		line-height: 1.5;
	}
	/* order */
	.di-order {
		margin: 0 0 0.7rem;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.di-order-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
	}
	.di-order-row.correct {
		border-color: var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
		background: var(--frc-achieve-tint, rgba(0, 255, 65, 0.14));
	}
	.di-order-row.incorrect {
		border-color: rgba(237, 28, 36, 0.4);
		background: rgba(237, 28, 36, 0.06);
	}
	.di-order-pos {
		flex-shrink: 0;
		width: 1.4rem;
		font-weight: 700;
		font-style: italic;
		color: var(--frc-blue, #0066b3);
	}
	.di-order-label {
		flex: 1;
		font-size: 0.92rem;
		color: var(--frc-ink, #231f20);
	}
	.di-order-controls {
		display: flex;
		gap: 0.3rem;
		flex-shrink: 0;
	}
	.di-move {
		font-family: inherit;
		font-size: 0.82rem;
		line-height: 1;
		width: 1.8rem;
		height: 1.8rem;
		color: var(--frc-blue, #0066b3);
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-blue-line, rgba(0, 102, 179, 0.35));
		border-radius: 4px;
		cursor: pointer;
	}
	.di-move:hover:not(:disabled) {
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
	}
	.di-move:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	/* match */
	.di-match {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.7rem;
	}
	.di-match-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
	}
	.di-match-row.correct {
		border-color: var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
		background: var(--frc-achieve-tint, rgba(0, 255, 65, 0.14));
	}
	.di-match-row.incorrect {
		border-color: rgba(237, 28, 36, 0.4);
		background: rgba(237, 28, 36, 0.06);
	}
	.di-match-left {
		flex: 1;
		font-size: 0.92rem;
		font-weight: 500;
		color: var(--frc-ink, #231f20);
	}
	.di-match-select {
		flex: 1;
		font-family: inherit;
		font-size: 0.88rem;
		color: var(--frc-ink, #231f20);
		background: #fff;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		padding: 0.4rem 0.5rem;
	}
	.di-match-select:disabled {
		opacity: 0.7;
	}
	/* pick */
	.di-pick {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.di-pick-opt {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--frc-line, #dde1e8);
		border-radius: 6px;
		background: var(--frc-surface, #fafbfd);
		cursor: pointer;
		font-size: 0.92rem;
		line-height: 1.45;
		color: #333133;
	}
	.di-pick-opt:hover {
		border-color: var(--frc-blue-line, rgba(0, 102, 179, 0.35));
	}
	.di-pick-opt.selected {
		border-color: var(--frc-blue, #0066b3);
	}
	.di-pick-opt.correct {
		border-color: var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
		background: var(--frc-achieve-tint, rgba(0, 255, 65, 0.14));
	}
	.di-pick-opt.incorrect {
		border-color: rgba(237, 28, 36, 0.4);
		background: rgba(237, 28, 36, 0.06);
	}
	.di-pick-opt input {
		margin-top: 0.2rem;
		accent-color: var(--frc-blue, #0066b3);
	}
	/* shared check button + feedback */
	.di-check {
		font-family: inherit;
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		background: var(--frc-blue, #0066b3);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.4rem 0.85rem;
		cursor: pointer;
	}
	.di-check:hover:not(:disabled) {
		background: var(--frc-blue-deep, #004f8a);
	}
	.di-check:disabled {
		background: none;
		color: var(--frc-gray, #9a989a);
		border-color: var(--frc-line, #dde1e8);
		cursor: not-allowed;
	}
	.di-feedback {
		margin: 0;
		padding: 0.6rem 0.8rem;
		border-radius: 0 8px 8px 0;
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.di-feedback.correct {
		border-left: 4px solid var(--frc-achieve-line, rgba(0, 200, 60, 0.55));
		background: var(--frc-achieve-tint, rgba(0, 255, 65, 0.14));
		color: var(--frc-ink, #231f20);
	}
	.di-feedback.incorrect {
		border-left: 4px solid rgba(237, 28, 36, 0.5);
		background: rgba(237, 28, 36, 0.06);
		color: var(--frc-ink, #231f20);
	}
	/* readiness summary: matches FrcDrillPhase's for a consistent look */
	.drill-summary {
		margin-top: 1.3rem;
		padding: 1rem 1.1rem;
		border-left: 4px solid var(--frc-blue, #0066b3);
	}
	.summary-lead {
		margin: 0 0 0.8rem;
		color: #333133;
		line-height: 1.6;
	}
	.summary-lead:last-of-type {
		margin-bottom: 0.8rem;
	}
	.summary-lead strong {
		color: var(--frc-ink, #231f20);
	}
	.summary-actions {
		display: flex;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.summary-btn {
		display: inline-block;
		font-family: inherit;
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.02em;
		color: var(--frc-blue, #0066b3);
		background: var(--frc-surface, #fafbfd);
		border: 1px solid var(--frc-blue, #0066b3);
		border-radius: 6px;
		padding: 0.5rem 0.9rem;
		cursor: pointer;
	}
	.summary-btn:hover {
		background: var(--frc-blue-tint, rgba(0, 102, 179, 0.08));
	}
	.summary-btn.primary {
		color: #fff;
		background: var(--frc-blue, #0066b3);
	}
	.summary-btn.primary:hover {
		background: var(--frc-blue-deep, #004f8a);
	}
</style>
