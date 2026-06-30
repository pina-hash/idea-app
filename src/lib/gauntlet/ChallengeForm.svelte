<script lang="ts">
	import { goto } from '$app/navigation';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { MODES, modeById, DIFFICULTY_LABELS } from '$lib/gauntlet';
	import {
		buildPayload,
		massFromGeometry,
		parseAuthorCapture,
		isModeling,
		type AuthorFormState
	} from '$lib/gauntlet/authoring';

	let { supabase, initial }: { supabase: SupabaseClient; initial: AuthorFormState } = $props();

	let form = $state<AuthorFormState>({ ...initial, options: initial.options.map((o) => ({ ...o })) });
	let file = $state<File | null>(null);
	let fileName = $state('');
	let pasteText = $state('');
	let saving = $state('');
	let error = $state('');

	const modeling = $derived(isModeling(form.mode));
	const gatedAsset = $derived(form.mode === 'speedrun' || form.mode === 'feature_golf');
	const computedMass = $derived(massFromGeometry(form.target_volume_mm3, form.density));
	const massMismatch = $derived(
		computedMass != null && form.target_mass != null && form.target_mass > 0
			? Math.abs(form.target_mass - computedMass) / computedMass > 0.005
			: false
	);

	const applyPaste = () => {
		const g = parseAuthorCapture(pasteText);
		if (g.target_volume_mm3 != null) form.target_volume_mm3 = g.target_volume_mm3;
		if (g.surface_area_mm2 != null) form.surface_area_mm2 = g.surface_area_mm2;
		if (g.feature_count != null) form.feature_count = g.feature_count;
		if (g.density != null) form.density = g.density;
		if (g.target_mass != null) form.target_mass = g.target_mass;
	};

	const onFile = (e: Event) => {
		const f = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
		file = f;
		fileName = f?.name ?? '';
	};

	const addOption = () => {
		const next = String.fromCharCode(97 + form.options.length); // a, b, c, ...
		form.options = [...form.options, { id: next, label: '' }];
	};
	const removeOption = (i: number) => {
		form.options = form.options.filter((_, idx) => idx !== i);
	};

	async function uploadAsset(): Promise<string> {
		if (!file) return form.asset;
		const ext = (file.name.split('.').pop() || 'png').toLowerCase();
		const path = `${crypto.randomUUID()}.${ext}`;
		const { error: upErr } = await supabase.storage
			.from('gauntlet')
			.upload(path, file, { contentType: file.type || undefined });
		if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
		return supabase.storage.from('gauntlet').getPublicUrl(path).data.publicUrl;
	}

	async function save(status: 'draft' | 'published') {
		saving = status;
		error = '';
		try {
			if (file) {
				form.asset = await uploadAsset();
				file = null;
				fileName = '';
			}
			const { prompt, answer } = buildPayload(form);
			const { data: id, error: rpcErr } = await supabase.rpc('gauntlet_author_upsert', {
				p_id: form.id,
				p_mode: form.mode,
				p_title: form.title,
				p_difficulty: form.difficulty,
				p_status: status,
				p_prompt: prompt,
				p_answer: answer
			});
			if (rpcErr) throw new Error(rpcErr.message);
			form.id = id as string;
			await goto('/gauntlet/author');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Save failed.';
		}
		saving = '';
	}

	async function remove() {
		if (!form.id) return;
		if (!confirm('Delete this challenge? It is archived instead if it has submissions.')) return;
		saving = 'delete';
		error = '';
		const { error: rpcErr } = await supabase.rpc('gauntlet_author_delete', { p_id: form.id });
		if (rpcErr) {
			error = rpcErr.message;
			saving = '';
			return;
		}
		await goto('/gauntlet/author');
	}
</script>

<div class="author-form">
	{#if form.id}
		<p class="status-line">
			Editing &middot; current status <span class="status-badge status-{form.status}">{form.status}</span>
		</p>
	{/if}

	<div class="card">
		<label class="ff">
			<span class="ff-label">Mode</span>
			<select class="ff-input" bind:value={form.mode}>
				{#each MODES as m (m.id)}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
		</label>
		<label class="ff">
			<span class="ff-label">Title</span>
			<input class="ff-input" type="text" bind:value={form.title} placeholder="Challenge title" />
		</label>
		<label class="ff">
			<span class="ff-label">Difficulty</span>
			<select class="ff-input" bind:value={form.difficulty}>
				{#each Object.entries(DIFFICULTY_LABELS) as [n, label] (n)}
					<option value={Number(n)}>{n} &middot; {label}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if modeling}
		<h2>Geometry capture</h2>
		<div class="card">
			<p class="ff-help">
				Run the GAUNTLET macro in <strong>Author capture</strong> mode on the real part, then paste
				its output here and Parse to fill the fields.
			</p>
			<textarea
				class="ff-input ff-area"
				bind:value={pasteText}
				rows="5"
				placeholder="GAUNTLET author capture ... target_volume_mm3 : ..."
			></textarea>
			<div class="btn-row">
				<button class="btn secondary" type="button" onclick={applyPaste}>Parse capture</button>
			</div>
		</div>

		<div class="card">
			<label class="ff">
				<span class="ff-label">Canonical volume (mm3)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.target_volume_mm3} />
			</label>
			<label class="ff">
				<span class="ff-label">Surface area (mm2)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.surface_area_mm2} />
			</label>
			<label class="ff">
				<span class="ff-label">Feature count</span>
				<input class="ff-input" type="number" step="1" bind:value={form.feature_count} />
			</label>
			<label class="ff">
				<span class="ff-label">Material</span>
				<input class="ff-input" type="text" bind:value={form.material} placeholder="Aluminum 6061" />
			</label>
			<label class="ff">
				<span class="ff-label">Density (g/cm3)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.density} />
			</label>
			<label class="ff">
				<span class="ff-label">Target mass (g)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.target_mass} />
			</label>
			{#if massMismatch}
				<p class="warn ff-warn">
					Target mass {form.target_mass} g does not match volume x density ({computedMass} g).
					Check the values.
				</p>
			{/if}
			<label class="ff">
				<span class="ff-label">Tolerance band (%)</span>
				<input class="ff-input" type="number" step="any" bind:value={form.tolerance_pct} />
			</label>
			{#if form.mode === 'feature_golf'}
				<label class="ff">
					<span class="ff-label">Par features (shown, not graded)</span>
					<input class="ff-input" type="number" step="1" bind:value={form.par_features} />
				</label>
			{/if}
			<label class="ff">
				<span class="ff-label">Note</span>
				<input class="ff-input" type="text" bind:value={form.note} placeholder="Optional framing note" />
			</label>
		</div>
	{:else}
		<h2>Question</h2>
		<div class="card">
			<label class="ff">
				<span class="ff-label">Question</span>
				<textarea class="ff-input ff-area" bind:value={form.question} rows="2"></textarea>
			</label>
			<label class="ff">
				<span class="ff-label">Instructions (optional)</span>
				<input class="ff-input" type="text" bind:value={form.instructions} />
			</label>
			<label class="ff">
				<span class="ff-label">Answer type</span>
				<select class="ff-input" bind:value={form.answerType}>
					<option value="choice">Multiple choice</option>
					<option value="text">Exact text</option>
					<option value="numeric">Numeric</option>
				</select>
			</label>

			{#if form.answerType === 'choice'}
				<div class="opt-editor">
					<span class="ff-label">Options (the correct one is selected below)</span>
					{#each form.options as opt, i (i)}
						<div class="opt-edit-row">
							<input class="ff-input opt-id" type="text" bind:value={opt.id} maxlength="3" />
							<input class="ff-input" type="text" bind:value={opt.label} placeholder="Option text" />
							<button class="text-act danger" type="button" onclick={() => removeOption(i)}>Remove</button>
						</div>
					{/each}
					<button class="btn secondary" type="button" onclick={addOption}>Add option</button>
				</div>
				<label class="ff">
					<span class="ff-label">Correct option</span>
					<select class="ff-input" bind:value={form.correct}>
						<option value="">Select...</option>
						{#each form.options as opt (opt.id)}
							<option value={opt.id}>{opt.id} &middot; {opt.label}</option>
						{/each}
					</select>
				</label>
			{:else}
				<label class="ff">
					<span class="ff-label">Correct answer</span>
					<input class="ff-input" type="text" bind:value={form.correct} />
				</label>
				<label class="ff">
					<span class="ff-label">Unit (optional)</span>
					<input class="ff-input" type="text" bind:value={form.inputUnit} placeholder="mm" />
				</label>
				{#if form.answerType === 'numeric'}
					<label class="ff">
						<span class="ff-label">Numeric tolerance (+/-)</span>
						<input class="ff-input" type="number" step="any" bind:value={form.numericTolerance} />
					</label>
				{/if}
			{/if}
			<label class="ff">
				<span class="ff-label">Explanation (shown after answering)</span>
				<textarea class="ff-input ff-area" bind:value={form.explanation} rows="2"></textarea>
			</label>
		</div>
	{/if}

	<h2>{modeling ? (gatedAsset ? 'Drawing (hidden, revealed on Start)' : 'Reference') : 'Drawing or image (optional)'}</h2>
	<div class="card">
		{#if gatedAsset}
			<p class="ff-help">
				This drawing is stored in the hidden answer and revealed only when a student clicks Start.
			</p>
		{/if}
		<label class="ff">
			<span class="ff-label">Upload image</span>
			<input class="ff-input" type="file" accept="image/*,.svg" onchange={onFile} />
		</label>
		{#if fileName}<p class="ff-help">Selected: {fileName} (uploads on save)</p>{/if}
		<label class="ff">
			<span class="ff-label">Or paste inline SVG / URL</span>
			<textarea class="ff-input ff-area" bind:value={form.asset} rows="3" placeholder="<svg ...> or https://..."></textarea>
		</label>
	</div>

	{#if error}<p class="warn">{error}</p>{/if}

	<div class="btn-row form-actions">
		<button class="btn secondary" type="button" disabled={saving !== ''} onclick={() => save('draft')}>
			{saving === 'draft' ? 'Saving...' : 'Save draft'}
		</button>
		<button class="btn" type="button" disabled={saving !== ''} onclick={() => save('published')}>
			{saving === 'published' ? 'Publishing...' : 'Save and publish'}
		</button>
		{#if form.id}
			<button class="btn secondary danger-btn" type="button" disabled={saving !== ''} onclick={remove}>
				{saving === 'delete' ? 'Deleting...' : 'Delete'}
			</button>
		{/if}
		<a class="btn secondary" href="/gauntlet/author">Cancel</a>
	</div>
	<p class="dim author-note">{modeById(form.mode)?.name}: publishing checks all required fields server-side.</p>
</div>
