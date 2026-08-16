<script lang="ts">
	import {
		referenceHref,
		validateReferenceSpec,
		type ReferenceSpec,
		type ReferenceTransports
	} from '$lib/classroom/reference-spec';

	/**
	 * The teacher tools for a MATERIAL: import a reference document, and decide
	 * whether it is readable outside the roster.
	 *
	 * The validation here is the FRIENDLY copy (every problem at once);
	 * _classroom_check_reference_spec re-validates in SQL regardless, so a
	 * document this component never saw still cannot land invalid.
	 *
	 * THE PUBLIC TOGGLE IS TWO GESTURES ON PURPOSE. Turning it ON is the one
	 * action here that changes who may read this, and "who" includes people with
	 * no account at all. So the confirm step names exactly what becomes visible
	 * -- and, just as importantly, what does not -- rather than asking "are you
	 * sure?" about something the teacher would have to reason out themselves.
	 * Turning it OFF is immediate: closing access is never the risky direction.
	 */
	let {
		itemId,
		spec = null,
		isPublic = false,
		attachmentCount = 0,
		transports,
		onchanged = null
	}: {
		itemId: string;
		spec: ReferenceSpec | null;
		isPublic?: boolean;
		attachmentCount?: number;
		transports: ReferenceTransports;
		onchanged?: (() => void | Promise<void>) | null;
	} = $props();

	let open = $state(false);
	let raw = $state('');
	let errors = $state<string[]>([]);
	let parsed = $state<ReferenceSpec | null>(null);
	let busy = $state(false);
	let notice = $state<string | null>(null);
	let armRemove = $state(false);
	let armPublic = $state(false);

	// The flag lives on the row, but the toggle has to reflect a just-made
	// change before the page reloads, so it tracks locally from the RPC's answer.
	let publicNow = $state(isPublic);
	$effect(() => {
		publicNow = isPublic;
	});

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
		const result = validateReferenceSpec(json);
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
		const res = await transports.setReferenceSpec(itemId, JSON.parse(raw));
		busy = false;
		if (!res.ok) {
			// The server's own refusal (the boundary): render it verbatim.
			errors = [res.message ?? 'Something went wrong.'];
			return;
		}
		notice = 'Reference document attached.';
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
		const res = await transports.setReferenceSpec(itemId, null);
		busy = false;
		if (!res.ok) {
			notice = res.message ?? 'Something went wrong.';
			return;
		}
		notice = 'Reference document removed.';
		await onchanged?.();
	}

	async function togglePublic() {
		if (!publicNow && !armPublic) {
			armPublic = true;
			return;
		}
		armPublic = false;
		busy = true;
		notice = null;
		const next = !publicNow;
		const res = await transports.setPublic(itemId, next);
		busy = false;
		if (!res.ok) {
			notice = res.message ?? 'Something went wrong.';
			return;
		}
		publicNow = res.data?.is_public ?? next;
		notice = publicNow
			? 'Anyone with the link can read this document now.'
			: 'This document is back to enrolled students only.';
		await onchanged?.();
	}
</script>

<div class="ref-tools">
	{#if spec}
		<p class="spec-line">
			<span class="ok-dot"></span>
			Reference document attached: <strong>{spec.meta.title}</strong>
			<span class="spec-meta">
				{spec.meta.referenceId} · {spec.sections.length} section{spec.sections.length === 1
					? ''
					: 's'} · {spec.navigation ?? 'tabs'}
			</span>
		</p>
		<p class="slug-line">
			Deep links:
			{#each spec.sections as section (section.slug)}
				<a href={referenceHref(itemId, section.slug)} target="_blank" rel="noopener noreferrer">
					#{section.slug}
				</a>
			{/each}
		</p>
	{:else}
		<p class="spec-line none">
			No reference document -- this material shows its written details instead.
		</p>
	{/if}

	<span class="actions">
		<button type="button" class="btn secondary tiny" onclick={() => (open = !open)}>
			{open ? 'Close import' : spec ? 'Replace document' : 'Import document'}
		</button>
		{#if spec}
			<a class="btn secondary tiny" href={referenceHref(itemId)} target="_blank" rel="noopener noreferrer">
				Open reader
			</a>
			<button type="button" class="btn secondary tiny danger" disabled={busy} onclick={remove}>
				{armRemove ? 'Really remove?' : 'Remove document'}
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
				placeholder="Paste the reference document's spec JSON here"
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
					Attach document
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
					Valid: "{parsed.meta.title}" -- {parsed.sections.length} sections ({parsed.sections
						.map((s) => s.slug)
						.join(', ')}).
				</p>
			{/if}
		</div>
	{/if}

	<hr class="tool-rule" />

	<div class="public-block" class:live={publicNow}>
		<p class="public-state">
			<span class="state-tag" class:on={publicNow}>{publicNow ? 'Public' : 'Class only'}</span>
			{#if publicNow}
				Anyone with the link can read this document -- no sign-in.
			{:else}
				Only students enrolled in this class can read this.
			{/if}
		</p>

		{#if armPublic}
			<div class="confirm">
				<p class="confirm-head">Make this readable by anyone with the link?</p>
				<p class="confirm-body">
					<strong>Becomes visible to anyone, signed in or not:</strong> this material's title, its
					reference document{#if attachmentCount}, and its {attachmentCount} attached
						file{attachmentCount === 1 ? '' : 's'}{/if}.
				</p>
				<p class="confirm-body">
					<strong>Stays private:</strong> your class roster, every student's name, work and grades,
					every other post, assignment and material, who is enrolled where, and anything marked
					instructor-only. None of it is reachable from the public page.
				</p>
				<span class="actions">
					<button type="button" class="btn tiny" disabled={busy} onclick={togglePublic}>
						Yes, make it public
					</button>
					<button type="button" class="btn secondary tiny" onclick={() => (armPublic = false)}>
						Cancel
					</button>
				</span>
			</div>
		{:else}
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={togglePublic}>
				{publicNow ? 'Make class-only' : 'Make public…'}
			</button>
		{/if}
	</div>
</div>

<style>
	.ref-tools {
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
	.slug-line {
		margin: 0;
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.66rem;
		color: var(--text-2);
	}
	.actions {
		display: flex;
		gap: 0.35rem;
		flex-wrap: wrap;
		align-items: center;
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
	.tool-rule {
		border: none;
		border-top: 1px solid var(--hairline);
		margin: 0.1rem 0;
		width: 100%;
	}
	.public-block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		align-items: flex-start;
	}
	.public-state {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-2);
		display: flex;
		align-items: baseline;
		gap: 0.45rem;
		flex-wrap: wrap;
	}
	.state-tag {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.06rem 0.5rem;
		color: var(--text-2);
	}
	.state-tag.on {
		color: var(--gold);
		border-color: var(--gold);
	}
	.confirm {
		border: 1px solid var(--gold);
		border-radius: var(--radius-card);
		padding: 0.65rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		box-sizing: border-box;
	}
	.confirm-head {
		margin: 0;
		font-size: 0.9rem;
		color: var(--gold);
	}
	.confirm-body {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-2);
	}
	.confirm-body strong {
		color: var(--text-1);
	}
</style>
