<script lang="ts">
	import {
		criterionIncomplete,
		criterionIssues,
		criterionMax,
		MAX_LEVELS,
		MIN_LEVELS,
		rubricFromSpec,
		rubricTotal,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type RubricCriterion,
		type RubricLevel
	} from '$lib/classroom/assignment-spec';

	/**
	 * The rubric builder: ordered criteria, each an ordered list of LEVELS with
	 * points, a short label and a descriptor. Saved as ONE full-set replacement
	 * through classroom_set_rubric (validated and stamped in SQL); for a
	 * spec-driven assignment "Generate from spec" carries the authored levels
	 * through, which are then ordinary editable rows -- generation is a starting
	 * point, never a lock.
	 *
	 * THE TOP LEVEL IS THE MAXIMUM. There is deliberately no separate "criterion
	 * points" field to keep in step with it: the server re-derives `points` from
	 * levels[0] on every save, so a second input could only ever disagree.
	 *
	 * A criterion that does not yet satisfy the constraints (three or four
	 * levels, top = maximum, bottom = 0, strictly descending, every level
	 * labelled and described) is saveable but flagged UNFINISHED, here and
	 * everywhere it is rendered. That is what the flat-to-leveled migration
	 * produces, and it must be visible rather than silent.
	 */
	let {
		itemId,
		criteria = null,
		spec = null,
		transports,
		onchanged = null
	}: {
		itemId: string;
		criteria: RubricCriterion[] | null;
		spec: AssignmentSpec | null;
		transports: AssignmentTeacherTransports;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let editing = $state(false);
	let rows = $state<RubricCriterion[]>([]);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let notice = $state<string | null>(null);
	let armRemove = $state(false);
	let nextId = $state(1);

	const total = $derived(rubricTotal(rows));
	const unfinished = $derived(rows.filter((r) => criterionIssues(r).length > 0).length);
	const savedUnfinished = $derived((criteria ?? []).filter(criterionIncomplete).length);

	function blankCriterion(): RubricCriterion {
		nextId += 1;
		return {
			id: `c${Date.now().toString(36)}-${nextId}`,
			criterion: '',
			points: 10,
			levels: [
				{ points: 10, label: 'Complete', descriptor: '' },
				{ points: 6, label: 'Developing', descriptor: '' },
				{ points: 0, label: 'Absent', descriptor: '' }
			]
		};
	}

	function startEdit(from: RubricCriterion[]) {
		rows = structuredClone($state.snapshot(from) as RubricCriterion[]).map((r) => ({
			...r,
			levels: r.levels ?? []
		}));
		editing = true;
		error = null;
		notice = null;
	}

	function addRow() {
		rows = [...rows, blankCriterion()];
	}

	function removeRow(index: number) {
		rows = rows.filter((_, i) => i !== index);
	}

	function moveRow(index: number, direction: -1 | 1) {
		const target = index + direction;
		if (target < 0 || target >= rows.length) return;
		const next = [...rows];
		[next[index], next[target]] = [next[target], next[index]];
		rows = next;
	}

	/** Keeps `points` (the criterion maximum) in step with the top level. */
	function syncMax(index: number) {
		rows[index] = { ...rows[index], points: criterionMax(rows[index]) };
	}

	/**
	 * Adds the next level DOWN, keeping the set descending without hand-editing.
	 * Where it goes depends on whether the criterion already has a bottom:
	 *   * bottom is 0 -> slot in ABOVE it, at the midpoint (the fresh-criterion
	 *     case, where the ladder is already closed).
	 *   * no zero yet -> APPEND below, and close at 0 once there are two levels
	 *     already (the MIGRATED case, which starts as a lone top level -- an
	 *     insert-above there would push the author's own top level down a rung).
	 */
	function addLevel(index: number) {
		const levels = rows[index].levels ?? [];
		if (levels.length >= MAX_LEVELS) return;
		const last = levels[levels.length - 1];
		const closed = levels.length > 0 && Number(last?.points) === 0;
		const blank = (points: number): RubricLevel => ({
			points: Math.max(0, points),
			label: '',
			descriptor: ''
		});
		if (!levels.length) {
			rows[index] = { ...rows[index], levels: [blank(criterionMax(rows[index]))] };
			return;
		}
		if (!closed) {
			const next = levels.length >= 2 ? 0 : Math.round(Number(last.points) / 2);
			rows[index] = { ...rows[index], levels: [...levels, blank(next)] };
			return;
		}
		const above = levels[levels.length - 2];
		const cut = levels.length - 1;
		const next = blank(Math.round(Number(above?.points ?? levels[0].points) / 2));
		rows[index] = { ...rows[index], levels: [...levels.slice(0, cut), next, ...levels.slice(cut)] };
	}

	function removeLevel(index: number, li: number) {
		const levels = (rows[index].levels ?? []).filter((_, i) => i !== li);
		rows[index] = { ...rows[index], levels };
		syncMax(index);
	}

	function generate() {
		if (!spec) return;
		startEdit(rubricFromSpec(spec, criteria));
		notice = 'Generated from the spec’s leveled criteria -- edit freely, then save.';
	}

	async function save() {
		error = null;
		if (!rows.length) {
			error = 'Add at least one criterion.';
			return;
		}
		for (const row of rows) {
			if (!row.criterion.trim()) {
				error = 'Every criterion needs text.';
				return;
			}
			if (!row.levels?.length) {
				error = `"${row.criterion.trim()}" needs at least one level.`;
				return;
			}
		}
		busy = true;
		try {
			const payload = rows.map((r) => ({
				...r,
				criterion: r.criterion.trim(),
				points: criterionMax(r),
				levels: (r.levels ?? []).map((l) => ({
					points: Number(l.points) || 0,
					label: l.label.trim(),
					descriptor: l.descriptor?.trim() ?? '',
					// KEPT, not dropped. Generating from the spec carries the authored
					// short form in; re-listing the fields here without it would throw
					// it away one step later, which is the same defect one level in.
					...(l.short?.trim() ? { short: l.short.trim() } : {})
				}))
			}));
			const res = await transports.setRubric(itemId, payload as RubricCriterion[]);
			if (!res.ok) {
				error = res.message;
				return;
			}
			editing = false;
			notice = unfinished
				? `Rubric saved with ${unfinished} criteri${unfinished === 1 ? 'on' : 'a'} still unfinished.`
				: 'Rubric saved. Students can see it on the assignment.';
			await onchanged?.();
		} finally {
			// IN A `finally`: a throw anywhere above (a transport that rejects rather
			// than resolving `{ok:false}`, a refresh that fails) otherwise left every
			// control on this panel disabled with no way back but a reload.
			busy = false;
		}
	}

	async function removeRubric() {
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;
		busy = true;
		try {
			const res = await transports.setRubric(itemId, null);
			if (!res.ok) {
				error = res.message;
				return;
			}
			notice = 'Rubric removed.';
			await onchanged?.();
		} finally {
			busy = false;
		}
	}
</script>

<div class="rubric-builder">
	{#if !editing}
		<p class="line" class:none={!criteria?.length}>
			{#if criteria?.length}
				Rubric: {criteria.length} criteri{criteria.length === 1 ? 'on' : 'a'},
				{rubricTotal(criteria)} pts total.
			{:else}
				No rubric yet -- grading needs one.
			{/if}
		</p>
		{#if savedUnfinished}
			<p class="warn-line">
				{savedUnfinished} criteri{savedUnfinished === 1 ? 'on' : 'a'} still needs its levels written.
				Until then a grader has to override to reach most scores.
			</p>
		{/if}
		<span class="actions">
			<button
				type="button"
				class="btn secondary tiny"
				onclick={() => startEdit(criteria?.length ? criteria : [blankCriterion()])}
			>
				{criteria?.length ? 'Edit rubric' : 'Build rubric'}
			</button>
			{#if spec}
				<button type="button" class="btn secondary tiny" onclick={generate}>Generate from spec</button>
			{/if}
			{#if criteria?.length}
				<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={removeRubric}>
					{armRemove ? 'Really remove?' : 'Remove'}
				</button>
			{/if}
		</span>
	{:else}
		<div class="editor">
			<p class="rule">
				Each criterion needs {MIN_LEVELS} or {MAX_LEVELS} levels. The top level is the
				criterion maximum, the bottom level is 0, and each level is worth less than the one
				above it.
			</p>
			{#each rows as row, i (row.id)}
				{@const issues = criterionIssues(row)}
				<div class="crit-row" class:unfinished={issues.length > 0}>
					<div class="crit-main">
						<input
							type="text"
							class="crit-text"
							placeholder="Criterion"
							bind:value={row.criterion}
						/>
						<span class="crit-max">max {criterionMax(row)}</span>
						<span class="crit-ops">
							<button type="button" title="Move up" onclick={() => moveRow(i, -1)} disabled={i === 0}>↑</button>
							<button type="button" title="Move down" onclick={() => moveRow(i, 1)} disabled={i === rows.length - 1}>↓</button>
							<button type="button" title="Remove criterion" onclick={() => removeRow(i)}>✕</button>
						</span>
					</div>
					{#each row.levels ?? [] as level, li (li)}
						<div class="level-row">
							<input
								type="number"
								class="level-points"
								min="0"
								max="1000"
								step="0.5"
								bind:value={level.points}
								oninput={() => syncMax(i)}
								aria-label={`Level ${li + 1} points`}
							/>
							<input
								type="text"
								class="level-label"
								placeholder="Label (e.g. Complete)"
								bind:value={level.label}
								aria-label={`Level ${li + 1} label`}
							/>
							<input
								type="text"
								class="level-desc"
								placeholder="What this level looks like"
								bind:value={level.descriptor}
								aria-label={`Level ${li + 1} descriptor`}
							/>
							<button
								type="button"
								class="level-remove"
								title="Remove level"
								aria-label={`Remove level ${li + 1}`}
								onclick={() => removeLevel(i, li)}>✕</button
							>
						</div>
					{/each}
					{#if (row.levels?.length ?? 0) < MAX_LEVELS}
						<button type="button" class="add-level" onclick={() => addLevel(i)}>+ level</button>
					{/if}
					{#if issues.length}
						<p class="issues">{issues.join(' ')}</p>
					{/if}
				</div>
			{/each}
			<span class="actions">
				<button type="button" class="btn secondary tiny" onclick={addRow}>Add criterion</button>
				<span class="total">Total: {total} pts</span>
			</span>
			{#if unfinished}
				<p class="warn-line">
					{unfinished} criteri{unfinished === 1 ? 'on is' : 'a are'} unfinished. You can save and
					come back -- they stay flagged for you and for students until the levels are written.
				</p>
			{/if}
			<span class="actions">
				<button type="button" class="btn tiny" disabled={busy} onclick={save}>Save rubric</button>
				<button type="button" class="btn secondary tiny" onclick={() => (editing = false)}>Cancel</button>
			</span>
		</div>
	{/if}
	{#if error}<p class="feedback error">{error}</p>{/if}
	{#if notice && !editing}<p class="feedback ok">{notice}</p>{/if}
</div>

<style>
	.rubric-builder {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.line {
		margin: 0;
		font-size: 0.88rem;
	}
	.line.none {
		color: var(--text-2);
	}
	.rule {
		margin: 0;
		font-size: 0.76rem;
		color: var(--text-2);
	}
	.warn-line {
		margin: 0;
		font-size: 0.78rem;
		color: var(--amber);
	}
	.actions {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.crit-row {
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		padding: 0.45rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.crit-row.unfinished {
		border-color: var(--amber);
	}
	.crit-main {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.crit-text {
		flex: 1 1 12rem;
		min-width: 0;
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.9rem;
		padding: 0.3rem 0.45rem;
	}
	.crit-max {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--gold);
		white-space: nowrap;
	}
	.crit-ops {
		display: flex;
		gap: 0.15rem;
	}
	.crit-ops button {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-2);
		font-size: 0.7rem;
		width: 1.75rem;
		height: 1.75rem;
		cursor: pointer;
	}
	.crit-ops button:hover:not(:disabled) {
		color: var(--text-1);
		border-color: var(--line-strong);
	}
	.crit-ops button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.level-row {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.level-points {
		width: 4rem;
		color: var(--gold) !important;
		font-family: var(--font-mono) !important;
	}
	.level-label {
		flex: 0 1 9rem;
		min-width: 6rem;
	}
	.level-desc {
		flex: 3 1 14rem;
		min-width: 0;
	}
	.level-row input {
		background: var(--surface-0);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.82rem;
		padding: 0.3rem 0.4rem;
	}
	.level-remove {
		appearance: none;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-card);
		color: var(--text-2);
		cursor: pointer;
		font-size: 0.7rem;
		width: 1.75rem;
		height: 1.75rem;
	}
	.level-remove:hover {
		color: var(--crimson);
	}
	.add-level {
		appearance: none;
		background: none;
		border: none;
		color: var(--cyan);
		font-family: var(--font-mono);
		font-size: 0.64rem;
		text-align: left;
		cursor: pointer;
		padding: 0.2rem 0;
	}
	.issues {
		margin: 0;
		font-size: 0.72rem;
		color: var(--amber);
	}
	.total {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--gold);
	}
	@media (max-width: 640px) {
		.level-label,
		.level-desc {
			flex: 1 1 100%;
		}
		/* Real touch targets on a phone; the desktop layout keeps the compact
		   squares, which are pointer-sized already. */
		.crit-ops button,
		.level-remove {
			width: 2.75rem;
			height: 2.75rem;
		}
	}
</style>
