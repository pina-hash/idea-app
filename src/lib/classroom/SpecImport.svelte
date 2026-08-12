<script lang="ts">
	import {
		validateSpec,
		type AssignmentSpec,
		type AssignmentTeacherTransports
	} from '$lib/classroom/assignment-spec';

	/**
	 * The spec import flow: paste or upload the assignment's JSON spec
	 * (docs/IDEA_MATERIAL_SPEC_v1.md), see every validation problem at once,
	 * and attach it to the canonical assignment record.
	 *
	 * The validation here is the FRIENDLY copy; the RPC re-validates in SQL
	 * regardless (calc rejection, point sums, rubric sums, unique ids), so a
	 * spec this component never saw still cannot land invalid.
	 */
	let {
		itemId,
		spec = null,
		transports,
		onchanged = null
	}: {
		itemId: string;
		/** The currently attached spec, if any. */
		spec: AssignmentSpec | null;
		transports: AssignmentTeacherTransports;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let open = $state(false);
	let raw = $state('');
	let errors = $state<string[]>([]);
	let parsed = $state<AssignmentSpec | null>(null);
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let armRemove = $state(false);

	function check() {
		notice = null;
		parsed = null;
		let json: unknown;
		try {
			json = JSON.parse(raw);
		} catch (e) {
			errors = [`Not valid JSON: ${(e as Error).message}`];
			return;
		}
		const result = validateSpec(json);
		errors = result.errors;
		parsed = result.spec;
	}

	async function pickFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		raw = await file.text();
		check();
	}

	async function attach() {
		if (!parsed) return;
		busy = true;
		notice = null;
		const res = await transports.setSpec(itemId, JSON.parse(raw));
		busy = false;
		if (!res.ok) {
			// The server's own refusal (the boundary): render it verbatim.
			errors = [res.message];
			return;
		}
		notice = 'Spec attached. Students see the interactive assignment now.';
		open = false;
		raw = '';
		parsed = null;
		errors = [];
		await onchanged?.();
	}

	async function remove() {
		if (!armRemove) {
			armRemove = true;
			return;
		}
		armRemove = false;
		busy = true;
		const res = await transports.setSpec(itemId, null);
		busy = false;
		if (!res.ok) {
			notice = res.message;
			return;
		}
		notice = 'Spec removed.';
		await onchanged?.();
	}
</script>

<div class="spec-import">
	{#if spec}
		<p class="spec-line">
			<span class="ok-dot"></span>
			Interactive spec attached: <strong>{spec.meta.title}</strong>
			<span class="spec-meta">
				{spec.meta.assignmentId} · {spec.modules.length} module{spec.modules.length === 1 ? '' : 's'} ·
				{spec.meta.totalPoints} pts
			</span>
		</p>
	{:else}
		<p class="spec-line none">No interactive spec -- students see a plain file hand-in.</p>
	{/if}

	<span class="actions">
		<button type="button" class="btn secondary tiny" onclick={() => (open = !open)}>
			{open ? 'Close import' : spec ? 'Replace spec' : 'Import spec'}
		</button>
		{#if spec}
			<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={remove}>
				{armRemove ? 'Really remove?' : 'Remove spec'}
			</button>
		{/if}
	</span>

	{#if notice}<p class="feedback ok">{notice}</p>{/if}

	{#if open}
		<div class="import-body">
			<label class="btn secondary tiny file-pick">
				Upload .json
				<input type="file" accept=".json,application/json" hidden onchange={pickFile} />
			</label>
			<textarea
				class="paste"
				rows="8"
				placeholder="Paste the assignment's spec JSON here"
				bind:value={raw}
				oninput={() => {
					parsed = null;
					errors = [];
				}}
			></textarea>
			<span class="actions">
				<button type="button" class="btn secondary tiny" disabled={!raw.trim()} onclick={check}>
					Validate
				</button>
				<button type="button" class="btn tiny" disabled={!parsed || busy} onclick={attach}>
					Attach spec
				</button>
			</span>
			{#if errors.length}
				<ul class="error-list">
					{#each errors as e, i (i)}
						<li>{e}</li>
					{/each}
				</ul>
			{:else if parsed}
				<p class="valid-line">
					Valid: "{parsed.meta.title}" -- {parsed.modules.length} modules, {parsed.meta.totalPoints}
					points{parsed.approvalGate ? ', approval gate' : ''}{parsed.declarations?.academicIntegrity
						? ', integrity declaration'
						: ''}.
				</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.spec-import {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.spec-line {
		margin: 0;
		font-size: 0.88rem;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		flex-wrap: wrap;
	}
	.spec-line.none {
		color: var(--dim);
	}
	.ok-dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--green);
		align-self: center;
	}
	.spec-meta {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--dim);
	}
	.actions {
		display: flex;
		gap: 0.35rem;
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
	.import-body {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}
	.file-pick {
		align-self: flex-start;
		cursor: pointer;
	}
	.paste {
		width: 100%;
		box-sizing: border-box;
		background: var(--bg0);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		line-height: 1.45;
		padding: 0.5rem 0.6rem;
	}
	.paste:focus {
		outline: none;
		border-color: var(--line-strong);
	}
	.error-list {
		margin: 0;
		padding-left: 1.2rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.error-list li {
		font-size: 0.8rem;
		color: var(--amber);
	}
	.valid-line {
		margin: 0;
		font-size: 0.82rem;
		color: var(--green);
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		border-radius: 5px;
		padding: 0.4rem 0.65rem;
		margin: 0;
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
</style>
