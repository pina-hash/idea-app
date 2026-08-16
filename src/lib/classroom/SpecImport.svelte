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
	 *
	 * TWO MODES, ONE COMPONENT. With an `itemId` it attaches immediately, which
	 * is what the item page has always done. With `itemId` NULL -- the composer,
	 * creating an assignment that does not exist yet -- it STAGES instead,
	 * handing the validated JSON back through `onstage` for the composer to
	 * attach the moment the create call returns an id. The validation, the error
	 * list and the summary line are identical in both, because they are the same
	 * code: a teacher importing a spec while writing the assignment must not be
	 * shown a different, second-best version of this flow.
	 */
	let {
		itemId = null,
		spec = null,
		transports = null,
		staged = null,
		onstage = null,
		onchanged = null
	}: {
		/** Null while the assignment does not exist yet: stage rather than attach. */
		itemId?: string | null;
		/** The currently attached spec, if any. */
		spec: AssignmentSpec | null;
		/** Required to attach; unused (and absent) in staging mode. */
		transports?: AssignmentTeacherTransports | null;
		/** A spec already staged for the next save, in staging mode. */
		staged?: AssignmentSpec | null;
		/** Staging mode's counterpart to attaching: hands back the raw JSON. */
		onstage?: ((raw: unknown | null) => void) | null;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	const stagingMode = $derived(!itemId);
	/** What the summary line describes: attached, or waiting to be. */
	const shown = $derived(staged ?? spec);

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

		// Staging: the assignment does not exist yet, so there is nothing to
		// attach TO. The composer holds this and attaches it after the create
		// call, which is the only moment an item id exists.
		if (!itemId || !transports) {
			onstage?.(JSON.parse(raw));
			notice = 'Spec ready. It attaches when you save.';
			open = false;
			raw = '';
			parsed = null;
			errors = [];
			return;
		}

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

		if (!itemId || !transports) {
			onstage?.(null);
			notice = 'Spec removed.';
			return;
		}

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
	{#if shown}
		<p class="spec-line">
			<span class="ok-dot"></span>
			{staged ? 'Interactive spec ready:' : 'Interactive spec attached:'}
			<strong>{shown.meta.title}</strong>
			<span class="spec-meta">
				{shown.meta.assignmentId} · {shown.modules.length} module{shown.modules.length === 1 ? '' : 's'} ·
				{shown.meta.totalPoints} pts{staged ? ' · attaches on save' : ''}
			</span>
		</p>
	{:else}
		<p class="spec-line none">No interactive spec -- students see a plain file hand-in.</p>
	{/if}

	<span class="actions">
		<button type="button" class="btn secondary tiny" onclick={() => (open = !open)}>
			{open ? 'Close import' : shown ? 'Replace spec' : 'Import spec'}
		</button>
		{#if shown}
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
					{stagingMode ? 'Use this spec' : 'Attach spec'}
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
		color: var(--text-2);
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
		color: var(--text-2);
	}
	.actions {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
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
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card);
		color: var(--text-1);
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
</style>
