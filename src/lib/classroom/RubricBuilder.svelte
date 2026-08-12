<script lang="ts">
	import {
		rubricFromSpec,
		rubricTotal,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';

	/**
	 * The rubric builder: ordered criteria, each with points and optional
	 * leveled descriptors. Saved as ONE full-set replacement through
	 * classroom_set_rubric (validated in SQL); for a spec-driven assignment
	 * "Generate from spec" flattens the module rubrics into criteria, which are
	 * then ordinary editable rows -- generation is a starting point, never a
	 * lock.
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

	function startEdit(from: RubricCriterion[]) {
		rows = structuredClone($state.snapshot(from) as RubricCriterion[]);
		editing = true;
		error = null;
		notice = null;
	}

	function freshId(): string {
		nextId += 1;
		return `c${Date.now().toString(36)}-${nextId}`;
	}

	function addRow() {
		rows = [...rows, { id: freshId(), criterion: '', points: 5 }];
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

	function addLevel(index: number) {
		const levels = rows[index].levels ?? [];
		rows[index] = { ...rows[index], levels: [...levels, { label: '', description: '' }] };
	}

	function removeLevel(index: number, li: number) {
		const levels = (rows[index].levels ?? []).filter((_, i) => i !== li);
		rows[index] = { ...rows[index], levels: levels.length ? levels : undefined };
	}

	function generate() {
		if (!spec) return;
		startEdit(rubricFromSpec(spec));
		notice = 'Generated from the spec’s module rubrics -- edit freely, then save.';
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
			if (!(row.points >= 0)) {
				error = 'Every criterion needs points (0 or more).';
				return;
			}
		}
		busy = true;
		const payload = rows.map((r) => ({
			...r,
			criterion: r.criterion.trim(),
			points: Number(r.points),
			levels: r.levels
				?.filter((l) => l.label.trim())
				.map((l) => ({
					label: l.label.trim(),
					...(l.points != null && !Number.isNaN(Number(l.points)) ? { points: Number(l.points) } : {}),
					...(l.description?.trim() ? { description: l.description.trim() } : {})
				}))
		}));
		const res = await transports.setRubric(itemId, payload as RubricCriterion[]);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		editing = false;
		notice = 'Rubric saved. Students can see it on the assignment.';
		await onchanged?.();
	}

	async function removeRubric() {
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;
		busy = true;
		const res = await transports.setRubric(itemId, null);
		busy = false;
		if (!res.ok) {
			error = res.message;
			return;
		}
		notice = 'Rubric removed.';
		await onchanged?.();
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
		<span class="actions">
			<button
				type="button"
				class="btn secondary tiny"
				onclick={() => startEdit(criteria ?? [{ id: 'overall', criterion: 'Overall', points: 10 }])}
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
			{#each rows as row, i (row.id)}
				<div class="crit-row">
					<div class="crit-main">
						<input
							type="text"
							class="crit-text"
							placeholder="Criterion"
							bind:value={row.criterion}
						/>
						<input
							type="number"
							class="crit-points"
							min="0"
							max="1000"
							step="0.5"
							bind:value={row.points}
							aria-label="Points"
						/>
						<span class="crit-ops">
							<button type="button" title="Move up" onclick={() => moveRow(i, -1)} disabled={i === 0}>↑</button>
							<button type="button" title="Move down" onclick={() => moveRow(i, 1)} disabled={i === rows.length - 1}>↓</button>
							<button type="button" title="Remove" onclick={() => removeRow(i)}>✕</button>
						</span>
					</div>
					{#each row.levels ?? [] as level, li (li)}
						<div class="level-row">
							<input type="text" class="level-label" placeholder="Level label (e.g. Full credit)" bind:value={level.label} />
							<input type="text" class="level-desc" placeholder="Descriptor" bind:value={level.description} />
							<button type="button" class="level-remove" title="Remove level" onclick={() => removeLevel(i, li)}>✕</button>
						</div>
					{/each}
					<button type="button" class="add-level" onclick={() => addLevel(i)}>+ level descriptor</button>
				</div>
			{/each}
			<span class="actions">
				<button type="button" class="btn secondary tiny" onclick={addRow}>Add criterion</button>
				<span class="total">Total: {total} pts</span>
			</span>
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
		color: var(--dim);
	}
	.actions {
		display: flex;
		gap: 0.35rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.btn.tiny,
	.btn.secondary.tiny {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	.btn.danger {
		color: var(--crimson);
		border-color: var(--crimson);
	}
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.crit-row {
		border: 1px solid var(--line);
		border-radius: 6px;
		padding: 0.45rem 0.55rem;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
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
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.9rem;
		padding: 0.3rem 0.45rem;
	}
	.crit-points {
		width: 4.4rem;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--gold);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		padding: 0.3rem 0.35rem;
	}
	.crit-ops {
		display: flex;
		gap: 0.15rem;
	}
	.crit-ops button {
		appearance: none;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--dim);
		font-size: 0.7rem;
		width: 1.45rem;
		height: 1.45rem;
		cursor: pointer;
	}
	.crit-ops button:hover:not(:disabled) {
		color: var(--green);
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
	}
	.level-label {
		flex: 0 1 11rem;
		min-width: 0;
	}
	.level-desc {
		flex: 1 1 10rem;
		min-width: 0;
	}
	.level-row input {
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 4px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.8rem;
		padding: 0.25rem 0.4rem;
	}
	.level-remove {
		appearance: none;
		background: none;
		border: none;
		color: var(--dim);
		cursor: pointer;
		font-size: 0.7rem;
	}
	.level-remove:hover {
		color: var(--crimson);
	}
	.add-level {
		appearance: none;
		background: none;
		border: none;
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		text-align: left;
		cursor: pointer;
		padding: 0;
	}
	.total {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--gold);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		border-radius: 5px;
		padding: 0.4rem 0.65rem;
		margin: 0;
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
</style>
